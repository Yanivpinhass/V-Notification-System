using Magav.Common.Database;
using Magav.Common.Models;
using Microsoft.Data.Sqlite;
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
        catch (SqliteException ex) when (
            ex.SqliteErrorCode == 19 ||           // SQLITE_CONSTRAINT
            ex.SqliteExtendedErrorCode == 2067 || // SQLITE_CONSTRAINT_UNIQUE
            (ex.Message?.Contains("UNIQUE", StringComparison.OrdinalIgnoreCase) ?? false))
        {
            // UNIQUE constraint violation = this run already happened — silent dedup hit.
            return null;
        }
        catch (Exception ex)
        {
            // Not a dedup hit: a transient/real DB error. Log distinctly so it is no longer
            // masked as "already ran". Return null WITHOUT rethrowing — a rethrow would bubble
            // up to the scheduler and could trigger a re-send → duplicate SMS. [ISS-006]
            // Keep STRUCTURALLY IDENTICAL to the Android mirror in
            // android/.../service/SmsReminderService.kt (run-log insert catch).
            Console.Error.WriteLine(
                $"ERROR: SchedulerRunLog insert failed (non-UNIQUE) for ConfigId={log.ConfigId}, " +
                $"TargetDate={log.TargetDate}, ReminderType={log.ReminderType}: {ex}");
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
