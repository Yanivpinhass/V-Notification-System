using System.Data.Common;
using System.Linq.Expressions;
using NPoco;
using Serilog;
using Magav.Common.Extensions;

namespace Magav.Common.Database;

public class DbHelper : DbHelperCore, IDisposable
{
    #region Constructors
    public static DbHelper CreateMySqlDbHelper(string? connectionString = null)
    {
        connectionString ??= ConfigurationHelper.GetDbConnectionString();
        return new DbHelper(connectionString, DbType.Mysql);
    }
    public static DbHelper CreateSqlServerDbHelper(string connectionString)
    {
        return new DbHelper(connectionString, DbType.SqlServer);
    }

    public static DbHelper CreateSqliteDbHelper(string connectionString)
    {
        return new DbHelper(connectionString, DbType.Sqlite);
    }

    public static DbHelper CreatePostgreSqlDbHelper(string connectionString)
    {
        return new DbHelper(connectionString, DbType.PostgreSql);
    }

    protected DbHelper(string connectionString, DbType dbName, ILogger logger = null)
        : base(connectionString, dbName, logger) { }

    #endregion Constructors

    #region Transactions

    public ITransaction GetTransaction()
    {
        return GetDb().GetTransaction();
    }

    #endregion

    #region Truncate and Rebuild Table

    public void TruncateTable<T>()
    {
        string tableName = GetTableName<T>(DbType);
        string truncateCommand = DbType == DbType.Sqlite ? $"DELETE FROM {tableName}" : $"TRUNCATE TABLE {tableName}";
        Execute(truncateCommand);
    }

    public async Task TruncateTableAsync<T>()
    {
        string tableName = GetTableName<T>(DbType);
        string deleteCommand = $"DELETE FROM {tableName}";
        string truncateCommand = $"TRUNCATE TABLE {tableName}";

        if(DbType == DbType.Sqlite)
            await ExecuteAsync(deleteCommand);

        try
        {
            await ExecuteAsync(truncateCommand);
        }
        catch (Exception e)
        {
            if (e.Message.ToLower().Contains("permission denied for table"))
            {
                await ExecuteAsync(deleteCommand);
            }
            else
            {
                throw;
            }
        }
    }

    public async Task<int> RebuildTableAsync<T>(IEnumerable<T> itemsToInsert) where T : class
    {
        await TruncateTableAsync<T>();
        if (itemsToInsert.IsEmpty())
            return 0;
        return await BulkInsertAsync(itemsToInsert);
    }

    #endregion Truncate and Rebuild Table

    #region Single and First and Last

    public T Single<T>(string query)
    {
        return Exec(db => db.Single<T>(query));
    }

    public T SingleOrDefault<T>(string query, params object[] args)
    {
        try
        {
            return Exec(db => db.Single<T>(query, args));
        }
        catch (Exception e)
        {
            if (e.Message.Contains("Sequence contains no elements"))
            {
                return default;
            }

            throw;
        }
    }

    public T Single<T>(Sql query)
    {
        return Exec(db => db.Single<T>(query));
    }

    public T SingleById<T>(long id)
    {
        return Exec(db => db.SingleById<T>(id));
    }

    public T SingleOrDefaultById<T>(string id)
    {
        return Exec(db => db.SingleOrDefaultById<T>(id));
    }

    public T SingleOrDefaultById<T>(long id)
    {
        return Exec(db => db.SingleOrDefaultById<T>(id));
    }

    public T SingleById<T>(string id)
    {
        return Exec(db => db.SingleById<T>(id));
    }

    public async Task<T> SingleAsync<T>(string query, params object[] args)
    {
        return await ExecAsync(db => db.SingleAsync<T>(query, args));
    }

    public async Task<T> FirstOrDefaultAsync<T>(string query, params object[] args)
    {
        return await ExecAsync(db => db.FirstOrDefaultAsync<T>(query, args));
    }

    public async Task<T> SingleOrDefaultAsync<T>(string query, params object[] args)
    {
        try
        {
            return await ExecAsync(db => db.SingleOrDefaultAsync<T>(query, args));
        }
        catch (Exception e)
        {
            if (e.Message.Contains("Sequence contains no elements"))
            {
                return default;
            }

            throw;
        }
    }

    public async Task<T?> SingleOrDefaultAsync<T>(Expression<Func<T, bool>> whereExpression)
    {
        List<T> result = await FetchAsync(whereExpression);
        return result.SingleOrDefault();
    }

    public async Task<TReturnEntity?> SingleOrDefaultAsync<TEntity, TReturnEntity>(Expression<Func<TEntity, bool>> whereExpression, Expression<Func<TEntity, TReturnEntity>> fieldSelector)
    {
        return await ExecAsync(async db =>
        {
            List<TReturnEntity>? result = await db.Query<TEntity>().Where(whereExpression).ProjectToAsync(fieldSelector);
            return result.SingleOrDefault();
        });
    }

    public async Task<T> SingleAsync<T>(Sql query)
    {
        return await ExecAsync(db => db.SingleAsync<T>(query));
    }

    public async Task<T> SingleByIdAsync<T>(long id)
    {
        return await ExecAsync(db => db.SingleByIdAsync<T>(id));
    }

    public async Task<T> SingleOrDefaultByIdAsync<T>(string id)
    {
        return await ExecAsync(db => db.SingleOrDefaultByIdAsync<T>(id));
    }

    public async Task<T> SingleOrDefaultByIdAsync<T>(long id)
    {
        return await ExecAsync(db => db.SingleOrDefaultByIdAsync<T>(id));
    }

    public async Task<T> SingleByIdAsync<T>(string id)
    {
        return await ExecAsync(db => db.SingleByIdAsync<T>(id));
    }

    public async Task<T> FirstAsync<T>()
    {
        return await ExecAsync(db => db.Query<T>().FirstAsync());
    }

    public async Task<T> FirstOrDefaultAsync<T>()
    {
        return await ExecAsync(db => db.Query<T>().FirstOrDefaultAsync());
    }

    public async Task<T?> FirstOrDefaultAsync<T>(Expression<Func<T, bool>> whereExpression)
    {
        List<T> result = await FetchAsync(whereExpression);
        return result.FirstOrDefault();
    }

    public async Task<TReturnEntity?> FirstOrDefaultAsync<TEntity, TReturnEntity>(Expression<Func<TEntity, bool>> whereExpression, Expression<Func<TEntity, TReturnEntity>> fieldSelector)
    {
        return await ExecAsync(async db =>
        {
            List<TReturnEntity>? result = await db.Query<TEntity>().Where(whereExpression).ProjectToAsync(fieldSelector);
            return result.FirstOrDefault();
        });
    }

    public T? LastOrDefault<T>(Expression<Func<T, object>> orderByExpression, Expression<Func<T, bool>>? whereExpression = null)
    {
        return Exec(db =>
        {
            var query = whereExpression == null
                ? db.Query<T>()
                : db.Query<T>().Where(whereExpression); // Apply the where condition first

            query = query.OrderByDescending(orderByExpression); // Apply ordering after filtering

            return query.Limit(1).SingleOrDefault(); // Limit to 1 and fetch the result
        });
    }

    public async Task<T?> LastOrDefaultAsync<T>(Expression<Func<T, object>> orderByExpression, Expression<Func<T, bool>>? whereExpression = null)
    {
        return await ExecAsync(async db =>
        {
            var query = whereExpression == null
                ? db.Query<T>()
                : db.Query<T>().Where(whereExpression); // Apply the where condition first

            query = query.OrderByDescending(orderByExpression); // Apply ordering after filtering

            return await query.Limit(1).SingleOrDefaultAsync(); // Limit to 1 and fetch the result asynchronously
        });
    }

    #endregion Single and First and Last

    #region Fetch and Query

    public List<T> Fetch<T>(string query, params object[] args)
    {
        return DoFetch<T>(query, args);
    }

    public List<T> Fetch<T>(Sql query)
    {
        return DoFetch<T>(query);
    }

    public List<T> FetchAll<T>()
    {
        return DoFetch<T>();
    }

    public List<T> Fetch<T>(Expression<Func<T, bool>> whereExpression)
    {
        return Exec(db => db.Query<T>().Where(whereExpression).ToList());
    }

    private List<T> DoFetch<T>(Sql query)
    {
        return Exec(db => query == null ? db.Fetch<T>() : db.Fetch<T>(query));
    }

    private List<T> DoFetch<T>(string query = null, params object[] args)
    {
        return Exec(db => query == null ? db.Fetch<T>() : db.Fetch<T>(query, args));
    }


    public T SingleOrDefault<T>(Expression<Func<T, bool>> whereExpression)
    {
        return Exec(db =>
        {
            List<T>? result = db.Query<T>().Where(whereExpression).ToList();

            if (result == null)
                return default;

            if (result.Count > 1)
            {
                throw new InvalidOperationException("More than one element satisfies the condition in predicate.");
            }

            return result.FirstOrDefault();
        });
    }

    public List<T> SkipTake<T>(long skip, long take, string query)
    {
        return Exec(db => db.SkipTake<T>(skip, take, query));
    }

    public async Task<List<T>> TakeAsync<T>(int numOfRecordsToRetrieve)
    {
        return await ExecAsync(async db => await db.Query<T>().Limit(numOfRecordsToRetrieve).ToListAsync());
    }

    public async Task<List<T>> FetchAsync<T>(string query, params object[] args)
    {
        return await DoFetchAsync<T>(query, args);
    }

    public async Task<List<T>> FetchAsync<T>(Sql query)
    {
        return await DoFetchAsync<T>(query);
    }

    public async Task<List<T>> FetchAllAsync<T>()
    {
        return await DoFetchAsync<T>();
    }

    public async Task<List<T>> FetchAsync<T>(Expression<Func<T, bool>> whereExpression)
    {
        if(whereExpression == null)
            throw new ArgumentNullException(nameof(whereExpression));

        return await ExecAsync(db => db.Query<T>()?.Where(whereExpression).ToListAsync());
    }

    public async Task<List<TReturnEntity>> FetchWithSelectorAsync<TEntity, TReturnEntity>(Expression<Func<TEntity, bool>> whereExpression, Expression<Func<TEntity, TReturnEntity>> fieldSelector)
    {
        if (whereExpression == null)
            throw new ArgumentNullException(nameof(whereExpression));

        if (fieldSelector == null)
            throw new ArgumentNullException(nameof(fieldSelector));

        return await ExecAsync(db => db.Query<TEntity>()?.Where(whereExpression).ProjectToAsync(fieldSelector));
    }

    private async Task<List<T>> DoFetchAsync<T>(Sql query)
    {
        return await ExecAsync(async db => query == null ? await db.FetchAsync<T>() : await db.FetchAsync<T>(query));
    }

    private async Task<List<T>> DoFetchAsync<T>(string query = null, params object[] args)
    {
        return await ExecAsync(async db => query == null ? await db.FetchAsync<T>() : await db.FetchAsync<T>(query, args));
    }

    public async Task<List<T>> SkipTakeAsync<T>(long skip, long take, string query)
    {
        return await ExecAsync(async db => await db.SkipTakeAsync<T>(skip, take, query));
    }

    #endregion Fetch and Query

    #region Execute Query

    public void ExecuteQuery(string query)
    {
        using NPoco.Database db = GetDb();
        db.Execute(query);
    }

    public async Task ExecuteQueryAsync(string query, params object[] args)
    {
        using var db = GetDb();
        await db.ExecuteAsync(query, args);
    }

    public async Task ExecuteQueryAsync(string query)
    {
        using var db = GetDb();
        await db.ExecuteAsync(query);
    }

    #endregion Execute Query

    #region Scalar

    public T ExecuteScalar<T>(string query, params object[] args)
    {
        using NPoco.Database db = GetDb();
        return db.ExecuteScalar<T>(query, args);
    }

    public T ExecuteScalar<T>(string query)
    {
        using NPoco.Database db = GetDb();
        return db.ExecuteScalar<T>(query);
    }

    public async Task<T> ExecuteScalarAsync<T>(string query, params object[] args)
    {
        using var db = GetDb();
        return await db.ExecuteScalarAsync<T>(query, args);
    }

    public async Task<T> ExecuteScalarAsync<T>(string query)
    {
        using var db = GetDb();
        return await db.ExecuteScalarAsync<T>(query);
    }

    #endregion

    #region Update

    public void UpdateEntity(string tableName, string primaryKeyName, object entity, long primaryKeyValue)
    {
        using NPoco.Database db = GetDb();
        db.Update(tableName, primaryKeyName, entity, primaryKeyValue);
    }

    public int Update<T>(T itemToUpdate)
    {
        return Exec(db => db.Update(itemToUpdate));
    }

    public int Update<T>(string tableName, string primaryKeyName, T poco, object primaryKeyValue)
    {
        return Exec(db => db.Update(tableName, primaryKeyName, poco, primaryKeyValue));
    }

    public int UpdateWhere<T>(T itemToUpdate, string whereQuery)
    {
        return Exec(db => db.UpdateWhere(itemToUpdate, whereQuery));
    }

    public int BulkUpdate<T>(List<T> itemsToUpdate)
    {
        return Exec(db => db.UpdateBatch(itemsToUpdate.Select(item => new UpdateBatch<T> { Poco = item })));
    }

    public async Task<int> BulkUpdateAsync<T>(List<T> itemsToUpdate)
    {
        return await ExecAsync(db => db.UpdateBatchAsync(itemsToUpdate.Select(item => new UpdateBatch<T> { Poco = item })));
    }

    public int Update<T>(T itemToUpdate, Expression<Func<T, object>> onlyFields, Expression<Func<T, bool>> whereExpression)
    {
        return ExecWithTransaction<int>(db =>
        {
            // 1. ALWAYS validate primary key first (fast, prevents obvious errors)
            var (primaryKeyName, propertyInfo) = GetPrimaryKeyInfo<T>((NPoco.Database)db);
            var primaryKeyValue = propertyInfo.GetValue(itemToUpdate);

            if (primaryKeyValue == null)
                throw new ArgumentException($"Cannot update entity without primary key value. Primary key '{primaryKeyName}' is null.");

            Logger?.Information("Update: Updating entity of type {Type} with primary key {PrimaryKey}={Value}",
                typeof(T).Name, primaryKeyName, primaryKeyValue);

            // 2. OPTIMISTIC: Execute update immediately
            var result = db.UpdateMany<T>().OnlyFields(onlyFields).Where(whereExpression).Execute(itemToUpdate);

            // 3. POST-VALIDATION: Check result count
            if (result > 1)
                throw new InvalidOperationException($"Update affected {result} records, expected 1. Transaction rolled back.");

            Logger?.Information("Update: Successfully updated {Count} records", result);
            return result;
        });
    }

    /// <summary>
    ///
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="itemToUpdate"></param>
    /// <param name="onlyFields">Fields to be updated, e.g.: .UpdateAsync(product, x => new { x.Price, x.Description });</param>
    /// <param name="whereExpression">E.g.: x => x.Status == "New";</param>
    /// <returns></returns>
    public async Task<int> UpdateAsync<T>(T itemToUpdate, Expression<Func<T, object>> onlyFields, Expression<Func<T, bool>> whereExpression)
    {
        return await ExecWithTransactionAsync(async db =>
        {
            // 1. ALWAYS validate primary key first (fast, prevents obvious errors)
            var (primaryKeyName, propertyInfo) = GetPrimaryKeyInfo<T>((NPoco.Database)db);
            var primaryKeyValue = propertyInfo.GetValue(itemToUpdate);

            if (primaryKeyValue == null)
                throw new ArgumentException($"Cannot update entity without primary key value. Primary key '{primaryKeyName}' is null.");

            Logger?.Information("UpdateAsync: Updating entity of type {Type} with primary key {PrimaryKey}={Value}",
                typeof(T).Name, primaryKeyName, primaryKeyValue);

            // 2. OPTIMISTIC: Execute update immediately
            var result = await db.UpdateMany<T>().OnlyFields(onlyFields).Where(whereExpression).ExecuteAsync(itemToUpdate);

            // 3. POST-VALIDATION: Check result count
            if (result > 1)
                throw new InvalidOperationException($"Update affected {result} records, expected 1. Transaction rolled back.");

            Logger?.Information("UpdateAsync: Successfully updated {Count} records", result);
            return result;
        });
    }

    /// <summary>
    /// SAFETY-ENHANCED: Automatically uses entity's primary key for WHERE clause to prevent mass updates
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="itemToUpdate"></param>
    /// <param name="onlyFields">Fields to be updated, e.g.: .UpdateAsync(product, x => new { x.Price, x.Description });</param>
    /// <returns></returns>
    public async Task<int> UpdateAsync<T>(T itemToUpdate, Expression<Func<T, object>> onlyFields)
    {
        return await ExecWithTransactionAsync(async db =>
        {
            // 1. ALWAYS validate primary key first (fast, prevents obvious errors)
            var (primaryKeyName, propertyInfo) = GetPrimaryKeyInfo<T>((NPoco.Database)db);
            var primaryKeyValue = propertyInfo.GetValue(itemToUpdate);

            if (primaryKeyValue == null)
                throw new ArgumentException($"Cannot update entity without primary key value. Primary key '{primaryKeyName}' is null.");

            Logger?.Information("UpdateAsync: Updating single record of type {Type} with primary key {PrimaryKey}={Value}",
                typeof(T).Name, primaryKeyName, primaryKeyValue);

            // 2. OPTIMISTIC: Use primary key WHERE clause to ensure single record update
            var result = await db.UpdateMany<T>()
                .OnlyFields(onlyFields)
                .Where(x => propertyInfo.GetValue(x).Equals(primaryKeyValue))
                .ExecuteAsync(itemToUpdate);

            // 3. POST-VALIDATION: Check result count
            if (result > 1)
                throw new InvalidOperationException($"Update operation affected {result} records, expected 1. This indicates a data integrity issue. Transaction rolled back.");

            Logger?.Information("UpdateAsync: Successfully updated {Count} records", result);
            return result;
        });
    }

    public async Task<int> UpdateAsync<T>(T itemToUpdate)
    {
        return await ExecAsync(db => db.UpdateAsync(itemToUpdate));
    }

    public async Task<int> BulkUpdateExistingAsync<T>(List<T> itemsToUpdate)
    {
        return await ExecWithTransactionAsync(async db =>
        {
            (List<T> Exists, List<T> NotExists) existsRes = await BulkExistsAsync(itemsToUpdate, (NPoco.Database)db);
            if (existsRes.Exists == null || existsRes.Exists.Count == 0)
                return 0;

            int updatedCount = await db.UpdateBatchAsync(existsRes.Exists.Select(item => new UpdateBatch<T> { Poco = item }));
            return updatedCount;
        });
    }
    #endregion Update

    #region Insert

    public int Insert<T>(T itemToInsert)
    {
        object res = Exec(db => db.Insert(itemToInsert));
        return res != DBNull.Value ? Convert.ToInt32(res) : -1;
    }

    public async Task<bool> InsertAsync<T>(T itemToInsert)
    {
        object res = await ExecAsync(db => db.InsertAsync(itemToInsert));
        return res != DBNull.Value;
    }

    public async Task<TKey> InsertAsync<TItem, TKey>(TItem itemToInsert)
    {
        object res = await ExecAsync(db => db.InsertAsync(itemToInsert));

        if (res == null || res == DBNull.Value)
            return default(TKey);

        // Handle both value types (int, long) and reference types
        return (TKey)Convert.ChangeType(res, typeof(TKey));
    }

    public int BulkInsert<T>(IEnumerable<T> itemsToInsert) where T: class
    {
        if (itemsToInsert.IsEmpty())
            return 0;

        return Exec(db => db.InsertBatch(itemsToInsert, new BatchOptions { BatchSize = DbBatchSize }));
    }

    public async Task<int> BulkInsertAsync<T>(IEnumerable<T> itemsToInsert) where T : class
    {
        if (itemsToInsert.IsEmpty())
            return 0;

        int res = await ExecAsync(db => db.InsertBatchAsync(itemsToInsert, new BatchOptions{BatchSize = DbBatchSize}));
        return res;
    }

    /*
    public async Task<int> BulkInsertWithIdsAsync<T>(IEnumerable<T> itemsToInsert)
        where T : class
    {
        if (itemsToInsert.IsEmpty())
            return 0;

        return await ExecWithTransactionAsync(async db =>
        {
            // Get primary key information using existing helper method
            var (primaryKeyName, propertyInfo) = GetPrimaryKeyInfo<T>((NPoco.Database)db);
            string tableName = GetTableName<T>(DbType);

            List<T> itemsList = itemsToInsert.ToList();
            int totalCount = itemsList.Count;

            // CRITICAL FIX: Insert in batches and query MAX(id) AFTER each batch
            // This gives us the ACTUAL IDs assigned by MySQL, no assumptions needed

            const int batchSize = 1000; // Safe batch size for MySQL
            int totalInserted = 0;
            int itemIndex = 0; // Track position in itemsList

            // Process in batches
            for (int i = 0; i < totalCount; i += batchSize)
            {
                int currentBatchSize = Math.Min(batchSize, totalCount - i);
                List<T> batch = itemsList.GetRange(i, currentBatchSize);

                // Insert this batch
                int batchInserted = await db.InsertBatchAsync(batch,
                    new BatchOptions { BatchSize = batchSize });

                if (batchInserted > 0)
                {
                    // Get MAX(id) immediately after this batch insert
                    // This tells us the LAST ID assigned to this batch
                    long maxIdAfterBatch = await db.ExecuteScalarAsync<long>(
                        $"SELECT MAX({primaryKeyName}) FROM {tableName}");

                    // Calculate first ID of this batch: MAX - inserted_count + 1
                    // Example: If MAX=170999 and we inserted 1000, first ID = 170000
                    long firstIdOfBatch = maxIdAfterBatch - batchInserted + 1;

                    // Convert to actual property type (int, long, etc.)
                    Type pkType = propertyInfo.PropertyType;

                    // Assign IDs to items in THIS batch only
                    dynamic currentId = Convert.ChangeType(firstIdOfBatch, pkType);
                    for (int j = 0; j < batchInserted; j++)
                    {
                        propertyInfo.SetValue(itemsList[itemIndex], currentId);
                        currentId++;
                        itemIndex++;
                    }

                    totalInserted += batchInserted;
                }
            }

            return totalInserted;
        });
    }
    */
    public async Task<int> BulkInsertWithIdsAsync<T>(List<T> itemsToInsert) 
        where T : class
    {
        if (itemsToInsert.IsEmpty())
            return 0;

        return await ExecWithTransactionAsync(async db =>
        {
            var (primaryKeyName, propertyInfo) = GetPrimaryKeyInfo<T>((NPoco.Database)db);
            string tableName = GetTableName<T>(DbType);
        
            int totalCount = itemsToInsert.Count;
        
            const int batchSize = 100;
            int batchInserted = 0;
        
            // Insert all batches
            for (int i = 0; i < totalCount; i += batchSize)
            {
                Magav.Common.Logger.Log.WriteInformation($"Inserted items {i} from {totalCount}");
                int currentBatchSize = Math.Min(batchSize, totalCount - i);
                List<T> batch = itemsToInsert.GetRange(i, currentBatchSize);
            
                batchInserted += await db.InsertBatchAsync(batch, 
                    new BatchOptions { BatchSize = batchSize });
            }
        
            // Query MAX once and assign IDs
            if (batchInserted == totalCount)
            {
                long maxId = await db.ExecuteScalarAsync<long>(
                    $"SELECT MAX({primaryKeyName}) FROM {tableName}");
            
                int currentId = (int)(maxId - totalCount + 1);
                foreach (var item in itemsToInsert)
                    propertyInfo.SetValue(item, currentId++);
            }
            else
            {
                throw new InvalidOperationException(
                    $"Expected {totalCount} inserts, got {batchInserted}");
            }
        
            return batchInserted;
        });
    }
    #endregion Insert

    #region Upsert

    public void Upsert<T>(T itemToUpsert) where T : class
    {
        if(itemToUpsert == null)
           return;

        ExecWithTransaction(db =>
        {
            if (Exists(itemToUpsert, (NPoco.Database)db))
                db.Update(itemToUpsert);
            else
                db.Insert(itemToUpsert);
        });
    }

    public async Task UpsertAsync<T>(T itemToUpsert) where T : class
    {
        if (itemToUpsert == null)
            return;

        await ExecWithTransactionAsync<object>(async db =>
        {
            if (await ExistsAsync(itemToUpsert, (NPoco.Database)db))
                await db.UpdateAsync(itemToUpsert);
            else
                await db.InsertAsync(itemToUpsert);
            return null;
        });
    }

    public int BulkUpsert<T>(IEnumerable<T> itemsToUpsert) where T : class
    {
        if (itemsToUpsert.IsEmpty())
            return 0;

        return ExecWithTransaction<int>(db =>
        {
            var (exists, notExists) = BulkExists(itemsToUpsert, (NPoco.Database)db);

            int updateCount = exists.Count > 0
                ? db.UpdateBatch(exists.Select(item => new UpdateBatch<T> { Poco = item }))
                : 0;

            int insertCount = notExists.Count > 0
                ? db.InsertBatch(notExists, new BatchOptions { BatchSize = DbBatchSize })
                : 0;

            return updateCount + insertCount;
        });
    }

    public async Task<int> BulkUpsertAsync<T>(IEnumerable<T> itemsToUpsert) where T : class
    {
        if (itemsToUpsert.IsEmpty())
            return 0;

        return await ExecWithTransactionAsync(async db =>
        {
            var (exists, notExists) = await BulkExistsAsync(itemsToUpsert, (NPoco.Database)db);

            int updateCount = exists.Count > 0
                ? await db.UpdateBatchAsync(exists.Select(item => new UpdateBatch<T> { Poco = item }))
                : 0;

            int insertCount = notExists.Count > 0
                ? await db.InsertBatchAsync(notExists, new BatchOptions { BatchSize = DbBatchSize })
                : 0;

            return updateCount + insertCount;
        });
    }
    #endregion Upsert

    #region Delete

   public bool Delete<T>(T itemToDelete)
    {
        int deletedItems = Exec(db => db.Delete(itemToDelete));
        if (deletedItems == 1)
        {
            return true;
        }

        if (deletedItems == 0)
        {
            return false;
        }

        throw new ApplicationException($"Too many items were deleted - {deletedItems} items");
    }

    public int DeleteWhere<T>(string whereQuery)
    {
        return Exec(db => db.DeleteWhere<T>(whereQuery));
    }

    public int DeleteMany<T>(Expression<Func<T, bool>> predicate)
    {
        return Exec(db => db.DeleteMany<T>().Where(predicate).Execute());
    }

    public bool DeleteById<T>(long id)
    {
        return DoDeleteById<T>(id);
    }

    public bool DeleteById<T>(int id)
    {
        return DoDeleteById<T>(id);
    }

    public bool DeleteById<T>(string id)
    {
        return DoDeleteById<T>(id);
    }

    public async Task<bool> DeleteAsync<T>(T itemToDelete)
    {
        int deletedItems = await ExecAsync(db => db.DeleteAsync(itemToDelete));
        if (deletedItems == 1)
        {
            return true;
        }

        if (deletedItems == 0)
        {
            return false;
        }

        throw new ApplicationException($"Too many items were deleted - {deletedItems} items");
    }

    public async Task<int> DeleteManyAsync<T>(Expression<Func<T, bool>> predicate)
    {
        return await ExecAsync(db => db.DeleteMany<T>().Where(predicate).ExecuteAsync());
    }

    public async Task<bool> DeleteByIdAsync<T>(long id)
    {
        return await DoDeleteByIdAsync<T>(id);
    }

    public async Task<bool> DeleteByIdAsync<T>(int id)
    {
        return await DoDeleteByIdAsync<T>(id);
    }

    public async Task<bool> DeleteByIdAsync<T>(string id)
    {
        return await DoDeleteByIdAsync<T>(id);
    }

    private bool DoDeleteById<T>(object id)
    {
        int deletedItems = Exec(db => db.Delete<T>(id));
        if (deletedItems == 1)
        {
            return true;
        }

        if (deletedItems == 0)
        {
            return false;
        }

        throw new ApplicationException($"Too many items were deleted - {deletedItems} items");
    }

    private async Task<bool> DoDeleteByIdAsync<T>(object id)
    {
        int deletedItems = await ExecAsync(db => db.DeleteAsync(id));
        if (deletedItems == 1)
        {
            return true;
        }

        if (deletedItems == 0)
        {
            return false;
        }

        throw new ApplicationException($"Too many items were deleted - {deletedItems} items");
    }

    #endregion

    #region Count

    public int GetCount<T>() where T : class
    {
        return Exec(db => db.Query<T>().Count());
    }

    public int GetCountByCondition<T>(Expression<Func<T, bool>> whereExpression) where T : class
    {
        return Exec(db => db.Query<T>().Where(whereExpression).Count());
    }

    public Task<int> GetCountByConditionAsync<T>(Expression<Func<T, bool>> whereExpression) where T : class
    {
        return ExecAsync(db => db.Query<T>().Where(whereExpression).CountAsync());
    }

    public Task<int> GetCountAsync<T>() where T : class
    {
        return ExecAsync(db => db.Query<T>().CountAsync());
    }

    #endregion Count

    #region Dispose & ConnectionTerminator
    public new void Dispose()
    {
        // Dispose of any additional resources here
        base.Dispose();
    }

    public interface IConnectionTerminator
    {
        void Close();
    }

    private class ConnectionTerminator(DbConnection connection, IDatabase database) : IConnectionTerminator
    {
        public void Close()
        {
            database?.Dispose();
            connection?.Close();
        }
    }

    #endregion Dispose & ConnectionTerminator
}

