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

    public async Task<bool> IsReferencedByFutureShiftsAsync(int locationId)
    {
        var israelTz = TimeZoneInfo.FindSystemTimeZoneById(
            OperatingSystem.IsWindows() ? "Israel Standard Time" : "Asia/Jerusalem");
        var today = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, israelTz).Date;

        var count = await Db.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM Shifts WHERE LocationId = @0 AND ShiftDate >= @1",
            locationId, today.ToString("o"));
        return count > 0;
    }
}
