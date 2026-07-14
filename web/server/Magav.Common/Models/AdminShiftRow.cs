namespace Magav.Common.Models;

// Row DTO for the administrative-shifts week view (join of Shifts + Volunteers + Locations).
// Carries the admin-only columns (Description/ShiftTime/Address/VehicleLocation) plus the reused
// CarId (vehicle) and location fields. One row per assigned volunteer; the UI groups rows by
// (ShiftDate, ShiftTime, Description).
public class AdminShiftRow
{
    public int Id { get; set; }
    public DateTime ShiftDate { get; set; }
    public string ShiftName { get; set; } = string.Empty;
    public string CarId { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? ShiftTime { get; set; }
    public string? Address { get; set; }
    public string? VehicleLocation { get; set; }
    public int? VolunteerId { get; set; }
    public int? LocationId { get; set; }
    public string? VolunteerName { get; set; }
    public string? VolunteerPhone { get; set; }
    public bool VolunteerApproved { get; set; }
    public string? LocationName { get; set; }
    public string? LocationNavigation { get; set; }
    public string? LocationCity { get; set; }

    // v2: vehicle-location reference (מיקום רכב picker) resolved from VehicleLocationId, with a
    // free-text fallback (VehicleLocation). Used by the week-card display, openEdit mapping, and SMS.
    public int? VehicleLocationId { get; set; }
    public string? VehicleLocationName { get; set; }
    public string? VehicleLocationNavigation { get; set; }
    public string? VehicleLocationCity { get; set; }
}
