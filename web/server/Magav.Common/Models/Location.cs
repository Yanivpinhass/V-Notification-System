using NPoco;

namespace Magav.Common.Models;

[TableName("Locations")]
[PrimaryKey("Id", AutoIncrement = true)]
public class Location
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Address { get; set; }
    public string? City { get; set; }
    public string? Navigation { get; set; }
    public DateTime? CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}
