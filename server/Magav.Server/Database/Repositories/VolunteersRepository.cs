using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Magav.Common.Database;
using Magav.Common.Models;
using Magav.Server.Database;

namespace Magav.Server.Database.Repositories;

public class VolunteersRepository : Repository<Volunteer>
{
    public VolunteersRepository(DbHelper db) : base(db) { }

    /// <summary>
    /// Hash internal ID using SHA256 (same pattern as refresh tokens).
    /// </summary>
    public static string HashInternalId(string internalId)
    {
        if (string.IsNullOrWhiteSpace(internalId))
            throw new ArgumentException("Internal ID cannot be empty", nameof(internalId));
        return Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(internalId)));
    }

    public async Task<Volunteer?> GetByInternalIdAsync(string internalId)
    {
        if (string.IsNullOrWhiteSpace(internalId))
            return null;
        var hash = HashInternalId(internalId);
        return await Db.SingleOrDefaultAsync<Volunteer>(v => v.InternalIdHash == hash);
    }

    public async Task<bool> ExistsByInternalIdAsync(string internalId)
    {
        if (string.IsNullOrWhiteSpace(internalId))
            return false;
        var hash = HashInternalId(internalId);
        var count = await Db.GetCountByConditionAsync<Volunteer>(v => v.InternalIdHash == hash);
        return count > 0;
    }

    public async Task<List<Volunteer>> GetByRoleIdAsync(int roleId)
        => await Db.FetchAsync<Volunteer>(v => v.RoleId == roleId);

    public async Task<List<Volunteer>> GetSmsApprovedAsync()
        => await Db.FetchAsync<Volunteer>(v => v.ApproveToReceiveSms);

    public async Task<Volunteer?> GetByIdAsync(int id) => await GetByIdAsync((long)id);
}
