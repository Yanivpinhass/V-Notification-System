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
}
