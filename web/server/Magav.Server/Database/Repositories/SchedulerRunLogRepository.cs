using Magav.Common.Database;
using Magav.Common.Models;
using NPoco;

namespace Magav.Server.Database.Repositories;

public class SchedulerRunLogRepository : Repository<SchedulerRunLog>
{
    public SchedulerRunLogRepository(DbHelper db) : base(db) { }

    public async Task<List<SchedulerRunLog>> GetRecentAsync(int count)
    {
        return await Db.FetchAsync<SchedulerRunLog>(
            Sql.Builder.OrderBy("RanAt DESC").Append($"LIMIT {count}"));
    }

    public new async Task<SchedulerRunLog?> InsertAsync(SchedulerRunLog log)
    {
        try
        {
            await Db.InsertAsync(log);
            return log;
        }
        catch (Exception)
        {
            // UNIQUE constraint violation means already ran — return null
            return null;
        }
    }

    public async Task<bool> ExistsForConfigAndDateAsync(int configId, string targetDate, string reminderType)
    {
        var count = await Db.ExecuteScalarAsync<int>(
            "SELECT COUNT(1) FROM SchedulerRunLog WHERE ConfigId = @0 AND TargetDate = @1 AND ReminderType = @2",
            configId, targetDate, reminderType);
        return count > 0;
    }
}
