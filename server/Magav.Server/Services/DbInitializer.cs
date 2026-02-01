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

        // Create SQLCipher connection - always set up WAL mode and busy timeout
        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();

        // Enable WAL mode for better concurrent access (persists in database)
        await using (var walCmd = new SqliteCommand("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=30000;", connection))
        {
            await walCmd.ExecuteNonQueryAsync();
        }

        if (!dbExists)
        {
            Console.WriteLine($"Creating database at: {fullPath}");

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

            await using var cmd = new SqliteCommand(createTableSql, connection);
            await cmd.ExecuteNonQueryAsync();

            // Create Volunteers table
            var createVolunteersSql = @"
                CREATE TABLE Volunteers (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    InternalIdHash TEXT NOT NULL UNIQUE,
                    MappingName TEXT NOT NULL,
                    FirstName TEXT NULL,
                    LastName TEXT NULL,
                    MobilePhone TEXT NULL,
                    ApproveToReceiveSms INTEGER NOT NULL DEFAULT 0,
                    RoleId INTEGER NULL,
                    CreatedAt TEXT NULL,
                    UpdatedAt TEXT NULL
                );
                CREATE INDEX IX_Volunteers_InternalIdHash ON Volunteers(InternalIdHash);
                CREATE INDEX IX_Volunteers_RoleId ON Volunteers(RoleId);
            ";

            await using var volunteersCmd = new SqliteCommand(createVolunteersSql, connection);
            await volunteersCmd.ExecuteNonQueryAsync();

            // Create Shifts table
            var createShiftsSql = @"
                CREATE TABLE Shifts (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ShiftDate TEXT NOT NULL,
                    ShiftName TEXT NOT NULL,
                    CarId TEXT NOT NULL DEFAULT '',
                    VolunteerId INTEGER NOT NULL,
                    SmsSentAt TEXT NULL,
                    CreatedAt TEXT NULL,
                    UpdatedAt TEXT NULL,
                    FOREIGN KEY (VolunteerId) REFERENCES Volunteers(Id)
                );
                CREATE INDEX IX_Shifts_VolunteerId ON Shifts(VolunteerId);
                CREATE INDEX IX_Shifts_ShiftDate ON Shifts(ShiftDate);
            ";

            await using var shiftsCmd = new SqliteCommand(createShiftsSql, connection);
            await shiftsCmd.ExecuteNonQueryAsync();

            // Create SmsLog table
            var createSmsLogSql = @"
                CREATE TABLE SmsLog (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ShiftId INTEGER NOT NULL,
                    SentAt TEXT NOT NULL,
                    Status TEXT NOT NULL DEFAULT 'Success',
                    Error TEXT NULL,
                    FOREIGN KEY (ShiftId) REFERENCES Shifts(Id)
                );
                CREATE INDEX IX_SmsLog_ShiftId ON SmsLog(ShiftId);
                CREATE INDEX IX_SmsLog_SentAt ON SmsLog(SentAt);
            ";

            await using var smsLogCmd = new SqliteCommand(createSmsLogSql, connection);
            await smsLogCmd.ExecuteNonQueryAsync();

            // Create default admin user with BCrypt hashed password
            var adminPasswordHash = BCrypt.Net.BCrypt.HashPassword("Admin123!", 12);
            var now = DateTime.UtcNow.ToString("o");

            var insertAdminSql = @"
                INSERT INTO Users (FullName, UserName, PasswordHash, IsActive, Role, MustChangePassword, CreatedAt, UpdatedAt)
                VALUES (@FullName, @UserName, @PasswordHash, 1, 'Admin', 1, @CreatedAt, @UpdatedAt)
            ";

            using var insertCmd = new SqliteCommand(insertAdminSql, connection);
            insertCmd.Parameters.AddWithValue("@FullName","יניב פנחס");
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

            // === SAMPLE DATA FOR TESTING — remove before production ===
            await SeedSampleDataAsync(connection, now);
        }
        else
        {
            Console.WriteLine($"Database already exists at: {fullPath}");
        }

    }

    public string GetConnectionString()
    {
        var fullPath = Path.GetFullPath(_dbPath);
        // Add busy timeout (30 seconds) to prevent "database is locked" errors
        return $"Data Source={fullPath};Password={_dbPassword};Default Timeout=30";
    }

    // === SAMPLE DATA FOR TESTING — remove this method before production ===
    private static async Task SeedSampleDataAsync(SqliteConnection connection, string now)
    {
        using var sha = System.Security.Cryptography.SHA256.Create();
        string Hash(string id) => Convert.ToHexString(sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(id))).ToLower();

        // 12 real volunteers from Volunteers.xlsx
        var volunteers = new[]
        {
            (Id: "1000", Name: "אבי דוידי",     First: "אבי",    Last: "דוידי",    Phone: "050-4448246"),
            (Id: "1001", Name: "אבי דרי",       First: "אבי",    Last: "דרי",      Phone: "050-4448246"),
            (Id: "1002", Name: "אבי מלכה",      First: "אבי",    Last: "מלכה",     Phone: "050-4448246"),
            (Id: "1003", Name: "אברהם אוחיון",  First: "אברהם",  Last: "אוחיון",   Phone: "050-4448246"),
            (Id: "1004", Name: "אהרון בן דוד",  First: "אהרון",  Last: "בן דוד",   Phone: "050-4448246"),
            (Id: "1005", Name: "אוריאל דגן",    First: "אוריאל", Last: "דגן",      Phone: "050-4448246"),
            (Id: "1006", Name: "אופיר גבאי",    First: "אופיר",  Last: "גבאי",     Phone: "050-4448246"),
            (Id: "1007", Name: "איציק כהן",     First: "איציק",  Last: "כהן",      Phone: "050-4448246"),
            (Id: "1008", Name: "אלון שמואלי",   First: "אלון",   Last: "שמואלי",   Phone: "050-4448246"),
            (Id: "1009", Name: "אלי ביטון",     First: "אלי",    Last: "ביטון",    Phone: "050-4448246"),
            (Id: "1010", Name: "אמיר פרץ",      First: "אמיר",   Last: "פרץ",      Phone: "050-4448246"),
            (Id: "1011", Name: "בני אזולאי",    First: "בני",    Last: "אזולאי",   Phone: "050-4448246"),
        };

        foreach (var v in volunteers)
        {
            var sql = @"INSERT INTO Volunteers (InternalIdHash, MappingName, FirstName, LastName, MobilePhone, ApproveToReceiveSms, CreatedAt, UpdatedAt)
                        VALUES (@Hash, @Name, @First, @Last, @Phone, 1, @Now, @Now)";
            await using var cmd = new SqliteCommand(sql, connection);
            cmd.Parameters.AddWithValue("@Hash", Hash(v.Id));
            cmd.Parameters.AddWithValue("@Name", v.Name);
            cmd.Parameters.AddWithValue("@First", v.First);
            cmd.Parameters.AddWithValue("@Last", v.Last);
            cmd.Parameters.AddWithValue("@Phone", v.Phone);
            cmd.Parameters.AddWithValue("@Now", now);
            await cmd.ExecuteNonQueryAsync();
        }

        // 4 teams, 3 volunteers each (volunteer IDs 1-12)
        var teams = new[]
        {
            (Name: "מרחבים 221", Car: "21-850", Vols: new[] { 1, 2, 3 }),
            (Name: "מרחבים 222", Car: "21-176", Vols: new[] { 4, 5, 6 }),
            (Name: "מרחבים 211", Car: "21-174", Vols: new[] { 7, 8, 9 }),
            (Name: "מרחבים 212", Car: "21-851", Vols: new[] { 10, 11, 12 }),
        };

        // Shifts for 7 days (today-1 through today-7)
        var shiftCount = 0;
        for (var dayOffset = 1; dayOffset <= 7; dayOffset++)
        {
            var shiftDate = DateTime.UtcNow.Date.AddDays(-dayOffset).ToString("o");
            foreach (var team in teams)
            {
                foreach (var volId in team.Vols)
                {
                    shiftCount++;
                    var sql = @"INSERT INTO Shifts (ShiftDate, ShiftName, CarId, VolunteerId, CreatedAt, UpdatedAt)
                                VALUES (@Date, @Name, @Car, @VolId, @Now, @Now)";
                    await using var cmd = new SqliteCommand(sql, connection);
                    cmd.Parameters.AddWithValue("@Date", shiftDate);
                    cmd.Parameters.AddWithValue("@Name", team.Name);
                    cmd.Parameters.AddWithValue("@Car", team.Car);
                    cmd.Parameters.AddWithValue("@VolId", volId);
                    cmd.Parameters.AddWithValue("@Now", now);
                    await cmd.ExecuteNonQueryAsync();
                }
            }
        }

        // SmsLog entries — 84 shifts total (7 days × 4 teams × 3 volunteers)
        // Mix: most succeed, some fail (every 6th), some not sent (every 9th)
        for (var id = 1; id <= shiftCount; id++)
        {
            // Not sent — every 9th shift has no SMS log
            if (id % 9 == 0) continue;

            // Vary sentAt per day: shifts 1-12 = day 1, 13-24 = day 2, etc.
            var dayGroup = (id - 1) / 12;
            var sentAt = DateTime.UtcNow.Date.AddDays(-(dayGroup + 1)).AddHours(8).ToString("o");

            // Every 6th shift fails
            var status = id % 6 == 0 ? "Fail" : "Success";
            var error = status == "Fail" ? "מספר טלפון לא תקין" : (string?)null;

            var sql = @"INSERT INTO SmsLog (ShiftId, SentAt, Status, Error)
                        VALUES (@ShiftId, @SentAt, @Status, @Error)";
            await using var cmd = new SqliteCommand(sql, connection);
            cmd.Parameters.AddWithValue("@ShiftId", id);
            cmd.Parameters.AddWithValue("@SentAt", sentAt);
            cmd.Parameters.AddWithValue("@Status", status);
            cmd.Parameters.AddWithValue("@Error", (object?)error ?? DBNull.Value);
            await cmd.ExecuteNonQueryAsync();
        }

        Console.WriteLine("Sample SMS log data seeded for testing.");
    }
}
