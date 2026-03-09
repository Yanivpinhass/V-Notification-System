using NPoco;

namespace Magav.Common.Models;

[TableName("SmsLog")]
[PrimaryKey("Id", AutoIncrement = true)]
public class SmsLog
{
    public int Id { get; set; }
    public int ShiftId { get; set; }
    public DateTime SentAt { get; set; }
    public string Status { get; set; } = "Success";
    public string? Error { get; set; }
    public string ReminderType { get; set; } = "SameDay";
}
