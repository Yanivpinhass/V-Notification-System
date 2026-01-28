using NPoco;

namespace Magav.Common.Models;

[TableName("Shifts")]
[PrimaryKey("Id", AutoIncrement = true)]
public class Shift
{
    public int Id { get; set; }
    public DateTime ShiftDate { get; set; }
    public string ShiftName { get; set; } = string.Empty;
    public int VolunteerId { get; set; }
    public DateTime? SmsSentAt { get; set; }
    public DateTime? CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}
