using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Magav.Common.Database;
using Magav.Common.Models.Auth;

namespace Magav.Server.Database.Repositories;

/// <summary>
/// Repository for User entity database operations.
/// Encapsulates all user-related queries for clean separation of concerns.
/// </summary>
public class UsersRepository : Repository<User>
{
    public UsersRepository(DbHelper db) : base(db) { }

    // User-specific queries
    public async Task<User?> GetByUserNameAsync(string userName)
    {
        if (string.IsNullOrWhiteSpace(userName))
            throw new ArgumentException("Username cannot be empty", nameof(userName));
        return await Db.SingleOrDefaultAsync<User>(u => u.UserName == userName);
    }

    public async Task<User?> GetByRefreshTokenHashAsync(string refreshTokenHash)
    {
        if (string.IsNullOrWhiteSpace(refreshTokenHash))
            return null;
        return await Db.SingleOrDefaultAsync<User>(u => u.RefreshTokenHash == refreshTokenHash);
    }

    public async Task<List<User>> GetActiveUsersAsync()
        => await Db.FetchAsync<User>(u => u.IsActive);

    public async Task<List<User>> GetByRoleAsync(string role)
    {
        if (string.IsNullOrWhiteSpace(role))
            throw new ArgumentException("Role cannot be empty", nameof(role));
        return await Db.FetchAsync<User>(u => u.Role == role);
    }

    public async Task<bool> ExistsByUserNameAsync(string userName)
    {
        if (string.IsNullOrWhiteSpace(userName))
            return false;
        var count = await Db.GetCountByConditionAsync<User>(u => u.UserName == userName);
        return count > 0;
    }

    /// <summary>
    /// Get user by ID (convenience method with int parameter)
    /// </summary>
    public async Task<User?> GetByIdAsync(int id) => await GetByIdAsync((long)id);
}
