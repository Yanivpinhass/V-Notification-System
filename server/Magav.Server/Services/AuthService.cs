using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Magav.Common.Models.Auth;
using Magav.Server.Database;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace Magav.Server.Services;

public class AuthService
{
    private readonly MagavDbManager _dbManager;
    private readonly JwtSettings _jwtSettings;
    private readonly SecuritySettings _securitySettings;

    public AuthService(MagavDbManager dbManager, IConfiguration config)
    {
        _dbManager = dbManager ?? throw new ArgumentNullException(nameof(dbManager));
        _jwtSettings = config.GetSection("Jwt").Get<JwtSettings>()
            ?? throw new InvalidOperationException("JWT settings not configured");
        _securitySettings = config.GetSection("Security").Get<SecuritySettings>()
            ?? new SecuritySettings();
    }

    public async Task<LoginResponse> LoginAsync(string username, string password)
    {
        var user = await _dbManager.Users.GetByUserNameAsync(username);

        // Check if account is locked
        if (user?.LockoutUntil > DateTime.UtcNow)
            throw new AuthException("החשבון נעול. נסה שוב מאוחר יותר.");

        // Verify password using BCrypt (one-way hash comparison)
        if (user == null || !BCrypt.Net.BCrypt.Verify(password, user.PasswordHash))
        {
            if (user != null)
            {
                user.FailedLoginAttempts++;
                if (user.FailedLoginAttempts >= _securitySettings.MaxFailedLoginAttempts)
                    user.LockoutUntil = DateTime.UtcNow.AddMinutes(_securitySettings.LockoutMinutes);
                user.UpdatedAt = DateTime.UtcNow;
                await _dbManager.Users.UpdateAsync(user);
            }
            throw new AuthException("שם משתמש או סיסמה שגויים");
        }

        if (!user.IsActive)
            throw new AuthException("החשבון אינו פעיל");

        // Reset failed attempts on successful login
        user.FailedLoginAttempts = 0;
        user.LockoutUntil = null;
        user.LastConnected = DateTime.UtcNow;
        user.UpdatedAt = DateTime.UtcNow;

        // Generate tokens
        var accessToken = GenerateJwtToken(user);
        var refreshToken = GenerateSecureToken();
        var refreshTokenExpiry = DateTime.UtcNow.AddDays(_jwtSettings.RefreshTokenExpirationDays);

        // Store HASHED refresh token with expiry
        user.RefreshTokenHash = HashRefreshToken(refreshToken);
        user.RefreshTokenExpiry = refreshTokenExpiry;
        await _dbManager.Users.UpdateAsync(user);

        return new LoginResponse
        {
            AccessToken = accessToken,
            RefreshToken = refreshToken,
            ExpiresAt = DateTime.UtcNow.AddMinutes(_jwtSettings.AccessTokenExpirationMinutes).ToString("o"),
            User = new UserInfo
            {
                Id = user.Id.ToString(),
                Name = user.FullName,
                Email = $"{user.UserName}@magav.local",  // Placeholder email
                Roles = new[] { user.Role },
                Permissions = new Dictionary<string, object>()
            },
            MustChangePassword = user.MustChangePassword
        };
    }

    public async Task<LoginResponse> RefreshTokenAsync(string refreshToken)
    {
        var hash = HashRefreshToken(refreshToken);
        var user = await _dbManager.Users.GetByRefreshTokenHashAsync(hash);

        // Validate refresh token
        if (user == null || !user.IsActive)
            throw new AuthException("Invalid refresh token");

        // Check expiry
        if (user.RefreshTokenExpiry == null || user.RefreshTokenExpiry < DateTime.UtcNow)
            throw new AuthException("Refresh token expired");

        // Generate new tokens (rotate)
        var newAccessToken = GenerateJwtToken(user);
        var newRefreshToken = GenerateSecureToken();
        var newExpiry = DateTime.UtcNow.AddDays(_jwtSettings.RefreshTokenExpirationDays);

        user.RefreshTokenHash = HashRefreshToken(newRefreshToken);
        user.RefreshTokenExpiry = newExpiry;
        user.UpdatedAt = DateTime.UtcNow;
        await _dbManager.Users.UpdateAsync(user);

        return new LoginResponse
        {
            AccessToken = newAccessToken,
            RefreshToken = newRefreshToken,
            ExpiresAt = DateTime.UtcNow.AddMinutes(_jwtSettings.AccessTokenExpirationMinutes).ToString("o"),
            User = new UserInfo
            {
                Id = user.Id.ToString(),
                Name = user.FullName,
                Email = $"{user.UserName}@magav.local",
                Roles = new[] { user.Role },
                Permissions = new Dictionary<string, object>()
            },
            MustChangePassword = user.MustChangePassword
        };
    }

    public async Task LogoutAsync(int userId)
    {
        var user = await _dbManager.Users.GetByIdAsync(userId);
        if (user != null)
        {
            user.RefreshTokenHash = null;
            user.RefreshTokenExpiry = null;
            user.UpdatedAt = DateTime.UtcNow;
            await _dbManager.Users.UpdateAsync(user);
        }
    }

    // Generate JWT access token
    private string GenerateJwtToken(User user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSettings.SecretKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Name, user.FullName),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var token = new JwtSecurityToken(
            issuer: _jwtSettings.Issuer,
            audience: _jwtSettings.Audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(_jwtSettings.AccessTokenExpirationMinutes),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    // Generate cryptographically secure random token
    private static string GenerateSecureToken()
    {
        var randomBytes = new byte[32];  // 256 bits
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(randomBytes);
        return Convert.ToBase64String(randomBytes);
    }

    // Hash refresh token for secure storage
    private static string HashRefreshToken(string token) =>
        Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}

// Response models
public class ApiResponse<T>
{
    public bool Success { get; set; }
    public string? Message { get; set; }
    public T? Data { get; set; }
    public string[]? Errors { get; set; }

    public static ApiResponse<T> Ok(T data, string? message = null) => new()
    {
        Success = true,
        Data = data,
        Message = message
    };

    public static ApiResponse<T> Fail(string error) => new()
    {
        Success = false,
        Errors = new[] { error }
    };

    public static ApiResponse<T> Fail(string[] errors) => new()
    {
        Success = false,
        Errors = errors
    };
}

public class LoginResponse
{
    public string AccessToken { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
    public string ExpiresAt { get; set; } = string.Empty;  // ISO 8601
    public UserInfo User { get; set; } = new();
    public bool MustChangePassword { get; set; } = false;
}

public class UserInfo
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string[] Roles { get; set; } = Array.Empty<string>();
    public Dictionary<string, object> Permissions { get; set; } = new();
}

// Settings classes
public class JwtSettings
{
    public string SecretKey { get; set; } = string.Empty;
    public string Issuer { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    public int AccessTokenExpirationMinutes { get; set; } = 15;
    public int RefreshTokenExpirationDays { get; set; } = 7;
}

public class SecuritySettings
{
    public int MaxFailedLoginAttempts { get; set; } = 5;
    public int LockoutMinutes { get; set; } = 15;
    public int BcryptWorkFactor { get; set; } = 12;
}

public class AuthException : Exception
{
    public AuthException(string message) : base(message) { }
}
