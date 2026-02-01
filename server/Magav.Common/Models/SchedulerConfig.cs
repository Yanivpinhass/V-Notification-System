using NPoco;

namespace Magav.Common.Models;

[TableName("SchedulerConfig")]
[PrimaryKey("Id", AutoIncrement = true)]
public class SchedulerConfig
{
    public int Id { get; set; }
    public string DayGroup { get; set; } = string.Empty;
    public string ReminderType { get; set; } = string.Empty;
    public string Time { get; set; } = string.Empty;
    public int DaysBeforeShift { get; set; }
    public int IsEnabled { get; set; } = 1;
    public string MessageTemplate { get; set; } = string.Empty;
    public DateTime? UpdatedAt { get; set; }
    public string? UpdatedBy { get; set; }
}
