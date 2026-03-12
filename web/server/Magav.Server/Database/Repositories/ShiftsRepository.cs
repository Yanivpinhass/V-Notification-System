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

    public async Task<bool> HasShiftGroupAsync(DateTime date, string shiftName, string carId)
    {
        var shifts = await GetByDateAsync(date);
        return shifts.Any(s => s.ShiftName == shiftName && s.CarId == carId);
    }

    public async Task<int> UpdateShiftGroupAsync(DateTime date, string oldShiftName, string oldCarId, string newShiftName, string newCarId)
    {
        var shifts = await GetByDateAsync(date);
        var matching = shifts.Where(s => s.ShiftName == oldShiftName && s.CarId == oldCarId).ToList();

        foreach (var shift in matching)
        {
            shift.ShiftName = newShiftName;
            shift.CarId = newCarId;
            shift.UpdatedAt = DateTime.UtcNow;
            await UpdateAsync(shift);
        }

        return matching.Count;
    }
}
