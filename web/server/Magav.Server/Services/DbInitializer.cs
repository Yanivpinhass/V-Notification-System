using Magav.Common;
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

            // Create Locations table (must be before Shifts — FK dependency)
            var createLocationsSql = @"
                CREATE TABLE Locations (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL UNIQUE,
                    Address TEXT NULL,
                    City TEXT NULL,
                    Navigation TEXT NULL,
                    CreatedAt TEXT NULL,
                    UpdatedAt TEXT NULL
                );
            ";

            await using var locationsCmd = new SqliteCommand(createLocationsSql, connection);
            await locationsCmd.ExecuteNonQueryAsync();

            // Create Shifts table
            var createShiftsSql = @"
                CREATE TABLE Shifts (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ShiftDate TEXT NOT NULL,
                    ShiftName TEXT NOT NULL,
                    CarId TEXT NOT NULL DEFAULT '',
                    VolunteerId INTEGER NULL,
                    VolunteerName TEXT NULL,
                    LocationId INTEGER NULL,
                    CustomLocationName TEXT NULL,
                    CustomLocationNavigation TEXT NULL,
                    SmsSentAt TEXT NULL,
                    CreatedAt TEXT NULL,
                    UpdatedAt TEXT NULL,
                    FOREIGN KEY (VolunteerId) REFERENCES Volunteers(Id),
                    FOREIGN KEY (LocationId) REFERENCES Locations(Id)
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
                    ReminderType TEXT NOT NULL DEFAULT 'SameDay',
                    FOREIGN KEY (ShiftId) REFERENCES Shifts(Id)
                );
                CREATE INDEX IX_SmsLog_ShiftId ON SmsLog(ShiftId);
                CREATE INDEX IX_SmsLog_SentAt ON SmsLog(SentAt);
            ";

            await using var smsLogCmd = new SqliteCommand(createSmsLogSql, connection);
            await smsLogCmd.ExecuteNonQueryAsync();

            // Create MessageTemplate table (must be before SchedulerConfig — FK dependency)
            var createMessageTemplateSql = @"
                CREATE TABLE MessageTemplate (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Name TEXT NOT NULL,
                    Content TEXT NOT NULL,
                    CreatedAt TEXT NULL,
                    UpdatedAt TEXT NULL
                );
            ";

            await using var messageTemplateCmd = new SqliteCommand(createMessageTemplateSql, connection);
            await messageTemplateCmd.ExecuteNonQueryAsync();

            // Seed default message templates
            await SeedMessageTemplatesAsync(connection);

            // Create SchedulerConfig table
            var createSchedulerConfigSql = @"
                CREATE TABLE SchedulerConfig (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    DayGroup TEXT NOT NULL,
                    ReminderType TEXT NOT NULL,
                    Time TEXT NOT NULL,
                    DaysBeforeShift INTEGER NOT NULL DEFAULT 0,
                    IsEnabled INTEGER NOT NULL DEFAULT 1,
                    MessageTemplateId INTEGER NOT NULL DEFAULT 1,
                    UpdatedAt TEXT NULL,
                    UpdatedBy TEXT NULL,
                    UNIQUE(DayGroup, ReminderType)
                );
            ";

            await using var schedulerConfigCmd = new SqliteCommand(createSchedulerConfigSql, connection);
            await schedulerConfigCmd.ExecuteNonQueryAsync();

            // Create SchedulerRunLog table
            var createSchedulerRunLogSql = @"
                CREATE TABLE SchedulerRunLog (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ConfigId INTEGER NOT NULL,
                    ReminderType TEXT NOT NULL,
                    RanAt TEXT NOT NULL,
                    TargetDate TEXT NOT NULL,
                    TotalEligible INTEGER NOT NULL DEFAULT 0,
                    SmsSent INTEGER NOT NULL DEFAULT 0,
                    SmsFailed INTEGER NOT NULL DEFAULT 0,
                    Status TEXT NOT NULL DEFAULT 'Pending',
                    Error TEXT NULL,
                    FOREIGN KEY (ConfigId) REFERENCES SchedulerConfig(Id),
                    UNIQUE(ConfigId, TargetDate, ReminderType)
                );
                CREATE INDEX IX_SchedulerRunLog_RanAt ON SchedulerRunLog(RanAt);
                CREATE INDEX IX_SchedulerRunLog_ConfigId ON SchedulerRunLog(ConfigId);
            ";

            await using var schedulerRunLogCmd = new SqliteCommand(createSchedulerRunLogSql, connection);
            await schedulerRunLogCmd.ExecuteNonQueryAsync();

            // Seed default SchedulerConfig rows
            await SeedSchedulerConfigAsync(connection);

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
            await MigrateShiftsTableAsync(connection);
            await MigrateLocationsAsync(connection);
        }

    }

    public string GetConnectionString()
    {
        var fullPath = Path.GetFullPath(_dbPath);
        // Add busy timeout (30 seconds) to prevent "database is locked" errors
        return $"Data Source={fullPath};Password={_dbPassword};Default Timeout=30";
    }

    private static async Task MigrateShiftsTableAsync(SqliteConnection connection)
    {
        try
        {
            // Check if VolunteerName column already exists
            var hasColumn = false;
            await using (var checkCmd = new SqliteCommand("PRAGMA table_info(Shifts)", connection))
            await using (var reader = await checkCmd.ExecuteReaderAsync())
            {
                while (await reader.ReadAsync())
                {
                    if (reader.GetString(1) == "VolunteerName")
                    {
                        hasColumn = true;
                        break;
                    }
                }
            }

            if (hasColumn) return;

            Console.WriteLine("Migrating Shifts table: adding VolunteerName, making VolunteerId nullable...");

            var migrationSql = @"
                CREATE TABLE Shifts_new (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ShiftDate TEXT NOT NULL,
                    ShiftName TEXT NOT NULL,
                    CarId TEXT NOT NULL DEFAULT '',
                    VolunteerId INTEGER NULL,
                    VolunteerName TEXT NULL,
                    SmsSentAt TEXT NULL,
                    CreatedAt TEXT NULL,
                    UpdatedAt TEXT NULL,
                    FOREIGN KEY (VolunteerId) REFERENCES Volunteers(Id)
                );
                INSERT INTO Shifts_new (Id, ShiftDate, ShiftName, CarId, VolunteerId, SmsSentAt, CreatedAt, UpdatedAt)
                    SELECT Id, ShiftDate, ShiftName, CarId, VolunteerId, SmsSentAt, CreatedAt, UpdatedAt FROM Shifts;
                DROP TABLE Shifts;
                ALTER TABLE Shifts_new RENAME TO Shifts;
                CREATE INDEX IX_Shifts_VolunteerId ON Shifts(VolunteerId);
                CREATE INDEX IX_Shifts_ShiftDate ON Shifts(ShiftDate);
            ";

            await using var cmd = new SqliteCommand(migrationSql, connection);
            await cmd.ExecuteNonQueryAsync();
            Console.WriteLine("Shifts table migration completed successfully.");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Shifts table migration error: {ex}");
        }
    }

    private static async Task MigrateLocationsAsync(SqliteConnection connection)
    {
        try
        {
            // 1. Create Locations table if it doesn't exist
            await using (var checkCmd = new SqliteCommand(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='Locations'", connection))
            {
                var exists = Convert.ToInt32(await checkCmd.ExecuteScalarAsync()) > 0;
                if (!exists)
                {
                    Console.WriteLine("Creating Locations table...");
                    var createSql = @"
                        CREATE TABLE Locations (
                            Id INTEGER PRIMARY KEY AUTOINCREMENT,
                            Name TEXT NOT NULL UNIQUE,
                            Address TEXT NULL,
                            City TEXT NULL,
                            Navigation TEXT NULL,
                            CreatedAt TEXT NULL,
                            UpdatedAt TEXT NULL
                        );
                    ";
                    await using var createCmd = new SqliteCommand(createSql, connection);
                    await createCmd.ExecuteNonQueryAsync();
                    Console.WriteLine("Locations table created.");
                }
            }

            // 2. Add location columns to Shifts table (check each individually for partial-failure safety)
            var columnsToAdd = new[]
            {
                ("LocationId", "INTEGER NULL"),
                ("CustomLocationName", "TEXT NULL"),
                ("CustomLocationNavigation", "TEXT NULL"),
            };

            // Read existing columns
            var existingColumns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            await using (var pragmaCmd = new SqliteCommand("PRAGMA table_info(Shifts)", connection))
            await using (var reader = await pragmaCmd.ExecuteReaderAsync())
            {
                while (await reader.ReadAsync())
                {
                    existingColumns.Add(reader.GetString(1));
                }
            }

            foreach (var (columnName, columnType) in columnsToAdd)
            {
                if (existingColumns.Contains(columnName)) continue;

                Console.WriteLine($"Adding column {columnName} to Shifts table...");
                await using var alterCmd = new SqliteCommand(
                    $"ALTER TABLE Shifts ADD COLUMN {columnName} {columnType}", connection);
                await alterCmd.ExecuteNonQueryAsync();
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Locations migration error: {ex}");
        }
    }

    private static async Task SeedMessageTemplatesAsync(SqliteConnection connection)
    {
        var templates = new[]
        {
            ("תזכורת ליום המשמרת", "שלום {שם},\nתזכורת למשמרת היום ({יום}, {תאריך}),\nמשמרת {משמרת}, רכב {רכב}."),
            ("תזכורת מוקדמת", "שלום {שם},\nתזכורת למשמרת ביום {יום} {תאריך},\nמשמרת {משמרת}."),
            ("ביטול משמרת", "שלום {שם},\nהמשמרת שלך ביום {יום} {תאריך} בוטלה."),
        };

        var now = DateTime.UtcNow.ToString("o");
        var sql = @"INSERT INTO MessageTemplate (Name, Content, CreatedAt, UpdatedAt)
                    VALUES (@Name, @Content, @CreatedAt, @UpdatedAt)";

        foreach (var (name, content) in templates)
        {
            await using var cmd = new SqliteCommand(sql, connection);
            cmd.Parameters.AddWithValue("@Name", name);
            cmd.Parameters.AddWithValue("@Content", content);
            cmd.Parameters.AddWithValue("@CreatedAt", now);
            cmd.Parameters.AddWithValue("@UpdatedAt", now);
            await cmd.ExecuteNonQueryAsync();
        }

        Console.WriteLine("Message templates seeded with 3 default entries.");
    }

    private static async Task SeedSchedulerConfigAsync(SqliteConnection connection)
    {
        // MessageTemplateId 1 = "תזכורת ליום המשמרת" (SameDay), 2 = "תזכורת מוקדמת" (Advance)
        var configs = new[]
        {
            ("SunThu", MagavConstants.ReminderTypes.SameDay, "13:00", 0, 1),
            ("SunThu", MagavConstants.ReminderTypes.Advance, "18:30", 2, 2),
            ("Fri",    MagavConstants.ReminderTypes.SameDay, "10:00", 0, 1),
            ("Fri",    MagavConstants.ReminderTypes.Advance, "12:00", 2, 2),
            ("Sat",    MagavConstants.ReminderTypes.SameDay, "10:00", 0, 1),
            ("Sat",    MagavConstants.ReminderTypes.Advance, "12:00", 2, 2),
        };

        var sql = @"INSERT INTO SchedulerConfig (DayGroup, ReminderType, Time, DaysBeforeShift, IsEnabled, MessageTemplateId)
                    VALUES (@DayGroup, @ReminderType, @Time, @DaysBeforeShift, 1, @MessageTemplateId)";

        foreach (var (dayGroup, reminderType, time, daysBefore, templateId) in configs)
        {
            await using var cmd = new SqliteCommand(sql, connection);
            cmd.Parameters.AddWithValue("@DayGroup", dayGroup);
            cmd.Parameters.AddWithValue("@ReminderType", reminderType);
            cmd.Parameters.AddWithValue("@Time", time);
            cmd.Parameters.AddWithValue("@DaysBeforeShift", daysBefore);
            cmd.Parameters.AddWithValue("@MessageTemplateId", templateId);
            await cmd.ExecuteNonQueryAsync();
        }

        Console.WriteLine("Scheduler config seeded with 6 default entries.");
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
            var status = id % 6 == 0 ? MagavConstants.SmsStatuses.Fail : MagavConstants.SmsStatuses.Success;
            var error = status == MagavConstants.SmsStatuses.Fail ? "מספר טלפון לא תקין" : (string?)null;

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
