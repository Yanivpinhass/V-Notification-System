using NPoco;

namespace Magav.Common.Models;

[TableName("JewishHolidays")]
[PrimaryKey("Id", AutoIncrement = true)]
public class JewishHoliday
{
    public int Id { get; set; }
    public string Date { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
}
