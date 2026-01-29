namespace Magav.Common.Models;

public class ExcelShift
{
    public DateTime Date { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Car { get; set; } = string.Empty;
    public List<string> Volunteers { get; set; } = new();
}
