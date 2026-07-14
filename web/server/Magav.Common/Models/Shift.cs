using NPoco;

namespace Magav.Common.Models;

[TableName("Shifts")]
[PrimaryKey("Id", AutoIncrement = true)]
public class Shift
{
    public int Id { get; set; }
    public DateTime ShiftDate { get; set; }
    public string ShiftName { get; set; } = string.Empty;
    public string CarId { get; set; } = string.Empty;
    public int? VolunteerId { get; set; }
    public string? VolunteerName { get; set; }
    public DateTime? SmsSentAt { get; set; }
    public int? LocationId { get; set; }
    public string? CustomLocationName { get; set; }
    public string? CustomLocationNavigation { get; set; }
    public bool IsCanceled { get; set; }
    public DateTime? CanceledAt { get; set; }
    public DateTime? CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }

    // Administrative-shifts feature (two shift types: Operational | Administrative).
    // ShiftType discriminates every shift; the 4 nullable admin columns carry admin-only
    // fields and stay NULL for operational rows. Backfilled to 'Operational' on existing
    // DBs via the column DEFAULT (see DbInitializer.MigrateShiftTypeColumnsAsync).
    public string ShiftType { get; set; } = MagavConstants.ShiftTypes.Operational;
    public string? Description { get; set; }
    public string? ShiftTime { get; set; }
    public string? Address { get; set; }
    public string? VehicleLocation { get; set; }

    // v2: reference to a picked Vehicle-type Location for admin shifts (מיקום רכב picker). NULL for
    // operational rows and for admin rows using free-text VehicleLocation. Added via MigrateLocationTypeColumnsAsync.
    public int? VehicleLocationId { get; set; }
}
