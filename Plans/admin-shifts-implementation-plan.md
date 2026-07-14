# IMPLEMENTATION PLAN — Two Shift Types (Operational + Administrative) for Magav

> **What this is.** A complete, dependency-ordered implementation plan for the **administrative-shifts (משמרות מנהליות)** feature, produced from `Plans/admin-shifts-build-plan-prompt.md`. It introduces a **shift-type distinction** — **מבצעית (Operational)** = everything today; **מנהלית (Administrative)** = a new, always-manually-created type with its own page, fields, templates, and one automated advance reminder — while keeping operational behavior **byte-for-byte unchanged** and the two types strictly isolated in every query and SMS path. It covers **both deployment targets** (.NET 8 web + Android Ktor/Room) and the shared React SPA as first-class.
>
> No code is written here — this is the plan only.

---

## 0. Verification note (independent source re-check for this plan)

Per the build-plan instruction to *"open a cited source file whenever you need an exact signature, column, or line … where a citation has drifted, trust the code and note the correction,"* **every anchor below was re-read against the current tree** (the `graphify` CLI is not runnable in this environment — it errors `command not found` — so all verification was direct `Read`/`Grep`). Result: the load-bearing behaviors are all confirmed; several line numbers drifted. **Corrections applied throughout this plan:**

| Cited (prompt) | Verified actual | Impact |
|---|---|---|
| Shift endpoints block `~617-1370` | **`~631-1371`** (header L631-633, first endpoint `/import` L635, last endpoint `send-location-update` ends L1371) | cosmetic |
| `.NET update-group` calls `CountShiftGroupAsync` | **No `CountShiftGroupAsync` exists in the .NET server (0 matches).** Update-group uses `HasShiftGroup(existingShifts,…)` (`Program.cs:1286`, bool existence) + `UpdateShiftGroupAsync` (L1289) + `UpdateShiftGroupLocationAsync` (L1297). The repo has `HasShiftGroupAsync`/`HasShiftGroup` (`ShiftsRepository.cs:73-74/86-87`), not a count. | drop the invalid citation; sweep §6a rewritten |
| `.NET` group ops key on `(ShiftName, CarId, dateRange)` | **`.NET` group ops key on `(ShiftName, CarId)` within a SINGLE DAY** (the date is fixed by `GetByDateAsync`), NOT a date range. Android group ops DO use `(ShiftName, CarId)` + a `[from,to)` **date range**. | subtle .NET-vs-Android asymmetry, noted in §6 |
| `GetEffectiveDayGroupAsync ~151-165` | signature **L149**, `SunThu` default return **L165** (exact range 149-166) | cosmetic |
| Android `buildMessage` takes `(shiftName, carId, volunteerName, targetDate)` | **5 params — leading `template: String` first:** `buildMessage(template, shiftName, carId, volunteerName, targetDate: LocalDate)` (`SmsReminderService.kt:207-222`) | §4b signature-extension is a 5→9 param change |
| Android `buildMessage` callers = "cancel/send-sms/delete-group Ktor sites" | **exact callers:** internal `SmsReminderService.kt:108`; `ShiftRoutes.kt:219, :272, :350, :474` | §4b caller list corrected |
| Android DayGroup gate lives in `computeWindow ~272-282` | `computeWindow` (L272-282) only builds the window `Triple`; the **`WEEKDAY_ADVANCE` branch is L277**. The **`config.dayGroup != effectiveGroup` gate is at the callers**: `doWork:70` and `checkAllConfigs:116`. | §4c wording corrected |
| Android `{id}/send-sms` `buildMessage ~466/491` | route `post("/{id}/send-sms")` L417; templateId default block L458-467 (**L466** = `if (shiftDate == today) 1 else 2`); **`buildMessage` call L474-476**; L491 = the `reminderType` `when` mapping | cosmetic |
| `MessageTemplatesPage.tsx :84-86` uses `isReadOnly` | validation L84-86 confirmed; but the page uses **`const isAdmin = isUserAdmin()` (L43)**, NOT the `isReadOnly = !isUserAdmin()` form the sibling settings pages use | §7 read-only gate guidance |
| `CanceledShiftsPage.tsx` = "range-table pattern" | it is a **single-month** filtered table (`<Input type="month">` L103-108 → `getCanceledShifts(month)`), with **no read-only gate** (hard-delete unconditional) | new admin page must use the `ShiftsManagementPage` week-nav pattern (already mandated by §3.10) |
| menu case id for operational shifts | `renderContent()` switches on the **subItem `id`**; the operational case is **`'shifts-management'`** (`Index.tsx:90`), menu item title `'משמרות'` is `menuItems.ts:11`, parent top-level id `'shift-management'` title `'ניהול משמרות'` L5-15 | §7 routing corrected |

**Newly confirmed facts that shape the plan (not in the original prompt):**
- **`SchedulerConfig.IsEnabled` is an `int` (default 1), not a bool** — both the seeded admin config (`IsEnabled=0`) and the `AlarmScheduler` enabled filter (`isEnabled==1`, `AlarmScheduler.kt:40`) treat it as int.
- **`.NET` `SchedulerRunLog` FK to `SchedulerConfig(Id)` = `DbInitializer.cs:202`** (✓ as cited); Android FK `SchedulerRunLogEntity.kt:16-23` (✓). Both `UNIQUE(ConfigId,TargetDate,ReminderType)` (`.NET` L203 / Android L14).
- **`.NET` import hard-delete boundary is INCLUSIVE** (`s.ShiftDate >= minDate && s.ShiftDate <= maxDate`, `ShiftsImportService.cs:109`) — a closed range, unlike the half-open (`<`) read queries. The `&& ShiftType='Operational'` fix is correct regardless.
- **Android `ShiftCleanupWorker` has NO `SmsLog` prune** (only Shifts L37 + SchedulerRunLog L38); `.NET ShiftCleanupService` prunes `SmsLog` first (L80-82), then Shifts (L88-90), then SchedulerRunLog (L96-98). This is a **pre-existing cross-platform drift** (orphan `SmsLog` accumulates on Android) — **moot for this feature** (D11 = type-agnostic cleanup introduces no SmsLog scoping; see R12); **not introduced by this feature.**
- **Android message-template validation strings differ from .NET/React:** Android throws two separate `"תבנית חייבת להכיל {שם}"` / `"תבנית חייבת להכיל {תאריך}"` (`MessageTemplateRoutes.kt:62/65`), while .NET/React use one combined `"תבנית חייבת להכיל {שם} ו-{תאריך}"`. Pre-existing; matters if the rule is relaxed (§7.7).
- **`.NET` auth policies (exact):** `AdminOnly` = Admin; `CanManageMessages` = Admin+SystemManager. Scheduler-config GET = `CanManageMessages` (L1916); bulk PUT = `AdminOnly` (L1981); single PUT = `AdminOnly` (L2022); template POST = `AdminOnly` (L2094); template PUT = `AdminOnly` (L2128); all shift-mutating endpoints = `CanManageMessages`. Android: `authenticate("auth-bearer")` + per-handler `requireRole` — GET = Admin/SystemManager, mutating template/callback routes = **Admin only**.

Everything else (the FK-drives-D4 rationale, the WeekdayAdvance window/gate math, the two hard-delete anchors, the exact-match bulk-PUT breakage, the 5-site template validation, the Room migration discipline) verified **accurate as cited**.

---

## 1. Design decisions to confirm with the user (⟵ each is a recommended default — PROCEED with it, do not block)

| # | Decision | Recommendation (with reasoning) |
|---|----------|--------------------------------|
| **D1** | **Discriminator: column vs separate table** | **Single `ShiftType TEXT NOT NULL DEFAULT 'Operational'` column** on `Shifts`/`ShiftEntity` + 4 nullable admin columns. Reuses the one-row-per-volunteer model, `SmsLog(ShiftId,ReminderType)` dedup, all repos/DAOs, and the scheduler send loop unchanged. Existing rows backfill to `Operational` via the column default. The cost — a bounded, enumerable per-query type predicate (§6) — is cheaper than duplicating the dedup/scheduler plumbing on both platforms. ⟵ confirm |
| **D2** | **Admin extra-field storage** | Add to `Shifts`: `Description TEXT`, `ShiftTime TEXT` (HH:mm), `Address TEXT NULL`, `VehicleLocation TEXT NULL`. **Reuse existing columns** for the rest: `CarId` = vehicle (already optional), `CustomLocationName`/`LocationId` = location name (מיקום). Operational rows leave the 4 new columns NULL. `ShiftName` (`TEXT NOT NULL` on both platforms) is **reused as an admin group carrier** — admin rows set `ShiftName = Description` (§5a.2). ⟵ confirm the field→column mapping |
| **D3** | **Group key `(Date, ShiftTime, Description)`** | Adopt, with the two documented caveats: **edit re-buckets** (changing Date/Time/Description moves rows to a new group) and **identical triples merge**. Normalize `ShiftTime` to zero-padded `HH:mm` server-side so `"8:00"`/`"08:00"` don't split a group. Admin grouping lives in its OWN endpoints (§5a.1/5a.3/5a.4) — it never reuses the operational `(ShiftName, CarId)` group queries, so the two schemes never collide. Alternative (immutable `ShiftGroupId` column) noted but not adopted unless the caveats are rejected. ⟵ confirm |
| **D4** | **Admin scheduler = a REAL `SchedulerConfig` row** | **MANDATORY, not merely preferred** (`ReminderType='AdminAdvance'`, `DayGroup='SunThu'`, `DaysBeforeShift=1`, `IsEnabled=0`). `SchedulerRunLog.ConfigId` is a FK → `SchedulerConfig(Id)` (`.NET` `DbInitializer.cs:202`; Android `SchedulerRunLogEntity.kt:16-23`). A separate admin-config table makes the admin run-log INSERT violate the FK → on Android it throws → dedup never persists → **duplicate admin SMS every scheduler tick**. Keeping it in `SchedulerConfig` also reuses the `DayGroup==effectiveDayGroup` firing gate verbatim. ⟵ confirm the row values (esp. default `Time`) |
| **D5** | **Standalone template-role storage** | Create a **`.NET AppSettings` key-value table mirroring the existing Android `AppSettings`**; store `admin_assignment_template_id` + `admin_today_template_id`. The **advance** template id lives in the admin `SchedulerConfig.MessageTemplateId`. Reason: Android already has `AppSettings` (`AppSettingEntity`/`AppSettingDao`, seeded, `getByKey`+`upsert`); .NET has none — this closes the asymmetry with the smallest surface. ⟵ confirm |
| **D6** | **Per-volunteer icon when shift is NOT today** | **✅ CONFIRMED (user, 2026-07-02): send the assignment template** — "you have been assigned to this task" (task/date/time). On the shift's own day the icon sends the **today** template instead (§5d). |
| **D7** | **New placeholders `{תיאור} {שעה} {מיקום} {כתובת} {מיקום רכב}`** (`{רכב}` exists) | Add identically to both platforms with graceful empty-field degradation (§4b). Admin "today"/advance messages use **explicit placeholders only** — do NOT auto-append vehicle location (that operational coupling is SameDay-only). ⟵ confirm |
| **D8** | **Save+send UX** | **Two footer buttons** — "שמירה" / "שמירה ושליחת SMS". Backend = create-then-send via a dedicated admin send path (modeled on `SendLocationUpdateAsync`), passed as a `sendSms: bool` on the create-group request. ⟵ confirm |
| **D9** | **New admin settings page hosting all 3 template roles** | Page titled **"הגדרות תזמון למשמרות מנהליות"** hosting: advance (hour + enabled + template), assignment template, today template. ⟵ confirm title/scope |
| **D10** | **Manual admin send ReminderType** | Manual admin sends log as **`Manual`** (no dedup, re-sends allowed, mirrors operational). The automated advance uses new **`AdminAdvance`**. Isolation proof in §4d. ⟵ confirm |
| **D11** | **Admin-shift retention in monthly cleanup** | **✅ CONFIRMED (user, 2026-07-02): SAME as operational — cleanup stays TYPE-AGNOSTIC.** Admin rows age out after one month exactly like operational rows. **No change** to `.NET ShiftCleanupService.cs:88-90` or Android `ShiftDao.deleteOlderThan:57` — they stay unfiltered (§7). (Side effect: the pre-existing Android `SmsLog`-prune gap, R12, is now irrelevant to this feature — no SmsLog scoping is introduced.) |
| **D12** | **Auto-callback eligibility (ADR-021) shift-type scope** | **✅ CONFIRMED (user, 2026-07-02): keep auto-callback TYPE-AGNOSTIC** (matches both types). `CallbackLogic.isEligible` (`callback/CallbackLogic.kt:90`) keeps calling the unfiltered `getByDateRange(from,to)` — a volunteer on an administrative shift today stays a legitimate caller. `CallbackLogic` is NOT narrowed to Operational and `getByDateRange` is NOT deleted (would break compile). Mechanism in §7b. |
| **F1** | **`GetByVolunteerId` / `getByVolunteerId` scope** (volunteer-delete cascade) | **RECOMMEND leaving unfiltered** so the cascade covers admin shifts too (`.NET ShiftsRepository.cs:34-35`, `VolunteerId==id && !IsCanceled`, no date/type filter; Android `ShiftDao.getByVolunteerId:21`). ⟵ confirm |
| **F2** | **Template validation for admin templates** | **RECOMMEND keeping `{שם}`+`{תאריך}` mandatory for admin too** (simplest, no discriminator; the seeded admin templates include both). Otherwise relax at all **5 sites / 4 files** (§7.7). ⟵ confirm |
| **F3** | **Group-key caveats vs immutable `ShiftGroupId`** | **RECOMMEND accepting the D3 caveats** (no new column). ⟵ confirm |

---

## 2. Constants + parity-lint (do FIRST — every downstream step keys off these strings)

### 2a. New string constants — byte-identical on both platforms
- **`.NET` `web/server/Magav.Common/MagavConstants.cs`** (`ReminderTypes` class L9-16, consts L11-15; no `ShiftTypes` today):
  - Add `ReminderTypes.AdminAdvance = "AdminAdvance"`.
  - Add a new nested `public static class ShiftTypes { public const string Operational = "Operational"; public const string Administrative = "Administrative"; }`.
- **Android `util/Constants.kt`** (`ReminderTypes` L3-9; `SmsStatuses` L11-14; `DayGroups` L16-20; no `ShiftTypes`):
  - Add `const val ADMIN_ADVANCE = "AdminAdvance"` to `ReminderTypes`.
  - Add `object ShiftTypes { const val OPERATIONAL = "Operational"; const val ADMINISTRATIVE = "Administrative" }`.
- Values MUST match across the two files exactly.

### 2b. Parity-lint (`tools/parity-lint.mjs` + `tools/parity.md`) — real code edit
- `parity-lint.mjs` hardcodes exactly **3** value-sets (`ReminderTypes`/`SmsStatuses`/`DayGroups`, extraction maps L41-50, loop L56); `REACT_REMINDER_EXEMPT = ['LocationUpdate','Manual']` (L27); the `unexpectedMissing` check (L73-78) fails on a non-exempt canonical `ReminderType` absent from React.
  - **Add `'AdminAdvance'` to `REACT_REMINDER_EXEMPT`** (the admin scheduler UI is a separate cluster, not a `schedulerPreview.ts` row) and document it in `tools/parity.md`. Otherwise the lint fails.
- **`ShiftTypes` is not covered by the lint today.** RECOMMEND extending `parity-lint.mjs`: add a `ShiftTypes` extraction (`class ShiftTypes` / `object ShiftTypes`) + a .NET-vs-Android compare block (mirroring the existing 3-set logic). A genuine code edit, included as a deliverable.
- After edits: **`node tools/parity-lint.mjs` must exit 0.**

---

## 3. DB schema + migrations (both targets) — existing-DB backfill is mandatory

### 3a. `.NET` model + `Shifts` schema
- **`web/server/Magav.Common/Models/Shift.cs`** (NPoco auto-mapped — `[TableName("Shifts")]`, props L9-22, **no hand-written column list**): add 5 properties — `ShiftType` (string, default `"Operational"`), `Description` (string?), `ShiftTime` (string?), `Address` (string?), `VehicleLocation` (string?). NPoco maps by property name, so each new prop must have a matching column (below) or reads/writes break.
- **`DbInitializer.cs` fresh-install `CREATE TABLE Shifts`** (`createShiftsSql` literal L108-130, executed L132-133): add the 5 columns —
  - `ShiftType TEXT NOT NULL DEFAULT 'Operational'`, `Description TEXT NULL`, `ShiftTime TEXT NULL`, `Address TEXT NULL`, `VehicleLocation TEXT NULL`.
  - **Do NOT add a `ShiftType` index** (low volume; keeps parity with the Room "prefer no index" guidance and avoids Room index-name pitfalls on the mirror).
- **New idempotent `MigrateShiftTypeColumnsAsync(connection)`** following the **`MigrateCancellationColumnsAsync` PRAGMA `table_info(Shifts)` pattern (L400-438)**: for each of the 5 columns, `ALTER TABLE Shifts ADD COLUMN …` if absent. SQLite backfills existing rows to `Operational` via the column default; also run an explicit idempotent `UPDATE Shifts SET ShiftType='Operational' WHERE ShiftType IS NULL` as belt-and-suspenders. **Call it in the existing-DB migration block** (alongside the calls at `DbInitializer.cs:263-266`, right after `MigrateCancellationColumnsAsync`).

### 3b. `.NET AppSettings` table (D5) — new
- **`DbInitializer.cs` fresh install:** `CREATE TABLE AppSettings (Key TEXT PRIMARY KEY, Value TEXT NOT NULL)` (there is no `AppSettings` table on .NET today — verified).
- **New idempotent `MigrateAppSettingsAsync`:** `CREATE TABLE IF NOT EXISTS AppSettings …`, then `INSERT OR IGNORE` the two admin keys with defaults pointing at the seeded admin template ids resolved **by name** (§4). Called unconditionally (mirror `MigrateSchedulerConfigAsync`, `DbInitializer.cs:740-761`, called at L272).
- Add `Magav.Common/Models/AppSetting.cs` + a small `AppSettingsRepository` (`GetByKeyAsync`, `UpsertAsync`) in `Magav.Server/Database/Repositories/`, registered in `MagavDbManager`.

### 3c. `.NET SchedulerConfig` / `SchedulerRunLog` — no schema change
The admin advance is a normal `SchedulerConfig` row; `UNIQUE(DayGroup, ReminderType)` (`DbInitializer.cs:182`) lets `(SunThu, AdminAdvance)` coexist with `(SunThu, WeekdayAdvance)` etc. `SchedulerRunLog` FK (L202) stays valid (D4).

### 3d. Android entity + Room migration (version 9 → 10)
- **`db/entity/ShiftEntity.kt`** (`tableName="Shifts"`, `shiftName` NON-null String L33-34, all 5 admin fields absent): add `@ColumnInfo(name="ShiftType", defaultValue="Operational") val shiftType: String = "Operational"`, plus nullable `description`, `shiftTime`, `address`, `vehicleLocation`. **Do NOT add an `Index` on ShiftType** (an index needs the exact Room-generated name in the migration or the schema-hash check crashes — ADR-004).
- **`db/MagavDatabase.kt`** (currently `@Database(version = 9)` L44; `MIGRATION_8_9` L146-168 is the additive `CallbackConfig` precedent; **no `MIGRATION_9_10` exists**): bump to `version = 10`; add `MIGRATION_9_10` mirroring the additive-column pattern:
  ```
  ALTER TABLE Shifts ADD COLUMN ShiftType TEXT NOT NULL DEFAULT 'Operational'
  ALTER TABLE Shifts ADD COLUMN Description TEXT
  ALTER TABLE Shifts ADD COLUMN ShiftTime TEXT
  ALTER TABLE Shifts ADD COLUMN Address TEXT
  ALTER TABLE Shifts ADD COLUMN VehicleLocation TEXT
  ```
  The migration's resulting schema (names, NOT NULL, `defaultValue='Operational'`) MUST **byte-match the entity** or Room's schema-hash check throws on open (by design → crashes visibly, never wipes). `ADD COLUMN … NOT NULL DEFAULT` is legal because a default is supplied.
- **`MagavApplication.kt`**: append `MagavDatabase.MIGRATION_9_10` to **BOTH** `.addMigrations(...)` sites — **L109 (main build)** AND **L135 (SQLCipher key-mismatch recovery rebuild)** — identically. Forgetting either = schema-hash mismatch crash on upgraded devices. Never introduce `fallbackToDestructiveMigration` (recovery stays limited to SQLCipher key/corruption errors, L117-125).
- **New `db/` files (entity edits are in-place, but any NEW file under a `db/` package segment): `git add -f`** — the root `.gitignore` `db/` rule silently ignores them [ISS-010].
- **Bump `versionCode`** in `android/app/build.gradle.kts` (currently **76** / `versionName "1.4.26"`, L16-17) before the APK build.

### 3e. Android `AppSettings` — no Room change
Android already has `AppSettingEntity` (Key PK / Value) + `AppSettingDao` (`getByKey` L11-12, `upsert` @Upsert L14-15). Just seed the two admin keys in `DatabaseInitializer.seedAppSettings()` (L206) idempotently, guarded per-key with `getByKey` like the existing `sms_sim_subscription_id` (L207-208).

---

## 4. Seeding + existing-DB backfill (every site, both platforms; resolve ids BY NAME)

Because seed methods that bail on non-empty tables reach **fresh installs only**, admin templates/config/settings need **idempotent create-if-missing** to reach existing production DBs. **Auto-increment template ids cannot be hardcoded** (existing DBs may already have used ids 4/5) — resolve admin template ids **by NAME at runtime**, and seed templates **before** configs/settings for FK integrity.

> **⚠ `MessageTemplate.Name` is NOT unique on either platform.** Make every by-name lookup **deterministic** (`… WHERE Name=@0 ORDER BY Id LIMIT 1`) so a user-authored duplicate name can't pick the wrong row. On **.NET**, if the lookup fails, **skip the config/settings insert + log** (never write an invalid FK). **Mirror the same skip-on-missing guard on Android** — Room's `SchedulerConfig`/`AppSettings` template-id references have **no FK**, so an unresolved id would silently persist as a dangling reference (SMS then fails at send time). Guard both.

### 4a. New message templates (3 roles)
Author up to 3 admin templates; both examples deliberately include `{שם}` and `{תאריך}` so they pass the mandatory-placeholder validation kept in §7.7. **⟵ confirm exact contents.**
- assignment — **"שיבוץ למשמרת מנהלית"**: e.g. `שלום {שם},\nשובצת למשימה {תיאור},\nבתאריך {תאריך} שעה {שעה}\nבהצלחה`
- today — **"משמרת מנהלית היום"**: e.g. `שלום {שם},\nמשימה {תיאור} מתקיימת היום ({יום}, {תאריך}) בשעה {שעה}.`
- advance — reuse the assignment template or author a third; the advance template id is stored on the admin `SchedulerConfig.MessageTemplateId`.

**Seed sites (all must be touched):**
- **`.NET SeedMessageTemplatesAsync`** (L677-701, seeds 3 today, fresh only, called L168) — append the admin rows; update the "3 default entries" count/log.
- **`.NET` NEW idempotent `MigrateMessageTemplatesAsync`** (none exists today) — `INSERT … SELECT … WHERE NOT EXISTS(SELECT 1 FROM MessageTemplate WHERE Name=@Name)` per admin template; call it unconditionally in `InitializeAsync` (mirror `MigrateSchedulerConfigAsync`). **Never assume ids 4/5.**
- **Android `seedMessageTemplates()`** (`DatabaseInitializer.kt:66`, bails on non-empty L67-68, fresh only) — append the admin rows.
- **Android** NEW idempotent `migrateMessageTemplates()` (none exists) — insert each admin template only if a template of that Name is absent; call it unconditionally in `initialize()` (L16-24), mirror `migrateSchedulerConfigs()` (L189).

### 4b. Admin `SchedulerConfig` advance row (D4)
Seed `(DayGroup='SunThu', ReminderType='AdminAdvance', Time='06:00' ⟵ confirm, DaysBeforeShift=1, IsEnabled=0, MessageTemplateId=<advance template id resolved BY NAME>)`. `IsEnabled` is an **int** (0 = disabled).
- **`.NET`:** dedicated idempotent `MigrateAdminSchedulerConfigAsync` using `INSERT OR IGNORE` on `UNIQUE(DayGroup,ReminderType)`, called **unconditionally** after `MigrateSchedulerConfigAsync`. Resolve `MessageTemplateId` via `SELECT Id FROM MessageTemplate WHERE Name=…`; if the lookup fails, skip + log (never insert an invalid FK).
- **Android:** mirror in a new `migrateAdminSchedulerConfig()` (unconditional, `insertOrIgnore`), resolving the template id by Name. Keep the values in sync with .NET and add the same "keep in sync" comment `migrateSchedulerConfigs()` carries (L181-188).
- Ships **disabled** so no admin SMS fires until the user configures it.

### 4c. `.NET AppSettings` admin template-id keys
Seed `admin_assignment_template_id` + `admin_today_template_id` (§3b) with defaults = the assignment/today template ids resolved **by name**; Android mirror in `seedAppSettings()` (§3e).

---

## 5. Services / scheduler (both targets)

### 5a. SMS eligibility — add type isolation + project admin columns (P0)
- **`.NET SmsReminderService.cs` eligibility SELECT (`ExecuteAsync`, `FetchAsync<ShiftVolunteerDto>` L46, columns L47-52, WHERE L56-66):** it projects only `s.ShiftName, s.CarId` (+ `s.Id/ShiftDate/LocationId` + location joins) — **NOT** the admin columns. Two coupled edits in this one SELECT:
  1. Add `AND s.ShiftType = @N` bound to a type param derived from `config.ReminderType`: **`AdminAdvance ⇒ Administrative`, every other type ⇒ Operational**.
  2. **Also project `s.Description, s.ShiftTime, s.Address, s.VehicleLocation`** (NULL for operational rows) so `BuildMessage` can substitute the new placeholders; otherwise raw `{תיאור}/{שעה}/…` tokens would ship in admin SMS.
  - Add the 4 fields to **`ShiftVolunteerDto`** (class L326, fields L328-340).
- **`.NET SendLocationUpdateAsync` SELECT** (method L252, `FetchAsync` L257, SQL L258-273, WHERE L267-272, filters `ShiftName`+`CarId`, no type predicate): add `AND s.ShiftType = 'Operational'` (location update is operational-only).
- **Android `SmsReminderService.kt` `execute()`** (`getByDateRange(from,to)` at **L50**): replace with a new typed DAO method **`getByDateRangeAndType(from, to, shiftType)`** (§6b), passing the type resolved from `config.reminderType`. **Android note:** the DAO uses `SELECT * FROM Shifts` → the full `ShiftEntity`, so once §3d lands the admin columns are **auto-populated** — no explicit-projection change is needed on Android (only .NET needs the SELECT column additions). Do **NOT** touch `CallbackLogic.kt:90` (§6b / D12).

### 5b. `BuildMessage` / `buildMessage` — new placeholders + empty-token stripping (both, identical semantics)
Add the D7 placeholders to **`.NET BuildMessage`** (`public static string BuildMessage(string template, ShiftVolunteerDto shift, DateTime targetDate)` L204-220; today handles `{שם},{שם מלא},{תאריך},{יום},{משמרת},{רכב}` L214-219) and **Android `buildMessage`** (`fun buildMessage(template, shiftName, carId, volunteerName, targetDate: LocalDate)` L207-222; same 6 placeholders L216-221):
- New placeholders: `{תיאור}`←Description, `{שעה}`←ShiftTime, `{מיקום}`←location name, `{כתובת}`←Address, `{מיקום רכב}`←VehicleLocation.
- **Signature/DTO change:**
  - **.NET:** add the 4 nullable fields to `ShiftVolunteerDto` (done in §5a); `BuildMessage` keeps the DTO param — no caller churn.
  - **Android:** `buildMessage` currently has **5 params**; extend to **9** (add nullable `description, shiftTime, address, vehicleLocation`). **Update every caller:** internal `SmsReminderService.kt:108`, and `ShiftRoutes.kt:219, :272, :350, :474`. Prefer nullable-defaulted params so operational callers pass nothing new; then thread the real values from the admin send/scheduler paths.
- **⚠ Graceful empty-field degradation (strip raw tokens, not just blank lines) — shared 3-step post-pass on both platforms:** (1) substitute present values; (2) for each optional placeholder whose source is null/empty, **delete the token itself** (replace with `""`); (3) collapse any line that became blank or ends in a lone dangling label. Order matters — no raw `{…}` token or empty line may ever ship. Verify with an admin shift that sets Description+ShiftTime but leaves Address+VehicleLocation blank.
- **Pre-existing name-token divergence (ISS-003) — do NOT present admin templates as byte-identical output.** `{שם}` renders `FirstName` on .NET but `mappingName` on Android, and `{שם מלא}` also diverges. This is inherited by admin templates. Don't add new logic that depends on these matching; note the divergence in `tools/parity.md`.

### 5c. Admin advance scheduler — reuse the WeekdayAdvance machinery (D4)
- **`.NET SmsSchedulerService.cs`** (`CheckAndRunScheduledJobs` config loop L90-132): the loop already gates on `config.DayGroup == effectiveDayGroup` (L95-96) and exact `Time` match (L99-100). The admin row is `DayGroup='SunThu'`, so `GetEffectiveDayGroupAsync` (L149-166: Sat→`Sat` L151-156, Fri→`Fri` L158-163, else `SunThu` L165) makes it fire **only on working days** and **never on Fri/Sat/holiday/holiday-eve**. **Extend the window branch:** change the condition at **L114** from `== WeekdayAdvance` to `== WeekdayAdvance || == AdminAdvance`, so admin reuses the half-open window `[today+N, NextWorkingDay(today)+N)` with `runLogTargetDate = today` and `N = DaysBeforeShift = 1` (windowStart L110, today L108, n L109; WeekdayAdvance body L115-119).
- **`ExecuteAsync`** already derives per-shift `{תאריך}`/`{יום}` (correct for the multi-day admin window). The only admin-specific behavior: eligibility filters `Administrative` + projects admin columns (§5a); it must NOT append location (the SameDay location-append guard already excludes non-SameDay types). Heed the **WeekdayAdvance window/run-log coupling** (a single `runLogTargetDate` shared by the query and the run-log dedup key) — reused verbatim, already correct.
- **Android `SmsSchedulerWorker.kt`:** in `computeWindow` (L272-282), change the branch condition at **L277** (`config.reminderType == ReminderTypes.WEEKDAY_ADVANCE`) to also match `ADMIN_ADVANCE`; it builds `Triple(windowStart, nextWorkingDay(today).plusDays(n), today)` (L278). The **`config.dayGroup != effectiveGroup` firing gate lives at the callers** — `doWork:70` and `checkAllConfigs:116` — and works verbatim for the admin config. `SmsReminderService.execute` then filters `Administrative` via the typed DAO (§5a).
- **Android `AlarmScheduler.kt`:** `scheduleAllAlarms()` (L18-48) iterates ALL configs × 7 days, cancels all (L26-36), then re-schedules only `isEnabled==1` configs (L40-46). The admin config is discovered automatically once enabled. **requestCode = `config.id*10 + day.value`** (L28/L65) — distinct config ids never collide (gap of 10, day ≤ 7). No change beyond the config existing; document the invariant (admin config id ≥ 1).
- **Dedup unambiguity:** `SchedulerRunLog UNIQUE(ConfigId, TargetDate, ReminderType)` — admin uses its own ConfigId + `AdminAdvance` → never collides with operational. `SmsLog(ShiftId, AdminAdvance)` — a shift row is exactly one type, so admin shift ids never share a reminder-type key with operational sends. Safe.

### 5d. One-shot admin sends (creation-send + per-volunteer icon) — model on `SendLocationUpdateAsync`
The operational `POST /api/shifts/{id}/send-sms` hardcodes templateId `1/2` by date and derives ReminderType via a `1→SameDay / 2→Advance / else Manual` switch (`.NET` default L1114, switch L1147; Android default block L458-467, `when` L491). **Admin sends MUST NOT go through that id switch.** Use **dedicated admin send endpoints** (§6) that take an explicit templateId (resolved from AppSettings: assignment or today) and log **ReminderType=`Manual`** (D10), no dedup. The admin send resolves its DTO via a query projecting the admin columns so `BuildMessage`/`buildMessage` degrade placeholders cleanly (§5b).

---

## 6. Endpoints (both targets) + config isolation

### 6a. `.NET` (`Program.cs`) — shift-block ~631-1371; `Results.Json(ApiResponse<T>.Fail("<Hebrew>"))` only, never `Results.Problem`
Reads use `CanManageMessages` (matching existing shift endpoints); config/settings **writes = `AdminOnly`** (matching the existing scheduler-config/template PUTs).
1. **`GET /api/shifts/administrative/by-week?weekStart=YYYY-MM-DD`** (`CanManageMessages`) — Sun→Sat window; new repo `GetAdministrativeByWeekAsync(sundayDate)` filtering `ShiftType='Administrative' AND IsCanceled=0 AND ShiftDate ∈ [weekStart, weekStart+7)`; returns rows + DTO (Description/ShiftTime/Address/VehicleLocation/vehicle/location/volunteer).
2. **`POST /api/shifts/administrative`** (create-group, `CanManageMessages`) — body: Description, Date, ShiftTime (normalized `HH:mm`), Address?, LocationName?, CarId?, VehicleLocation?, `VolunteerIds:int[]`, `sendSms:bool` (D8). Insert one row per volunteer with `ShiftType=Administrative`. **⚠ ShiftName integrity (REQUIRED):** `ShiftName` is `TEXT NOT NULL` (.NET) / non-null (`ShiftEntity.shiftName`) — **set `ShiftName = Description`** (validate Description non-empty first). Never leave it null (constraint violation) or empty (would collide/bucket-collapse). If `sendSms`, resolve the **assignment** template id from AppSettings and send to each volunteer (log `Manual`).
3. **`PUT /api/shifts/administrative/update-group`** (`CanManageMessages`) — atomic group update keyed on old `(Date, ShiftTime, Description)` → new values (Caveat 1: editing re-buckets — update ALL group rows in one statement). When Description changes, update `ShiftName` too (keep `ShiftName == Description`).
4. **`POST /api/shifts/administrative/cancel-group`** (`CanManageMessages`) — soft-cancel scoped to `ShiftType='Administrative'` rows matching `(Date, ShiftTime, Description)`. Do NOT reuse the operational `ShiftName`+`CarId` cancel.
5. **`POST /api/shifts/administrative/{id}/send-sms`** (`CanManageMessages`) — explicit admin send (per-volunteer icon). If today → today template; else per **D6**. Logs `Manual`, no dedup.
6. **Admin scheduler config:** **`GET /api/admin-scheduler/config`** (`CanManageMessages`) returning only the `AdminAdvance` row; **`PUT /api/admin-scheduler/config`** (`AdminOnly`) updating **only** `Time`/`IsEnabled`/`MessageTemplateId`. **`DayGroup`, `ReminderType`, and `DaysBeforeShift` are server-owned/immutable** (not accepted from the PUT body) — `DaysBeforeShift` stays pinned at **1**, because the reused half-open WeekdayAdvance window is only gap/overlap-free for N=1 (the §11 "Sunday shift → advance fires Thursday" contract depends on it). Validate with a small admin-specific validator. **Mirror the immutability guard on the Android admin single-PUT (`AdminSchedulerRoutes.kt`); `requireRole("Admin")` must be the first statement in each admin handler.**
7. **Admin template roles:** **`GET /api/admin-settings/templates`** (`CanManageMessages`) → `{ assignmentTemplateId, todayTemplateId }` from AppSettings; **`PUT /api/admin-settings/templates`** (`AdminOnly`) to set them (validate referenced templates exist).
8. **Admin canceled view (optional):** either `GET /api/shifts/administrative/canceled?month=YYYY-MM`, or simply exclude admin from the operational canceled endpoint (§7 sweep). Minimal = exclusion.

### 6b. Android Ktor — mirror ALL of 6a
- New `AdminShiftRoutes.kt` + `AdminSchedulerRoutes.kt` (+ admin-settings), modeled on **`CallbackConfigRoutes.kt`** (fn L47, `authenticate("auth-bearer")` L48, `route(...)` L49, GET requireRole Admin/SystemManager, PUT requireRole **Admin** only, `toDto` helper). **Register each in `KtorServer.kt`'s `routing{}` block (L75), before the static catch-all `get("{...}")` (L90)** — next to `shiftRoutes` (L80)/`messageTemplateRoutes` (L85)/`callbackConfigRoutes` (L87). Route files that need SMS/assets take `context`; config/settings routes can take only `database` (like `callbackConfigRoutes`).
- Every handler: `authenticate("auth-bearer")` + `call.requireRole(...)` (GET = `"Admin","SystemManager"`; config/settings PUT = `"Admin"` only — matching the established pattern). Mirror DTOs in `api/models`. The admin create-group inserts `ShiftEntity` with `shiftType=Administrative` and **`shiftName = description`**. Admin send uses `AndroidSmsProvider` with the SIM subscription id (as existing routes do).

### 6c. Scheduler-config isolation (P0 — verified breakage)
`GET /api/scheduler/config` returns **all** rows (`GetAllAsync` L1906) and the bulk `PUT` **rejects the save unless the submitted id-set exactly equals every existing row** (`configsById` L1934, `submittedIds` L1935, `SetEquals` check L1936-1937). An unfiltered `AdminAdvance` row → operational admins can no longer save scheduler settings, and the admin row leaks into the operational UI. **Fixes (both platforms):**
- **`.NET GET /api/scheduler/config`** (L1902/1906): filter out `ReminderType='AdminAdvance'` (add `GetOperationalAsync` or `.Where(c => c.ReminderType != AdminAdvance)`).
- **`.NET` bulk `PUT`** (L1919): build `configsById` from the **operational-only** set so the exact-match ignores the admin row.
- **`.NET` single `PUT /api/scheduler/config/{id}`** (L1986): guard against editing the admin row via the operational endpoint (return 404/400 if the target is `AdminAdvance`).
- **Android:** apply the same filter in the **Ktor scheduler-config route handlers** only. **Do NOT filter `SchedulerConfigDao.getAll()`** — `AlarmScheduler` reuses it and must still see the admin row to schedule it.
- **React `SchedulerSettingsPage.tsx`** (grouping L114-122): filter out `AdminAdvance` before grouping (defense-in-depth after the API filter).

---

## 7. THE EXHAUSTIVE shift-type filter sweep (P0 — one miss = cross-type bleed or data loss)

> **Cross-cutting rule.** **by-id** paths stay **type-agnostic** (a shift id belongs to exactly one type); **by-DATE / by-GROUP / by-RANGE list/bulk** paths get the `Operational` predicate. Admin per-row cancel/delete route through the SAME by-id endpoints; adding a type guard there would make admin per-row ops silently no-op.
>
> **`.NET` choke-point insight (verified):** operational **by-date page, delete-group (hard-delete by id from a filtered read, L813/L871), and update-group (`HasShiftGroup(existingShifts…)` L1286 + `UpdateShiftGroupAsync` L1289 + `UpdateShiftGroupLocationAsync` L1297)** all load through **`GetByDateAsync`**. Adding `&& s.ShiftType=="Operational"` to `GetByDateAsync` transitively protects all of them. The **only** .NET mutations that bypass it are the **raw inline cancel-group `UPDATE` (L1031-1036)** and the **raw import `DeleteMany` (L109)** — patch those directly. (Android group ops are direct DAO `@Query`s, so each needs its own predicate — see below.)

### 7a. `.NET`

| File / method (verified line) | Change | Severity |
|---|---|---|
| `ShiftsImportService.cs:109` `DeleteManyAsync<Shift>(s => s.ShiftDate >= minDate && s.ShiftDate <= maxDate)` (**INCLUSIVE** closed range) | **Add `&& s.ShiftType == "Operational"`.** Import must never hard-delete admin shifts. Boundary stays inclusive. | **P0 data-loss** |
| `ShiftCleanupService.cs:88-90` `DELETE FROM Shifts WHERE ShiftDate < @0` (monthly, cutoff = first-of-month − 1 month, L71) | **✅ D11 = TYPE-AGNOSTIC — NO CHANGE.** Admin shifts age out after a month exactly like operational (confirmed by user). Leave the delete (and the sibling `SmsLog` L80-82 / `SchedulerRunLog` L96-98 deletes) unfiltered. **Add a one-line comment** noting the type-agnostic choice is intentional so a future reader doesn't "helpfully" add a filter. | no change (⟵ D11 ✅) |
| `Program.cs:1031-1036` raw inline cancel-group `UPDATE Shifts SET IsCanceled=1 … WHERE ShiftDate>=@2 AND ShiftDate<@3 AND ShiftName=@4 AND CarId=@5 AND IsCanceled=0` (raw `ExecuteQueryAsync`, no repo, **bypasses `GetByDateAsync`**) | **Add `AND ShiftType = 'Operational'`** to the WHERE. This is the only raw group-mutation SQL in `Program.cs`; it independently matches by ShiftName+CarId (an admin group with `ShiftName=Description` colliding with an operational cancel request would otherwise be wrongly cancelled on .NET while Android skips it → divergence). Must mirror the Android `cancelShiftGroup` predicate exactly. | **P0/P1 bleed** |
| `ShiftsRepository.GetByDateAsync` (L12-18) | Add `&& s.ShiftType == "Operational"`. **Transitively covers** the operational by-date page, delete-group (L813/871), and update-group (L1286/1289/1297). | P0 |
| `ShiftsRepository.GetDatesWithShiftsAsync` (L20-24) | `&& ShiftType='Operational'` (operational calendar dots). | P0 |
| `ShiftsRepository.GetDatesWithUnresolvedAsync` (L26-32, raw SQL) | `AND ShiftType='Operational'`. | P0 |
| `ShiftsRepository.GetCanceledByMonthAsync` (L37-58, hand-written columns) | `AND s.ShiftType='Operational'` so the operational canceled page excludes admin. | P1 |
| `ShiftsRepository.HasSameDaySmsBeenSentAsync` (L124-137) | `AND s.ShiftType='Operational'` (operational-only concept). | P1 |
| `ShiftsRepository.GetByVolunteerIdAsync` (L34-35, no date/type filter) | **⟵ F1 — RECOMMEND leaving unfiltered** (volunteer-delete cascade should span both types). Flag. | flag |
| Group repo methods (defense-in-depth): `UpdateShiftGroupAsync` IEnumerable overload (L89-104), `UpdateShiftGroupLocationAsync` IEnumerable overload (L106-122), `HasShiftGroup` (L86-87) | Optionally add `&& s.ShiftType == "Operational"` to the in-memory predicate. **Transitively already safe** once `GetByDateAsync` is filtered (they operate on its result), but explicit is robust. **Note:** `CountShiftGroupAsync` does NOT exist — do not look for it. | optional |
| `SmsReminderService.cs` eligibility (L46-67) | Parameterize `ShiftType` by config (Operational for op types, Administrative for AdminAdvance) **AND project the 4 admin columns** (§5a/§5b). | P0 |
| `SmsReminderService.cs SendLocationUpdateAsync` (L258-273) | `AND s.ShiftType='Operational'`. | P1 |
| **`GET /api/sms-log`** (`Program.cs:1840-1848`, `JOIN Shifts s`, `WHERE sl.SentAt >= @0`, selects `s.ShiftName`) | **⚠ Cross-type bleed — was missed.** Add `AND s.ShiftType = 'Operational'` (at L1847) so admin manual/`AdminAdvance` SMS rows don't surface on the operational SMS-log report. (Admin sends log real `SmsLog` rows per D10 → they otherwise appear.) | P1 |
| **`GET /api/sms-log/summary`** (`Program.cs:1872-1884`, `FROM Shifts s LEFT JOIN SmsLog … WHERE s.ShiftDate >= @0 AND s.IsCanceled = 0 GROUP BY … HAVING COUNT(sl.Id) > 0`) | **⚠ Cross-type bleed — was missed.** Add `AND s.ShiftType = 'Operational'` alongside `s.IsCanceled = 0` (at L1881). | P1 |
| **by-id** `DELETE /api/shifts/{id}` (L778), `POST .../{id}/cancel` (L888), `POST .../{id}/send-sms` (L1080) | **NO type predicate — stay type-agnostic** (cross-cutting rule). Admin per-row cancel/delete route here. | keep |
| `GET /api/scheduler/config` + bulk/single PUT | §6c. | P0 |

### 7b. Android — `getByDateRange` caller inventory (verified) + DAO group ops

> **Root fix:** `ShiftDao.getByDateRange` (@Query L12) has **9 callers** across THREE classes with different correct type-semantics — a blanket "repoint all → Operational then delete" is WRONG for auto-callback. Add a **new typed `getByDateRangeAndType(from, to, shiftType)`** and repoint only the callers that need a type. **`getByDateRange` is NOT deleted** (auto-callback keeps it).

| Caller (verified) | Class | Change |
|---|---|---|
| `service/SmsReminderService.kt:50` | Scheduler | Repoint to `getByDateRangeAndType(from,to,type)`; type = AdminAdvance→`Administrative`, else `Operational` (§5a). |
| `ShiftRoutes.kt:69` (GET by-date), `:189` (delete-group), `:321` (cancel-group), `:551` (create dup-check), `:632` (update-group), `:802` (update-group-location), `:844` (send-location-update) | Operational Ktor routes | Repoint each to `getByDateRangeAndType(from,to,"Operational")`. Verify all 7 individually. |
| **`callback/CallbackLogic.kt:90`** (auto-callback eligibility, ADR-021) | Auto-callback (type-agnostic) | **⟵ D12 — KEEP on the unfiltered `getByDateRange`.** Do NOT repoint (would silently drop admin-shift volunteers) and do NOT delete `getByDateRange`. Add a DAO comment: "sole remaining caller is auto-callback; deliberately type-agnostic — do not delete or add a ShiftType predicate." |

| `ShiftDao` method (verified line) | Change |
|---|---|
| `deleteByDateRange` (@Query L27) — called by `ShiftsImportService.importFromExcel` | **⚠ P0.** Add `AND ShiftType='Operational'`. |
| `deleteByDateFrom` (@Query L24) | Add `AND ShiftType='Operational'` (defensive — this method has **no current caller**; the predicate is harmless future-proofing, not an active import path). |
| `deleteOlderThan` (@Query L57) — called by `ShiftCleanupWorker:37` | **✅ D11 = TYPE-AGNOSTIC — NO CHANGE.** Leave unfiltered so admin ages out like operational, matching `.NET ShiftCleanupService`. (Android prunes only Shifts+SchedulerRunLog, no SmsLog — pre-existing, unaffected.) |
| `getDistinctDatesByRange` (L15), `getDistinctDatesWithUnresolved` (L18) | Add `AND ShiftType='Operational'` (operational calendar). |
| `getCanceledByDateRange` (L60, `IsCanceled=1`) | Add `AND ShiftType='Operational'` (operational canceled page). |
| `getByVolunteerId` (L21) | ⟵ F1 — mirror the .NET decision (recommend unfiltered). |
| `updateShiftGroup` (L48), `countShiftGroup` (L51), `updateShiftGroupLocation` (L54), `cancelShiftGroup` (L66) — all key on `(ShiftName, CarId)` + `[from,to)` + `IsCanceled=0` | **Add `AND ShiftType='Operational'` to EACH** (direct DAO `@Query`s — not routed through `getByDateRange`, so they need explicit predicates). **`cancelShiftGroup:66` is the exact twin of the .NET inline cancel-group UPDATE (§7a) — predicates MUST match.** (Note: Android `countShiftGroup` exists even though .NET has no `CountShiftGroupAsync`.) |
| `deleteById` (@Query L45/fun L46), `cancelById` (@Query L63/fun L64) | **NO type predicate — stay type-agnostic.** Admin per-id cancel/delete route here. |
| **`SmsLogDao.getLogsWithDetails` (L11-22)** — `JOIN Shifts`, byte-identical twin of `.NET /api/sms-log` | **⚠ Cross-type bleed — was missed.** Add `AND s.ShiftType = 'Operational'` to the WHERE (mirror the .NET fix so admin SMS rows don't appear on the operational SMS-log report). |
| **`SmsLogDao.getSummary` (L24-40)** — twin of `.NET /api/sms-log/summary` | **⚠ Cross-type bleed — was missed.** Add `AND s.ShiftType = 'Operational'` alongside `IsCanceled = 0`. Predicate MUST match the .NET fix exactly. |
| Ktor scheduler-config routes | §6c. |

**Dedup proof (both platforms):** operational uses `Advance/SameDay/WeekdayAdvance/Manual/LocationUpdate`; admin automated = `AdminAdvance`; admin manual = `Manual`. Each `ShiftId` is exactly one `ShiftType`, so `SmsLog(ShiftId, ReminderType)` and `SchedulerRunLog(ConfigId, TargetDate, ReminderType)` stay unambiguous across types.

---

## 8. React UI + template-validation parity

Navigation is **state-based** via `Index.tsx` `renderContent()` (`switch (activeSubItem)` L65, keyed by the menu subItem **`id`**, not React Router; `path` is decorative). Adding a page = a `menuItems.ts` subItem (unique id) + a matching `case` in the switch.

1. **Rename** the operational page label: `menuItems.ts:11` `title: 'משמרות'` → **`'משמרות מבצעיות'`**. (Optionally rename the in-page `<h1>ניהול משמרות</h1>` at `ShiftsManagementPage.tsx:587` — subjective polish; the parent top-level item title `'ניהול משמרות'` L7 can stay.)
2. **New menu subItems** (`requiredRoles: ['Admin','SystemManager']`):
   - Under top-level `shift-management`: `{ id: 'admin-shifts', title: 'משמרות מנהליות', path: '/shift-management/admin-shifts' }` (+ optional `admin-canceled-shifts`).
   - Under `settings` (subItems L55-67): `{ id: 'admin-scheduler-settings', title: 'הגדרות תזמון למשמרות מנהליות', path: '/settings/admin-scheduler' }` (D9).
3. **`Index.tsx renderContent()`** — import the new pages; add `case 'admin-shifts':` and `case 'admin-scheduler-settings':` (matching the operational `case 'shifts-management':` at L90).
4. **New `AdminShiftsPage.tsx`** — per-week **Sun→Sat** view with **prev/next-week nav reusing the `ShiftsManagementPage` `ChevronLeft`/`ChevronRight` primitives** (imports L21; nav L601/L649; Card grouping L695-876) — **NOT** the single-month `CanceledShiftsPage` table. Shows Description; group rows by `(Date, ShiftTime, Description)`. **Net-new create/edit dialog** (not the single-shot operational Add-Volunteer flow): Description (req), Date (req), ShiftTime (req), Address (opt), location name (opt, reuse location-picker), Vehicle/CarId (opt), VehicleLocation (opt), **volunteer multi-select**. Footer: "שמירה" / "שמירה ושליחת SMS" (D8). Per-volunteer **`MessageSquare`** send icon (mirror `ShiftsManagementPage.tsx:819`; D6 gates the not-today branch) → admin `{id}/send-sms`; per-row cancel/delete → the type-agnostic by-id endpoints. **RTL:** dialog X on `left-4`; `Switch dir="ltr"`; top-aligned scrollable dialog (no `dvh`/`visualViewport`/bottom-sheet).
5. **New `AdminSchedulerSettingsPage.tsx`** — mirror the scheduler cluster for the single admin advance row (hour + enabled + template select) + three template-role selectors (advance/assignment/today, D9). **Add the read-only gate** `const isReadOnly = !isUserAdmin();` (as `SchedulerSettingsPage.tsx:34` / `CallbackSettingsPage.tsx:22` do — MessageTemplatesPage's `isAdmin` variant is the outlier) and pass it to all controls, so a `SystemManager` sees disabled controls rather than edits that fail server-side (the PUTs are `AdminOnly`). Wire to `/api/admin-scheduler/config` + `/api/admin-settings/templates`.
6. **`SchedulerSettingsPage.tsx`** — filter out `AdminAdvance` before grouping (§6c defense-in-depth).
7. **New/extended services** (all extend `BaseApiClient`, which auto-attaches `Authorization: Bearer` from localStorage `accessToken`, `BaseApiClient.ts:37-40`): extend `shiftsService.ts` (admin CRUD/by-week/send); new `adminSchedulerService.ts`; `adminSettingsService.ts` (the two template-role ids).

### 7.7 (§8.8) Mandatory-placeholder template validation — a **5-site / 4-file** change (if pursued)
The `{שם}`+`{תאריך}` requirement lives at **5 sites across 4 files** (verified):

| # | File | Site | Notes |
|---|------|------|-------|
| 1 | `web/server/Magav.Api/Program.cs` | L2073 (POST) | Fail `"תבנית חייבת להכיל {שם} ו-{תאריך}"` (L2074) |
| 2 | `web/server/Magav.Api/Program.cs` | L2111 (PUT) | same combined string (L2112) |
| 3 | `web/client/src/pages/MessageTemplatesPage.tsx` | L84-86 | same combined string |
| 4 | `android/.../api/routes/MessageTemplateRoutes.kt` | L61-65 (POST) | **two separate** strings: `"תבנית חייבת להכיל {שם}"` (L62) + `"…{תאריך}"` (L65) |
| 5 | `android/.../api/routes/MessageTemplateRoutes.kt` | L118-122 (PUT) | same two separate strings |

- **⟵ F2 — RECOMMEND keeping `{שם}`+`{תאריך}` mandatory for ALL templates** (the seeded admin templates include both). **No change to any of the 5 sites** in this default path.
- **IF relaxed for admin templates:** because the contract is triplicated with no shared source, **ALL 5 sites must change together** (relaxing only the .NET + React sites would leave the Android Ktor server rejecting admin templates → silent cross-platform drift), and it requires a template-`type` discriminator (there is none today) so operational templates keep the rule. Bigger change; flag it. Run `node tools/parity-lint.mjs` after (the lint does not cover this validation string — the 5-site enumeration here is the manual gate; document in `tools/parity.md`).

---

## 9. Dependency-ordered execution sequence

1. **Constants + parity-lint** (§2) → `node tools/parity-lint.mjs` green.
2. **`.NET` schema/model/migrations** (§3a-c) + **Android entity + Room 9→10 + BOTH `addMigrations` sites + `versionCode` bump** (§3d-e). `git add -f` new `db/` files.
3. **Seeding + idempotent backfills, resolving template ids BY NAME** (§4, both platforms; templates before configs/settings).
4. **Services/scheduler** (§5) — .NET SELECT-column + type predicate; placeholder additions with 3-step empty-token stripping; Android `buildMessage` 5→9 params + all callers; the `AdminAdvance` window branch (`.NET` L114, Android L277); the dedicated one-shot admin sends.
5. **Endpoints** (§6) — .NET then Android Ktor mirror; scheduler-config isolation (§6c); admin create-group writes non-null `ShiftName=Description`.
6. **Shift-type filter sweep** (§7) — the **one P0 hard-delete FIRST** (Excel import `.cs:109` / Android `deleteByDateRange`+`deleteByDateFrom`). **The monthly cleanup is deliberately left UNCHANGED (D11 = type-agnostic) — do NOT add a filter to `ShiftCleanupService.cs:88-90` or `deleteOlderThan`.** Then: `GetByDateAsync` predicate (transitively covers .NET by-date/delete-group/update-group); the raw inline cancel-group UPDATE (L1031-1036) + all 4 Android DAO group ops get the predicate; the **SMS-log report + summary** get `ShiftType='Operational'` on both platforms (`Program.cs:1847`/`1881`, `SmsLogDao` both queries); by-id paths stay type-agnostic; new typed `getByDateRangeAndType`; scheduler + 7 operational routes repointed; `CallbackLogic.kt:90` left on unfiltered `getByDateRange` (retained).
7. **React UI** (§8, incl. the read-only gate on the new settings page; the §7.7 default = no validation change).
8. **Build:** web `npm run build` + `npm run lint`; `dotnet build`; Android `build-apk.bat` (after versionCode bump) → report the APK path (`android/app/build/outputs/apk/debug/app-debug.apk`).
9. **Verification** (§10).

---

## 10. Manual verification plan (no automated tests exist)

**Migration safety (foremost risk):**
- Copy a **populated** production-shaped web `magav.db` → run the API → confirm the new-column migration logs run, existing shifts get `ShiftType='Operational'`, no data lost.
- On a **populated dev Android device at version 9** → install the new APK → confirm `MIGRATION_9_10` runs, no "שגיאה באתחול המערכת", all shifts/logs/configs intact (ADR-004 crash-visible check); confirm the SQLCipher recovery path is NOT triggered.

**Operational unchanged (regressions):**
- By-date, calendar dots, create/cancel/delete-group, update-group, import, same-day location append — all behave as before.
- **Operational scheduler-settings page still SAVES** after the admin config row exists (bulk-PUT exact-match no longer counts the admin row). §6c.
- Operational per-row cancel/delete via by-id endpoints still work (by-id paths kept type-agnostic).
- **Cross-platform cancel-group/update-group symmetry:** create an admin group whose `(Date, ShiftName=Description, CarId)` deliberately collides with an operational cancel/update request; issue it on **BOTH** .NET and Android → admin rows are NOT touched on EITHER platform.
- Excel import over a week containing admin shifts → **admin rows survive** (§7 P0).
- **Monthly cleanup:** populated DB + month rollover → run `.NET ShiftCleanupService` and Android `ShiftCleanupWorker` → admin rows behave **identically** per D11.
- **Auto-callback (D12):** a volunteer whose only today/yesterday shift is **administrative**, `allCallers=0`, calls in and does not answer → auto-callback still fires (rejects + auto-dials Gate after 20s), proving `CallbackLogic` kept type-agnostic eligibility and `getByDateRange` still compiles.

**Admin functional:**
- Create an admin shift with vehicle + vehicle-location + address + location LEFT BLANK → saves; `ShiftName` stored = Description (non-empty). Message degrades cleanly: outgoing SMS has **no raw `{תיאור}/{שעה}/{כתובת}/{מיקום רכב}` token** and no dangling label/blank line.
- Save vs Save+SMS → assignment template sent to all assigned volunteers.
- Per-volunteer icon on the shift day → "today" template; not-today per D6. Per-row cancel/delete via by-id endpoints work.
- **Admin advance firing (window math):** enable at hour H, `DaysBeforeShift=1`. Because the config is `DayGroup='SunThu'`, it fires **only on working days** and **NEVER on Fri/Sat/holiday/holiday-eve**. Concrete case: **a Sunday admin shift's advance fires on THURSDAY** (the last SunThu working day whose window `[Thu+1, NextWorkingDay(Thu)+1)` = `[Fri, Sun+1)` covers Sunday) — **NOT Friday** (Friday can never fire this config; do not "fix" the code to make Friday fire). Also verify a holiday-preceded day pulls onto the prior working day, no location append, and only `Administrative` rows are pulled.
- Dedup: admin advance sends exactly once per `(shift, AdminAdvance)`; no operational/admin bleed either way.
- Week view Sun→Sat with prev/next nav; admin canceled shifts do NOT appear on the operational canceled page.

**Template validation (§7.7 parity):**
- Default (rule kept everywhere): create/update a template missing `{תאריך}` via the .NET API, React UI, AND Android Ktor API → all three reject with the Hebrew error (proving no site was accidentally relaxed).

**Parity/lint:** `node tools/parity-lint.mjs` exits 0 (incl. the new `ShiftTypes` compare). **APK:** versionCode bumped; report the built path.

---

## 11. Top risks & mitigations

- **R1 — Silent Room data-loss (schema-hash mismatch).** Additive `MIGRATION_9_10` only, no index on ShiftType, registered in **both** `addMigrations` sites (L109 + L135), defaults/NOT-NULL byte-matching the entity, verified on a populated device; `fallbackToDestructiveMigration` stays absent (crash-visible). **Highest severity.**
- **R2 — Cross-type isolation (SMS bleed / hard-delete data-loss).** The §7 per-file matrix is the mitigation. The one remaining P0 hard-delete is the **Excel import** (`.cs:109` / Android `deleteByDateRange`/`deleteByDateFrom`) — it wipes a date range and re-inserts from the sheet, so it MUST gain `ShiftType='Operational'` or it destroys admin shifts in that range. The monthly cleanup is **intentionally left type-agnostic (D11 ✅)** — admin ages out like operational, so it is not a data-loss risk here. On .NET, `GetByDateAsync` is the choke point for by-date/delete-group/update-group; the raw inline cancel-group UPDATE and the raw import DeleteMany are the only bypasses.
- **R3 — `SchedulerRunLog` FK (dedup integrity).** Admin advance is an in-`SchedulerConfig` row (D4), so the run-log INSERT keeps a valid `ConfigId` FK — dedup persists. (Wording nuance: the Android run-log-insert catch swallows all `SQLiteConstraintException` incl. FK, so a *bad*-FK config would silently **drop** dedup persistence rather than "duplicate every tick" — either way the fix is the same: a real `SchedulerConfig` row makes the FK valid. Conclusion unchanged.)
- **R4 — Scheduler-config exact-match PUT breakage.** §6c filters `AdminAdvance` out of the operational GET / bulk-PUT / single-PUT / React grouping (verified against L1934-1937).
- **R5 — Template-id drift on existing DBs.** All admin template references resolve **by Name**, never a literal id (auto-increment ids may already be consumed on upgraded DBs). FK/role integrity checked before insert.
- **R6 — Scheduler pulls the wrong shift type.** The typed `getByDateRangeAndType` serves the scheduler (config-resolved type) and all 7 operational routes (`Operational`); the .NET eligibility SELECT is parameterized identically. The unfiltered `getByDateRange` is retained with exactly one intentional caller (auto-callback).
- **R7 — Placeholder/empty-field leakage.** The shared 3-step post-pass (substitute → delete absent tokens → collapse blank/dangling lines) guarantees no raw `{…}` token ships; identical on both platforms.
- **R8 — Admin `ShiftName` integrity + operational group-op collision.** Admin create-group writes `ShiftName = Description` (non-null, non-empty) on both platforms → satisfies the NOT NULL constraint and avoids empty-bucketing. The resulting collision surface with operational `ShiftName`+`CarId` group ops is closed by adding `ShiftType='Operational'` to every operational group-mutation path (the .NET raw inline cancel UPDATE, the Android 4 DAO group ops, and — via `GetByDateAsync` — the .NET update/delete-group).
- **R9 — Auto-callback eligibility regression (D12).** The sweep explicitly excludes `CallbackLogic.kt:90`; a DAO comment records the intent so a future "unused method" cleanup doesn't delete `getByDateRange` or add a type predicate.
- **R10 — Admin-advance firing-day misunderstanding.** The §10 check states the correct expected outcome (Sunday shift → advance fires Thursday, never Friday) with the derivation, so a tester can't "fix" correct window code. `AdminAdvance` reuses the WeekdayAdvance branch verbatim (`.NET` L114, Android L277) — only the config row + the eligibility type-filter are new.
- **R11 — Template-validation contract drift.** The rule lives at 5 sites / 4 files; default changes none; if relaxed, all 5 change together (the two Android Ktor sites are the easy omission) — plus a template-`type` discriminator. §7.7 is the manual gate.
- **R12 — Pre-existing Android `SmsLog`-prune gap (now moot for this feature).** Android's monthly cleanup prunes only Shifts + SchedulerRunLog (no `SmsLog`), unlike .NET. Because D11 = type-agnostic (no cleanup change), this feature introduces no SmsLog scoping and the gap is unaffected. Noted only for awareness — fixing it is a separate cleanup, out of scope.
- **R13 — Cross-platform drift (general).** Every constant/scheduler/seed/placeholder/cleanup/group-op/template change is a paired .NET+Android(+React) deliverable; parity-lint (extended to `ShiftTypes`) + the §7.7 5-site enumeration are the gates.

---

## 12. Decisions to confirm with the user (sign-off list)

**✅ Confirmed by the user (2026-07-02):**

- **D6** — per-volunteer icon on a non-today shift sends the **assignment** template; on the shift's own day it sends the **today** template.
- **D11** — monthly cleanup is **type-agnostic** (admin shifts age out after a month, same as operational — no cleanup code change).
- **D12** — auto-callback stays **type-agnostic** (admin-shift volunteers remain eligible callers).

**Still on recommended defaults — proceeding unless you object** (these are architectural/low-risk; call out any you want to change):

- **D1** discriminator column (vs table) · **D2** admin field→column mapping · **D3** group key `(Date, ShiftTime, Description)` + caveats · **D4** admin config as a `SchedulerConfig` row (mandatory — confirm the default `Time`, proposed `06:00`) · **D5** `.NET AppSettings` table for template roles · **D7** new placeholders, explicit-only (no location auto-append) · **D8** two-button save+send · **D9** admin settings page title/scope · **D10** manual admin send = `Manual`.
- **F1** `GetByVolunteerId`/`getByVolunteerId` scope (recommend unfiltered) · **F2** admin template validation (recommend keep `{שם}`+`{תאריך}` mandatory) · **F3** accept D3 group-key caveats vs adding an immutable `ShiftGroupId`.
- **Template contents** (§4a) and the admin advance default hour (`06:00`) — placeholder examples; confirm the exact Hebrew wording when convenient.
- **SMS-log report/summary policy** (§7a/§7b): the plan **excludes** administrative shifts from the operational SMS-log report + summary (adds `ShiftType='Operational'`, recommended for isolation parity). If instead you want a **combined** SMS audit log showing both types, say so — the four queries would then be left type-agnostic and documented as such.

---

### Key files (all under `c:\MyData\Projects\Magav\V-Notification-System\`)
`web/server/Magav.Common/Models/Shift.cs`, `…/MagavConstants.cs`, `…/Models/{SchedulerConfig,SchedulerRunLog,SmsLog}.cs`, `…/Models/AppSetting.cs` (new); `web/server/Magav.Server/Services/DbInitializer.cs`, `…/Services/ShiftsImportService.cs`, `…/Services/ShiftCleanupService.cs`, `…/Services/Sms/{SmsSchedulerService,SmsReminderService}.cs`, `…/Database/Repositories/ShiftsRepository.cs` (+ new `AppSettingsRepository.cs`); `web/server/Magav.Api/Program.cs`; `tools/parity-lint.mjs`, `tools/parity.md`; `android/app/src/main/java/com/magav/app/util/Constants.kt`, `…/db/entity/ShiftEntity.kt`, `…/db/MagavDatabase.kt`, `…/MagavApplication.kt`, `…/db/dao/ShiftDao.kt`, `…/db/DatabaseInitializer.kt`, `…/service/SmsReminderService.kt`, `…/service/ShiftsImportService.kt`, `…/scheduler/{SmsSchedulerWorker,AlarmScheduler,ShiftCleanupWorker}.kt`, `…/callback/CallbackLogic.kt`, `…/api/routes/{ShiftRoutes,MessageTemplateRoutes,CallbackConfigRoutes}.kt` (+ new `AdminShiftRoutes.kt`/`AdminSchedulerRoutes.kt`), `…/api/KtorServer.kt`, `android/app/build.gradle.kts` (versionCode); `web/client/src/components/layout/menuItems.ts`, `…/pages/{Index,ShiftsManagementPage,CanceledShiftsPage,SchedulerSettingsPage,MessageTemplatesPage}.tsx` (+ new `AdminShiftsPage.tsx`/`AdminSchedulerSettingsPage.tsx`), `…/services/{shiftsService,schedulerService,messageTemplateService}.ts` (+ new `adminSchedulerService.ts`/`adminSettingsService.ts`).
