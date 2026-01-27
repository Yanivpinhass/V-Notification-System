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

builder.Services.AddAuthorization();

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
