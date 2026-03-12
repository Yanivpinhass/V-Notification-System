using Magav.Common.Database;
using Magav.Common.Models;

namespace Magav.Server.Database.Repositories;

public class MessageTemplateRepository : Repository<MessageTemplate>
{
    public MessageTemplateRepository(DbHelper db) : base(db) { }

    public async Task<MessageTemplate?> GetByIdAsync(int id)
        => await Db.SingleOrDefaultByIdAsync<MessageTemplate>(id);

    public async Task<bool> IsInUseAsync(int id)
    {
        var count = await Db.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM SchedulerConfig WHERE MessageTemplateId = @0", id);
        return count > 0;
    }
}
