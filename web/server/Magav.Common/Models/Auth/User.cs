using NPoco;

namespace Magav.Common.Models.Auth;

[TableName("Users")]
[PrimaryKey("Id", AutoIncrement = true)]
public class User
{
    public int Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;  // BCrypt hash
    public bool IsActive { get; set; } = true;
    public string Role { get; set; } = "User";
    public bool MustChangePassword { get; set; } = false;  // Force password change
    public int FailedLoginAttempts { get; set; } = 0;
    public DateTime? LockoutUntil { get; set; }
    public string? RefreshTokenHash { get; set; }   // SHA256 hash of refresh token
    public DateTime? RefreshTokenExpiry { get; set; }  // When refresh token expires
    public DateTime? LastConnected { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
