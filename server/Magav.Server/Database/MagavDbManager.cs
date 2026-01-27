using System;
using Magav.Common.Database;
using Magav.Server.Database.Repositories;
using NPoco;

namespace Magav.Server.Database;

/// <summary>
/// Main database manager that provides access to all repositories.
/// Implements lazy initialization for repositories to optimize resource usage.
/// Registered as Scoped in DI - one instance per request.
/// </summary>
public class MagavDbManager
{
    private readonly DbHelper _db;

    // Lazy-initialized repositories (created on first access)
    private UsersRepository? _users;

    public MagavDbManager(DbHelper db)
    {
        _db = db ?? throw new ArgumentNullException(nameof(db));
    }

    /// <summary>
    /// Users repository for all user-related database operations
    /// </summary>
    public UsersRepository Users => _users ??= new UsersRepository(_db);

    /// <summary>
    /// Direct DbHelper access for complex operations or raw queries.
    /// Use sparingly - prefer repository methods for type safety.
    /// </summary>
    public DbHelper Db => _db;

    /// <summary>
    /// Start a database transaction for operations that require atomicity.
    /// Usage: using var transaction = _dbManager.GetTransaction();
    /// Call transaction.Complete() before disposal to commit.
    /// </summary>
    public ITransaction GetTransaction() => _db.GetTransaction();
}
