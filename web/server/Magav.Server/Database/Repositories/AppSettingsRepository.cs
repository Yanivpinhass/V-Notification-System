using Magav.Common.Database;
using Magav.Common.Models;

namespace Magav.Server.Database.Repositories;

// Repository for the AppSettings key-value table (administrative-shifts template roles — D5).
// Mirrors the Android AppSettingDao (getByKey / upsert). Parameterized queries only.
public class AppSettingsRepository : Repository<AppSetting>
{
    public AppSettingsRepository(DbHelper db) : base(db) { }

    public async Task<AppSetting?> GetByKeyAsync(string key)
    {
        var rows = await Db.FetchAsync<AppSetting>("SELECT Key, Value FROM AppSettings WHERE Key = @0", key);
        return rows.FirstOrDefault();
    }

    public async Task<string?> GetValueAsync(string key)
        => (await GetByKeyAsync(key))?.Value;

    // Insert-or-update the key. SQLite UPSERT (ON CONFLICT on the Key PK) keeps this atomic and
    // idempotent. Value is always parameterized.
    public async Task UpsertAsync(string key, string value)
    {
        await Db.ExecuteQueryAsync(
            "INSERT INTO AppSettings (Key, Value) VALUES (@0, @1) " +
            "ON CONFLICT(Key) DO UPDATE SET Value = @1",
            key, value);
    }
}
