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

    /// <summary>
    /// Insert or update volunteer by internal ID.
    /// On update: only updates MappingName and MobilePhone, preserves other fields.
    /// </summary>
    public async Task<bool> UpsertByInternalIdAsync(Volunteer volunteer, string rawInternalId)
    {
        var hash = HashInternalId(rawInternalId);
        var existing = await GetByInternalIdAsync(rawInternalId);

        if (existing != null)
        {
            // UPDATE: Only update fields from Excel, preserve other fields
            existing.MappingName = volunteer.MappingName;
            existing.MobilePhone = volunteer.MobilePhone;
            existing.UpdatedAt = DateTime.UtcNow;
            await UpdateAsync(existing);
            return false; // Updated
        }
        else
        {
            // INSERT: Set hash and timestamps
            volunteer.InternalIdHash = hash;
            volunteer.CreatedAt = DateTime.UtcNow;
            volunteer.UpdatedAt = DateTime.UtcNow;
            await InsertAsync(volunteer);
            return true; // Inserted
        }
    }

    /// <summary>
    /// Update volunteer SMS approval and contact details.
    /// Returns false if volunteer not found or already approved.
    /// </summary>
    public async Task<bool> UpdateSmsApprovalAsync(
        string rawInternalId,
        string firstName,
        string lastName,
        string mobilePhone,
        bool approveToReceiveSms)
    {
        var volunteer = await GetByInternalIdAsync(rawInternalId);
        if (volunteer == null) return false;
        if (volunteer.ApproveToReceiveSms) return false; // Already approved - must contact admin

        volunteer.FirstName = firstName;
        volunteer.LastName = lastName;
        volunteer.MobilePhone = mobilePhone;
        volunteer.ApproveToReceiveSms = approveToReceiveSms;
        volunteer.UpdatedAt = DateTime.UtcNow;

        await UpdateAsync(volunteer);
        return true;
    }

    /// <summary>
    /// Revoke SMS approval for a volunteer by internal ID.
    /// Returns false if volunteer not found or already not approved.
    /// </summary>
    public async Task<bool> RevokeSmsApprovalAsync(string rawInternalId)
    {
        var volunteer = await GetByInternalIdAsync(rawInternalId);
        if (volunteer == null) return false;
        if (!volunteer.ApproveToReceiveSms) return false; // Already not approved

        volunteer.ApproveToReceiveSms = false;
        volunteer.UpdatedAt = DateTime.UtcNow;
        await UpdateAsync(volunteer);
        return true;
    }
}
