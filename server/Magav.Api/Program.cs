using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Magav.Common.Database;
using Magav.Server.Database;
using Magav.Server.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// ============================================
// CONFIGURATION
// ============================================

var jwtSettings = builder.Configuration.GetSection("Jwt").Get<JwtSettings>()
    ?? throw new InvalidOperationException("JWT settings not configured");

var allowedOrigins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>()
    ?? new[] { "http://localhost:8080" };

// ============================================
// SERVICES
// ============================================

// Add CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowClient", policy =>
    {
        policy.WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

// Add JWT Authentication
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtSettings.Issuer,
            ValidAudience = jwtSettings.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings.SecretKey)),
            ClockSkew = TimeSpan.Zero  // No clock skew tolerance
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("CanImportVolunteers", policy =>
        policy.RequireRole("Admin", "SystemManager"));
});

// Register services
builder.Services.AddSingleton<DbInitializer>();
builder.Services.AddScoped<MagavDbManager>(sp =>
{
    var dbInit = sp.GetRequiredService<DbInitializer>();
    var db = DbHelper.CreateSqliteDbHelper(dbInit.GetConnectionString());
    return new MagavDbManager(db);
});
builder.Services.AddScoped<AuthService>(sp =>
{
    var config = sp.GetRequiredService<IConfiguration>();
    var dbManager = sp.GetRequiredService<MagavDbManager>();
    return new AuthService(dbManager, config);
});

// ============================================
// HTTPS ENFORCEMENT (Production)
// ============================================

if (!builder.Environment.IsDevelopment())
{
    builder.Services.AddHttpsRedirection(options =>
    {
        options.RedirectStatusCode = StatusCodes.Status308PermanentRedirect;
        options.HttpsPort = 443;
    });

    builder.Services.AddHsts(options =>
    {
        options.Preload = true;
        options.IncludeSubDomains = true;
        options.MaxAge = TimeSpan.FromDays(365);
    });
}

var app = builder.Build();

// ============================================
// MIDDLEWARE
// ============================================

// Initialize database
var dbInitializer = app.Services.GetRequiredService<DbInitializer>();
await dbInitializer.InitializeAsync();

// HTTPS (Production)
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

// CORS
app.UseCors("AllowClient");

// Authentication & Authorization
app.UseAuthentication();
app.UseAuthorization();

// ============================================
// AUTH ENDPOINTS
// ============================================

app.MapPost("/api/auth/login", async (LoginRequest request, AuthService authService) =>
{
    try
    {
        var response = await authService.LoginAsync(request.Username, request.Password);
        return Results.Ok(ApiResponse<LoginResponse>.Ok(response));
    }
    catch (AuthException ex)
    {
        return Results.Json(
            ApiResponse<LoginResponse>.Fail(ex.Message),
            statusCode: StatusCodes.Status401Unauthorized);
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Login error: {ex}");
        return Results.Problem("An error occurred during login");
    }
});

app.MapPost("/api/auth/refresh", async (RefreshTokenRequest request, AuthService authService) =>
{
    try
    {
        var response = await authService.RefreshTokenAsync(request.RefreshToken);
        return Results.Ok(ApiResponse<LoginResponse>.Ok(response));
    }
    catch (AuthException ex)
    {
        return Results.Json(
            ApiResponse<LoginResponse>.Fail(ex.Message),
            statusCode: StatusCodes.Status401Unauthorized);
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Refresh token error: {ex}");
        return Results.Problem("An error occurred during token refresh");
    }
});

app.MapPost("/api/auth/logout", async (HttpContext context, AuthService authService) =>
{
    try
    {
        // Get user ID from JWT claims
        var userIdClaim = context.User.FindFirst(JwtRegisteredClaimNames.Sub)
            ?? context.User.FindFirst(ClaimTypes.NameIdentifier);

        if (userIdClaim != null && int.TryParse(userIdClaim.Value, out int userId))
        {
            await authService.LogoutAsync(userId);
        }

        return Results.Ok(ApiResponse<object>.Ok(null!, "Logged out successfully"));
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Logout error: {ex}");
        return Results.Problem("An error occurred during logout");
    }
}).RequireAuthorization();

// Health check endpoint
app.MapGet("/api/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

// ============================================
// VOLUNTEERS ENDPOINTS
// ============================================

app.MapPost("/api/volunteers/import", async (HttpRequest request, MagavDbManager db) =>
{
    const long MaxFileSize = 10 * 1024 * 1024; // 10MB

    try
    {
        // CSRF protection: Require custom header that forms can't set
        if (!request.Headers.TryGetValue("X-Requested-With", out var xhrHeader) ||
            xhrHeader.ToString() != "XMLHttpRequest")
        {
            return Results.BadRequest(ApiResponse<ImportResult>.Fail("בקשה לא תקינה"));
        }

        // Read form data
        var form = await request.ReadFormAsync();
        var file = form.Files.GetFile("file");

        // Validation 1: File exists
        if (file == null || file.Length == 0)
            return Results.BadRequest(ApiResponse<ImportResult>.Fail("לא נבחר קובץ"));

        // Validation 2: File size
        if (file.Length > MaxFileSize)
            return Results.BadRequest(ApiResponse<ImportResult>.Fail("גודל הקובץ חורג מהמותר (10MB)"));

        // Validation 3: File extension
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (extension != ".xlsx" && extension != ".xls")
            return Results.BadRequest(ApiResponse<ImportResult>.Fail("יש להעלות קובץ אקסל בלבד (.xlsx או .xls)"));

        // Copy to MemoryStream (ensures seekability for magic bytes check + EPPlus)
        using var memoryStream = new MemoryStream();
        await file.CopyToAsync(memoryStream);
        memoryStream.Position = 0;

        // Validation 4: Magic bytes (file signature)
        var header = new byte[4];
        await memoryStream.ReadAsync(header, 0, 4);
        memoryStream.Position = 0; // Reset for EPPlus

        bool isXlsx = header[0] == 0x50 && header[1] == 0x4B; // ZIP signature (PK)
        bool isXls = header[0] == 0xD0 && header[1] == 0xCF;  // OLE signature
        if (!isXlsx && !isXls)
            return Results.BadRequest(ApiResponse<ImportResult>.Fail("הקובץ אינו קובץ אקסל תקין"));

        // Process import
        var service = new VolunteersImportService();
        var result = await service.ImportFromExcelAsync(memoryStream, db);

        return Results.Ok(ApiResponse<ImportResult>.Ok(result));
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Volunteers import error: {ex}");
        return Results.Problem("אירעה שגיאה בעת ייבוא הקובץ");
    }
})
.RequireAuthorization("CanImportVolunteers")
.DisableAntiforgery(); // Required for file uploads

// ============================================
// RUN
// ============================================

Console.WriteLine("========================================");
Console.WriteLine("Magav API Server Starting...");
Console.WriteLine($"Environment: {app.Environment.EnvironmentName}");
Console.WriteLine($"CORS Origins: {string.Join(", ", allowedOrigins)}");
Console.WriteLine("========================================");

app.Run();

// ============================================
// REQUEST MODELS
// ============================================

public record LoginRequest(string Username, string Password);
public record RefreshTokenRequest(string RefreshToken);
