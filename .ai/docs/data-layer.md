<!-- DeepInit Horizontal | Component: system-wide
DeepInit C8 update | Run ID: deepinit-2026-08-17 | Generated: 2026-08-17 — schema moved on BOTH targets for the first time since the Volunteers divergence: Shifts gains ShiftType + Description/ShiftTime/Address/VehicleLocation (+ VehicleLocationId), Locations gains LocationType, and AppSettings finally exists on .NET too (closing drift row D-2). Room @Database 9 → 11 via two additive ALTER-only migrations (MIGRATION_9_10, MIGRATION_10_11) mirrored by .NET MigrateShiftTypeColumnsAsync / MigrateLocationTypeColumnsAsync. Separately, SmsLog.Status gains a THIRD value 'Dispatched' with NO DDL change (existing TEXT column) — written by Android only. · prior: deepinit-2026-06-30 (Auto-Callback-to-Gate — Android-only: NEW Room table CallbackConfig, @Database(version) bumped 8→9, additive MIGRATION_8_9; NO .NET/EF/NPoco counterpart) · prior: deepinit-2026-06-25b (re-verified through 778a2dd: STILL no schema change — the Duty Log editable-hours preview + the Android device-allowlist gate persist NOTHING; no CREATE TABLE / Room @Entity / @Database(version) change) · prior: deepinit-2026-06-25 (commit 970cdcc — NO schema change: the Duty Log (יומן הפעלה) feature persists NOTHING; no CREATE TABLE / Room @Entity / @Database(version) change on either target → no new code-vs-code schema drift. ADR-019.) · prior: deepinit-2026-06-24 (run-log dedup note + Volunteer divergence accepted by ADR-016)
Input files processed: the 5 component docs + discovery.md
Generated: 2026-06-18 -->

# Data Layer — Magav V-Notification-System

## 0. Connectivity & method

The database is **NOT connected** for this analysis. Both targets use **SQLCipher-encrypted SQLite**; the web dev DB (`db/magav.db`) is gitignored with its passphrase local-only, and the Android DB lives on-device with its passphrase in EncryptedSharedPreferences. Per global-rule **R7, no live DB read is performed.** (discovery.md §6) [HIGH]

The schema below is documented **from code**:
- **.NET schema** from the CREATE TABLE / migration DDL in `web/server/Magav.Server/Services/DbInitializer.cs` (read directly; fresh-DB DDL `:60-290`, in-place migrations `:326-591`, admin backfills `:938-1051`; server.md WF-server:005). [HIGH]
- **Android schema** from the Room `@Entity` classes under `android/app/src/main/java/com/magav/app/db/entity/*` at **`@Database(version = 11)`** (`db/MagavDatabase.kt:44`; android.md §5). Entity count is unchanged at 11 — v10 and v11 added **columns**, not tables. [HIGH]

Both physical databases are **separate** (one per .NET deployment, one per Android device); they are never the same file. They are two independent definitions of the same logical model — which is exactly why the code-vs-code drift check in §3 matters.

---

## 1. Data-access patterns

| Target | ORM / access | Parameterization | Source |
|---|---|---|---|
| **.NET** (`server`) | NPoco via the custom `common.DbHelper` facade (Fetch/Insert/Update/Delete/ExecuteScalar/ExecuteQuery, transactions). Repositories (`Repository<T>` base + 9 domain repos) call DbHelper; `MagavDbManager` is the scoped facade. | Raw SQL uses positional `@0,@1,…` placeholders for all VALUES; only table/column NAMES (from type metadata, never request input) are interpolated. | common.md §8; server.md §5, boundary rules; `Database/Repository.cs`, `Database/MagavDbManager.cs` |
| **Android** | Room DAOs with `@Query`. Direct raw SQLCipher only in `DbInitializer`-equivalent seed paths. | Room `@Query` bind parameters (`:param`); compile-time-checked queries. | android.md §5, §9 |
| **.NET DDL/seed** | Raw `Microsoft.Data.Sqlite` `SqliteCommand` in `DbInitializer` (CREATE TABLE, migrations, seeds). `PRAGMA journal_mode=WAL; busy_timeout=30000`. | Seeds use `AddWithValue` parameters; migration column names from a static array. | server.md WF-server:005, IP-server:002 |

### 1.1 Dedup indices (load-bearing — identical intent on both platforms)

- **SmsLog per-shift dedup — THE TWO PLATFORMS NOW DIVERGE (accepted, 2026-08-17):**
  - **.NET (unchanged):** skips a shift only if a `SmsLog` row exists with `(ShiftId, ReminderType)` **and `Status='Success'`** (`NOT EXISTS` subquery, `SmsReminderService.cs:74-80`). A delivered-but-`Fail`-logged send is therefore re-sent on a later run.
  - **Android (v1.5.0, at-most-once):** skips on **ANY** row for `(ShiftId, ReminderType)` regardless of status — `Success`, `Dispatched`, or `Fail` — via `getShiftIdsWithAnyRow` plus a status-filter-free point re-check immediately before dispatch (`SmsLogDao.kt:62-63,68-69`; `SmsReminderService.kt:84,128`). Even a `Fail` row is only retried **manually**.
  - Same index on both sides (`IX_SmsLog_ShiftId` / `index_SmsLog_ShiftId`); the divergence is in the **predicate**, not the schema. Recorded as an accepted divergence in `tools/parity.md` "until the web target ships". [HIGH] (server.md BR-server:001; android.md BR-android:004)
- **`SmsLog.Status` now carries a third value, `Dispatched`, with NO DDL change** — `Status` was always a plain `TEXT` column with a `'Success'` default on both sides, so widening the value-set required no migration (deliberately kept outside the ADR-004 hazard class). **Only Android writes it**; .NET declares the constant for parity and never produces it. Any consumer that treats `Status != 'Success'` as failure is now wrong on Android — the Android summary query counts `Status IN ('Success','Dispatched')` as sent (`SmsLogDao.kt:37`), and the shared React log page renders `Dispatched` amber. [HIGH]
- **SchedulerRunLog per-run dedup:** `UNIQUE(ConfigId, TargetDate, ReminderType)` — a duplicate insert is silently swallowed = "this config already ran for this target date." Present in BOTH schemas. [HIGH] (server.md BR-server:002, `DbInitializer.cs:203`; android.md BR-android:005, `SchedulerRunLogEntity.kt:14`)

> Note (updated 2026-06-19, `2989b01`): `SchedulerRunLogRepository.InsertAsync` now swallows **only** the SQLite UNIQUE violation as "already ran"; any other DB error is logged distinctly and returns null without rethrowing (the Android mirror in `SmsReminderService.kt` matches). The earlier swallow-ALL caveat is resolved (ISS-006).

---

## 2. Entity ↔ Table mapping (core tables)

Status legend: **✓ defined in code (not live-verified)** for every table (R7 — no live DB).

| Logical table | .NET model (`Magav.Common.Models`) | .NET DDL site | Android Room entity | Status |
|---|---|---|---|---|
| **Users** | `Auth/User.cs` |  `DbInitializer.cs:59-75` | `UserEntity` | ✓ defined in code (not live-verified) |
| **Volunteers** | `Volunteer.cs` |  `DbInitializer.cs:83-96` | `VolunteerEntity` | ✓ defined in code (not live-verified) — **drift, see §3** |
| **Shifts** | `Shift.cs` (+`ShiftType`, 4 admin cols, `VehicleLocationId`) | `DbInitializer.cs:121-147` | `ShiftEntity` | ✓ defined in code (not live-verified) — **+6 columns at v10/v11, see §2.2** |
| **SmsLog** | `SmsLog.cs` |  `DbInitializer.cs:155-165` | `SmsLogEntity` | ✓ defined in code (not live-verified) |
| **SchedulerConfig** | `SchedulerConfig.cs` |  `DbInitializer.cs:190-206` | `SchedulerConfigEntity` | ✓ defined in code (not live-verified) |
| **SchedulerRunLog** | `SchedulerRunLog.cs` |  `DbInitializer.cs:209-224` | `SchedulerRunLogEntity` | ✓ defined in code (not live-verified) |
| **MessageTemplate** | `MessageTemplate.cs` |  `DbInitializer.cs:173-180` | `MessageTemplateEntity` | ✓ defined in code (not live-verified) |
| **Locations** | `Location.cs` (+`LocationType`) | `DbInitializer.cs:104-118` | `LocationEntity` (+`locationType`) | ✓ defined in code — **+1 column at v11** |
| **JewishHolidays** | `JewishHoliday.cs` |  `DbInitializer.cs:249-255` | `JewishHolidayEntity` | ✓ defined in code (not live-verified) |
| **AppSettings** | **`AppSetting.cs`** (NEW 2026-07-14, PK `Key`, `AutoIncrement=false`) | **`DbInitializer.cs:238-245` (fresh) + `MigrateAppSettingsAsync` `:1016-1035` (`CREATE TABLE IF NOT EXISTS`, both paths)** | `AppSettingEntity` (PK `Key`) | ✓ **now on BOTH — drift row D-2 CLOSED** |
| **CallbackConfig** | *(none — no .NET model/table)* | *(absent)* | `CallbackConfigEntity` (singleton PK `Id`=1) | ✓ Android-only — **drift, see §3** |

Non-table DTOs (read models, no table): .NET `CanceledShiftRow`, `ExcelShift`, `ShiftVolunteerDto`; Android `SmsLogDetailDto`, `SmsLogSummaryDto`, and the dead `AiShiftVolunteerDto`. (common.md §5; server.md §5; android.md §5)

### 2.1 CallbackConfig — Android-only singleton (Room v9, schema-from-code)

Added by the **Auto-Callback-to-Gate** feature (Android-native; ADR-021). It is the **11th** Room `@Entity` and the first schema change since v8 — `@Database(version)` bumped **8 → 9** (`db/MagavDatabase.kt:44`). **There is NO .NET `DbInitializer` CREATE TABLE, no `Magav.Common.Models` class, and no EF/NPoco counterpart** — same accepted "Android-only native setting" pattern as `AppSettings` (the SIM-selection table). Schema documented from `db/entity/CallbackConfigEntity.kt:15-45` (R7 — no live DB). [HIGH]

| Column | Type | NOT NULL | Default (`@ColumnInfo(defaultValue=…)`) | Notes |
|---|---|---|---|---|
| `Id` | INTEGER | yes | *(none — fixed)* | **Singleton `@PrimaryKey` Id = 1**, `autoGenerate=false`; the table holds exactly one row (`CallbackConfigEntity.kt:17-19`). |
| `IsActive` | INTEGER | yes | `0` | Feature toggle, bool-as-int 0/1. |
| `GatePhone` | TEXT | yes | `''` (empty) | Gate number to auto-dial. |
| `FromHour` | TEXT | yes | `08:00` | Window start, `HH:mm`. |
| `ToHour` | TEXT | yes | `20:00` | Window end, `HH:mm`. |
| `AllDay` | INTEGER | yes | `0` | All-day window override, bool-as-int. |
| `AllCallers` | INTEGER | yes | `0` | ON ⇒ bypass the today/yesterday-volunteer WHO filter (any caller), bool-as-int. |
| `UpdatedAt` | TEXT | no (`String?`) | *(none — nullable)* | Audit. |
| `UpdatedBy` | TEXT | no (`String?`) | *(none — nullable)* | Audit. |

**Seeded with the type defaults** (the singleton `CallbackConfigEntity()` no-arg row) on two paths: `DatabaseInitializer.seedCallbackConfig()` via `callbackConfigDao().insertOrIgnore()` (fresh installs, idempotent) and `MIGRATION_8_9`'s `INSERT OR IGNORE` (upgrades) — DAO `insertOrIgnore` is `OnConflictStrategy.IGNORE`, so neither clobbers an admin edit (`db/dao/CallbackConfigDao.kt:13-22`). Reads/writes route through the Android-only `GET/PUT /api/callback-config` (`api/routes/CallbackConfigRoutes.kt`). [HIGH]

**MIGRATION_8_9 (additive-only — done by the full ritual):** `db/MagavDatabase.kt:146-168` — `CREATE TABLE IF NOT EXISTS CallbackConfig` (column list / NOT NULL flags / DEFAULT clauses match the entity exactly) **+ `INSERT OR IGNORE` of the singleton row**; it **touches NO existing table**, so all existing user data (users/volunteers/shifts/logs/configs/holidays) is preserved (ADR-004). It is registered in **BOTH** `addMigrations(...)` sites in `MagavApplication.kt` — the initial build (`:109`) **and** the SQLCipher-recovery rebuild (`:135`) — and `fallbackToDestructiveMigration` remains **ABSENT** (a forgotten-migration / schema-hash mismatch still crashes VISIBLY rather than wiping). **Entity↔migration default agreement was schema-hash verified via `exportSchema`.** This is the second real, correctly-executed example of the v7→v8/ADR-004 migration ritual. [HIGH]

### 2.2 The 2026-07-14 additive column set (both targets, schema-from-code)

Six new columns, all **additive** and all mirrored on both targets. Room went **9 → 11** in two `ALTER TABLE ADD COLUMN`-only migrations; .NET added the same columns through two `PRAGMA table_info` add-if-absent migrations. **No table was rebuilt and no column was dropped on either side**, so all existing user data is preserved (ADR-004). [HIGH]

| Table | Column | Type | NOT NULL | Default | Room migration | .NET migration |
|---|---|---|---|---|---|---|
| `Shifts` | `ShiftType` | TEXT | yes | `'Operational'` | `MIGRATION_9_10` (`MagavDatabase.kt:177-186`) | `MigrateShiftTypeColumnsAsync` (`DbInitializer.cs:490-538`) |
| `Shifts` | `Description` / `ShiftTime` / `Address` / `VehicleLocation` | TEXT | no | — | `MIGRATION_9_10` | `MigrateShiftTypeColumnsAsync` |
| `Locations` | `LocationType` | TEXT | yes | `'Vehicle'` | `MIGRATION_10_11` (`MagavDatabase.kt:194-200`) | `MigrateLocationTypeColumnsAsync` (`DbInitializer.cs:540-591`) |
| `Shifts` | `VehicleLocationId` | INTEGER | no | — | `MIGRATION_10_11` | `MigrateLocationTypeColumnsAsync` |

**Why the two NOT-NULL discriminators are safe to add in place:** SQLite permits `ADD COLUMN … NOT NULL` **only when a DEFAULT is supplied**, and it then backfills every existing row — so all pre-existing shifts become `Operational` and all pre-existing locations become `Vehicle`, which is exactly the intended semantics (every location that existed before v11 *was* a patrol parking spot). .NET adds a belt-and-suspenders `UPDATE … WHERE … IS NULL` normalize on top (`DbInitializer.cs:535-537,572-577`). [HIGH]

**Deliberately NO index on `ShiftType`, `LocationType` or `VehicleLocationId`, and NO `@ForeignKey` on `VehicleLocationId`** — both stated in-comment on the entity (`ShiftEntity.kt:71-73,89-92`). The reason is ADR-004 mechanics, not performance: an index or FK changes the `CREATE TABLE` shape Room hashes, which would turn an ALTER-only migration into a table rebuild — the exact operation that caused the original data-loss incident. Referential integrity for `VehicleLocationId` is instead enforced at the application layer by the widened location-delete guard (BR-server:030). [HIGH]

**Uniqueness note:** `Locations.Name` remains **globally unique across both types** (the single pre-existing unique index is untouched). A `General` location therefore cannot reuse a `Vehicle` location's name — an intentional consequence of typing an existing table rather than splitting it. [HIGH] (`LocationEntity.kt:34-37`)

---

## 3. Schema Drift Report

### 3.1 Live-drift (IF-2): SUPPRESSED

Live-drift detection is **SUPPRESSED (R7 — no DB connection); IF-2 not run.** No comparison of code-declared schema against an actual database was performed because the encrypted DB was never opened. (discovery.md §6) [HIGH]

### 3.2 Code-vs-code drift (the real risk: two independent schema definitions)

Because the .NET `DbInitializer` schema and the Android Room schema are maintained **separately** for the same logical model, they can drift. Comparing the `DbInitializer.cs` DDL against the Room entity column lists (android.md §5):

| # | Table | .NET (DbInitializer.cs) | Android (Room entity) | Drift | Severity |
|---|---|---|---|---|---|
| D-1 | **Volunteers** | has `InternalIdHash TEXT NOT NULL UNIQUE`, `FirstName TEXT NULL`, `LastName TEXT NULL`, `RoleId INTEGER NULL` (`DbInitializer.cs:74-85`) | `VolunteerEntity` has **none** of these — only `MappingName` (unique), `MobilePhone`, `ApproveToReceiveSms`, `CreatedAt`, `UpdatedAt` (android.md §5) | **Columns present in .NET, absent on Android: `InternalIdHash`, `FirstName`, `LastName`, `RoleId`.** | **HIGH → accepted by design (ADR-016)** |
| D-2 | **AppSettings** | ~~no such table~~ → **`AppSetting.cs` + DDL on both the fresh path and an unconditional `CREATE TABLE IF NOT EXISTS` migration** (`DbInitializer.cs:243-251,1016-1035`) | `AppSettingEntity` (PK `Key`, `Value`) | **✅ CLOSED 2026-07-14.** The administrative-shifts feature needed a key-value store for the two template-role ids, so .NET grew the table Android already had. **Contents still differ by design:** Android holds `sms_sim_subscription_id` (+ the admin keys); .NET holds only the admin keys (its SMS provider is InforUMobile, so there is no SIM to select). | resolved |
| D-7 | **CallbackConfig** | no such table | `CallbackConfigEntity` singleton (PK `Id`=1; `db/MagavDatabase.kt:42`) | **Table present on Android (Room v9), absent in .NET.** (Justified — Auto-Callback-to-Gate is a phone-native Android-only feature with no .NET/EF counterpart; same class as D-2/AppSettings. ADR-021; ISS-004 accepted-divergence list.) | LOW (intentional) |
| D-3 | **Volunteers identity model** | identity is `InternalIdHash` (SHA256 of national/internal id) — the unique key for upsert/approval (server.md BR-server:016, VolunteersRepository `HashInternalId`) | identity is the **unique `MappingName`** index; there is no hashed-internal-id column at all | **Fundamentally different volunteer-identity scheme between platforms.** | **HIGH → accepted by design (ADR-016)** |
| D-4 | **Users.UserName index** | non-unique `CREATE INDEX IX_Users_UserName` (`DbInitializer.cs:64`) — uniqueness enforced only by the column-level `UNIQUE` constraint on the column (`:51`) | `index_Users_UserName` declared **unique** (android.md §5) | Both ultimately enforce uniqueness (column UNIQUE on .NET, unique index on Android), so semantics match; the index *kind* differs. | LOW |
| D-5 | **Volunteers index** | `IX_Volunteers_InternalIdHash`, `IX_Volunteers_RoleId` (`DbInitializer.cs:84-85`) | unique `index_Volunteers_MappingName` only | Index sets differ as a consequence of D-1/D-3 (different columns exist). | follows from D-1 |
| D-6 | **Column nullability — CreatedAt/UpdatedAt** | `Users.CreatedAt/UpdatedAt` are `NOT NULL` (`DbInitializer.cs:61-62`); `Volunteers`/`Shifts`/`Locations` audit cols are `NULL` | Android audit columns are nullable `String?` across entities (android.md §5) | Minor: `Users` audit columns are NOT NULL on .NET vs nullable on Android. Low impact (always written on insert). | LOW |

**Why D-1 / D-3 are not fatal in practice:** the two databases are never shared — `.NET` writes its own `magav.db`, Android writes its own device DB. The volunteer-import + SMS-approval *logic* differs accordingly (server.md upserts by `InternalIdHash`; android.md `VolunteersImportService` matches by lowercased `MappingName`, BR-android:018, WF-android:005). So the drift is consistent *within* each platform. The risk is conceptual/maintenance: the two platforms model "who is a volunteer and how do we de-dup them on import" **differently**, and any feature that assumes the .NET volunteer shape (e.g. the hashed-internal-id SMS-approval flow, server.md BR-server:016 / api.md WF-api:008) has **no Android equivalent column to land on**. A volunteer record is not portable between the two backends. **Accepted by design (ADR-016)** — intentional per-target modeling (Android keys on `MappingName`, has no SMS-approval flow, never reads the four .NET-only columns); not migrated (ADR-004 data-wipe hazard for zero functional gain). [HIGH] [→ accepted]

| D-8 | **`SmsLog` dedup PREDICATE (not schema)** | eligibility excludes only rows with `Status='Success'` (`SmsReminderService.cs:74-80`) | **ANY** row for `(ShiftId, ReminderType)` blocks automatic re-dispatch, and the row is written **before** the send (`SmsLogDao.kt:62-63,68-69`; `SmsReminderService.kt:84,128,172`) | **Same columns and index, different safety semantics.** Android is at-most-once; .NET is still the pre-incident post-send/Success-only scheme. Accepted "until the web target ships" (`tools/parity.md`) — but the .NET side carries the failure mode the Android fix removed. | **MEDIUM → accepted (documented)** |

**Tables that are consistent across both** (same columns, types, defaults, dedup constraints): `Shifts` (**including all 6 new columns and their defaults**), `SmsLog`, `SchedulerConfig`, `SchedulerRunLog`, `MessageTemplate`, `Locations` (**including `LocationType`**), `JewishHolidays`, and now `AppSettings`. In particular the two load-bearing dedup constraints (`SmsLog (ShiftId,ReminderType)` and `SchedulerRunLog UNIQUE(ConfigId,TargetDate,ReminderType)`) and the soft-cancel columns (`Shifts.IsCanceled`/`CanceledAt`) match on both sides — the only 2026-08-17 divergence is D-8, which is behavioral, not structural. [HIGH]

---

## 4. Storage conventions (both platforms)

- **Booleans as INTEGER 1/0** — `IsActive`, `ApproveToReceiveSms`, `IsEnabled`, `IsCanceled`, `MustChangePassword` (SQLite has no native bool). [HIGH] (common.md §11; android.md §5)
- **Dates/timestamps as TEXT (ISO strings)** — `ShiftDate`, `SmsSentAt`, `CanceledAt`, audit columns, and `JewishHolidays.Date` / `SchedulerRunLog.TargetDate`/`RanAt` are stored as strings to avoid cross-provider/timezone ambiguity. [HIGH] (common.md §5, §11)
- **Encryption:** SQLCipher with WAL + 30s busy timeout on .NET (`PRAGMA journal_mode=WAL; busy_timeout=30000`, server.md WF-server:005); Room+SQLCipher with passphrase in EncryptedSharedPreferences on Android (android.md IP-android:011). [HIGH]
- **Foreign keys:** `Shifts.VolunteerId→Volunteers`, `Shifts.LocationId→Locations`, `SmsLog.ShiftId→Shifts`, `SchedulerRunLog.ConfigId→SchedulerConfig` on both; Android adds `ON DELETE CASCADE` on the Volunteer/Shift FKs (android.md §5). `SchedulerConfig.MessageTemplateId` is intentionally NOT an FK on Android (BR-android:011). [HIGH]

---

### Summary
- DB not connected (R7); schema documented from `DbInitializer.cs` (.NET) and Room `@Entity` at **`@Database(version=11)`** (Android); **IF-2 live-drift not run.**
- **2026-08-17:** the first *mirrored* schema change since the divergence was found — 6 additive columns on `Shifts`/`Locations` applied identically to both targets (§2.2), Room 9→11 via ALTER-only migrations registered in both `addMigrations` sites, and **drift row D-2 (AppSettings) CLOSED** (.NET grew the table). One NEW drift, **D-8**, is behavioral rather than structural: Android's `SmsLog` dedup is now at-most-once (any row blocks, written write-ahead) while .NET still dedups on `Success` only — accepted and documented in `tools/parity.md`.
- **Code-vs-code drift STILL PRESENT:** the **Volunteers** table diverges materially — .NET has `InternalIdHash`/`FirstName`/`LastName`/`RoleId` and de-dups volunteers by hashed internal id; Android has none of those and de-dups by a unique `MappingName`. Android also has two tables with no .NET counterpart, both intentional: `AppSettings` (SIM selection) and — new at Room v9 — `CallbackConfig`, the singleton (PK `Id`=1) for the Android-only Auto-Callback-to-Gate feature (§2.1; D-7; ADR-021), added via the additive `MIGRATION_8_9` (registered in both `addMigrations` sites; entity↔migration defaults schema-hash verified). All other core tables — including the two dedup constraints and the soft-cancel columns — are consistent.
