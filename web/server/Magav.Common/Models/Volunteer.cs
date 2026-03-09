using NPoco;

namespace Magav.Common.Models;

[TableName("Volunteers")]
[PrimaryKey("Id", AutoIncrement = true)]
public class Volunteer
{
    public int Id { get; set; }
    public string InternalIdHash { get; set; } = string.Empty;  // SHA256 hash
    public string MappingName { get; set; } = string.Empty;
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string? MobilePhone { get; set; }
    public bool ApproveToReceiveSms { get; set; } = false;
    public int? RoleId { get; set; }
    public DateTime? CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}
