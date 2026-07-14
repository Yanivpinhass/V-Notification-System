using Magav.Common.Database;
using Magav.Common.Models;
using Magav.Server.Database;

namespace Magav.Server.Database.Repositories;

public class LocationsRepository : Repository<Location>
{
    public LocationsRepository(DbHelper db) : base(db) { }

    public async Task<Location?> GetByIdAsync(int id) => await GetByIdAsync((long)id);

    public async Task<Location?> GetByNameAsync(string name)
        => await Db.SingleOrDefaultAsync<Location>(l => l.Name == name);

    // Locations of a single type (Vehicle = מיקומי ניידות | General = מיקומים כללי). The GET endpoint
    // uses this so General rows never leak into vehicle pickers (and vice versa). Name uniqueness stays global.
    public async Task<List<Location>> GetByTypeAsync(string type)
        => await Db.FetchAsync<Location>(l => l.LocationType == type);

    // A location is undeletable while a FUTURE shift references it as EITHER its mission location
    // (LocationId) OR its vehicle location (VehicleLocationId — v2). Type-agnostic + IsCanceled-agnostic
    // (pre-existing behavior, unchanged).
    public async Task<bool> IsReferencedByFutureShiftsAsync(int locationId)
    {
        var israelTz = TimeZoneInfo.FindSystemTimeZoneById(
            OperatingSystem.IsWindows() ? "Israel Standard Time" : "Asia/Jerusalem");
        var today = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, israelTz).Date;

        var count = await Db.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM Shifts WHERE (LocationId = @0 OR VehicleLocationId = @0) AND ShiftDate >= @1",
            locationId, today.ToString("o"));
        return count > 0;
    }
}
