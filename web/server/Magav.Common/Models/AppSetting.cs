using NPoco;

namespace Magav.Common.Models;

// Key-value application settings (administrative-shifts feature — D5). Mirrors the existing Android
// AppSettings table (AppSettingEntity). Stores the admin template-role ids
// (admin_assignment_template_id / admin_today_template_id); the advance template id lives on the
// admin SchedulerConfig.MessageTemplateId row instead. String primary key, NOT auto-increment.
[TableName("AppSettings")]
[PrimaryKey("Key", AutoIncrement = false)]
public class AppSetting
{
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
}
