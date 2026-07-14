using Magav.Common;
using Magav.Common.Database;
using Magav.Common.Models;

namespace Magav.Server.Database.Repositories;

public class SchedulerConfigRepository : Repository<SchedulerConfig>
{
    public SchedulerConfigRepository(DbHelper db) : base(db) { }

    public async Task<SchedulerConfig?> GetByIdAsync(int id)
    {
        return await Db.SingleOrDefaultByIdAsync<SchedulerConfig>(id);
    }

    public async Task<List<SchedulerConfig>> GetEnabledAsync()
    {
        return await Db.FetchAsync<SchedulerConfig>(c => c.IsEnabled == 1);
    }

    // Operational scheduler configs only (EXCLUDES the administrative-shifts AdminAdvance row). Used by
    // the operational /api/scheduler/config GET + exact-match bulk PUT so the admin row never leaks into
    // the operational UI and never breaks the set-equality save check (§6c). The scheduler itself keeps
    // using GetEnabledAsync (which DOES include the enabled admin row) so the admin config still fires.
    public async Task<List<SchedulerConfig>> GetOperationalAsync()
        => await Db.FetchAsync<SchedulerConfig>(c => c.ReminderType != MagavConstants.ReminderTypes.AdminAdvance);

    // The single administrative advance config row (ReminderType='AdminAdvance'). Exactly one exists —
    // UNIQUE(DayGroup, ReminderType) + seeded as (SunThu, AdminAdvance).
    public async Task<SchedulerConfig?> GetAdminAdvanceAsync()
        => (await Db.FetchAsync<SchedulerConfig>(c => c.ReminderType == MagavConstants.ReminderTypes.AdminAdvance)).FirstOrDefault();
}
