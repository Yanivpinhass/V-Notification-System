using Magav.Common;
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

    public async Task<List<DateTime>> GetDatesWithShiftsAsync(DateTime from, DateTime to)
    {
        var shifts = await Db.FetchAsync<Shift>(s => s.ShiftDate >= from && s.ShiftDate < to);
        return shifts.Select(s => s.ShiftDate.Date).Distinct().ToList();
    }

    public async Task<List<DateTime>> GetDatesWithUnresolvedAsync(DateTime from, DateTime to)
    {
        var shifts = await Db.FetchAsync<Shift>(
            "SELECT DISTINCT ShiftDate FROM Shifts WHERE VolunteerId IS NULL AND ShiftDate >= @0 AND ShiftDate < @1",
            from, to);
        return shifts.Select(s => s.ShiftDate.Date).Distinct().ToList();
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
        => HasShiftGroup(await GetByDateAsync(date), shiftName, carId);

    public async Task<int> UpdateShiftGroupAsync(DateTime date, string oldShiftName, string oldCarId, string newShiftName, string newCarId)
        => await UpdateShiftGroupAsync(await GetByDateAsync(date), oldShiftName, oldCarId, newShiftName, newCarId);

    public async Task<int> UpdateShiftGroupLocationAsync(
        DateTime date, string shiftName, string carId,
        int? locationId, string? customLocationName, string? customLocationNavigation)
        => await UpdateShiftGroupLocationAsync(await GetByDateAsync(date), shiftName, carId, locationId, customLocationName, customLocationNavigation);

    // Overloads accepting pre-loaded shifts (avoid redundant GetByDateAsync calls)

    public bool HasShiftGroup(IEnumerable<Shift> shifts, string shiftName, string carId)
        => shifts.Any(s => s.ShiftName == shiftName && s.CarId == carId);

    public async Task<int> UpdateShiftGroupAsync(
        IEnumerable<Shift> allShifts, string oldShiftName, string oldCarId,
        string newShiftName, string newCarId)
    {
        var matching = allShifts.Where(s => s.ShiftName == oldShiftName && s.CarId == oldCarId).ToList();

        foreach (var shift in matching)
        {
            shift.ShiftName = newShiftName;
            shift.CarId = newCarId;
            shift.UpdatedAt = DateTime.UtcNow;
            await UpdateAsync(shift);
        }

        return matching.Count;
    }

    public async Task<int> UpdateShiftGroupLocationAsync(
        IEnumerable<Shift> allShifts, string shiftName, string carId,
        int? locationId, string? customLocationName, string? customLocationNavigation)
    {
        var matching = allShifts.Where(s => s.ShiftName == shiftName && s.CarId == carId).ToList();

        foreach (var shift in matching)
        {
            shift.LocationId = locationId;
            shift.CustomLocationName = customLocationName;
            shift.CustomLocationNavigation = customLocationNavigation;
            shift.UpdatedAt = DateTime.UtcNow;
            await UpdateAsync(shift);
        }

        return matching.Count;
    }

    public async Task<bool> HasSameDaySmsBeenSentAsync(DateTime date, string shiftName, string carId)
    {
        var dateStart = date.Date.ToString("o");
        var dateEnd = date.Date.AddDays(1).ToString("o");
        var count = await Db.ExecuteScalarAsync<int>(
            @"SELECT COUNT(*) FROM SmsLog sl
              JOIN Shifts s ON sl.ShiftId = s.Id
              WHERE s.ShiftDate >= @0 AND s.ShiftDate < @1
                AND s.ShiftName = @2 AND s.CarId = @3
                AND sl.ReminderType = @4 AND sl.Status = @5",
            dateStart, dateEnd, shiftName, carId, MagavConstants.ReminderTypes.SameDay, MagavConstants.SmsStatuses.Success);
        return count > 0;
    }
}
