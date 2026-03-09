using Magav.Common.Database;
using Magav.Common.Models;
using Magav.Server.Database;

namespace Magav.Server.Database.Repositories;

public class ShiftsRepository : Repository<Shift>
{
    public ShiftsRepository(DbHelper db) : base(db) { }

    public async Task<List<Shift>> GetByDateAsync(DateTime date)
    {
        // Use date range comparison (works reliably with SQLite TEXT dates)
        var startOfDay = date.Date;
        var endOfDay = date.Date.AddDays(1);
        return await Db.FetchAsync<Shift>(s => s.ShiftDate >= startOfDay && s.ShiftDate < endOfDay);
    }

    public async Task<List<Shift>> GetByVolunteerIdAsync(int volunteerId)
        => await Db.FetchAsync<Shift>(s => s.VolunteerId == volunteerId);

    public async Task<Shift?> GetByIdAsync(int id) => await GetByIdAsync((long)id);

    public async Task<bool> MarkSmsSentAsync(int shiftId)
    {
        var shift = await GetByIdAsync(shiftId);
        if (shift == null) return false;

        shift.SmsSentAt = DateTime.UtcNow;
        shift.UpdatedAt = DateTime.UtcNow;
        await UpdateAsync(shift);
        return true;
    }
}
