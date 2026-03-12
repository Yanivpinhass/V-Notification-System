using NPoco;

namespace Magav.Common.Models;

[TableName("MessageTemplate")]
[PrimaryKey("Id", AutoIncrement = true)]
public class MessageTemplate
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public DateTime? CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}
