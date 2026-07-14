using Magav.Common;
using Magav.Common.Database;
using Magav.Common.Models;
using Magav.Server.Database;

namespace Magav.Server.Database.Repositories;

public class ShiftsRepository : Repository<Shift>
{
    public ShiftsRepository(DbHelper db) : base(db) { }

    // OPERATIONAL by-date read. The ShiftType='Operational' predicate is the .NET choke point — it
    // transitively scopes the by-date page, delete-group, and update-group (all load through here) to
    // operational shifts, so administrative rows never bleed into them. (Admin has its own by-week read.)
    public async Task<List<Shift>> GetByDateAsync(DateTime date)
    {
        // Use date range comparison (works reliably with SQLite TEXT dates)
        var startOfDay = date.Date;
        var endOfDay = date.Date.AddDays(1);
        return await Db.FetchAsync<Shift>(s => s.ShiftDate >= startOfDay && s.ShiftDate < endOfDay
            && s.ShiftType == MagavConstants.ShiftTypes.Operational && !s.IsCanceled);
    }

    public async Task<List<DateTime>> GetDatesWithShiftsAsync(DateTime from, DateTime to)
    {
        var shifts = await Db.FetchAsync<Shift>(s => s.ShiftDate >= from && s.ShiftDate < to
            && s.ShiftType == MagavConstants.ShiftTypes.Operational && !s.IsCanceled);
        return shifts.Select(s => s.ShiftDate.Date).Distinct().ToList();
    }

    public async Task<List<DateTime>> GetDatesWithUnresolvedAsync(DateTime from, DateTime to)
    {
        var shifts = await Db.FetchAsync<Shift>(
            "SELECT DISTINCT ShiftDate FROM Shifts WHERE VolunteerId IS NULL AND IsCanceled = 0 AND ShiftType = 'Operational' AND ShiftDate >= @0 AND ShiftDate < @1",
            from, to);
        return shifts.Select(s => s.ShiftDate.Date).Distinct().ToList();
    }

    // F1: TYPE-AGNOSTIC by design — the volunteer-delete cascade must cover admin shifts too.
    public async Task<List<Shift>> GetByVolunteerIdAsync(int volunteerId)
        => await Db.FetchAsync<Shift>(s => s.VolunteerId == volunteerId && !s.IsCanceled);

    public async Task<List<CanceledShiftRow>> GetCanceledByMonthAsync(int year, int month)
    {
        var start = new DateTime(year, month, 1);
        var end = start.AddMonths(1);
        return await Db.FetchAsync<CanceledShiftRow>(
            @"SELECT s.Id, s.ShiftDate, s.ShiftName, s.CarId, s.VolunteerId,
                     s.LocationId, s.CustomLocationName, s.CustomLocationNavigation,
                     s.CanceledAt,
                     v.MappingName AS VolunteerName, v.MobilePhone AS VolunteerPhone,
                     v.ApproveToReceiveSms AS VolunteerApproved,
                     COALESCE(l.Name, s.CustomLocationName) AS LocationName,
                     COALESCE(l.Navigation, s.CustomLocationNavigation) AS LocationNavigation,
                     l.City AS LocationCity
              FROM Shifts s
              LEFT JOIN Volunteers v ON s.VolunteerId = v.Id
              LEFT JOIN Locations  l ON s.LocationId  = l.Id
              WHERE s.IsCanceled = 1
                AND s.ShiftType = 'Operational'
                AND s.ShiftDate >= @0
                AND s.ShiftDate <  @1
              ORDER BY s.ShiftDate, s.ShiftName, v.MappingName",
            start, end);
    }

    // ADMINISTRATIVE by-week read. Returns admin rows (ShiftType='Administrative') for the Sun→Sat
    // window [weekStart, weekStart+7), joined to volunteer + location. Never returns operational rows.
    public async Task<List<AdminShiftRow>> GetAdministrativeByWeekAsync(DateTime weekStart)
    {
        var start = weekStart.Date;
        var end = start.AddDays(7);
        return await Db.FetchAsync<AdminShiftRow>(
            @"SELECT s.Id, s.ShiftDate, s.ShiftName, s.CarId,
                     s.Description, s.ShiftTime, s.Address, s.VehicleLocation,
                     s.VolunteerId, s.LocationId, s.VehicleLocationId,
                     v.MappingName AS VolunteerName, v.MobilePhone AS VolunteerPhone,
                     v.ApproveToReceiveSms AS VolunteerApproved,
                     COALESCE(l.Name, s.CustomLocationName) AS LocationName,
                     COALESCE(l.Navigation, s.CustomLocationNavigation) AS LocationNavigation,
                     l.City AS LocationCity,
                     COALESCE(vl.Name, s.VehicleLocation) AS VehicleLocationName,
                     vl.Navigation AS VehicleLocationNavigation,
                     vl.City AS VehicleLocationCity
              FROM Shifts s
              LEFT JOIN Volunteers v  ON s.VolunteerId       = v.Id
              LEFT JOIN Locations  l  ON s.LocationId        = l.Id
              LEFT JOIN Locations  vl ON s.VehicleLocationId = vl.Id
              WHERE s.ShiftType = @0
                AND s.IsCanceled = 0
                AND s.ShiftDate >= @1
                AND s.ShiftDate <  @2
              ORDER BY s.ShiftDate, s.ShiftTime, s.Description, v.MappingName",
            MagavConstants.ShiftTypes.Administrative, start, end);
    }

    // Active volunteer-ids already in a (Date, ShiftTime, Description) admin group. Used by the create
    // endpoint's dup-volunteer guard so the add-volunteers-in-edit re-POST is idempotent.
    public async Task<HashSet<int>> GetAdminGroupVolunteerIdsAsync(DateTime date, string shiftTime, string description)
    {
        var dateStart = date.Date.ToString("o");
        var dateEnd = date.Date.AddDays(1).ToString("o");
        var rows = await Db.FetchAsync<int>(
            @"SELECT VolunteerId FROM Shifts
              WHERE ShiftType = 'Administrative' AND IsCanceled = 0 AND VolunteerId IS NOT NULL
                AND ShiftDate >= @0 AND ShiftDate < @1
                AND ShiftTime = @2 AND Description = @3",
            dateStart, dateEnd, shiftTime, description);
        return rows.ToHashSet();
    }

    // Count active administrative rows matching a (Date, ShiftTime, Description) group. Used by the
    // update/cancel endpoints for the affected-row count (they read-then-write, like the operational
    // cancel-group). ShiftDate stored as ISO 'o' TEXT → lexicographic string range works.
    public async Task<int> CountAdminGroupAsync(DateTime date, string shiftTime, string description)
    {
        var dateStart = date.Date.ToString("o");
        var dateEnd = date.Date.AddDays(1).ToString("o");
        return await Db.ExecuteScalarAsync<int>(
            @"SELECT COUNT(*) FROM Shifts
              WHERE ShiftType = 'Administrative' AND IsCanceled = 0
                AND ShiftDate >= @0 AND ShiftDate < @1
                AND ShiftTime = @2 AND Description = @3",
            dateStart, dateEnd, shiftTime, description);
    }

    // Atomic administrative group update keyed on the OLD (Date, ShiftTime, Description) triple → new
    // values, scoped to ShiftType='Administrative'. Editing re-buckets (Caveat 1). ShiftName is kept
    // == Description (both set to @0) so the NOT-NULL ShiftName constraint stays satisfied and the
    // group never empty-buckets. Returns the number of rows updated (counted before the write).
    public async Task<int> UpdateAdminGroupAsync(
        DateTime date, string oldShiftTime, string oldDescription,
        string newDescription, string newShiftTime, string? address,
        int? locationId, string? customLocationName, string? customLocationNavigation,
        string? carId, string? vehicleLocation, int? vehicleLocationId)
    {
        var count = await CountAdminGroupAsync(date, oldShiftTime, oldDescription);
        if (count == 0) return 0;

        var dateStart = date.Date.ToString("o");
        var dateEnd = date.Date.AddDays(1).ToString("o");
        var nowIso = DateTime.UtcNow.ToString("o");
        await Db.ExecuteQueryAsync(
            @"UPDATE Shifts SET
                 Description = @0, ShiftName = @0, ShiftTime = @1, Address = @2,
                 LocationId = @3, CustomLocationName = @4, CustomLocationNavigation = @5,
                 CarId = @6, VehicleLocation = @7, VehicleLocationId = @8, UpdatedAt = @9
              WHERE ShiftType = 'Administrative' AND IsCanceled = 0
                AND ShiftDate >= @10 AND ShiftDate < @11
                AND ShiftTime = @12 AND Description = @13",
            newDescription, newShiftTime, address,
            locationId, customLocationName, customLocationNavigation,
            carId ?? "", vehicleLocation, vehicleLocationId, nowIso,
            dateStart, dateEnd, oldShiftTime, oldDescription);
        return count;
    }

    // Soft-cancel an administrative group keyed on (Date, ShiftTime, Description), scoped to
    // ShiftType='Administrative'. NEVER reuses the operational ShiftName+CarId cancel path. Returns
    // the number of rows canceled (counted before the write).
    public async Task<int> CancelAdminGroupAsync(DateTime date, string shiftTime, string description)
    {
        var count = await CountAdminGroupAsync(date, shiftTime, description);
        if (count == 0) return 0;

        var dateStart = date.Date.ToString("o");
        var dateEnd = date.Date.AddDays(1).ToString("o");
        var nowIso = DateTime.UtcNow.ToString("o");
        await Db.ExecuteQueryAsync(
            @"UPDATE Shifts SET IsCanceled = 1, CanceledAt = @0, UpdatedAt = @1
              WHERE ShiftType = 'Administrative' AND IsCanceled = 0
                AND ShiftDate >= @2 AND ShiftDate < @3
                AND ShiftTime = @4 AND Description = @5",
            nowIso, nowIso, dateStart, dateEnd, shiftTime, description);
        return count;
    }

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
                AND s.ShiftType = 'Operational'
                AND s.IsCanceled = 0
                AND sl.ReminderType = @4 AND sl.Status = @5",
            dateStart, dateEnd, shiftName, carId, MagavConstants.ReminderTypes.SameDay, MagavConstants.SmsStatuses.Success);
        return count > 0;
    }
}
