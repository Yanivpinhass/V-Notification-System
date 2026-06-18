<!-- DeepInit Extract | Component: common
Run ID: deepinit-2026-06-18
Input files processed: Magav.Common.csproj, MagavConstants.cs, Database/DbHelper.cs, Database/DbHelperCore.cs, Excel/ExcelHelper.cs, Excel/ExcelModels.cs, Excel/ExcelRowReader.cs, DataStructures/IndexedList.cs, Email/BrevoEmailNotifier.cs, Email/DataFile.cs, Email/EmailNotifier.cs, Encryption/EncryptedConnectionStringsProvider.cs, Encryption/EncryptedConnectionStringsSource.cs, Encryption/EncryptionHelper.cs, Extensions/DataTableExtensions.cs, Extensions/EntityExtensions.cs, Extensions/EnumerableExtensions.cs, Extensions/IgnoreOnCompareAttribute.cs, Extensions/ReflectionExtensions.cs, Attributes/HebrewDescriptionAttribute.cs, Logger/Log.cs, Utils/ConfigurationHelper.cs, Utils/DateTimeHelper.cs, Models/Auth/User.cs, Models/Volunteer.cs, Models/Shift.cs, Models/SmsLog.cs, Models/SchedulerConfig.cs, Models/SchedulerRunLog.cs, Models/MessageTemplate.cs, Models/Location.cs, Models/JewishHoliday.cs, Models/CanceledShiftRow.cs, Models/ExcelShift.cs
Generated: 2026-06-18 -->

# Component: common (`web/server/Magav.Common/`)

## 1. Component Overview

**Purpose:** The shared, dependency-free .NET 8 leaf library for the Magav web backend. It provides the entity/model classes, a custom multi-provider ORM wrapper over NPoco (`DbHelper`), canonical string constants (`MagavConstants`), Excel read/write utilities (EPPlus), connection-string encryption, configuration access, Serilog logging, an in-memory indexed-list structure, and email notification (Brevo). [HIGH] (`web/server/Magav.Common/Magav.Common.csproj:1-40`)

**Tech stack:** .NET 8, `ImplicitUsings` + `Nullable` enabled (`Magav.Common.csproj:4-6`). Key NuGet deps: NPoco 5.7.1 (ORM), EPPlus 7.1.1 (Excel), Serilog 4.0.1 (logging), Microsoft.Data.Sqlite 8.0.7 + SQLitePCLRaw.bundle_e_sqlcipher 2.1.11 (encrypted SQLite), Microsoft.Data.SqlClient, MySql.Data, Npgsql (referenced in code), AutoMapper 12, brevo_csharp 1.0.0 (email), RepoDb 1.13.1 (referenced as package but no usage found in scope). [HIGH] (`web/server/Magav.Common/Magav.Common.csproj:9-36`)

**Key files / entry points:**
- `web/server/Magav.Common/Database/DbHelper.cs` (960 LOC) + `Database/DbHelperCore.cs` (523 LOC) — ORM facade.
- `web/server/Magav.Common/MagavConstants.cs` — canonical constants.
- `web/server/Magav.Common/Excel/ExcelHelper.cs` (412 LOC), `Excel/ExcelRowReader.cs`, `Excel/ExcelModels.cs`.
- `web/server/Magav.Common/Models/` — 11 model classes (one per DB table + 2 DTOs).
- `web/server/Magav.Common/Encryption/`, `Utils/ConfigurationHelper.cs`, `Logger/Log.cs`.

**Complexity:** Moderate→Complex. The model/util/excel surface is Simple-to-Moderate, but `DbHelper`/`DbHelperCore` are large, generic-heavy, multi-DB-provider god objects (see §10). [HIGH]

**Certainty:** [HIGH] — every file in scope was read in full.

---

## 2. Features & Capabilities

| Feature | Description | Entry point | Source files | Certainty |
|---|---|---|---|---|
| Custom ORM facade | Async/sync CRUD, fetch, upsert, bulk ops, count, transactions over NPoco; provider-agnostic (SqlServer/Sqlite/MySql/PostgreSql) | `DbHelper.CreateSqliteDbHelper` etc. (`Database/DbHelper.cs:12-30`) | `Database/DbHelper.cs`, `Database/DbHelperCore.cs` | HIGH |
| Canonical constants | `ReminderTypes`, `SmsStatuses`, `DayGroups`, server name, send-email flag, password key | `MagavConstants` (`MagavConstants.cs:3`) | `MagavConstants.cs` | HIGH |
| Domain models | POCO entities mapped to DB tables via NPoco attributes | n/a | `Models/*.cs` | HIGH |
| Excel read | Parse rows→entities (file or stream), with optional per-row validation | `ExcelHelper.ReadExcel` (`Excel/ExcelHelper.cs:55`) | `Excel/ExcelHelper.cs`, `Excel/ExcelRowReader.cs`, `Excel/ExcelModels.cs` | HIGH |
| Excel write | Records→xlsx (auto columns or custom column defs), to file or byte[] | `ExcelHelper.WriteExcel` / `WriteExcelToBytes` (`Excel/ExcelHelper.cs:248,332`) | `Excel/ExcelHelper.cs`, `Excel/ExcelModels.cs` | HIGH |
| Connection-string encryption | Transparently decrypts the DB password inside connection strings at config-load time | `EncryptedConnectionStringsSource` (`Encryption/EncryptedConnectionStringsSource.cs:6`) | `Encryption/*.cs` | HIGH |
| AES symmetric encryption | Generic Rijndael/AES encrypt/decrypt string with password+salt+IV | `EncryptionHelper.EncryptDataWithKey` (`Encryption/EncryptionHelper.cs:16`) | `Encryption/EncryptionHelper.cs` | HIGH |
| Configuration access | Reads appsettings.json (through the decrypting source); exposes connection string, server name, send-email flag | `ConfigurationHelper` (`Utils/ConfigurationHelper.cs:6`) | `Utils/ConfigurationHelper.cs` | HIGH |
| Structured logging | Serilog static facade enriched with module/file/member name | `Log.WriteInformation` etc. (`Logger/Log.cs:39`) | `Logger/Log.cs` | HIGH |
| Email notification | Brevo transactional email with attachments, gated by `SendEmail` flag | `EmailNotifier.SendEmail` (`Email/EmailNotifier.cs:20`) | `Email/*.cs` | HIGH |
| In-memory indexed list | Thread-safe list with N-property composite hash indexes for O(1) lookup | `IndexedList<T>` (`DataStructures/IndexedList.cs:8`) | `DataStructures/IndexedList.cs` | HIGH |
| Reflection/compare utilities | Shallow copy by name (`CastType`), property-diff, Hebrew description lookup | `ReflectionExtensions` (`Extensions/ReflectionExtensions.cs:7`) | `Extensions/ReflectionExtensions.cs`, `Extensions/IgnoreOnCompareAttribute.cs`, `Attributes/HebrewDescriptionAttribute.cs` | HIGH |
| Date helper | Enumerate all dates of a given weekday in a range | `DateTimeHelper.GetDatesForDayOfWeek` (`Utils/DateTimeHelper.cs:5`) | `Utils/DateTimeHelper.cs` | HIGH |

---

## 3. Workflows & Behaviors

**WF-common:001 — Query execution with retry + last-SQL logging**
- Type: internal DB execution pipeline. Trigger: any `Exec`/`ExecAsync` call from a public DbHelper method.
- Steps: build `NPoco.Database` for the configured provider → `GetDb` (`Database/DbHelperCore.cs:192-224`) → wrap delegate in retry (`GetExecFuncWithRetryAsync`, `Database/DbHelperCore.cs:438-463`) → execute → capture `LastSQL` via `DoLogLastSql` (`Database/DbHelperCore.cs:403-409`).
- Error handling: on exception, retries up to `NumberOfTries=2` (`DbHelperCore.cs:27`); async delay `DelayBetweenFails=1000ms` (`DbHelperCore.cs:28,457`); **sync retry sleeps a hardcoded 30000ms, NOT the constant** (`DbHelperCore.cs:430,485` — likely-bug, see §10). Re-throws on final failure.
- Certainty: HIGH.

**WF-common:002 — Transactional write with rollback + duplicate-key swallow**
- Type: internal transaction wrapper. Trigger: `Upsert`, `BulkUpsert`, `Update(...onlyFields...)`, `BulkInsertWithIdsAsync`, etc.
- Steps: `BeginTransaction` → run delegate → `CompleteTransaction`; on exception `AbortTransaction` (rollback) then re-throw (`Database/DbHelperCore.cs:264-382`).
- State transitions: not-started → started → committed | rolled-back.
- Error handling: the **void** `ExecWithTransaction(Action)` overload SWALLOWS exceptions whose message contains `"duplicate key value"` after rollback (`DbHelperCore.cs:296-301`); the generic `<TResult>` overloads always re-throw (`DbHelperCore.cs:340,379`). Rollback failures are logged to `Debug.WriteLine` and not thrown (`DbHelperCore.cs:288-293`).
- Certainty: HIGH.

**WF-common:003 — Update safety: primary-key validation + post-count guard**
- Type: defensive write. Trigger: `Update`/`UpdateAsync` with `onlyFields` (`Database/DbHelper.cs:457-551`).
- Steps: resolve PK via cached reflection (`GetPrimaryKeyInfo`, `DbHelperCore.cs:133-185`) → throw `ArgumentException` if PK value null → execute `UpdateMany().OnlyFields().Where()` → if affected rows > 1, throw `InvalidOperationException` and roll back (`DbHelper.cs:475-476,509-510,545-546`).
- Invariant: an `onlyFields` update is expected to touch ≤1 row; >1 is treated as a data-integrity violation.
- Certainty: HIGH.

**WF-common:004 — Bulk insert with assigned IDs**
- Type: batched insert. Trigger: `BulkInsertWithIdsAsync<T>(List<T>)` (`Database/DbHelper.cs:678-723`).
- Steps: insert in batches of `100` inside a transaction → after all batches, `SELECT MAX(pk)` once → back-fill PK property on each item as `maxId - count + 1 … maxId` (`DbHelper.cs:706-714`).
- Error handling: if `batchInserted != totalCount`, throws `InvalidOperationException` (`DbHelper.cs:716-719`).
- Caveat: ID back-fill assumes contiguous auto-increment with no concurrent inserts — race-prone (see §10). The non-`Ids` `BulkInsertAsync` uses batch size `DbBatchSize=1000` (`DbHelperCore.cs:24`, `DbHelper.cs:610`).
- Certainty: HIGH.

**WF-common:005 — Decrypt connection-string password at config load**
- Type: configuration interception. Trigger: any `IConfiguration` read of a `ConnectionStrings:*` key (`Encryption/EncryptedConnectionStringsProvider.cs:28-38`).
- Steps: inner JSON provider `TryGet` → if key starts with `ConnectionStrings:` → parse with `DbConnectionStringBuilder` → unless `Integrated Security=True` present, decrypt the `password` token via `EncryptionHelper.DecryptDataWithKey(pass, MagavConstants.PasswordKey)` → rewrite (`Encryption/EncryptedConnectionStringsProvider.cs:40-51`).
- Wired via `EncryptedConnectionStringsSource` (`Encryption/EncryptedConnectionStringsSource.cs:8-12`) and `ConfigurationHelper` static ctor (`Utils/ConfigurationHelper.cs:18-23`).
- Certainty: HIGH.

**WF-common:006 — AES encrypt/decrypt with password**
- Type: crypto. Trigger: `EncryptionHelper.EncryptDataWithKey` / `DecryptDataWithKey`.
- Steps (encrypt): generate random 16-byte salt → derive 16-byte key via `Rfc2898DeriveBytes(password, salt)` → Rijndael encrypt → prepend salt+IV (unencrypted) to ciphertext → Base64 (`Encryption/EncryptionHelper.cs:51-102`). Decrypt reverses: read salt+IV, re-derive key (`EncryptionHelper.cs:107-163`).
- Error handling: null args throw `ArgumentNullException`; empty data returns empty.
- Certainty: HIGH.

**WF-common:007 — Excel read (+ optional validation)**
- Type: parsing. Trigger: `ReadExcel` / `ReadExcelWithValidation` (`Excel/ExcelHelper.cs:55,133`).
- Steps: open package (file or stream) → pick worksheet by index → iterate `startRow..Dimension.Rows` → skip empty rows (`IsEmptyRow`, `ExcelHelper.cs:230-238`) → wrap row in `ExcelRowReader` → caller-supplied `parseRow` builds entity → (validation variant) run `validate`, sort into `Items` vs `Errors` (`ExcelHelper.cs:163-174`).
- `ExcelRowReader` supports sequential (auto-advancing pointer) and direct-column reads, with typed parsers and Excel-serial date handling via `DateTime.FromOADate` (`Excel/ExcelRowReader.cs:265-279`).
- Certainty: HIGH.

**WF-common:008 — Email send (gated)**
- Type: outbound integration. Trigger: `EmailNotifier.SendEmail` (`Email/EmailNotifier.cs:20`).
- Steps: early-return if `MagavConstants.SendEmail` false (`EmailNotifier.cs:22-25`) → require prior `Configure()` else throw → prefix subject with server name → delegate to `BrevoEmailNotifier.SendEmail` (`Email/BrevoEmailNotifier.cs:10`).
- Error handling: Brevo send-exceptions are caught and logged (re-throw commented out) — failures are swallowed (`Email/BrevoEmailNotifier.cs:50-54`).
- Certainty: HIGH.

---

## 4. Business Rules & Invariants

| ID | Rule | Criticality | Source |
|---|---|---|---|
| BR-common:001 | Reminder type is one of the canonical strings: `SameDay`, `Advance`, `LocationUpdate`, `Manual`, `WeekdayAdvance` | Core | `MagavConstants.cs:9-16` |
| BR-common:002 | SMS status is exactly `Success` or `Fail` | Core | `MagavConstants.cs:18-22` |
| BR-common:003 | Day group is one of `SunThu`, `Fri`, `Sat` | Core | `MagavConstants.cs:24-29` |
| BR-common:004 | `SmsLog` defaults: Status=`Success`, ReminderType=`SameDay` (constants, not inline strings) | Supporting | `Models/SmsLog.cs:13,15` |
| BR-common:005 | An `onlyFields` update must affect ≤1 row; >1 → `InvalidOperationException` + rollback | Core | `Database/DbHelper.cs:475-476,509-510,545-546` |
| BR-common:006 | An update entity must have a non-null primary key value or the op throws before executing | Core | `Database/DbHelper.cs:465-466,499-500,532-533` |
| BR-common:007 | `Delete`/`DeleteById` returning a count >1 throws `ApplicationException("Too many items were deleted")` | Core | `Database/DbHelper.cs:815,856,892,908` |
| BR-common:008 | DB password in a connection string is decrypted on load unless `Integrated Security=True` | Core | `Encryption/EncryptedConnectionStringsProvider.cs:43-48` |
| BR-common:009 | Email is suppressed entirely when `SendEmail` config flag is false | Supporting | `Email/EmailNotifier.cs:22-25` |
| BR-common:010 | Empty Excel rows are skipped during read | Supporting | `Excel/ExcelHelper.cs:77-78,119-120,230-238` |
| BR-common:011 | `GetDatesForDayOfWeek` rejects `fromDate > toDate` and a degenerate same-day case (throws) | Peripheral | `Utils/DateTimeHelper.cs:9-21` |
| BR-common:012 | Bulk-insert-with-ids requires every row to insert (`batchInserted == totalCount`) before back-filling IDs | Supporting | `Database/DbHelper.cs:706-719` |
| BR-common:013 | The void transaction wrapper swallows `"duplicate key value"` errors (idempotent insert intent); generic wrapper does not | Supporting | `Database/DbHelperCore.cs:296-301,340,379` |
| BR-common:014 | Every entity type must declare an NPoco primary key (`GetPrimaryKeyInfo` throws if missing) | Core | `Database/DbHelperCore.cs:143-146,170-173` |

**Key invariants (Q10):**
- **Value semantics — entities are MUTATED, not copied.** `Update`/`UpdateAsync` operate on the passed entity in place; `BulkInsertWithIdsAsync` SETS the PK property on each input item via reflection (`Database/DbHelper.cs:713`). `ReflectionExtensions.CastType<T>` is the only "return a new copy" op — it shallow-copies matching public properties by name into a fresh instance (`Extensions/ReflectionExtensions.cs:9-26`). [HIGH]
- **Core data structure: `IndexedList<T>`.** Load-bearing property: indexes are built from `List.ToLookup(propGetter)` and kept in sync by registered insert/remove `Action`s (`DataStructures/IndexedList.cs:45-57,59-86`). Composite indexes key on `Tuple.Create(...)` (`IndexedList.cs:126-154`). Thread safety via a single `ReaderWriterLockSlim` (`IndexedList.cs:10`). Note: `RemoveItem` returns `.All(result => true)` which is **always true regardless of actual removal** (`IndexedList.cs:78` — likely bug, see §10). [HIGH]
- **NPoco / DbHelper method-name conventions (non-standard, load-bearing — match CLAUDE.md):**
  - `FetchAsync<T>(Expression<Func<T,bool>>)` — lambda-predicate query (`Database/DbHelper.cs:338-344`).
  - `FetchAsync<T>(string sql, params object[] args)` — raw parameterized SQL (`DbHelper.cs:323-326`).
  - `FetchAllAsync<T>()` — all rows, no-arg; use this instead of `FetchAsync<T>()` with zero args (`DbHelper.cs:333-336`). Sync twin `FetchAll<T>()` (`DbHelper.cs:274-277`).
  - `ExecuteQueryAsync(sql, args)` — raw execution; **NOT** `ExecuteAsync` (which is `internal`/`protected`, `DbHelperCore.cs:232`). (`DbHelper.cs:382-392`).
  - `ExecuteScalarAsync<T>(sql, args)` — scalar (`DbHelper.cs:410-420`).
  - `SingleOrDefaultByIdAsync<T>(id)` — by PK, string or long overloads (`DbHelper.cs:192-200`).
  - Insert: `InsertAsync<T>` returns `bool`; `InsertAsync<TItem,TKey>` returns the generated key (`DbHelper.cs:580-595`).
- **Parameterized-query discipline:** all raw-SQL public methods take `params object[] args` mapped to NPoco `@0,@1,…` placeholders (`DbHelper.cs:323,382,398,410`). **However** internal helpers interpolate table/column NAMES (never user values) directly into SQL — `BulkExists`/`BulkExistsAsync` (`DbHelperCore.cs:85,114`), `BulkInsertWithIdsAsync` MAX query (`DbHelper.cs:708-709`), `TruncateTable` (`DbHelper.cs:51,58-59`). These are derived from type metadata, not request input. [HIGH]

**Boundary / layer rules (Q11):**
- This is the **leaf** project: no `ProjectReference` entries in `Magav.Common.csproj` (`Magav.Common.csproj:9-37`) — it depends on nothing internal. [HIGH]
- Per CLAUDE.md, `Magav.Server` and `Magav.Api` reference it; it must NOT reference them. Nothing here imports `Magav.Server`/`Magav.Api` namespaces. [HIGH] (confirmed by reading all files in scope)
- All entity/model classes live here under namespace `Magav.Common.Models` (CLAUDE.md rule) — confirmed for all 11 models. [HIGH]

---

## 5. Data Models

All models are NPoco POCOs with `[TableName(...)]` + `[PrimaryKey("Id", AutoIncrement = true)]` unless noted. `CanceledShiftRow` and `ExcelShift` are non-table DTOs (no NPoco attributes).

### User — `web/server/Magav.Common/Models/Auth/User.cs` (table `Users`, ns `Magav.Common.Models.Auth`)
Purpose: authentication/account record.
| Property | Type | Required | Description |
|---|---|---|---|
| Id | int | PK | auto-increment |
| FullName | string | yes (default "") | display name |
| UserName | string | yes (default "") | login |
| PasswordHash | string | yes (default "") | BCrypt hash (per comment `User.cs:12`) |
| IsActive | bool | default true | account enabled |
| Role | string | default `"User"` | single role string (NOTE: stored as one string here; frontend uses `roles[]` per CLAUDE.md) |
| MustChangePassword | bool | default false | force change |
| FailedLoginAttempts | int | default 0 | lockout counter |
| LockoutUntil | DateTime? | no | lockout expiry |
| RefreshTokenHash | string? | no | SHA256 of refresh token |
| RefreshTokenExpiry | DateTime? | no | refresh expiry |
| LastConnected | DateTime? | no | last login |
| CreatedAt / UpdatedAt | DateTime | — | audit |

### Volunteer — `Models/Volunteer.cs` (table `Volunteers`)
| Property | Type | Required | Description |
|---|---|---|---|
| Id | int | PK | |
| InternalIdHash | string | yes (default "") | SHA256 hash of internal ID |
| MappingName | string | yes (default "") | name used to match Excel imports |
| FirstName / LastName | string? | no | |
| MobilePhone | string? | no | SMS target |
| ApproveToReceiveSms | bool | default false | consent gate for SMS |
| RoleId | int? | no | |
| CreatedAt / UpdatedAt | DateTime? | no | audit |
Relationship: referenced by `Shift.VolunteerId`. [MEDIUM — FK inferred by naming]

### Shift — `Models/Shift.cs` (table `Shifts`)
| Property | Type | Required | Description |
|---|---|---|---|
| Id | int | PK | |
| ShiftDate | DateTime | yes | shift date |
| ShiftName | string | yes (default "") | team/shift name |
| CarId | string | yes (default "") | car/patrol number |
| VolunteerId | int? | no | FK → Volunteer |
| VolunteerName | string? | no | denormalized name |
| SmsSentAt | DateTime? | no | same-day SMS marker |
| LocationId | int? | no | FK → Location |
| CustomLocationName / CustomLocationNavigation | string? | no | free-text "Other" location |
| IsCanceled | bool | — | soft-cancel flag (CLAUDE.md: active queries must filter `=0`) |
| CanceledAt | DateTime? | no | soft-cancel timestamp |
| CreatedAt / UpdatedAt | DateTime? | no | audit |

### SmsLog — `Models/SmsLog.cs` (table `SmsLog`)
| Property | Type | Required | Description |
|---|---|---|---|
| Id | int | PK | |
| ShiftId | int | yes | FK → Shift |
| SentAt | DateTime | yes | |
| Status | string | default `SmsStatuses.Success` | dedup/audit |
| Error | string? | no | failure detail |
| ReminderType | string | default `ReminderTypes.SameDay` | dedup key with ShiftId |

### SchedulerConfig — `Models/SchedulerConfig.cs` (table `SchedulerConfig`)
| Property | Type | Required | Description |
|---|---|---|---|
| Id | int | PK | |
| DayGroup | string | yes (default "") | run-day group (DayGroups) — the day SMS is SENT (per MEMORY) |
| ReminderType | string | yes (default "") | ReminderTypes value |
| Time | string | yes (default "") | trigger time-of-day |
| DaysBeforeShift | int | yes | look-ahead window |
| IsEnabled | int | default 1 | 1/0 boolean-as-int |
| MessageTemplateId | int | yes | FK → MessageTemplate |
| UpdatedAt | DateTime? / UpdatedBy string? | no | audit |

### SchedulerRunLog — `Models/SchedulerRunLog.cs` (table `SchedulerRunLog`)
| Property | Type | Required | Description |
|---|---|---|---|
| Id | int | PK | |
| ConfigId | int | yes | FK → SchedulerConfig |
| ReminderType | string | yes | |
| RanAt | string | yes | (stored as string) |
| TargetDate | string | yes | (stored as string) — UNIQUE w/ ConfigId+ReminderType per CLAUDE.md |
| TotalEligible / SmsSent / SmsFailed | int | — | run counters |
| Status | string | yes | |
| Error | string? | no | |

### MessageTemplate — `Models/MessageTemplate.cs` (table `MessageTemplate`)
Id (PK), Name (string, default ""), Content (string, default "" — body with `{שם}`/`{תאריך}` placeholders), CreatedAt/UpdatedAt (DateTime?).

### Location — `Models/Location.cs` (table `Locations`)
Id (PK), Name (string, default ""), Address/City/Navigation (string?, nullable — Navigation = Waze link), CreatedAt/UpdatedAt (DateTime?). Referenced by `Shift.LocationId`.

### JewishHoliday — `Models/JewishHoliday.cs` (table `JewishHolidays`)
Id (PK), Date (string, default ""), Name (string, default ""). Note: Date stored as string, not DateTime. [HIGH]

### CanceledShiftRow — `Models/CanceledShiftRow.cs` (DTO, no table)
Read-model joining Shift + Volunteer + Location for the canceled-shifts page. Fields: Id, ShiftDate, ShiftName, CarId, VolunteerId?, LocationId?, CustomLocationName?, CustomLocationNavigation?, CanceledAt?, VolunteerName?, VolunteerPhone?, VolunteerApproved (bool), LocationName?, LocationNavigation?, LocationCity?. [HIGH]

### ExcelShift — `Models/ExcelShift.cs` (DTO, no table)
Parsed shift block from the schedule Excel: Date (DateTime), Name (string), Car (string), Volunteers (List<string>). [HIGH]

**Enums:** only `DbType { SqlServer, Sqlite, Mysql, PostgreSql }` (`Database/DbHelperCore.cs:516-522`). No domain enums — domain "enums" are the string constants in `MagavConstants`. [HIGH]

---

## 6. Integration Points

| ID | Name | Type | Direction | Target | Source |
|---|---|---|---|---|---|
| IP-common:001 | SQLite/SQLCipher | DB driver | outbound | encrypted SQLite | `Database/DbHelperCore.cs:198,206`, `Magav.Common.csproj:14,31` |
| IP-common:002 | SQL Server | DB driver | outbound | MSSQL | `Database/DbHelperCore.cs:196,205` |
| IP-common:003 | MySQL | DB driver | outbound | MySQL | `Database/DbHelperCore.cs:197,207` |
| IP-common:004 | PostgreSQL (Npgsql) | DB driver | outbound | PostgreSQL | `Database/DbHelperCore.cs:199,208` |
| IP-common:005 | Brevo transactional email API | HTTP API | outbound | api.brevo.com | `Email/BrevoEmailNotifier.cs:31-47` |
| IP-common:006 | appsettings.json | config file | inbound | local file | `Utils/ConfigurationHelper.cs:21`, `Encryption/EncryptedConnectionStringsSource.cs` |
| IP-common:007 | Serilog config + sinks | logging | outbound | console/file (from config) | `Logger/Log.cs:17-20`, `Magav.Common.csproj:27-30` |
| IP-common:008 | Excel files (.xlsx) | file I/O | bidirectional | filesystem/stream (EPPlus) | `Excel/ExcelHelper.cs:61,103,284` |

---

## 7. User Roles & Access

No authorization policies or role-checking logic defined in this component. The only role-related primitives are:
- `User.Role` string field, default `"User"` (`Models/Auth/User.cs:14`). [HIGH]
- No `"Admin"`/`"SystemManager"` constants are declared here (those policy strings live in higher layers per CLAUDE.md). [HIGH — none found in scope]
- Auth-adjacent fields on `User`: `PasswordHash` (BCrypt), `RefreshTokenHash` (SHA256), `FailedLoginAttempts`, `LockoutUntil` (`Models/Auth/User.cs:12-19`). The hashing/lockout *logic* is not in this component. [HIGH]

---

## 8. Interfaces Exposed

**`MagavConstants`** (`MagavConstants.cs`) — exact canonical values:
- `ReminderTypes`: `SameDay`="SameDay", `Advance`="Advance", `LocationUpdate`="LocationUpdate", `Manual`="Manual", `WeekdayAdvance`="WeekdayAdvance" (`MagavConstants.cs:11-15`). **Note: `WeekdayAdvance` exists here but is NOT listed in CLAUDE.md's ReminderTypes — extra value.** [HIGH]
- `SmsStatuses`: `Success`="Success", `Fail`="Fail" (`MagavConstants.cs:20-21`).
- `DayGroups`: `SunThu`="SunThu", `Fri`="Fri", `Sat`="Sat" (`MagavConstants.cs:26-28`).
- `ServerName` (from config), `SendEmail` (bool from config), `PasswordKey` (const string used to decrypt connection strings) (`MagavConstants.cs:5-7`).

**`DbHelper`** (`Database/DbHelper.cs`) — factory + CRUD API surface used by `Magav.Server` repositories:
- Factories: `CreateSqliteDbHelper`, `CreateMySqlDbHelper`, `CreateSqlServerDbHelper`, `CreatePostgreSqlDbHelper` (`DbHelper.cs:12-30`).
- Transactions: `GetTransaction()` (`DbHelper.cs:39-42`).
- Fetch: `FetchAsync<T>(expr|sql|Sql)`, `FetchAllAsync<T>()`, `FetchWithSelectorAsync`, sync `Fetch`/`FetchAll`, `SkipTake[Async]`, `TakeAsync` (`DbHelper.cs:264-371`).
- Single/First/Last: `SingleOrDefaultByIdAsync`, `SingleAsync`, `SingleOrDefaultAsync(expr)`, `FirstOrDefaultAsync`, `LastOrDefaultAsync` (`DbHelper.cs:91-258`).
- Write: `InsertAsync`, `BulkInsertAsync`, `BulkInsertWithIdsAsync`, `UpdateAsync` (3 overloads), `BulkUpdate[Existing]Async`, `Upsert[Async]`, `BulkUpsert[Async]`, `Delete[Async]`, `DeleteById[Async]`, `DeleteMany[Async]`, `DeleteWhere` (`DbHelper.cs:424-909`).
- Scalar/exec: `ExecuteScalarAsync<T>`, `ExecuteQueryAsync` (`DbHelper.cs:374-420`).
- Count: `GetCount[Async]`, `GetCountByCondition[Async]` (`DbHelper.cs:913-933`).
- Maintenance: `TruncateTableAsync<T>`, `RebuildTableAsync<T>` (`DbHelper.cs:46-87`).
- Diagnostics: `LastSql` property, `CommandTimeoutSeconds` (default 120s) (`DbHelperCore.cs:30-33`).

**`ExcelHelper`** (`Excel/ExcelHelper.cs`): `ReadExcel<T>`, `ReadExcelWithValidation<T>`, `WriteExcel<T>`, `WriteExcelToBytes<T>` (file/stream/byte[] variants). Support types: `ExcelRowReader`, `ExcelReadResult<T>`, `ExcelRowError`, `ExcelColumnDefinition<T>`, `ExcelColumnBuilder<T>`.

**`EncryptionHelper`** (`Encryption/EncryptionHelper.cs`): `EncryptDataWithKey(data, password)`, `DecryptDataWithKey(enc, password)`.

**`ConfigurationHelper`** (`Utils/ConfigurationHelper.cs`): static `Configuration`, `GetDbConnectionString`, `GetServerClearName`, `GetSendEmail`.

**`Log`** (`Logger/Log.cs`): static `WriteVerbose/Debug/Information/Warning/Error/Fatal` with auto module/file/member enrichment.

**`EmailNotifier`** (`Email/EmailNotifier.cs`): static `Configure(...)`, `SendEmail(subject, content, attachments?)`; `DataFile` attachment wrapper.

**`IndexedList<T>`** (`DataStructures/IndexedList.cs`, ns `Magav.Common.Helpers`): `Index` (1–6 props), `Add`, `RemoveItem`, `GetByProperty/GetByProperties`, `GetFirstByProperty/GetFirstByProperties`, read-only `List`.

**Extensions / attributes:** `EnumerableExtensions` (`IsEmpty`/`IsNotEmpty`/`ForEach`/`Concat`), `EntityExtensions.GetTableName<T>`, `ReflectionExtensions` (`CastType`, `IsEqual`, `GetNotEqualProperties`, `GetHebrewDescription`), `DataTableExtensions.AsDataTable<T>`, `HebrewDescriptionAttribute`, `IgnoreOnCompareAttribute`. `DateTimeHelper.GetDatesForDayOfWeek`.

---

## 9. Interfaces Consumed

| External component | What imported | Import location |
|---|---|---|
| NPoco 5.7.1 | ORM core (`Database`, `Query<T>`, attributes, `Sql`, `UpdateBatch`) | `Database/DbHelper.cs:3`, `Database/DbHelperCore.cs:7`, all `Models/*.cs` |
| EPPlus 7.1.1 (OfficeOpenXml) | Excel read/write | `Excel/ExcelHelper.cs:1-3`, `Excel/ExcelRowReader.cs:1` |
| Serilog 4.0.1 (+ Settings.Configuration, Sinks.Console, Sinks.File) | logging | `Logger/Log.cs:3-5`, `Database/*.cs` |
| Microsoft.Data.Sqlite 8.0.7 | SQLite provider factory | `Database/DbHelperCore.cs:5,206` |
| SQLitePCLRaw.bundle_e_sqlcipher 2.1.11 | SQLCipher native bundle | `Magav.Common.csproj:31` (no direct code ref in scope) |
| Microsoft.Data.SqlClient 5.2.1 | SQL Server provider | `Database/DbHelperCore.cs:4,205` |
| MySql.Data 9.0.0 | MySQL provider | `Database/DbHelperCore.cs:6,207` |
| Npgsql | PostgreSQL provider | `Database/DbHelperCore.cs:208` |
| Microsoft.Extensions.Configuration(.Json) 8.0.0 | config building | `Utils/ConfigurationHelper.cs:1-2`, `Encryption/*.cs` |
| Microsoft.Extensions.Logging(.Abstractions) | `ILogger` abstraction | `Database/DbHelperCore.cs` (Serilog `ILogger` used) |
| brevo_csharp 1.0.0 | transactional email | `Email/EmailNotifier.cs:1`, `Email/BrevoEmailNotifier.cs:1-3` |
| AutoMapper 12.0.1 | (referenced) | `Magav.Common.csproj:10` — no usage found in scope |
| RepoDb 1.13.1 (+ MySql/PostgreSql/SqlServer/BulkOperations) | (referenced) | `Magav.Common.csproj:21-26` — no usage found in scope |
| System.IO.FileSystem.Primitives / System.Text.Encoding.Extensions / Microsoft.Win32.Primitives 4.3.0 | transitive-downgrade fixes for brevo | `Magav.Common.csproj:33-36` |

---

## 10. Legacy Warnings

- **God objects (>500 LOC):** `Database/DbHelper.cs` = **960 LOC**, `Database/DbHelperCore.cs` = **523 LOC**. Both are large, generic-heavy, multi-provider DB facades. `Excel/ExcelHelper.cs` = 412 LOC (4 near-duplicate read/write method pairs differing only file-vs-stream-vs-bytes — heavy duplication). [HIGH]
- **TODO/FIXME/HACK markers:** 0 found in scope (`grep -i` over the whole component). [HIGH]
- **Dead / commented-out code:** A large commented-out `BulkInsertWithIdsAsync` implementation (~60 lines) sits inline (`Database/DbHelper.cs:614-677`). Usage-example block commented in `ExcelHelper` (`Excel/ExcelHelper.cs:18-42`). Re-throw commented out in `BrevoEmailNotifier` (`Email/BrevoEmailNotifier.cs:53`). [HIGH]
- **Likely bug — sync retry sleep:** `GetExecFuncWithRetry` and `GetExecActionWithRetry` `Thread.Sleep(30000)` (30s) instead of using `DelayBetweenFails` (1s); the async path correctly uses the 1s constant (`Database/DbHelperCore.cs:430,485` vs `:457`). A failing sync query blocks the thread 30s before its single retry. [HIGH]
- **Likely bug — `IndexedList.RemoveItem` return value:** `_removeActions.Select(...).All(result => true)` always evaluates to `true` regardless of whether the item was actually removed from any index (`DataStructures/IndexedList.cs:78`). The per-index `RemoveFromDictionary` result is discarded. [HIGH]
- **Misleading log level:** successful email send is logged via `Log.WriteError(...)` (`Email/BrevoEmailNotifier.cs:48`). [HIGH]
- **Swallowed failures:** void transaction wrapper silently swallows duplicate-key errors (`DbHelperCore.cs:296-301`); email exceptions are caught and not re-thrown (`BrevoEmailNotifier.cs:50-54`); rollback failures only `Debug.WriteLine` (`DbHelperCore.cs:288-293`). [HIGH]
- **Concurrency hazard:** `BulkInsertWithIdsAsync` infers PKs from `SELECT MAX(id)` and assumes contiguous, uninterleaved auto-increment — concurrent inserts could mis-assign IDs (`Database/DbHelper.cs:708-714`). [MEDIUM — inferred from algorithm]
- **Stale comments:** `DbBatchSize` comment references "lessons"/"activities" and a "PHASE 2 increase from 1000 to 5000," but the constant is actually `1000` — comment doesn't match code and references a different domain (`Database/DbHelperCore.cs:18-24`). Suggests this DbHelper was lifted from another project. [HIGH]
- **Identity/naming drift:** build artifacts and assembly info reference **"Avidov.Common"** (`obj/.../Avidov.Common.AssemblyInfo.cs`) while the project is `Magav.Common`; `BrevoEmailNotifier` uses `eladr@avidov.com`-style ownership. Reinforces that `Magav.Common` (esp. DbHelper) is a vendored shared library from an "Avidov" codebase. [HIGH — observed in obj artifacts, out of primary scope but visible in file list]
- **Missing tests:** none in this component (project-wide: "There are no automated tests" per CLAUDE.md). [HIGH]
- **Crypto smell:** `EncryptionHelper` uses `Rfc2898DeriveBytes` with the **default iteration count** and `Rijndael` (legacy alias) (`Encryption/EncryptionHelper.cs:75,80,135`). `PasswordKey` is a hardcoded literal in source (`MagavConstants.cs:7`) used to decrypt connection-string passwords — documented here as structure/intent only, value not reproduced. [HIGH]
- **Unused package weight:** `AutoMapper` and the full `RepoDb` family are referenced but unused in scope — dead dependencies bloating the build (`Magav.Common.csproj:10,21-26`). [MEDIUM]

---

## 11. Design Rationale

| Pattern | Location | Rationale | Evidence | Certainty |
|---|---|---|---|---|
| Custom `DbHelper` over raw NPoco | `Database/DbHelper.cs`, `DbHelperCore.cs` | One ergonomic, provider-agnostic facade with retry, transaction wrapping, PK-safety guards, and renamed methods (`FetchAll`, `ExecuteQuery`) so repositories never touch NPoco directly | Provider switch in `GetDb` (`DbHelperCore.cs:192-224`); safety guards (`DbHelper.cs:457-551`) | HIGH |
| Split DbHelper into Core (protected executors) + public API | two files, `DbHelperCore` base of `DbHelper` | Separate connection/transaction/retry plumbing from the public CRUD surface | `public class DbHelper : DbHelperCore` (`DbHelper.cs:9`) | HIGH |
| Per-call short-lived `NPoco.Database` (no pooled connection) | `DbHelperCore.GetDb` + `using` in every method | Avoids shared-connection threading issues; relies on ADO connection pooling. Fits SQLite WAL + busy-timeout model noted in CLAUDE.md | `using NPoco.Database db = GetDb()` throughout (`DbHelperCore.cs:226-261`) | HIGH |
| `CommandTimeout` default 120s | `DbHelperCore.cs:30` | Tolerate slow/locked SQLite under WAL + 30s busy timeout | comment "2 minutes by default" | MEDIUM |
| Cached PK reflection | `PrimaryKeyCache` ConcurrentDictionary | Avoid repeated NPoco metadata + reflection lookups per write | `DbHelperCore.cs:131-185` | HIGH |
| Decrypting config provider | `Encryption/Encrypted*` + `ConfigurationHelper` | Keep DB password encrypted at rest in appsettings; decrypt transparently so callers use a normal connection string | `TryGet` rewrite (`EncryptedConnectionStringsProvider.cs:28-51`) | HIGH |
| Salt+IV prepended to ciphertext | `EncryptionHelper.cs:87-89,130-132` | Self-contained Base64 blob — no separate IV/salt storage needed for decrypt | code structure | HIGH |
| String constants over enums for domain values | `MagavConstants.cs` | Values are persisted to DB as strings and mirrored verbatim on Android; constants prevent drift between platforms (CLAUDE.md "use the constants, never inline") | `SmsLog` defaults reference the constants (`SmsLog.cs:13,15`) | HIGH |
| `IsEnabled` as `int` (1/0) not `bool` | `SchedulerConfig.cs:14` | SQLite has no native bool; int mirrors the Android Room/SQLite representation | field type | MEDIUM |
| Dates-as-strings for `JewishHoliday`/`SchedulerRunLog` | `JewishHoliday.cs:10`, `SchedulerRunLog.cs:12-13` | Avoid timezone/format ambiguity across providers; stored as canonical strings | field types | MEDIUM |
| `IndexedList<T>` composite-key indexing | `DataStructures/IndexedList.cs` | O(1) multi-property lookup for in-memory matching (e.g., shift dedup/import matching) without re-scanning lists | `Tuple.Create` index keys (`IndexedList.cs:126-154`) | MEDIUM |
| Callback-based Excel parsing (`Func<ExcelRowReader,T>`) | `Excel/ExcelHelper.cs:55` | Decouple generic iteration/empty-skip/validation from per-entity column mapping | signature + usage example | HIGH |
| Email gated by config flag | `EmailNotifier.cs:22-25` | Allow disabling all outbound mail per environment via `SendEmail` | early return | HIGH |

---

### Summary
- **Business rules:** 14 (BR-common:001–014) plus a key-invariants block. **Workflows:** 8 (WF-common:001–008). **Integration points:** 8 (IP-common:001–008).
- **Most non-obvious fact:** `MagavConstants.ReminderTypes` defines a fifth value `WeekdayAdvance` (`MagavConstants.cs:15`) that is absent from CLAUDE.md's documented reminder-type list — the canonical constant set has drifted ahead of the docs, and the constant pool itself (along with "Avidov.Common" assembly names and a stale "lessons/activities" batch-size comment) shows DbHelper is a vendored library carried in from another codebase.
