using Magav.Common.Database;
using Magav.Common.Models;

namespace Magav.Server.Database.Repositories;

public class JewishHolidaysRepository : Repository<JewishHoliday>
{
    public JewishHolidaysRepository(DbHelper db) : base(db) { }

    public async Task<JewishHoliday?> GetByIdAsync(int id) => await GetByIdAsync((long)id);

    public async Task<JewishHoliday?> GetByDateAsync(string date)
        => await Db.SingleOrDefaultAsync<JewishHoliday>(h => h.Date == date);

    public async Task<bool> IsHolidayAsync(string date)
    {
        var count = await Db.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM JewishHolidays WHERE Date = @0", date);
        return count > 0;
    }

    public async Task<List<JewishHoliday>> GetAllSortedAsync()
    {
        return await Db.FetchAsync<JewishHoliday>(
            "SELECT * FROM JewishHolidays ORDER BY Date");
    }
}
