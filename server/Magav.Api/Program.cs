using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.RegularExpressions;
using Magav.Common.Database;
using Magav.Common.Models.Auth;
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

    options.AddPolicy("AdminOnly", policy =>
        policy.RequireRole("Admin"));
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

// Change own password (for logged-in user)
app.MapPost("/api/auth/change-password", async (ChangePasswordRequest request, MagavDbManager db,
    HttpContext context, IConfiguration config) =>
{
    try
    {
        // Get current user ID from JWT (with fallback for claim mapping)
        var userIdClaim = context.User.FindFirst(JwtRegisteredClaimNames.Sub)
            ?? context.User.FindFirst(ClaimTypes.NameIdentifier);
        if (userIdClaim == null || !int.TryParse(userIdClaim.Value, out var userId))
            return Results.Unauthorized();

        var user = await db.Users.GetByIdAsync(userId);
        if (user == null)
            return Results.Unauthorized();

        // Validate new password
        if (string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length < 6 ||
            !request.NewPassword.Any(c => char.IsLetter(c)) ||
            !request.NewPassword.Any(c => char.IsDigit(c)))
            return Results.BadRequest(ApiResponse<object>.Fail("הסיסמה חייבת להכיל לפחות 6 תווים, אות אחת ומספר אחד"));

        // Hash and save new password
        var securitySettings = config.GetSection("Security").Get<SecuritySettings>() ?? new SecuritySettings();
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword, securitySettings.BcryptWorkFactor);
        user.MustChangePassword = false;
        user.UpdatedAt = DateTime.UtcNow;

        await db.Users.UpdateAsync(user);

        return Results.Ok(ApiResponse<object>.Ok(null!, "הסיסמה שונתה בהצלחה"));
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Change password error: {ex}");
        return Results.Json(
            ApiResponse<object>.Fail("אירעה שגיאה בשינוי הסיסמה"),
            statusCode: StatusCodes.Status500InternalServerError);
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
// USER MANAGEMENT ENDPOINTS (Admin only)
// ============================================

// GET all users
app.MapGet("/api/users", async (MagavDbManager db) =>
{
    try
    {
        var users = await db.Users.GetAllAsync();
        var userDtos = users.Select(u => new
        {
            u.Id,
            u.FullName,
            u.UserName,
            u.IsActive,
            u.Role,
            u.MustChangePassword,
            u.LastConnected,
            u.CreatedAt,
            u.UpdatedAt
        }).ToList();
        return Results.Ok(ApiResponse<object>.Ok(userDtos));
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Error fetching users: {ex}");
        return Results.Json(
            ApiResponse<object>.Fail("אירעה שגיאה בטעינת הנתונים"),
            statusCode: StatusCodes.Status500InternalServerError);
    }
}).RequireAuthorization("AdminOnly");

// GET single user
app.MapGet("/api/users/{id:int}", async (int id, MagavDbManager db) =>
{
    try
    {
        var user = await db.Users.GetByIdAsync(id);
        if (user == null)
            return Results.NotFound(ApiResponse<object>.Fail("משתמש לא נמצא"));

        return Results.Ok(ApiResponse<object>.Ok(new
        {
            user.Id,
            user.FullName,
            user.UserName,
            user.IsActive,
            user.Role,
            user.MustChangePassword,
            user.LastConnected,
            user.CreatedAt,
            user.UpdatedAt
        }));
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Error fetching user: {ex}");
        return Results.Json(
            ApiResponse<object>.Fail("אירעה שגיאה בטעינת הנתונים"),
            statusCode: StatusCodes.Status500InternalServerError);
    }
}).RequireAuthorization("AdminOnly");

// POST create user
app.MapPost("/api/users", async (CreateUserRequest request, MagavDbManager db, IConfiguration config) =>
{
    try
    {
        // Validate required fields
        if (string.IsNullOrWhiteSpace(request.FullName) ||
            string.IsNullOrWhiteSpace(request.UserName) ||
            string.IsNullOrWhiteSpace(request.Password))
            return Results.BadRequest(ApiResponse<object>.Fail("כל השדות הם חובה"));

        // Validate username format (Hebrew, English letters, digits, underscore, 3-50 chars)
        var normalizedUserName = request.UserName.Trim();
        if (!Regex.IsMatch((string)normalizedUserName, @"^[\u0590-\u05FFa-zA-Z0-9_]{3,50}$"))
            return Results.BadRequest(ApiResponse<object>.Fail("שם משתמש חייב להכיל 3-50 תווים: אותיות בעברית או באנגלית, מספרים או קו תחתון"));

        // Check username uniqueness (case-insensitive)
        if (await db.Users.ExistsByUserNameAsync(normalizedUserName))
            return Results.BadRequest(ApiResponse<object>.Fail("שם משתמש כבר קיים במערכת"));

        // Validate password strength (min 6 chars, at least 1 letter and 1 digit)
        if (request.Password.Length < 6 ||
            !request.Password.Any(c => char.IsLetter(c)) ||
            !request.Password.Any(c => char.IsDigit(c)))
            return Results.BadRequest(ApiResponse<object>.Fail("הסיסמה חייבת להכיל לפחות 6 תווים, אות אחת ומספר אחד"));

        // Validate role
        var validRoles = new[] { "Admin", "User", "SystemManager" };
        if (!validRoles.Contains(request.Role))
            return Results.BadRequest(ApiResponse<object>.Fail("תפקיד לא תקין"));

        var securitySettings = config.GetSection("Security").Get<SecuritySettings>() ?? new SecuritySettings();

        var user = new User
        {
            FullName = request.FullName.Trim(),
            UserName = normalizedUserName,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password, securitySettings.BcryptWorkFactor),
            Role = request.Role,
            IsActive = request.IsActive,
            MustChangePassword = request.MustChangePassword,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        await db.Users.InsertAsync(user);

        return Results.Created($"/api/users/{user.Id}", ApiResponse<object>.Ok(new
        {
            user.Id,
            user.FullName,
            user.UserName,
            user.IsActive,
            user.Role,
            user.MustChangePassword,
            user.CreatedAt,
            user.UpdatedAt
        }));
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Error creating user: {ex}");
        return Results.Json(
            ApiResponse<object>.Fail("אירעה שגיאה בשמירת הנתונים"),
            statusCode: StatusCodes.Status500InternalServerError);
    }
}).RequireAuthorization("AdminOnly");

// PUT update user
app.MapPut("/api/users/{id:int}", async (int id, UpdateUserRequest request, MagavDbManager db,
    HttpContext context, IConfiguration config) =>
{
    try
    {
        var user = await db.Users.GetByIdAsync(id);
        if (user == null)
            return Results.NotFound(ApiResponse<object>.Fail("משתמש לא נמצא"));

        // Get current user ID from JWT (with fallback for claim mapping)
        var userIdClaim = context.User.FindFirst(JwtRegisteredClaimNames.Sub)
            ?? context.User.FindFirst(ClaimTypes.NameIdentifier);
        if (userIdClaim == null || !int.TryParse(userIdClaim.Value, out var currentUserId))
            return Results.Unauthorized();

        // Prevent admin from deactivating themselves
        if (id == currentUserId && !request.IsActive)
            return Results.BadRequest(ApiResponse<object>.Fail("לא ניתן לבטל את החשבון שלך"));

        // Prevent admin from removing their own admin role
        if (id == currentUserId && request.Role != "Admin")
            return Results.BadRequest(ApiResponse<object>.Fail("לא ניתן להסיר את הרשאות המנהל מעצמך"));

        // Validate username format (Hebrew, English letters, digits, underscore, 3-50 chars)
        var normalizedUserName = request.UserName.Trim();
        if (!Regex.IsMatch((string)normalizedUserName, @"^[\u0590-\u05FFa-zA-Z0-9_]{3,50}$"))
            return Results.BadRequest(ApiResponse<object>.Fail("שם משתמש חייב להכיל 3-50 תווים: אותיות בעברית או באנגלית, מספרים או קו תחתון"));

        // Check username uniqueness if changed
        if (normalizedUserName != user.UserName && await db.Users.ExistsByUserNameAsync(normalizedUserName))
            return Results.BadRequest(ApiResponse<object>.Fail("שם משתמש כבר קיים במערכת"));

        // Validate role
        var validRoles = new[] { "Admin", "User", "SystemManager" };
        if (!validRoles.Contains(request.Role))
            return Results.BadRequest(ApiResponse<object>.Fail("תפקיד לא תקין"));

        // Update fields
        user.FullName = request.FullName.Trim();
        user.UserName = normalizedUserName;
        user.Role = request.Role;
        user.IsActive = request.IsActive;
        user.MustChangePassword = request.MustChangePassword;
        user.UpdatedAt = DateTime.UtcNow;

        // Update password if provided
        if (!string.IsNullOrWhiteSpace(request.NewPassword))
        {
            if (request.NewPassword.Length < 6 ||
                !request.NewPassword.Any(c => char.IsLetter(c)) ||
                !request.NewPassword.Any(c => char.IsDigit(c)))
                return Results.BadRequest(ApiResponse<object>.Fail("הסיסמה חייבת להכיל לפחות 6 תווים, אות אחת ומספר אחד"));

            var securitySettings = config.GetSection("Security").Get<SecuritySettings>() ?? new SecuritySettings();
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword, securitySettings.BcryptWorkFactor);
        }

        await db.Users.UpdateAsync(user);

        return Results.Ok(ApiResponse<object>.Ok(new
        {
            user.Id,
            user.FullName,
            user.UserName,
            user.IsActive,
            user.Role,
            user.MustChangePassword,
            user.LastConnected,
            user.CreatedAt,
            user.UpdatedAt
        }));
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Error updating user: {ex}");
        return Results.Json(
            ApiResponse<object>.Fail("אירעה שגיאה בשמירת הנתונים"),
            statusCode: StatusCodes.Status500InternalServerError);
    }
}).RequireAuthorization("AdminOnly");

// DELETE user
app.MapDelete("/api/users/{id:int}", async (int id, MagavDbManager db, HttpContext context) =>
{
    try
    {
        var user = await db.Users.GetByIdAsync(id);
        if (user == null)
            return Results.NotFound(ApiResponse<object>.Fail("משתמש לא נמצא"));

        // Get current user ID from JWT (with fallback for claim mapping)
        var userIdClaim = context.User.FindFirst(JwtRegisteredClaimNames.Sub)
            ?? context.User.FindFirst(ClaimTypes.NameIdentifier);
        if (userIdClaim == null || !int.TryParse(userIdClaim.Value, out var currentUserId))
            return Results.Unauthorized();

        // Prevent admin from deleting themselves
        if (id == currentUserId)
            return Results.BadRequest(ApiResponse<object>.Fail("לא ניתן למחוק את החשבון שלך"));

        // Prevent deleting the last admin
        if (user.Role == "Admin")
        {
            var adminCount = (await db.Users.GetByRoleAsync("Admin")).Count;
            if (adminCount <= 1)
                return Results.BadRequest(ApiResponse<object>.Fail("לא ניתן למחוק את המנהל האחרון במערכת"));
        }

        await db.Users.DeleteAsync(user);
        return Results.Ok(ApiResponse<object>.Ok(null!, "המשתמש נמחק בהצלחה"));
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Error deleting user: {ex}");
        return Results.Json(
            ApiResponse<object>.Fail("אירעה שגיאה במחיקת הנתונים"),
            statusCode: StatusCodes.Status500InternalServerError);
    }
}).RequireAuthorization("AdminOnly");

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
public record ChangePasswordRequest(string NewPassword);
public record CreateUserRequest(string FullName, string UserName, string Password, string Role, bool IsActive = true, bool MustChangePassword = true);
public record UpdateUserRequest(string FullName, string UserName, string? NewPassword, string Role, bool IsActive, bool MustChangePassword);
