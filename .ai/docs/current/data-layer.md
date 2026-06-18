<!-- DeepInit Horizontal | Component: system-wide
Run ID: deepinit-2026-06-18
Input files processed: the 5 component docs + discovery.md
Generated: 2026-06-18 -->

# Data Layer — Magav V-Notification-System

## 0. Connectivity & method

The database is **NOT connected** for this analysis. Both targets use **SQLCipher-encrypted SQLite**; the web dev DB (`db/magav.db`) is gitignored with its passphrase local-only, and the Android DB lives on-device with its passphrase in EncryptedSharedPreferences. Per global-rule **R7, no live DB read is performed.** (discovery.md §6) [HIGH]

The schema below is documented **from code**:
- **.NET schema** from the CREATE TABLE / migration DDL in `web/server/Magav.Server/Services/DbInitializer.cs` (read directly, lines `47-273`, server.md WF-server:005). [HIGH]
- **Android schema** from the Room `@Entity` classes under `android/app/src/main/java/com/magav/app/db/entity/*` at `@Database(version = 8)` (android.md §5). [HIGH]

Both physical databases are **separate** (one per .NET deployment, one per Android device); they are never the same file. They are two independent definitions of the same logical model — which is exactly why the code-vs-code drift check in §3 matters.

---

## 1. Data-access patterns

| Target | ORM / access | Parameterization | Source |
|---|---|---|---|
| **.NET** (`server`) | NPoco via the custom `common.DbHelper` facade (Fetch/Insert/Update/Delete/ExecuteScalar/ExecuteQuery, transactions). Repositories (`Repository<T>` base + 9 domain repos) call DbHelper; `MagavDbManager` is the scoped facade. | Raw SQL uses positional `@0,@1,…` placeholders for all VALUES; only table/column NAMES (from type metadata, never request input) are interpolated. | common.md §8; server.md §5, boundary rules; `Database/Repository.cs`, `Database/MagavDbManager.cs` |
| **Android** | Room DAOs with `@Query`. Direct raw SQLCipher only in `DbInitializer`-equivalent seed paths. | Room `@Query` bind parameters (`:param`); compile-time-checked queries. | android.md §5, §9 |
| **.NET DDL/seed** | Raw `Microsoft.Data.Sqlite` `SqliteCommand` in `DbInitializer` (CREATE TABLE, migrations, seeds). `PRAGMA journal_mode=WAL; busy_timeout=30000`. | Seeds use `AddWithValue` parameters; migration column names from a static array. | server.md WF-server:005, IP-server:002 |

### 1.1 Dedup indices (load-bearing — identical intent on both platforms)

- **SmsLog per-shift dedup:** a reminder run skips a shift if a `SmsLog` row exists with the same `(ShiftId, ReminderType)` and `Status='Success'` (`NOT EXISTS` subquery on .NET; DAO check on Android). Backed by `IX_SmsLog_ShiftId` (.NET) / `index_SmsLog_ShiftId` (Android). [HIGH] (server.md BR-server:001; android.md BR-android:004)
- **SchedulerRunLog per-run dedup:** `UNIQUE(ConfigId, TargetDate, ReminderType)` — a duplicate insert is silently swallowed = "this config already ran for this target date." Present in BOTH schemas. [HIGH] (server.md BR-server:002, `DbInitializer.cs:203`; android.md BR-android:005, `SchedulerRunLogEntity.kt:14`)

> Caveat carried from component docs: .NET `SchedulerRunLogRepository.InsertAsync` swallows **ALL** exceptions as "already ran," not just UNIQUE violations (server.md §10) — a transient DB error during run-log insert is indistinguishable from a legitimate dedup hit.

---

## 2. Entity ↔ Table mapping (core tables)

Status legend: **✓ defined in code (not live-verified)** for every table (R7 — no live DB).

| Logical table | .NET model (`Magav.Common.Models`) | .NET DDL site | Android Room entity | Status |
|---|---|---|---|---|
| **Users** | `Auth/User.cs` | `DbInitializer.cs:48-64` | `UserEntity` | ✓ defined in code (not live-verified) |
| **Volunteers** | `Volunteer.cs` | `DbInitializer.cs:72-86` | `VolunteerEntity` | ✓ defined in code (not live-verified) — **drift, see §3** |
| **Shifts** | `Shift.cs` | `DbInitializer.cs:109-130` | `ShiftEntity` | ✓ defined in code (not live-verified) |
| **SmsLog** | `SmsLog.cs` | `DbInitializer.cs:137-148` | `SmsLogEntity` | ✓ defined in code (not live-verified) |
| **SchedulerConfig** | `SchedulerConfig.cs` | `DbInitializer.cs:172-183` | `SchedulerConfigEntity` | ✓ defined in code (not live-verified) |
| **SchedulerRunLog** | `SchedulerRunLog.cs` | `DbInitializer.cs:191-204` | `SchedulerRunLogEntity` | ✓ defined in code (not live-verified) |
| **MessageTemplate** | `MessageTemplate.cs` | `DbInitializer.cs:155-161` | `MessageTemplateEntity` | ✓ defined in code (not live-verified) |
| **Locations** | `Location.cs` | `DbInitializer.cs:93-101` | `LocationEntity` | ✓ defined in code (not live-verified) |
| **JewishHolidays** | `JewishHoliday.cs` | `DbInitializer.cs:217-222` | `JewishHolidayEntity` | ✓ defined in code (not live-verified) |
| **AppSettings** | *(none — no .NET model/table)* | *(absent)* | `AppSettingEntity` (PK `Key`) | ✓ Android-only — **drift, see §3** |

Non-table DTOs (read models, no table): .NET `CanceledShiftRow`, `ExcelShift`, `ShiftVolunteerDto`; Android `SmsLogDetailDto`, `SmsLogSummaryDto`, and the dead `AiShiftVolunteerDto`. (common.md §5; server.md §5; android.md §5)

---

## 3. Schema Drift Report

### 3.1 Live-drift (IF-2): SUPPRESSED

Live-drift detection is **SUPPRESSED (R7 — no DB connection); IF-2 not run.** No comparison of code-declared schema against an actual database was performed because the encrypted DB was never opened. (discovery.md §6) [HIGH]

### 3.2 Code-vs-code drift (the real risk: two independent schema definitions)

Because the .NET `DbInitializer` schema and the Android Room schema are maintained **separately** for the same logical model, they can drift. Comparing the `DbInitializer.cs` DDL against the Room entity column lists (android.md §5):

| # | Table | .NET (DbInitializer.cs) | Android (Room entity) | Drift | Severity |
|---|---|---|---|---|---|
| D-1 | **Volunteers** | has `InternalIdHash TEXT NOT NULL UNIQUE`, `FirstName TEXT NULL`, `LastName TEXT NULL`, `RoleId INTEGER NULL` (`DbInitializer.cs:74-85`) | `VolunteerEntity` has **none** of these — only `MappingName` (unique), `MobilePhone`, `ApproveToReceiveSms`, `CreatedAt`, `UpdatedAt` (android.md §5) | **Columns present in .NET, absent on Android: `InternalIdHash`, `FirstName`, `LastName`, `RoleId`.** | **HIGH** |
| D-2 | **AppSettings** | no such table | `AppSettingEntity` (PK `Key`, `Value`; e.g. `sms_sim_subscription_id`) | **Table present on Android, absent in .NET.** (Justified — SIM-selection is Android-only; the .NET SMS provider is InforUMobile.) | LOW (intentional) |
| D-3 | **Volunteers identity model** | identity is `InternalIdHash` (SHA256 of national/internal id) — the unique key for upsert/approval (server.md BR-server:016, VolunteersRepository `HashInternalId`) | identity is the **unique `MappingName`** index; there is no hashed-internal-id column at all | **Fundamentally different volunteer-identity scheme between platforms.** | **HIGH** |
| D-4 | **Users.UserName index** | non-unique `CREATE INDEX IX_Users_UserName` (`DbInitializer.cs:64`) — uniqueness enforced only by the column-level `UNIQUE` constraint on the column (`:51`) | `index_Users_UserName` declared **unique** (android.md §5) | Both ultimately enforce uniqueness (column UNIQUE on .NET, unique index on Android), so semantics match; the index *kind* differs. | LOW |
| D-5 | **Volunteers index** | `IX_Volunteers_InternalIdHash`, `IX_Volunteers_RoleId` (`DbInitializer.cs:84-85`) | unique `index_Volunteers_MappingName` only | Index sets differ as a consequence of D-1/D-3 (different columns exist). | follows from D-1 |
| D-6 | **Column nullability — CreatedAt/UpdatedAt** | `Users.CreatedAt/UpdatedAt` are `NOT NULL` (`DbInitializer.cs:61-62`); `Volunteers`/`Shifts`/`Locations` audit cols are `NULL` | Android audit columns are nullable `String?` across entities (android.md §5) | Minor: `Users` audit columns are NOT NULL on .NET vs nullable on Android. Low impact (always written on insert). | LOW |

**Why D-1 / D-3 are not fatal in practice:** the two databases are never shared — `.NET` writes its own `magav.db`, Android writes its own device DB. The volunteer-import + SMS-approval *logic* differs accordingly (server.md upserts by `InternalIdHash`; android.md `VolunteersImportService` matches by lowercased `MappingName`, BR-android:018, WF-android:005). So the drift is consistent *within* each platform. The risk is conceptual/maintenance: the two platforms model "who is a volunteer and how do we de-dup them on import" **differently**, and any feature that assumes the .NET volunteer shape (e.g. the hashed-internal-id SMS-approval flow, server.md BR-server:016 / api.md WF-api:008) has **no Android equivalent column to land on**. A volunteer record is not portable between the two backends. [HIGH]

**Tables that are consistent across both** (same columns, types, defaults, dedup constraints): `Shifts`, `SmsLog`, `SchedulerConfig`, `SchedulerRunLog`, `MessageTemplate`, `Locations`, `JewishHolidays`. In particular the two load-bearing dedup constraints (`SmsLog (ShiftId,ReminderType)` and `SchedulerRunLog UNIQUE(ConfigId,TargetDate,ReminderType)`) and the soft-cancel columns (`Shifts.IsCanceled`/`CanceledAt`) match on both sides. [HIGH]

---

## 4. Storage conventions (both platforms)

- **Booleans as INTEGER 1/0** — `IsActive`, `ApproveToReceiveSms`, `IsEnabled`, `IsCanceled`, `MustChangePassword` (SQLite has no native bool). [HIGH] (common.md §11; android.md §5)
- **Dates/timestamps as TEXT (ISO strings)** — `ShiftDate`, `SmsSentAt`, `CanceledAt`, audit columns, and `JewishHolidays.Date` / `SchedulerRunLog.TargetDate`/`RanAt` are stored as strings to avoid cross-provider/timezone ambiguity. [HIGH] (common.md §5, §11)
- **Encryption:** SQLCipher with WAL + 30s busy timeout on .NET (`PRAGMA journal_mode=WAL; busy_timeout=30000`, server.md WF-server:005); Room+SQLCipher with passphrase in EncryptedSharedPreferences on Android (android.md IP-android:011). [HIGH]
- **Foreign keys:** `Shifts.VolunteerId→Volunteers`, `Shifts.LocationId→Locations`, `SmsLog.ShiftId→Shifts`, `SchedulerRunLog.ConfigId→SchedulerConfig` on both; Android adds `ON DELETE CASCADE` on the Volunteer/Shift FKs (android.md §5). `SchedulerConfig.MessageTemplateId` is intentionally NOT an FK on Android (BR-android:011). [HIGH]

---

### Summary
- DB not connected (R7); schema documented from `DbInitializer.cs` (.NET) and Room `@Entity` at `@Database(version=8)` (Android); **IF-2 live-drift not run.**
- **Code-vs-code drift FOUND:** the **Volunteers** table diverges materially — .NET has `InternalIdHash`/`FirstName`/`LastName`/`RoleId` and de-dups volunteers by hashed internal id; Android has none of those and de-dups by a unique `MappingName`. Android also has an `AppSettings` table with no .NET counterpart (intentional, SIM selection). All other core tables — including the two dedup constraints and the soft-cancel columns — are consistent.
