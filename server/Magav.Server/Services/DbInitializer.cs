using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Configuration;

namespace Magav.Server.Services;

public class DbInitializer
{
    private readonly string _dbPath;
    private readonly string _dbPassword;

    public DbInitializer(IConfiguration config)
    {
        _dbPath = config["Database:Path"] ?? "../db/magav.db";
        _dbPassword = config["Database:Password"]
            ?? throw new InvalidOperationException("Database password not configured");
    }

    public async Task InitializeAsync()
    {
        // Ensure directory exists
        var fullPath = Path.GetFullPath(_dbPath);
        var dir = Path.GetDirectoryName(fullPath);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);

        // Check if DB already exists
        bool dbExists = File.Exists(fullPath);

        // Create SQLCipher connection
        var connectionString = $"Data Source={fullPath};Password={_dbPassword}";

        if (!dbExists)
        {
            Console.WriteLine($"Creating database at: {fullPath}");

            // Create database and tables
            using var connection = new SqliteConnection(connectionString);
            await connection.OpenAsync();

            var createTableSql = @"
                CREATE TABLE Users (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    FullName TEXT NOT NULL,
                    UserName TEXT NOT NULL UNIQUE,
                    PasswordHash TEXT NOT NULL,
                    IsActive INTEGER NOT NULL DEFAULT 1,
                    Role TEXT NOT NULL DEFAULT 'User',
                    MustChangePassword INTEGER NOT NULL DEFAULT 0,
                    FailedLoginAttempts INTEGER NOT NULL DEFAULT 0,
                    LockoutUntil TEXT NULL,
                    RefreshTokenHash TEXT NULL,
                    RefreshTokenExpiry TEXT NULL,
                    LastConnected TEXT NULL,
                    CreatedAt TEXT NOT NULL,
                    UpdatedAt TEXT NOT NULL
                );
                CREATE INDEX IX_Users_UserName ON Users(UserName);
            ";

            using var cmd = new SqliteCommand(createTableSql, connection);
            await cmd.ExecuteNonQueryAsync();

            // Create default admin user with BCrypt hashed password
            var adminPasswordHash = BCrypt.Net.BCrypt.HashPassword("Admin123!", 12);
            var now = DateTime.UtcNow.ToString("o");

            var insertAdminSql = @"
                INSERT INTO Users (FullName, UserName, PasswordHash, IsActive, Role, MustChangePassword, CreatedAt, UpdatedAt)
                VALUES (@FullName, @UserName, @PasswordHash, 1, 'Admin', 1, @CreatedAt, @UpdatedAt)
            ";

            using var insertCmd = new SqliteCommand(insertAdminSql, connection);
            insertCmd.Parameters.AddWithValue("@FullName", "מנהל מערכת");
            insertCmd.Parameters.AddWithValue("@UserName", "admin");
            insertCmd.Parameters.AddWithValue("@PasswordHash", adminPasswordHash);
            insertCmd.Parameters.AddWithValue("@CreatedAt", now);
            insertCmd.Parameters.AddWithValue("@UpdatedAt", now);
            await insertCmd.ExecuteNonQueryAsync();

            Console.WriteLine("========================================");
            Console.WriteLine("Database initialized with admin user:");
            Console.WriteLine("  Username: admin");
            Console.WriteLine("  Password: Admin123!");
            Console.WriteLine("========================================");
            Console.WriteLine("WARNING: Change the admin password immediately!");
            Console.WriteLine("========================================");
        }
        else
        {
            Console.WriteLine($"Database already exists at: {fullPath}");
        }
    }

    public string GetConnectionString()
    {
        var fullPath = Path.GetFullPath(_dbPath);
        return $"Data Source={fullPath};Password={_dbPassword}";
    }
}
