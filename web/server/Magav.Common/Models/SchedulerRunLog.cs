using NPoco;

namespace Magav.Common.Models;

[TableName("SchedulerRunLog")]
[PrimaryKey("Id", AutoIncrement = true)]
public class SchedulerRunLog
{
    public int Id { get; set; }
    public int ConfigId { get; set; }
    public string ReminderType { get; set; } = string.Empty;
    public string RanAt { get; set; } = string.Empty;
    public string TargetDate { get; set; } = string.Empty;
    public int TotalEligible { get; set; }
    public int SmsSent { get; set; }
    public int SmsFailed { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? Error { get; set; }
}
