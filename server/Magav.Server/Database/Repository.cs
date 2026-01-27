using System;
using System.Collections.Generic;
using System.Linq.Expressions;
using System.Threading.Tasks;
using Magav.Common.Database;

namespace Magav.Server.Database;

/// <summary>
/// Generic base repository providing common CRUD operations.
/// Thread-safe: Each repository instance uses a single DbHelper instance.
/// </summary>
public class Repository<T> where T : class
{
    protected readonly DbHelper Db;

    public Repository(DbHelper db)
    {
        Db = db ?? throw new ArgumentNullException(nameof(db));
    }

    // Common CRUD operations
    public virtual async Task<T?> GetByIdAsync(long id) => await Db.SingleOrDefaultByIdAsync<T>(id);
    public virtual async Task<List<T>> GetAllAsync() => await Db.FetchAllAsync<T>();
    public virtual async Task<T?> FirstOrDefaultAsync(Expression<Func<T, bool>> predicate)
        => await Db.SingleOrDefaultAsync<T>(predicate);
    public virtual async Task<List<T>> FindAsync(Expression<Func<T, bool>> predicate)
        => await Db.FetchAsync<T>(predicate);
    public virtual async Task<bool> InsertAsync(T entity) => await Db.InsertAsync(entity);
    public virtual async Task<int> UpdateAsync(T entity) => await Db.UpdateAsync(entity);
    public virtual async Task<bool> DeleteAsync(T entity) => await Db.DeleteAsync(entity);
    public virtual async Task<int> CountAsync() => await Db.GetCountAsync<T>();
    public virtual async Task<int> CountAsync(Expression<Func<T, bool>> predicate)
        => await Db.GetCountByConditionAsync<T>(predicate);
}
