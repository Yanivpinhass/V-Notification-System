using Magav.Common.Database;
using Magav.Common.Models;

namespace Magav.Server.Database.Repositories;

public class SmsLogRepository : Repository<SmsLog>
{
    public SmsLogRepository(DbHelper db) : base(db) { }

    public async Task<List<SmsLog>> GetByDateRangeAsync(DateTime from, DateTime to)
    {
        return await Db.FetchAsync<SmsLog>(s => s.SentAt >= from && s.SentAt < to);
    }

    public async Task<List<SmsLog>> GetByDateAsync(DateTime date)
    {
        return await GetByDateRangeAsync(date.Date, date.Date.AddDays(1));
    }

    public async Task<List<SmsLog>> GetFailedByDateRangeAsync(DateTime from, DateTime to)
    {
        return await Db.FetchAsync<SmsLog>(s => s.SentAt >= from && s.SentAt < to && s.Status == "Fail");
    }

    public async Task<List<SmsLog>> GetFailedByDateAsync(DateTime date)
    {
        return await GetFailedByDateRangeAsync(date.Date, date.Date.AddDays(1));
    }
}
