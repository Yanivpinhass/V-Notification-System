using System.Collections.Concurrent;
using System.Data.Common;
using System.Reflection;
using Microsoft.Data.SqlClient;
using Microsoft.Data.Sqlite;
using MySql.Data.MySqlClient;
using NPoco;
using Serilog;

namespace Magav.Common.Database;

public class DbHelperCore : IDisposable
{
    #region Init

    private readonly string _connectionString;

    // Batch size for bulk insert/update operations
    // PHASE 2: Increased from 1000 to 5000 for better performance on large operations
    // MySQL max_allowed_packet default is 64MB, so 5000 rows (~5MB) is very safe
    // This reduces network round-trips and MAX(id) queries:
    //   - 10,000 lessons: 2 batches instead of 10 batches (80% reduction)
    //   - 50,000 activities: 10 batches instead of 50 batches (80% reduction)
    protected const int DbBatchSize = 1000;

    //Retry mechanism constants
    private const int NumberOfTries = 2;
    private const int DelayBetweenFails = 1000; //wait 1 second after each fail

    public int CommandTimeoutSeconds { get; set; } = 60*2; //2 minutes by default

    public bool LogLastSql { get; set; } = true;
    public string LastSql { get; private set; }

    protected readonly DbType DbType;
    protected readonly ILogger? Logger;

    protected DbHelperCore(string connectionString, DbType dbType, ILogger logger = null)
    {
        _connectionString = connectionString;
        DbType = dbType;
        Logger = logger;
    }


    public void Dispose()
    {
    }
    #endregion Init

    #region Protected Helpers

    protected bool Exists<T>(T entity, NPoco.Database db)
    {
        (string primaryKeyName, PropertyInfo propertyInfo) = GetPrimaryKeyInfo<T>(db);
        var primaryKeyValue = propertyInfo.GetValue(entity);
        return primaryKeyValue != null && db.Exists<T>(primaryKeyValue);
    }

    protected async Task<bool> ExistsAsync<T>(T entity, NPoco.Database db)
    {
        (string primaryKeyName, PropertyInfo propertyInfo) = GetPrimaryKeyInfo<T>(db);
        var primaryKeyValue = propertyInfo.GetValue(entity);
        if (primaryKeyValue == null)
            return false;

        var result = await db.SingleOrDefaultByIdAsync<T>(primaryKeyValue);
        return result != null;
    }

    protected (List<T> Exists, List<T> NotExists) BulkExists<T>(IEnumerable<T> entities, NPoco.Database db)
    {
        var (primaryKeyName, propertyInfo) = GetPrimaryKeyInfo<T>(db);

        List<T> entityList = entities.ToList();
        var primaryKeyValues = entityList
            .Select(e => propertyInfo.GetValue(e))
            .Where(v => v != null)
            .ToList();

        // Use NPoco to get the table name for type T
        string? tableName = db.PocoDataFactory.ForType(typeof(T)).TableInfo.TableName;

        // Fetch existing entities from the database based on primary keys
        List<T> existingEntities = db.Fetch<T>($"SELECT * FROM {tableName} WHERE {primaryKeyName} IN (@0)", primaryKeyValues);

        var existingPrimaryKeys = existingEntities
            .Select(e => propertyInfo.GetValue(e))
            .ToHashSet();

        List<T> existsList = entityList
            .Where(entity => existingPrimaryKeys.Contains(propertyInfo.GetValue(entity)))
            .ToList();

        List<T> notExistsList = entityList
            .Where(entity => !existingPrimaryKeys.Contains(propertyInfo.GetValue(entity)))
            .ToList();

        return (existsList, notExistsList);
    }

    protected async Task<(List<T> Exists, List<T> NotExists)> BulkExistsAsync<T>(IEnumerable<T> entities, NPoco.Database db)
    {
        var (primaryKeyName, propertyInfo) = GetPrimaryKeyInfo<T>(db);

        List<T> entityList = entities.ToList();
        var primaryKeyValues = entityList
            .Select(e => propertyInfo.GetValue(e))
            .Where(v => v != null)
            .ToList();

        string tableName = GetTableName<T>(DbType);
        // Fetch existing entities from the database based on primary keys
        List<T> existingEntities = await db.FetchAsync<T>($"SELECT * FROM {tableName} WHERE {primaryKeyName} IN (@0)", primaryKeyValues);

        var existingPrimaryKeys = existingEntities
            .Select(e => propertyInfo.GetValue(e))
            .ToHashSet();

        List<T> existsList = entityList
            .Where(entity => existingPrimaryKeys.Contains(propertyInfo.GetValue(entity)))
            .ToList();

        List<T> notExistsList = entityList
            .Where(entity => !existingPrimaryKeys.Contains(propertyInfo.GetValue(entity)))
            .ToList();

        return (existsList, notExistsList);
    }

    private static readonly ConcurrentDictionary<Type, (string PrimaryKeyName, PropertyInfo PropertyInfo)> PrimaryKeyCache = new();

    protected (string PrimaryKeyName, PropertyInfo PropertyInfo) GetPrimaryKeyInfo<T>(NPoco.Database db)
    {
        var type = typeof(T);

        if (!PrimaryKeyCache.TryGetValue(type, out var cacheEntry))
        {
            var pocoData = db.PocoDataFactory.ForType(type);
            var primaryKeyName = pocoData.TableInfo.PrimaryKey;


            if (string.IsNullOrEmpty(primaryKeyName))
            {
                throw new InvalidOperationException($"No primary key defined for type {type.Name}");
            }

            // Find the property by column name
            PropertyInfo? propertyInfo = null;

            // Approach 1: Search through all properties for Column attribute match
            foreach (var prop in type.GetProperties(BindingFlags.Public | BindingFlags.Instance))
            {
                // Check for NPoco Column attribute
                var columnAttr = prop.GetCustomAttribute<ColumnAttribute>();
                if (columnAttr != null &&
                    string.Equals(columnAttr.Name, primaryKeyName, StringComparison.OrdinalIgnoreCase))
                {
                    propertyInfo = prop;
                    break;
                }
            }

            // Approach 2: Fallback - try direct property name match
            if (propertyInfo == null)
            {
                propertyInfo = type.GetProperty(primaryKeyName, BindingFlags.Public | BindingFlags.Instance);
            }

            if (propertyInfo == null)
            {
                throw new InvalidOperationException($"Primary key property '{primaryKeyName}' not found on type {type.Name}");
            }

            if (DbType == DbType.PostgreSql)
            {
                primaryKeyName = $"\"{primaryKeyName}\"";
            }

            cacheEntry = (primaryKeyName, propertyInfo);
            PrimaryKeyCache[type] = cacheEntry;
        }

        return cacheEntry;
    }


    #endregion Protected Helpers

    #region Protected Executers

    protected NPoco.Database GetDb(bool keepConnectionAlive = false)
    {
        var dbType = DbType switch
        {
            DbType.SqlServer => DatabaseType.SqlServer2012,
            DbType.Sqlite => DatabaseType.SQLite,
            DbType.Mysql => DatabaseType.MySQL,
            DbType.PostgreSql => DatabaseType.PostgreSQL,
            _ => throw new ArgumentException("Unsupported database type")
        };

        DbProviderFactory dbProvider = DbType switch
        {
            DbType.SqlServer => SqlClientFactory.Instance,
            DbType.Sqlite => SqliteFactory.Instance,
            DbType.Mysql => MySqlClientFactory.Instance,
            DbType.PostgreSql => Npgsql.NpgsqlFactory.Instance,
            _ => throw new ArgumentException("Unsupported database type")
        };

        var db = new NPoco.Database(_connectionString, dbType, dbProvider)
        {
            KeepConnectionAlive = keepConnectionAlive,
            CommandTimeout = CommandTimeoutSeconds
        };

        if (Logger != null)
        {
            db.Interceptors.Add(new QueryTraceInterceptor(Logger));
        }

        return db;
    }

    protected void Execute(string query)
    {
        using NPoco.Database db = GetDb();
        db.Execute(query);
    }

    internal async Task<int> ExecuteAsync(string query, params object[] args)
    {
        using var db = GetDb();
        return await db.ExecuteAsync(query, args);
    }

    protected T Exec<T>(Func<IDatabase, T> execFunc)
    {
        using NPoco.Database db = GetDb();
        var execWithRetryOnLock = GetExecFuncWithRetry(execFunc);
        var result = execWithRetryOnLock(db);
        DoLogLastSql(db);
        return result;
    }

    protected async Task<T> ExecAsync<T>(Func<IDatabase, Task<T>> execFunc)
    {
        using NPoco.Database db = GetDb();
        Func<IDatabase, Task<T>> execWithRetryOnLock = GetExecFuncWithRetryAsync(execFunc);
        T result = await execWithRetryOnLock(db);
        DoLogLastSql(db);
        return result;
    }


    protected async Task ExecAsync(Func<IDatabase, Task> execAction)
    {
        using NPoco.Database db = GetDb();
        await execAction(db);
    }


    protected void ExecWithTransaction(Action<IDatabase> execAction)
    {
        using (NPoco.Database db = GetDb())
        {
            bool transactionStarted = false;
            try
            {
                db.BeginTransaction();
                transactionStarted = true;
            
                execAction(db);
            
                db.CompleteTransaction();
                transactionStarted = false;  // Successfully committed
            }
            catch (Exception e)
            {
                // Always try to rollback if transaction was started
                if (transactionStarted)
                {
                    try
                    {
                        db.AbortTransaction();
                    }
                    catch (Exception rollbackEx)
                    {
                        // Log rollback failure but don't throw - original exception is more important
                        System.Diagnostics.Debug.WriteLine($"Rollback failed: {rollbackEx.Message}");
                        // Or use your logger: Logger.Error($"Rollback failed: {rollbackEx.Message}", rollbackEx);
                    }
                }
            
                // Only throw if NOT duplicate key
                if (!e.Message.Contains("duplicate key value"))
                {
                    throw;  // Use 'throw' not 'throw e' to preserve stack trace
                }
                // If duplicate key: exception is swallowed (transaction was rolled back above)
            }
        }
    }

    protected TResult ExecWithTransaction<TResult>(Func<IDatabase, TResult> execFunc)
    {
        using (NPoco.Database db = GetDb())
        {
            bool transactionStarted = false;
            try
            {
                db.BeginTransaction();
                transactionStarted = true;
            
                TResult result = execFunc(db);
            
                db.CompleteTransaction();
                transactionStarted = false;  // Successfully committed
            
                return result;
            }
            catch (Exception e)
            {
                // Always try to rollback if transaction was started
                if (transactionStarted)
                {
                    try
                    {
                        db.AbortTransaction();
                    }
                    catch (Exception rollbackEx)
                    {
                        // Log rollback failure but don't throw - original exception is more important
                        System.Diagnostics.Debug.WriteLine($"Rollback failed: {rollbackEx.Message}");
                        // Or use your logger: Logger.Error($"Rollback failed: {rollbackEx.Message}", rollbackEx);
                    }
                }
            
                throw;  // Use 'throw' not 'throw e' to preserve stack trace
            }
        }
    }

    protected async Task<TResult> ExecWithTransactionAsync<TResult>(Func<IDatabase, Task<TResult>> execAction)
    {
        using (NPoco.Database db = GetDb())
        {
            bool transactionStarted = false;
            try
            {
                db.BeginTransaction();
                transactionStarted = true;
            
                TResult result = await execAction(db);
            
                db.CompleteTransaction();
                transactionStarted = false;  // Successfully committed
            
                return result;
            }
            catch (Exception e)
            {
                // Always try to rollback if transaction was started
                if (transactionStarted)
                {
                    try
                    {
                        db.AbortTransaction();
                    }
                    catch (Exception rollbackEx)
                    {
                        // Log rollback failure but don't throw - original exception is more important
                        System.Diagnostics.Debug.WriteLine($"Rollback failed: {rollbackEx.Message}");
                        // Or use your logger: Logger.Error($"Rollback failed: {rollbackEx.Message}", rollbackEx);
                    }
                }
            
                throw;  // Use 'throw' not 'throw e' to preserve stack trace
            }
        }
    }

    protected static string GetTableName<T>(DbType dbType)
    {
        object[] customAttributes = typeof(T).GetCustomAttributes(typeof(TableNameAttribute), false);
        string tableName = customAttributes.Length > 0
            ? ((TableNameAttribute)customAttributes[0]).Value
            : typeof(T).Name;

        if (dbType == DbType.PostgreSql)
        {
            tableName = $"\"{tableName}\"";
        }

        return tableName;
    }

    #endregion Protected Executers

    #region Private Methods

    private void DoLogLastSql(NPoco.Database db)
    {
        if (LogLastSql)
        {
            LastSql = db.LastSQL;
        }
    }

    private Func<IDatabase, T> GetExecFuncWithRetry<T>(Func<IDatabase, T> execFunc)
    {
        return db =>
        {
            int tryNum = 0;
            while (tryNum < NumberOfTries)
            {
                tryNum++;
                try
                {
                    return execFunc(db);
                }
                catch (Exception e)
                {
                    if (tryNum == NumberOfTries)
                    {
                        throw;
                    }

                    Thread.Sleep(30000);
                }
            }

            throw new ApplicationException($"Failed to execute {execFunc.Method.Name}");
        };
    }

    private Func<IDatabase, Task<T>> GetExecFuncWithRetryAsync<T>(Func<IDatabase, Task<T>> execFunc)
    {
        return async db =>
        {
            int tryNum = 0;
            while (tryNum < NumberOfTries)
            {
                tryNum++;
                try
                {
                    return await execFunc(db);
                }
                catch (Exception e)
                {
                    if (tryNum == NumberOfTries)
                    {
                        throw;
                    }

                    await Task.Delay(DelayBetweenFails);
                }
            }

            throw new ApplicationException($"Failed to execute {execFunc.Method.Name}");
        };
    }

    private Action<IDatabase> GetExecActionWithRetry(Action<IDatabase> execAction)
    {
        return db =>
        {
            int tryNum = 0;
            while (tryNum < NumberOfTries)
            {
                tryNum++;
                try
                {
                    execAction(db);
                    return;
                }
                catch (Exception e)
                {
                    if (tryNum == NumberOfTries)
                    {
                        throw;
                    }

                    Thread.Sleep(30000);
                }
            }

            throw new ApplicationException($"Failed to execute {execAction.Method.Name}");
        };
    }

    #endregion Private Methods
}

#region Public Classes & Types
public class QueryTraceInterceptor : IExecutingInterceptor
{
    private readonly ILogger _logger;

    public QueryTraceInterceptor(ILogger logger)
    {
        _logger = logger;
    }

    public void OnExecutedCommand(IDatabase database, DbCommand cmd)
    {
    }

    public void OnExecutingCommand(IDatabase database, DbCommand cmd)
    {
        // _logger.Trace(cmd.CommandText);
    }
}

public enum DbType
{
    SqlServer,
    Sqlite,
    Mysql,
    PostgreSql // Added support for PostgreSQL
}

#endregion Public Classes & Types