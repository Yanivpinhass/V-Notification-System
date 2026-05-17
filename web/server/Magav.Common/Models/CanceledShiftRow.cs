namespace Magav.Common.Models;

public class CanceledShiftRow
{
    public int Id { get; set; }
    public DateTime ShiftDate { get; set; }
    public string ShiftName { get; set; } = string.Empty;
    public string CarId { get; set; } = string.Empty;
    public int? VolunteerId { get; set; }
    public int? LocationId { get; set; }
    public string? CustomLocationName { get; set; }
    public string? CustomLocationNavigation { get; set; }
    public DateTime? CanceledAt { get; set; }
    public string? VolunteerName { get; set; }
    public string? VolunteerPhone { get; set; }
    public bool VolunteerApproved { get; set; }
    public string? LocationName { get; set; }
    public string? LocationNavigation { get; set; }
    public string? LocationCity { get; set; }
}
