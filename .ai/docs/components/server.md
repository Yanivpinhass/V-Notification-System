<!-- DeepInit Extract | Component: server
DeepInit C8 update | Run ID: deepinit-2026-08-17 | Generated: 2026-08-17 (commit cfb8e36 administrative-shifts + general-locations: NEW AppSettingsRepository; ShiftsRepository gains the Operational predicate on every by-date/range/canceled read + 5 administrative group methods; SchedulerConfigRepository gains GetOperationalAsync/GetAdminAdvanceAsync; LocationsRepository gains GetByTypeAsync + a VehicleLocationId-aware delete guard; DbInitializer gains MigrateShiftTypeColumnsAsync / MigrateLocationTypeColumnsAsync / MigrateMessageTemplatesAsync / MigrateAdminSchedulerConfigAsync / MigrateAppSettingsAsync + resolve-template-BY-NAME; SmsReminderService gains shift-type isolation, the admin placeholder strip/collapse pass, BuildAdminMissionText/BuildAdminSmsBlocks and SendAdminSmsAsync; SmsSchedulerService routes AdminAdvance through the WeekdayAdvance half-open window; ShiftsImportService range-delete scoped to Operational [P0 data-loss guard]) · prior: deepinit-2026-06-24 (2989b01)
Run ID: deepinit-2026-06-18 · Updated: deepinit-2026-06-24 (incremental --update over commit 2989b01: run-log dedup narrowed [ISS-006], PasswordValidator.cs deleted [ISS-009]) — note: Helpers/PasswordValidator.cs in the input list below no longer exists
Input files processed: Magav.Server.csproj, Services/AuthService.cs, Services/DbInitializer.cs, Services/ShiftsImportService.cs, Services/VolunteersImportService.cs, Services/ShiftCleanupService.cs, Services/Sms/ISmsProvider.cs, Services/Sms/InforUMobileSmsProvider.cs, Services/Sms/SmsSchedulerService.cs, Services/Sms/SmsReminderService.cs, Database/MagavDbManager.cs, Database/Repository.cs, Database/Repositories/UsersRepository.cs, Database/Repositories/VolunteersRepository.cs, Database/Repositories/ShiftsRepository.cs, Database/Repositories/SmsLogRepository.cs, Database/Repositories/SchedulerConfigRepository.cs, Database/Repositories/SchedulerRunLogRepository.cs, Database/Repositories/MessageTemplateRepository.cs, Database/Repositories/LocationsRepository.cs, Database/Repositories/JewishHolidaysRepository.cs, Helpers/PasswordValidator.cs, Helpers/ShiftScheduleParser.cs
Generated: 2026-06-18 -->

# Component: server (`web/server/Magav.Server/`)

## 1. Component Overview

**Purpose:** The business-logic layer of the Magav web backend. It owns the SMS reminder scheduler subsystem, JWT authentication (login/refresh/lockout), the repository/data-access layer over `Magav.Common`'s `DbHelper`, database creation + migration + seeding (`DbInitializer`), Excel import services (volunteers + shift schedules), a monthly data-cleanup background job, and password-policy validation. It sits between `Magav.Common` (leaf) and `Magav.Api` (entry point). [HIGH] (`web/server/Magav.Server/Magav.Server.csproj:16-18` references only `Magav.Common`)

**Tech stack:** .NET 8, `ImplicitUsings` + `Nullable` enabled (`Magav.Server.csproj:4-6`). NuGet deps: `BCrypt.Net-Next` 4.0.3 (password hashing), `Microsoft.AspNetCore.Authentication.JwtBearer` 8.0.0, `System.IdentityModel.Tokens.Jwt` 8.0.0 (JWT issue/sign), `Microsoft.Extensions.Configuration.Abstractions` 8.0.0 (`Magav.Server.csproj:10-13`). Also uses (transitively / from base/SDK): `Microsoft.Extensions.Hosting` (`BackgroundService`), `Microsoft.Extensions.DependencyInjection` (`IServiceScopeFactory`), `Microsoft.Extensions.Logging`, `Microsoft.Data.Sqlite` (raw SQLCipher DDL in `DbInitializer`), `OfficeOpenXml`/EPPlus (Excel parsing), `System.Xml.Linq` (InforUMobile XML), `NPoco` (`Sql.Builder`, `ITransaction`). [HIGH]

**Entry points (consumed by `Magav.Api` via DI):**
- `MagavDbManager` (scoped) — repository facade (`Database/MagavDbManager.cs:13`).
- `AuthService` (scoped) — login/refresh/logout/JWT (`Services/AuthService.cs:12`).
- `SmsReminderService` (scoped) — core SMS send/log logic (`Services/Sms/SmsReminderService.cs:8`).
- `SmsSchedulerService` (singleton `BackgroundService`, 60s poll) (`Services/Sms/SmsSchedulerService.cs:14`).
- `ShiftCleanupService` (singleton `BackgroundService`, hourly) (`Services/ShiftCleanupService.cs:8`).
- `DbInitializer` (singleton, run once at startup) (`Services/DbInitializer.cs:7`).
- `ISmsProvider`/`InforUMobileSmsProvider` (HttpClient-injected) (`Services/Sms/ISmsProvider.cs:3`, `Services/Sms/InforUMobileSmsProvider.cs:12`).
- `ShiftsImportService`, `VolunteersImportService` (`Services/ShiftsImportService.cs:7`, `Services/VolunteersImportService.cs:8`).
- `ShiftScheduleParser` (static helper). *(`PasswordValidator` was deleted in `2989b01` — it was dead code; the live password rule is inline in the api's `change-password`. ISS-009 resolved.)*

**Complexity:** Moderate. Most files are small and single-responsibility; complexity concentrates in `DbInitializer.cs` (859 LOC, mostly the holiday seed table) and the scheduler window/day-group logic in `SmsSchedulerService.cs` + `SmsReminderService.cs`. [HIGH]

**Certainty:** [HIGH] — every `.cs` file under `web/server/Magav.Server/` (excluding `obj/` build artifacts) was read in full.

---

## 2. Features & Capabilities

| Feature | Description | Entry point | Source files | Certainty |
|---|---|---|---|---|
| SMS scheduler (background) | Polls every 60s, matches enabled configs by effective day group + exact HH:mm, computes eligibility window, delegates to reminder service | `SmsSchedulerService.ExecuteAsync` (`Services/Sms/SmsSchedulerService.cs:29`) | `Services/Sms/SmsSchedulerService.cs` | HIGH |
| SMS reminder execution | Queries eligible shifts (dedup-aware), builds message from template, sends via `ISmsProvider`, logs to `SmsLog`, writes `SchedulerRunLog` | `SmsReminderService.ExecuteAsync` (`Services/Sms/SmsReminderService.cs:24`) | `Services/Sms/SmsReminderService.cs` | HIGH |
| Location-update SMS | Re-notifies a shift team when location changed after same-day SMS | `SmsReminderService.SendLocationUpdateAsync` (`Services/Sms/SmsReminderService.cs:252`) | `Services/Sms/SmsReminderService.cs` | HIGH |
| InforUMobile SMS provider | XML HTTP POST to `SendMessageXml.ashx`, numeric/XML status parsing, phone masking in logs | `InforUMobileSmsProvider.SendSmsAsync` (`Services/Sms/InforUMobileSmsProvider.cs:36`) | `Services/Sms/InforUMobileSmsProvider.cs`, `Services/Sms/ISmsProvider.cs` | HIGH |
| JWT auth | Login (BCrypt verify + lockout), refresh (rotate), logout (clear token); HMAC-SHA256 access token + SHA256-hashed refresh token | `AuthService.LoginAsync` / `RefreshTokenAsync` / `LogoutAsync` (`Services/AuthService.cs:27,84,123`) | `Services/AuthService.cs` | HIGH |
| Password policy validation | ~~8+ chars, upper/lower/digit/special via `PasswordValidator`~~ — **`Helpers/PasswordValidator.cs` deleted in `2989b01`** (it was never called). The enforced policy is now inline in the api's `POST /api/auth/change-password` (≥6 + letter + digit). | (inline) `web/server/Magav.Api/Program.cs` change-password | — | HIGH |
| Repository layer | Generic `Repository<T>` base + 9 domain repositories with specialized queries; lazy facade `MagavDbManager` | `MagavDbManager` (`Database/MagavDbManager.cs:13`) | `Database/*.cs`, `Database/Repositories/*.cs` | HIGH |
| DB init + migrate + seed | Creates encrypted SQLite schema on fresh DB; idempotent column/table migrations on existing DB; seeds admin/templates/configs/holidays + sample data | `DbInitializer.InitializeAsync` (`Services/DbInitializer.cs:19`) | `Services/DbInitializer.cs` | HIGH |
| Volunteers Excel import | Reads 3-column sheet, sanitizes phone, upsert-by-internal-id (max 10000 rows) | `VolunteersImportService.ImportFromExcelAsync` (`Services/VolunteersImportService.cs:12`) | `Services/VolunteersImportService.cs` | HIGH |
| Shift schedule Excel import | Parses weekly team blocks (EPPlus), matches names to volunteers, replaces shifts in date range | `ShiftsImportService.ImportFromExcelAsync` (`Services/ShiftsImportService.cs:9`), `ShiftScheduleParser.Parse` (`Helpers/ShiftScheduleParser.cs:27,36`) | `Services/ShiftsImportService.cs`, `Helpers/ShiftScheduleParser.cs` | HIGH |
| Monthly shift cleanup (background) | On the 1st of each month, hard-deletes shifts/SMS logs/run logs older than the prior month. **Deliberately TYPE-AGNOSTIC** — admin shifts age out exactly like operational ones (in-code note at `:88-90`) | `ShiftCleanupService.ExecuteAsync` (`Services/ShiftCleanupService.cs:24`) | `Services/ShiftCleanupService.cs` | HIGH |
| **Administrative-shift data access** (NEW) | Week read (`GetAdministrativeByWeekAsync` → `AdminShiftRow`), group count/update/cancel keyed on `(Date, ShiftTime, Description)`, and the dup-volunteer id set that makes the create endpoint idempotent | `ShiftsRepository` (`Database/Repositories/ShiftsRepository.cs:69,99,115,131,161`) | `Database/Repositories/ShiftsRepository.cs` | HIGH |
| **Administrative scheduler config** (NEW) | `GetOperationalAsync` (everything EXCEPT `AdminAdvance`) + `GetAdminAdvanceAsync` (the single admin row) — the isolation split that keeps the admin row out of the operational settings UI while the scheduler's `GetEnabledAsync` still fires it | `SchedulerConfigRepository` (`Database/Repositories/SchedulerConfigRepository.cs:25,30`) | `Database/Repositories/SchedulerConfigRepository.cs` | HIGH |
| **AppSettings key-value store** (NEW) | `GetByKeyAsync` / `GetValueAsync` / `UpsertAsync` (SQLite `ON CONFLICT(Key) DO UPDATE`) over the new `AppSettings` table; today it holds only the two administrative template-role ids | `AppSettingsRepository` (`Database/Repositories/AppSettingsRepository.cs:12,20,26`) | `Database/Repositories/AppSettingsRepository.cs` | HIGH |
| **Administrative SMS build + one-shot send** (NEW) | `BuildAdminMissionText` / `BuildAdminSmsBlocks` (mission block + vehicle block, each with Waze) and `SendAdminSmsAsync(shift, volunteer, template)` — an explicit-template single send that logs `ReminderType=Manual` with **no dedup** (re-sends allowed) | `SmsReminderService` (`Services/Sms/SmsReminderService.cs:304,316,350`) | `Services/Sms/SmsReminderService.cs` | HIGH |
| **Typed location reads** (NEW) | `GetByTypeAsync(type)` so `Vehicle` and `General` locations never leak into each other's pickers; the delete guard now counts **both** `LocationId` and `VehicleLocationId` references | `LocationsRepository` (`Database/Repositories/LocationsRepository.cs:20,30-32`) | `Database/Repositories/LocationsRepository.cs` | HIGH |

---

## 3. Workflows & Behaviors

**WF-server:001 — SMS scheduler tick (background, 60s poll)**
- Type: background (`BackgroundService`). Trigger: `Task.Delay(60s)` loop while not cancelled (`Services/Sms/SmsSchedulerService.cs:33,50`).
- Steps:
  1. `using scope = _scopeFactory.CreateScope()` → resolve scoped `MagavDbManager` + `SmsReminderService` (`SmsSchedulerService.cs:63-65`) — singleton resolving scoped (see BR-server:010).
  2. Compute Israel-local `now` and `currentTime = now.ToString("HH:mm")` (`SmsSchedulerService.cs:67-68`).
  3. Load enabled configs via `db.SchedulerConfig.GetEnabledAsync()` (`SmsSchedulerService.cs:70`).
  4. Resolve `effectiveDayGroup` via `GetEffectiveDayGroupAsync` (holiday-aware); on exception, fall back to `GetNormalDayGroup(now.DayOfWeek)` (`SmsSchedulerService.cs:73-82`).
  5. For each config: skip if `config.DayGroup != effectiveDayGroup` (`:95`); skip if `config.Time != currentTime` (exact HH:mm match) (`:99`).
  6. Compute window + RunLog key: SameDay/Advance → single-day `[today+N, today+N+1)`, `runLogTargetDate = today+N` (`:120-124`); WeekdayAdvance → `[today+N, NextWorkingDay(today)+N)`, `runLogTargetDate = today` (`:114-119`).
  7. `await reminderService.ExecuteAsync(config, windowStart, windowEnd, runLogTargetDate, ct)` (`:131`).
- State transitions: per tick, each matching config triggers exactly one `ExecuteAsync`; dedup downstream prevents repeat sends within the same minute window.
- Error handling: whole tick wrapped in try/catch logging `"Scheduler tick failed"` and continuing the loop (`:43-46`); `OperationCanceledException` on cancellation breaks the loop (`:39-42,52-55`).
- Certainty: HIGH.

**WF-server:002 — SMS reminder run (eligibility query → send → log)**
- Type: invoked workflow (called by WF-server:001, and by API for manual/location runs). Trigger: `SmsReminderService.ExecuteAsync(config, windowStart, windowEnd, runLogTargetDate, ct)` (`Services/Sms/SmsReminderService.cs:24`).
- Steps:
  1. Build query bounds: `windowStartStr`/`windowEndStr` = `.Date.ToString("o")`, `runLogDateStr` = `yyyy-MM-dd` (`SmsReminderService.cs:35-37`). **Then resolve the shift type from the reminder type: `AdminAdvance ⇒ Administrative`, everything else ⇒ `Operational`** (`SmsReminderService.cs:43-45`).
  2. Eligibility query: join `Shifts`→`Volunteers`, LEFT JOIN `Locations` **twice (mission `l` on `LocationId`, vehicle `vl` on `VehicleLocationId`)**; filter `ShiftDate >= @0 AND < @1`, **`ShiftType = @4`**, `IsCanceled = 0`, `ApproveToReceiveSms = 1`, non-empty `MobilePhone`, and `NOT EXISTS` a successful `SmsLog` for this `ReminderType` (`SmsReminderService.cs:53-81`). Location columns COALESCE master `Locations` over per-shift `CustomLocation*`; the projection now also carries the 4 admin columns + the resolved vehicle-location trio so `BuildMessage` can substitute the admin placeholders (`:56-64`).
  3. Resolve template once (`db.MessageTemplates.GetByIdAsync(config.MessageTemplateId)`); if missing → write a `Failed` `SchedulerRunLog` with error `"תבנית הודעה לא נמצאה"` and return (`SmsReminderService.cs:83-101`).
  4. For each eligible shift: build message from template using the shift's OWN date (`BuildMessage(template.Content, shift, shift.ShiftDate)`, `:126`); if `ReminderType == SameDay` append `BuildLocationText(shift)`; **else if `ReminderType == AdminAdvance` append `BuildAdminSmsBlocks(shift)`** (mission block + vehicle block) (`:127-131`); send via `_smsProvider.SendSmsAsync`; insert `SmsLog` row with Success/Fail; on success increment `smsSent` + `UPDATE Shifts SET SmsSentAt`, else increment `smsFailed`.
  5. Per-shift exception → increment `smsFailed`, log, attempt a Fail `SmsLog` with error `"שגיאה פנימית"` (nested try/catch) (`:143-165`).
  6. Compute run status: `Completed` (0 eligible or 0 failed) | `Failed` (sent 0) | `Partial` (`:169-172`); set `runError` if any failed (`:174-175`).
  7. Insert `SchedulerRunLog` via `InsertAsync`; `null` return = UNIQUE-constraint duplicate (the only swallowed case since `2989b01`) → log warning (`:178-197`).
- State transitions: shift becomes "notified for ReminderType" once a `Success` `SmsLog` exists (suppresses future eligibility); `SmsSentAt` set as general same-day indicator.
- Error handling: provider failures captured as `SmsResult.Error` (never throw out of provider, see WF-server:004); per-shift exceptions isolated; run-log UNIQUE duplicates swallowed (any other run-log DB error is now logged distinctly, not masked as a dedup hit — ISS-006 resolved).
- Certainty: HIGH.

**WF-server:003 — Auth: login / refresh / logout**
- Type: user-facing (invoked by API). Trigger: `AuthService.LoginAsync(username, password)` (`Services/AuthService.cs:27`).
- Login steps:
  1. `db.Users.GetByUserNameAsync(username)` (`AuthService.cs:29`).
  2. If `LockoutUntil > UtcNow` → throw `AuthException("החשבון נעול…")` (`:32-33`).
  3. `BCrypt.Verify(password, user.PasswordHash)`; on fail (or null user): if user exists, increment `FailedLoginAttempts`, lock for `LockoutMinutes` once `>= MaxFailedLoginAttempts`, persist; throw generic `"שם משתמש או סיסמה שגויים"` (`:36-47`).
  4. If `!IsActive` → throw `"החשבון אינו פעיל"` (`:49-50`).
  5. Reset failed-attempt counters + `LastConnected` (`:53-56`).
  6. Issue access token (`GenerateJwtToken`, HMAC-SHA256, 15 min default) + opaque refresh token (32 random bytes, base64) (`:59-61`); store SHA256(refresh) + expiry (7 days default) on user; persist (`:64-66`).
  7. Return `LoginResponse` { AccessToken, RefreshToken, ExpiresAt(ISO), User{Id, Name, Roles=[user.Role], Permissions={} }, MustChangePassword } (`:68-81`).
- Refresh steps: hash incoming token → `GetByRefreshTokenHashAsync` → reject if null/`!IsActive` or expired; rotate (new access + new refresh, store new hash + expiry) (`AuthService.cs:84-121`).
- Logout: load user by id, null out `RefreshTokenHash`/`RefreshTokenExpiry`, persist (`AuthService.cs:123-133`).
- Error handling: all failure paths throw `AuthException` with a generic Hebrew/English message; no exception details leak.
- Certainty: HIGH.

**WF-server:004 — InforUMobile SMS send**
- Type: outbound integration. Trigger: `InforUMobileSmsProvider.SendSmsAsync(phone, message)` (`Services/Sms/InforUMobileSmsProvider.cs:36`).
- Steps: build `<Inforu>` XML (User/Password/Content[Type=sms]/Recipients/Settings.Sender) (`:75-95`) → `Uri.EscapeDataString` → HTTP POST `SendMessageXml.ashx?InforuXML=…` (`:40-45`) → read body → if non-2xx, log + return `Error="שגיאת שליחה"` (`:49-54`) → `ParseResponse`.
- `ParseResponse`: numeric body `1` = success; `-2/-6/-9/-13` mapped to Hebrew errors, else `"שגיאת שליחה"`; fallback parses XML `<Status>` (`:97-136`).
- Error handling: never throws — `TaskCanceledException`(timeout)/`HttpRequestException`(network)/generic each return a `SmsResult{Success=false}` with a Hebrew error; phone masked to last 4 in logs (`:58-72,138-143`).
- Certainty: HIGH.

**WF-server:005 — DB initialize / migrate / seed (startup)**
- Type: startup, run once. Trigger: `DbInitializer.InitializeAsync()` (`Services/DbInitializer.cs:19`).
- Steps:
  1. Ensure DB dir exists; open SQLCipher connection (`Data Source=…;Password=…`); `PRAGMA journal_mode=WAL; busy_timeout=30000` always (`DbInitializer.cs:21-41`).
  2. **Fresh DB (`!dbExists`)**: CREATE all tables in FK order — Users, Volunteers, Locations, Shifts, SmsLog, MessageTemplate, SchedulerConfig, SchedulerRunLog, JewishHolidays — with indexes (`:47-227`); seed message templates (`SeedMessageTemplatesAsync`, 3 rows, `:677-701`), scheduler configs (`SeedSchedulerConfigAsync`, 6 rows, `:703-731`), holidays (`SeedJewishHolidaysAsync`, `:477-675`); create admin user `admin`/`Admin123!` (BCrypt cost 12, Role=`Admin`, `MustChangePassword=1`) (`:232-247`); seed sample data (`SeedSampleDataAsync`, `:258,763-858`).
  3. **Existing DB (`else`)**: run idempotent migrations — `MigrateShiftsTableAsync`, `MigrateLocationsAsync`, `MigrateJewishHolidaysAsync`, `MigrateCancellationColumnsAsync`, **`MigrateShiftTypeColumnsAsync`** (`:490`) and **`MigrateLocationTypeColumnsAsync`** (`:540`) (`DbInitializer.cs:295-300`).
  4. **Always (both paths, in this ORDER — order is load-bearing)**: `MigrateSchedulerConfigAsync` (the WeekdayAdvance row, `:306`) → **`MigrateMessageTemplatesAsync`** (the 3 administrative templates, `:314`) → **`MigrateAdminSchedulerConfigAsync`** (the AdminAdvance config row, `:315`) → **`MigrateAppSettingsAsync`** (the 2 admin template-role keys, `:316`). Templates MUST run first because the config + settings resolve their template ids **by Name** (comment `:308-313`).
- **The two new column migrations (`ShiftType`+4 admin cols on `Shifts`; `LocationType` on `Locations` + `VehicleLocationId` on `Shifts`)** follow the existing `PRAGMA table_info` add-if-absent pattern; the NOT-NULL discriminators are added `WITH DEFAULT` so SQLite backfills every existing row (`Operational` / `Vehicle`), plus a belt-and-suspenders `UPDATE … WHERE … IS NULL` normalize (`:490-538`, `:540-591`). They mirror Android `MIGRATION_9_10` / `MIGRATION_10_11`.
- **Template-id resolution is BY NAME, never by a hardcoded auto-increment id** — `ResolveTemplateIdByNameAsync` does `SELECT Id … WHERE Name = @Name ORDER BY Id LIMIT 1` (`:922-931`). `MessageTemplate.Name` is NOT unique, so the `ORDER BY Id LIMIT 1` makes a user-authored duplicate name resolve deterministically to the oldest id. If a lookup returns null the dependent config/settings insert is **SKIPPED and logged** rather than writing a dangling reference (`:985-990`, `:1041-1045`).
- State transitions: fresh → fully-seeded; existing → schema upgraded in place; WeekdayAdvance + AdminAdvance rows, the 3 admin templates and the 2 AppSettings keys ensured on every startup.
- Error handling: each migration wrapped in try/catch that logs to `Console.Error` and continues (does NOT rethrow) — non-fatal upgrades.
- Certainty: HIGH.

**WF-server:010 — Administrative one-shot SMS send (explicit template, no dedup)** *(NEW 2026-07-14)*
- Type: invoked workflow (called by the api's admin create-with-SMS and per-volunteer send endpoints). Trigger: `SmsReminderService.SendAdminSmsAsync(shift, volunteer, template)` (`Services/Sms/SmsReminderService.cs:350`).
- Steps: load the mission `Location` (by `shift.LocationId`) and the vehicle `Location` (by `shift.VehicleLocationId`) (`:352-357`) → project a `ShiftVolunteerDto` carrying the admin columns + both resolved location trios (`:359-380`) → `BuildMessage(template.Content, dto, shift.ShiftDate)` **+ `BuildAdminSmsBlocks(dto)`** — every admin send appends the mission + vehicle blocks, unlike the operational SameDay-only rule (`:386`) → `SendSmsAsync` → insert `SmsLog` with **`ReminderType = Manual`** (`:425-432`) → on success `UPDATE Shifts SET SmsSentAt` (`:434-440`).
- **No dedup on this path**: it logs `Manual`, which the `AdminAdvance` scheduler run never matches, so an admin can legitimately re-send. The operational 1/2 template switch is NOT used.
- Certainty: HIGH.

**WF-server:011 — Administrative placeholder substitution (substitute-or-STRIP + line collapse)** *(NEW 2026-07-14)*
- Type: pure function inside `BuildMessage` (`Services/Sms/SmsReminderService.cs:238-263`).
- Steps: the 6 pre-existing placeholders substitute exactly as before (`:241-247`) → detect whether the template uses **any** of the 5 optional admin placeholders `{תיאור} {שעה} {מיקום} {כתובת} {מיקום רכב}` (`AdminOptionalPlaceholders`, `:223-224`; `hasAdmin` at `:246`) → each admin token is replaced with its value **or DELETED when the value is blank** (`ReplaceOrStrip`, `:266-267`) so a raw `{…}` never ships → **only when `hasAdmin`**, `CollapseBlankLines` drops whitespace-only lines and trailing whitespace (`:260,272-278`).
- **Invariant this encodes:** operational templates contain none of the 5 admin tokens, so `hasAdmin` is false and the collapse pass is skipped — operational SMS output is byte-for-byte unchanged by this feature. Stated in-comment at `:245` and `:257-258`.
- Certainty: HIGH.

**WF-server:006 — Monthly shift cleanup (background, hourly poll)**
- Type: background (`BackgroundService`, 1-hour delay loop). Trigger: `ShiftCleanupService.ExecuteAsync` → `CheckAndRunCleanup` (`Services/ShiftCleanupService.cs:24,56`).
- Steps: only proceed if Israel-local `now.Day == 1` and `_lastCleanupMonth != now.Month` (run-once-per-month guard) (`:60-64`); cutoff = first-of-this-month minus one month (`:71-72`); hard-DELETE `SmsLog` for shifts older than cutoff, then `Shifts` older than cutoff, then `SchedulerRunLog` with `TargetDate < cutoffStr`; set `_lastCleanupMonth = now.Month` (`:76-100`).
- Error handling: tick try/catch logs and continues (`:38-41`); inner cleanup logs then RE-THROWS (`:106-110`) — but the throw is caught by the outer tick handler so the service survives (`_lastCleanupMonth` is NOT advanced on failure, so it retries next hour).
- Note: `_lastCleanupMonth` is in-memory only → a restart on the 1st re-runs cleanup (idempotent: deletes already-gone rows). [HIGH]
- Certainty: HIGH.

**WF-server:007 — Volunteers Excel import**
- Type: user-facing (API upload). Trigger: `VolunteersImportService.ImportFromExcelAsync(stream, db)` (`Services/VolunteersImportService.cs:12`).
- Steps: `ExcelHelper.ReadExcel<VolunteerRow>` (cols: InternalId/Name/Phone) (`:20-26`); reject empty or `> 10000` rows (`:36-48`); per row validate required InternalId+Name, sanitize phone (digits-only, prefix `0`) (`:55-77,93-99`), `db.Volunteers.UpsertByInternalIdAsync` → count Inserted/Updated (`:79-80`).
- Error handling: per-row try/catch increments `Errors` with Hebrew row message; no transaction (comment cites SQLite per-op connection incompatibility, `:50-51`).
- Certainty: HIGH.

**WF-server:008 — Shift schedule Excel import**
- Type: user-facing (API upload). Trigger: `ShiftsImportService.ImportFromExcelAsync(stream, db)` (`Services/ShiftsImportService.cs:9`).
- Steps: `ShiftScheduleParser.Parse(stream)` → list of `ExcelShift` (`:17`); filter to `Date >= today` (`:34-35`); build volunteer lookup by trimmed `MappingName` (case-insensitive) (`:44-51`); per shift per volunteer, match → `Shift{VolunteerId}` else unresolved `Shift{VolunteerName}` (`:58-90`); dedup by `(ShiftDate, ShiftName, VolunteerId, VolunteerName)` (`:95-98`); DELETE existing shifts in `[minDate, maxDate]` then `BulkInsertAsync(newShifts)` (`:104-114`).
- Parser behavior: scans col A for OLE-serial/DateTime cells with `Year > 1901` as week-date rows (`Helpers/ShiftScheduleParser.cs:78-92`); each week = 4 teams × 6 rows (name + car + 4 volunteers), starting 3 rows below the date row, reading cols A–G (Sun–Sat) (`:13-18,108-151`).
- Error handling: parse failure → `Errors=1`, `"שגיאה בקריאת הקובץ"`; empty file / no future shifts → Hebrew message; DB error → `Errors++`, `"שגיאה בשמירת המשמרות"` (`:18-31,116-121`).
- Certainty: HIGH.

**WF-server:009 — Effective day-group + next-working-day resolution (holiday-aware)**
- Type: internal helper for WF-server:001. Trigger: `GetEffectiveDayGroupAsync`, `NextWorkingDayAsync` (`Services/Sms/SmsSchedulerService.cs:149,180`).
- `GetEffectiveDayGroupAsync` priority: Saturday → `Sat`; today is holiday → `Sat`; Friday → `Fri`; tomorrow is holiday → `Fri`; else `SunThu` (`:151-165`). (`IsHolidayAsync` checks `yyyy-MM-dd` string against `JewishHolidays`.)
- `NextWorkingDayAsync`: smallest date strictly after `from` with effective group `SunThu`, bounded 14-day walk with its own try/catch; on bound-exceed or DB error falls back to `NextPlainWeekday` (next non-Fri/Sat, ignoring holidays) (`:172-211`).
- Certainty: HIGH.

---

## 4. Business Rules & Invariants

| ID | Rule | Criticality | Source |
|---|---|---|---|
| BR-server:001 | SMS dedup (per-shift): a shift is excluded from a reminder run if a `SmsLog` row exists with the same `ShiftId`, that run's `ReminderType`, and `Status = Success` (`NOT EXISTS` subquery) | Core | `Services/Sms/SmsReminderService.cs:61-67` |
| BR-server:002 | SMS dedup (per-run): `SchedulerRunLog` has UNIQUE(ConfigId, TargetDate, ReminderType); a UNIQUE-violating insert is swallowed (returns null) so a config fires at most once per target date. Since `2989b01` ONLY the UNIQUE violation is swallowed — any other DB error is logged distinctly and returned-null without rethrow | Core | `Services/DbInitializer.cs:203`, `Database/Repositories/SchedulerRunLogRepository.cs:25-44`, `Services/Sms/SmsReminderService.cs:191-197` |
| BR-server:003 | DayGroup = the day the SMS is SENT (the run/firing day), matched against the holiday-aware effective day group of "now"; it is NOT the shift's day. `DaysBeforeShift` (N) is the look-ahead offset added to today to find target shift dates | Core | `Services/Sms/SmsSchedulerService.cs:95,108-124,149-165` |
| BR-server:004 | Same-day reminders APPEND the location text (city/name + Waze "navigate" link); Advance/Manual/WeekdayAdvance do NOT (only `ReminderType == SameDay` calls `BuildLocationText`) | Core | `Services/Sms/SmsReminderService.cs:113-114,222-250` |
| BR-server:005 | Active-shift queries MUST filter `IsCanceled = 0` (soft-cancel); every shift list/eligibility query in scope does so | Core | `Services/Sms/SmsReminderService.cs:57,269`, `Database/Repositories/ShiftsRepository.cs:17,22,29,35,133`, `Database/Repositories/ShiftsRepository.cs:53` (canceled page filters `=1`) |
| BR-server:006 | LocationUpdate reminder: re-notify a shift group (Date+ShiftName+CarId) with the new location text; logged with `ReminderType=LocationUpdate`. Not deduped by SmsLog (no NOT EXISTS) — intended to re-send | Supporting | `Services/Sms/SmsReminderService.cs:252-308` |
| BR-server:007 | WeekdayAdvance: window is half-open `[today+N, NextWorkingDay(today)+N)` so shifts whose natural send-day lands on Fri/Sat/holiday/holiday-eve are pulled back onto a working day; RunLog key = today (firing day). `{תאריך}`/`{יום}` derived from EACH shift's own date, not the window start | Core | `Services/Sms/SmsSchedulerService.cs:114-119`, `Services/Sms/SmsReminderService.cs:76,109-112` |
| BR-server:008 | Holiday-aware effective day group: Sat > today-is-holiday(→Sat) > Fri > tomorrow-is-holiday(→Fri) > SunThu; on holiday-check failure, fall back to plain weekday mapping | Core | `Services/Sms/SmsSchedulerService.cs:73-82,138-166` |
| BR-server:009 | Scheduler fires only on EXACT `HH:mm` string match between config `Time` and Israel-local current time, and only for enabled configs (`IsEnabled == 1`) | Core | `Services/Sms/SmsSchedulerService.cs:99`, `Database/Repositories/SchedulerConfigRepository.cs:17` |
| BR-server:010 | The singleton `SmsSchedulerService` / `ShiftCleanupService` resolve scoped services (`MagavDbManager`, `SmsReminderService`) via `IServiceScopeFactory.CreateScope()` per tick | Core | `Services/Sms/SmsSchedulerService.cs:63-65`, `Services/ShiftCleanupService.cs:68-69` |
| BR-server:011 | Account lockout after `MaxFailedLoginAttempts` (default 5) failed logins, for `LockoutMinutes` (default 15); counters reset on success | Core | `Services/AuthService.cs:40-42,53-54`, `Services/AuthService.cs:230-233` |
| BR-server:012 | Access token = HMAC-SHA256 JWT, default 15-min expiry; refresh token = 32 random bytes, default 7-day expiry, stored as SHA256(token) and ROTATED on every refresh | Core | `Services/AuthService.cs:59-66,98-105,136-171,225-226` |
| BR-server:013 | Login NEVER reveals whether username or password was wrong (single generic message); locked/inactive states use distinct messages; no exception details leak | Core | `Services/AuthService.cs:33,46,50` |
| BR-server:014 | Roles array returned to client is `[user.Role]` — server stores a single `Role` string, wrapped into a one-element array for the client's `roles[]` contract | Supporting | `Services/AuthService.cs:77,116` |
| BR-server:015 | ~~Password policy: 8+ chars + upper/lower/digit/special~~ — **`Helpers/PasswordValidator.cs` was deleted in `2989b01`** (dead code, never called). The actually-enforced policy is the inline rule in the api's `change-password` (≥6 + letter + digit). The cross-platform .NET vs Android (≥4) policy difference is an accepted divergence (`tools/parity.md` #2) | Supporting | (inline) `web/server/Magav.Api/Program.cs` change-password; ISS-009 resolved |
| BR-server:016 | Volunteer SMS approval is one-way via public page: `UpdateSmsApprovalAsync` refuses if already approved (must contact admin); upsert-by-internal-id only updates MappingName+MobilePhone on existing rows | Supporting | `Database/Repositories/VolunteersRepository.cs:55-103` |
| BR-server:017 | Shift import only imports today-and-future shifts and REPLACES all shifts in the imported `[minDate, maxDate]` range (delete-then-bulk-insert) | Supporting | `Services/ShiftsImportService.cs:34-35,104-114` |
| BR-server:018 | Volunteer import capped at 10000 rows (DoS protection); phone sanitized to digits with leading `0` | Supporting | `Services/VolunteersImportService.cs:10,43-48,93-99` |
| BR-server:019 | Monthly cleanup hard-deletes shifts/SMS logs (by shift) older than the prior month, and run logs with `TargetDate` before the cutoff; runs only on day 1, once per calendar month (in-memory guard) | Supporting | `Services/ShiftCleanupService.cs:60-100` |
| BR-server:020 | Location cannot be deleted while referenced by a future shift (Israel-local "today" cutoff) | Supporting | `Database/Repositories/LocationsRepository.cs:16-26` |
| BR-server:021 | Message template cannot be deleted while referenced by any `SchedulerConfig` | Supporting | `Database/Repositories/MessageTemplateRepository.cs:13-18` |
| BR-server:022 | Default scheduler seed = exactly 6 configs (SunThu/Fri/Sat × SameDay/Advance), enabled; WeekdayAdvance seeded separately as a 7th, DISABLED; **AdminAdvance seeded as an 8th, DISABLED, via its own idempotent migration** | Supporting | `Services/DbInitializer.cs:859-894,896-920,979-1014` |
| BR-server:023 | **Shift-type isolation on the SMS eligibility query:** `AdminAdvance` pulls ONLY `Administrative` shifts; every other reminder type pulls ONLY `Operational`. Because a row is exactly one type, admin and operational sends can never collide on the `SmsLog (ShiftId, ReminderType)` dedup key | Core | `Services/Sms/SmsReminderService.cs:43-45,74,81` |
| BR-server:024 | **The `Operational` predicate on `ShiftsRepository.GetByDateAsync` is the .NET choke point** — the by-date page, delete-group and update-group all load through it, so administrative rows can never bleed into operational flows. `GetDatesWithShiftsAsync`, `GetDatesWithUnresolvedAsync`, `GetCanceledByMonthAsync` and `HasSameDaySmsBeenSentAsync` each carry the predicate independently | Core | `Database/Repositories/ShiftsRepository.cs:21,27,34,60,251` |
| BR-server:025 | **Deliberately TYPE-AGNOSTIC paths (do NOT add a `ShiftType` predicate):** `GetByVolunteerIdAsync` (the volunteer-delete cascade must cover admin shifts), `GetByIdAsync`, and the monthly cleanup deletes. Each carries an in-code note saying so | Core | `Database/Repositories/ShiftsRepository.cs:39-41,178`; `Services/ShiftCleanupService.cs:88-90` |
| BR-server:026 | **P0 data-loss guard:** the Excel import's range hard-delete is scoped to `ShiftType == Operational`, so importing a schedule can never destroy manually-created administrative shifts in the same date range. Boundary stays inclusive (`>= .. <=`), matching the original behavior | Core | `Services/ShiftsImportService.cs:110-113` |
| BR-server:027 | **An administrative group is keyed on `(ShiftDate, ShiftTime, Description)`** — never on the operational `(ShiftDate, ShiftName, CarId)` triple. `ShiftName` is kept **== `Description`** on every admin write so the NOT-NULL `ShiftName` constraint holds and the group never empty-buckets; editing the time or description **re-buckets** the group | Core | `Database/Repositories/ShiftsRepository.cs:131-159,161-176` |
| BR-server:028 | **`AdminAdvance` reuses the WeekdayAdvance half-open window verbatim** (`[today+N, NextWorkingDay(today)+N)`, RunLog key = the firing day). Its config is `DayGroup='SunThu'` (so it fires only on working days) with **`DaysBeforeShift` pinned at 1** — the only N for which that window is gap/overlap-free | Core | `Services/Sms/SmsSchedulerService.cs:104-122`; seed `Services/DbInitializer.cs:979-1014` |
| BR-server:029 | **Administrative template ids are resolved BY NAME at runtime, never hardcoded** (an upgraded DB may already have consumed ids 4/5). `MessageTemplate.Name` is not unique, so lookups are `ORDER BY Id LIMIT 1`; a failed lookup SKIPS the dependent insert and logs rather than persisting a dangling reference | Core | `Services/DbInitializer.cs:922-931,985-990,1041-1045` |
| BR-server:030 | **A location is undeletable while a FUTURE shift references it as EITHER its mission location (`LocationId`) OR its vehicle location (`VehicleLocationId`)** — the guard is type-agnostic and `IsCanceled`-agnostic (pre-existing behavior, unchanged) | Supporting | `Database/Repositories/LocationsRepository.cs:30-32` |

**Boundary / layer rules (Q11):**
- This component references ONLY `Magav.Common` (`Magav.Server.csproj:16-18`) — no reference to `Magav.Api`. It is the middle layer. [HIGH]
- `BackgroundService` singletons never hold scoped DB state directly; they always open a fresh DI scope per tick (BR-server:010). [HIGH]
- Raw SQL uses parameterized `@0,@1,…` placeholders for all values; the only interpolated tokens are migration column names (derived from a static array, never request input) in `MigrateLocationsAsync` (`DbInitializer.cs:390`) and the `LIMIT {count}` in `GetRecentAsync` (`SchedulerRunLogRepository.cs:14`, integer count). [HIGH]

---

## 5. Data Models

This component owns no entity classes (all live in `Magav.Common.Models`); it owns the repositories and one query DTO. Repositories extend `Repository<T>` (`Database/Repository.cs:13`) which provides `GetByIdAsync(long)`, `GetAllAsync`, `FirstOrDefaultAsync`, `FindAsync`, `InsertAsync`, `UpdateAsync`, `DeleteAsync`, `CountAsync`.

| Repository | Manages (common model) | Notable repo-specific queries/projections | Source |
|---|---|---|---|
| `UsersRepository` | `User` (`Models/Auth/User.cs`) | `GetByUserNameAsync`, `GetByRefreshTokenHashAsync`, `GetActiveUsersAsync`, `GetByRoleAsync`, `ExistsByUserNameAsync`, `GetByIdAsync(int)` | `Database/Repositories/UsersRepository.cs` |
| `VolunteersRepository` | `Volunteer` | `HashInternalId` (SHA256→base64), `GetByInternalIdAsync`, `ExistsByInternalIdAsync`, `GetByRoleIdAsync`, `GetSmsApprovedAsync`, `UpsertByInternalIdAsync` (update only MappingName+MobilePhone), `UpdateSmsApprovalAsync`, `RevokeSmsApprovalAsync` | `Database/Repositories/VolunteersRepository.cs` |
| `ShiftsRepository` | `Shift` | `GetByDateAsync`/`GetDatesWithShiftsAsync`/`GetDatesWithUnresolvedAsync`/`GetCanceledByMonthAsync` (all filter `!IsCanceled` **AND `ShiftType='Operational'`**), `GetByVolunteerIdAsync` + `GetByIdAsync` (**type-agnostic by design**), `MarkSmsSentAsync`, shift-group update/location-update overloads, `HasSameDaySmsBeenSentAsync`. **NEW admin set:** `GetAdministrativeByWeekAsync(weekStart)` → `List<AdminShiftRow>` (Sun→Sat `[weekStart, +7)`, LEFT JOINs Volunteers + Locations twice), `GetAdminGroupVolunteerIdsAsync`, `CountAdminGroupAsync`, `UpdateAdminGroupAsync`, `CancelAdminGroupAsync` — all scoped to `ShiftType='Administrative'` and keyed on `(date, ShiftTime, Description)` | `Database/Repositories/ShiftsRepository.cs:15,24,31,39,43,69,99,115,131,161,178` |
| `AppSettingsRepository` *(NEW)* | `AppSetting` | `GetByKeyAsync`, `GetValueAsync`, `UpsertAsync` (`INSERT … ON CONFLICT(Key) DO UPDATE`) — mirrors the Android `AppSettingDao` | `Database/Repositories/AppSettingsRepository.cs:12,20,26` |
| `SmsLogRepository` | `SmsLog` | `GetByDateRangeAsync`, `GetByDateAsync`, `GetFailedByDateRangeAsync`, `GetFailedByDateAsync` | `Database/Repositories/SmsLogRepository.cs` |
| `SchedulerConfigRepository` | `SchedulerConfig` | `GetByIdAsync(int)`, `GetEnabledAsync` (`IsEnabled == 1` — **still includes the enabled admin row so the scheduler fires it**), **`GetOperationalAsync`** (everything except `AdminAdvance` — used by the operational GET + bulk-PUT set-equality check), **`GetAdminAdvanceAsync`** (the single admin row) | `Database/Repositories/SchedulerConfigRepository.cs:16,25,30` |
| `SchedulerRunLogRepository` | `SchedulerRunLog` | `GetRecentAsync(count)` (`Sql.Builder.OrderBy("RanAt DESC")+LIMIT`), `InsertAsync` (swallows UNIQUE violation→null), `ExistsForConfigAndDateAsync` | `Database/Repositories/SchedulerRunLogRepository.cs` |
| `MessageTemplateRepository` | `MessageTemplate` | `GetByIdAsync(int)`, `IsInUseAsync` (referenced by SchedulerConfig) | `Database/Repositories/MessageTemplateRepository.cs` |
| `LocationsRepository` | `Location` | `GetByIdAsync(int)`, `GetByNameAsync`, `IsReferencedByFutureShiftsAsync` | `Database/Repositories/LocationsRepository.cs` |
| `JewishHolidaysRepository` | `JewishHoliday` | `GetByIdAsync(int)`, `GetByDateAsync(string)`, `IsHolidayAsync(string)`, `GetAllSortedAsync` | `Database/Repositories/JewishHolidaysRepository.cs` |

**Query DTO defined in this component:**
- `ShiftVolunteerDto` — projection for the scheduler join. Base fields (ShiftId, ShiftDate, ShiftName, CarId, VolunteerId, FirstName, LastName, MappingName, MobilePhone, LocationId, LocationName, LocationNavigation, LocationCity) **plus, since 2026-07-14, the 4 admin columns (Description, ShiftTime, Address, VehicleLocation) and the resolved vehicle-location quartet (VehicleLocationId, VehicleLocationName, VehicleLocationNavigation, VehicleLocationCity)** — projected so `BuildMessage` can substitute the admin placeholders instead of shipping raw `{…}` tokens (`Services/Sms/SmsReminderService.cs:483-512`). [HIGH]
- Auth response/settings types: `ApiResponse<T>`, `LoginResponse`, `UserInfo`, `JwtSettings`, `SecuritySettings`, `AuthException` (`Services/AuthService.cs:175-239`). [HIGH]
- `ImportResult` + private `VolunteerRow` record (`Services/VolunteersImportService.cs:102,105-114`). [HIGH]

---

## 6. Integration Points

| ID | Name | Type | Direction | Target | Source |
|---|---|---|---|---|---|
| IP-server:001 | InforUMobile SMS XML API | HTTP POST (XML) | outbound | `SendMessageXml.ashx` (base URL configured in API DI HttpClient) | `Services/Sms/InforUMobileSmsProvider.cs:40-45,75-95` |
| IP-server:002 | Encrypted SQLite (SQLCipher) — DDL/seed | DB driver | outbound | local `magav.db` via `Microsoft.Data.Sqlite` | `Services/DbInitializer.cs:31-41` |
| IP-server:003 | Database via `DbHelper` (NPoco) | DB facade | outbound | same SQLite DB (repositories) | `Database/MagavDbManager.cs:15,67`, all repositories |
| IP-server:004 | `IConfiguration` (appsettings) | config | inbound | `Jwt:*`, `Security:*`, `InforUMobile:*`, `Database:Path`/`Database:Password` | `Services/AuthService.cs:21-24`, `Services/Sms/InforUMobileSmsProvider.cs:28-33`, `Services/DbInitializer.cs:14-16` |
| IP-server:005 | Excel files (.xlsx) via EPPlus | file/stream I/O | inbound | uploaded streams | `Helpers/ShiftScheduleParser.cs:27,36`, `Services/VolunteersImportService.cs:20` |
| IP-server:006 | `ILogger` / structured logging | logging | outbound | host logging pipeline | `Services/Sms/SmsSchedulerService.cs`, `SmsReminderService.cs`, etc. |

No email notifier is used in this component (Brevo `EmailNotifier` lives in `Magav.Common` and is not referenced by any file in scope). [HIGH — none found]

---

## 7. User Roles & Access

- **Auth mechanism:** JWT bearer. Access token is an HMAC-SHA256-signed `JwtSecurityToken` carrying claims `sub`(user id), `name`, `ClaimTypes.Role`(single role string), `jti`(GUID), issuer/audience from `Jwt` config, expiry = `AccessTokenExpirationMinutes` (default 15) (`Services/AuthService.cs:136-158`).
- **Password hashing:** BCrypt (`BCrypt.Net.BCrypt.Verify`/`HashPassword`), seed admin hashed at work factor 12 (`DbInitializer.cs:233`); `SecuritySettings.BcryptWorkFactor` default 12 (`AuthService.cs:233`) — though the seed hardcodes 12 rather than reading the setting.
- **Refresh-token storage:** opaque 256-bit random token returned to client; only `SHA256(token)` (base64) is persisted in `Users.RefreshTokenHash`, with `RefreshTokenExpiry` (`AuthService.cs:64-66,160-171`). Rotated on every refresh; cleared on logout.
- **Lockout:** `FailedLoginAttempts` increments on bad password; `LockoutUntil = UtcNow + LockoutMinutes` once `>= MaxFailedLoginAttempts` (defaults 5 / 15 min) (`AuthService.cs:40-42`, `SecuritySettings:230-233`).
- **Roles:** the server stores `User.Role` as a single string (seeded admin = `"Admin"`, `DbInitializer.cs:238`); login/refresh wrap it as `Roles = new[]{ user.Role }` for the client (`AuthService.cs:77,116`). The role-policy strings (`"Admin"`, `"SystemManager"`, `"User"`) and `.RequireAuthorization()` policy enforcement live in the API layer, not here. `UsersRepository.GetByRoleAsync` supports filtering by role. [HIGH]
- **Public-page volunteer flow:** `VolunteersRepository.UpdateSmsApprovalAsync`/`RevokeSmsApprovalAsync` back the no-auth SMS-approval page; approval is one-way (refuses re-approval) (`VolunteersRepository.cs:84-119`).

---

## 8. Interfaces Exposed

Consumed by `Magav.Api` via DI:

- **`MagavDbManager`** (scoped) — facade with lazy repository properties: `Users`, `Volunteers`, `Shifts`, `SmsLog`, `SchedulerConfig`, `SchedulerRunLog`, `MessageTemplates`, `Locations`, `JewishHolidays`, raw `Db` (`DbHelper`), and `GetTransaction()` (`Database/MagavDbManager.cs:36-74`).
- **`AuthService`** — `LoginAsync`, `RefreshTokenAsync`, `LogoutAsync` (`Services/AuthService.cs:27,84,123`); plus exposed types `ApiResponse<T>`, `LoginResponse`, `UserInfo`, `JwtSettings`, `SecuritySettings`, `AuthException`.
- **`SmsReminderService`** — `ExecuteAsync(config, windowStart, windowEnd, runLogTargetDate, ct)`, `SendLocationUpdateAsync(date, shiftName, carId)`, static `BuildMessage`, `BuildLocationText`, `GetHebrewDayName` (`Services/Sms/SmsReminderService.cs:24,252,204,222,310`).
- **`SmsSchedulerService`** (singleton hosted) and **`ShiftCleanupService`** (singleton hosted) — registered via `AddHostedService`.
- **`ISmsProvider`** / **`InforUMobileSmsProvider`** — `SendSmsAsync(phone, message) → SmsResult{Success,Error}` (`Services/Sms/ISmsProvider.cs:3-12`).
- **`DbInitializer`** — `InitializeAsync()`, `GetConnectionString()` (`Services/DbInitializer.cs:19,275`).
- **`ShiftsImportService`** / **`VolunteersImportService`** — `ImportFromExcelAsync(stream, db) → ImportResult` (`Services/ShiftsImportService.cs:9`, `Services/VolunteersImportService.cs:12`).
- **`ShiftScheduleParser`** (static) — `Parse(filePath|stream) → List<ExcelShift>` (`Helpers/ShiftScheduleParser.cs:27,36`).
- ~~**`PasswordValidator`** (static)~~ — **deleted in `2989b01`** (was dead code; the live policy is inline in the api's `change-password`). ISS-009 resolved.
- **`Repository<T>`** generic base — extendable CRUD (`Database/Repository.cs:13`).

---

## 9. Interfaces Consumed

| External component | What imported | Import location |
|---|---|---|
| `Magav.Common.Database.DbHelper` | ORM facade (Fetch/Insert/Update/Delete/ExecuteScalar/ExecuteQuery/GetTransaction/SingleOrDefault) | `Database/Repository.cs:5`, `Database/MagavDbManager.cs:2`, all repositories |
| `Magav.Common.Models.*` | entity types (Shift, Volunteer, SmsLog, SchedulerConfig/RunLog, MessageTemplate, Location, JewishHoliday, CanceledShiftRow, ExcelShift) | repositories + `SmsReminderService.cs:2`, `ShiftScheduleParser.cs:1` |
| `Magav.Common.Models.Auth.User` | auth entity | `Database/Repositories/UsersRepository.cs:5`, `Services/AuthService.cs:5` |
| `Magav.Common.MagavConstants` | ReminderTypes / SmsStatuses / DayGroups constants | `SmsReminderService.cs:1`, `SmsSchedulerService.cs:1`, `ShiftsRepository.cs:1`, `SmsLogRepository.cs:1`, `DbInitializer.cs:1` |
| `Magav.Common.Excel.ExcelHelper` | `ReadExcel<T>` for volunteers | `Services/VolunteersImportService.cs:2,20` |
| `NPoco` | `Sql.Builder`, `ITransaction` | `Database/Repositories/SchedulerRunLogRepository.cs:3`, `Database/MagavDbManager.cs:4,74` |
| BCrypt.Net-Next 4.0.3 | password hash/verify | `Services/AuthService.cs:36`, `Services/DbInitializer.cs:233` |
| System.IdentityModel.Tokens.Jwt 8.0.0 + Microsoft.IdentityModel.Tokens | JWT build/sign | `Services/AuthService.cs:1,8,138-157` |
| Microsoft.Data.Sqlite | raw SQLCipher connection + DDL | `Services/DbInitializer.cs:2,34-41` |
| OfficeOpenXml (EPPlus) | shift Excel parsing | `Helpers/ShiftScheduleParser.cs:2,21` |
| System.Xml.Linq | InforUMobile XML payload/parse | `Services/Sms/InforUMobileSmsProvider.cs:2,77-95,123` |
| System.Security.Cryptography | SHA256 (refresh/internal-id hash), RandomNumberGenerator | `Services/AuthService.cs:3,163-171`, `Database/Repositories/VolunteersRepository.cs:3,23` |
| Microsoft.Extensions.Hosting / .DependencyInjection / .Logging / .Configuration | BackgroundService, scope factory, logging, config | `SmsSchedulerService.cs:1-5`, `ShiftCleanupService.cs:1-4`, `AuthService.cs:7` |
| `System.Net.Http.HttpClient` | InforUMobile HTTP (injected via API's `AddHttpClient`) | `Services/Sms/InforUMobileSmsProvider.cs:14,43` |

---

## 10. Legacy Warnings

- **God object (grew):** `Services/DbInitializer.cs` = **1148 LOC** (was 859 — +289 for the administrative-shifts migrations/seeds), dominated by an inline ~180-entry hardcoded `SeedJewishHolidaysAsync` table (2025–2035, `:630-828`) that must be kept in sync with the Android `DatabaseInitializer.kt` (comment `:629`). Embedding a decade of holiday dates in code means the system silently stops being holiday-aware after 2035. [HIGH]
- **The admin migration chain is ORDER-DEPENDENT and silently degrades.** `MigrateMessageTemplatesAsync` → `MigrateAdminSchedulerConfigAsync` → `MigrateAppSettingsAsync` must run in that order because the latter two resolve template ids by Name (comment `DbInitializer.cs:308-313`). If a by-name lookup fails, the dependent insert is skipped **and only logged to `Console.Error`** — startup still succeeds, but administrative SMS sends will then fail at send time with "תבנית ההודעה המנהלית לא הוגדרה". Re-ordering these three calls, or letting an operator rename an admin template, breaks the chain quietly. [HIGH] (`DbInitializer.cs:314-316,985-990,1041-1045`)
- **The admin template-role AppSettings keys are seeded `INSERT OR IGNORE` / once-only, so they never self-heal.** If the referenced template is later deleted or repointed, `MigrateAppSettingsAsync` will NOT correct the stale key on the next startup (the key exists, so the insert is ignored) — an admin must re-pick the template in the admin scheduler-settings page. This is the mechanism behind ISS-011. [HIGH] (`DbInitializer.cs:1037-1051`)
- **Sample data ships in initializer:** `SeedSampleDataAsync` (12 fake volunteers, 4 teams, 84 shifts, SMS logs) is called unconditionally on every FRESH DB (`DbInitializer.cs:258,763-858`); marked "remove before production" but still present. All sample volunteers share phone `050-4448246` and `ApproveToReceiveSms=1`. [HIGH]
- **Scheduler-config seeding gotcha (matches MEMORY):** `SeedSchedulerConfigAsync` (the 6 default configs) runs ONLY on a fresh DB inside the `!dbExists` branch (`DbInitializer.cs:213,703-731`). New seed rows do NOT reach existing DBs — the WeekdayAdvance row had to be added via a separate idempotent `MigrateSchedulerConfigAsync` (INSERT OR IGNORE, unconditional) (`:269-272,740-761`). Any future default config must follow the same migration pattern, and the "6 configs" value is effectively hardcoded across `DbInitializer` (.NET) + Android per MEMORY. [HIGH]
- **Migrations swallow errors:** all `Migrate*` methods catch-and-log-to-Console.Error then continue (`DbInitializer.cs:330,394,434,470,757`). A failed in-place migration does not stop startup and can leave a partially-upgraded schema. [HIGH]
- ~~**`SchedulerRunLogRepository.InsertAsync` swallows ALL exceptions**~~ **RESOLVED 2026-06-19 (`2989b01`):** the bare `catch (Exception)` was narrowed to `SqliteException` filtered on UNIQUE (code 19 / extended 2067 / message-contains-UNIQUE) → silent dedup hit; any other exception is logged distinctly (ConfigId/TargetDate/ReminderType) and returns null WITHOUT rethrow. Kept structurally identical to the Android mirror (`SmsReminderService.kt`). (`SchedulerRunLogRepository.cs:25-44`; ISS-006 resolved) [resolved]
- **BcryptWorkFactor setting partially unused:** seed admin hardcodes work factor `12` (`DbInitializer.cs:233`) instead of reading `SecuritySettings.BcryptWorkFactor` (`AuthService.cs:233`). Drift risk if the setting is changed. [MEDIUM]
- **Import without transaction:** `VolunteersImportService` deliberately processes rows one-by-one with no transaction (comment cites SQLite per-op connection model, `:50-51`) — a mid-import failure leaves partial data. `ShiftsImportService` delete-then-bulk-insert is also not wrapped in a single transaction (`ShiftsImportService.cs:104-114`), so a crash between DELETE and INSERT loses shifts. [MEDIUM]
- **TODO/FIXME/HACK markers:** 0 found in scope (grep over the whole component). [HIGH]
- **Hardcoded values:** admin username `admin` + password `Admin123!` seeded with `MustChangePassword=1` (`DbInitializer.cs:233,243,252`); seed admin FullName `"יניב פנחס"` (`:242`); default DB path `../db/magav.db` (`:14`); WeekdayAdvance defaults `06:00`/`DaysBeforeShift=5`/disabled (`:750-752`); the 6 default config times (`:708-713`). [HIGH]
- **Missing tests:** none in this component (project-wide: "There are no automated tests" per CLAUDE.md). [HIGH]
- **Divergence from CLAUDE.md (notable):** CLAUDE.md's documented `ReminderTypes` list (`SameDay`, `Advance`, `LocationUpdate`, `Manual`) omits **`WeekdayAdvance`**, which this component actively schedules (`SmsSchedulerService.cs:114`) and seeds (`DbInitializer.cs:749`). The `Manual` reminder type is referenced by CLAUDE.md but no code in THIS component sends a `Manual` reminder (likely driven from the API layer). [HIGH]

---

## 11. Design Rationale

| Pattern | Location | Rationale | Evidence | Certainty |
|---|---|---|---|---|
| `BackgroundService` 60s polling vs cron | `Services/Sms/SmsSchedulerService.cs:33,50` | Single self-contained process (mirrors Android's alarm model); exact `HH:mm` string match makes "fire once this minute" trivial without external scheduler | poll loop + exact-time check (`:99`) | HIGH |
| `IServiceScopeFactory.CreateScope()` for scoped-in-singleton | `SmsSchedulerService.cs:63-65`, `ShiftCleanupService.cs:68-69` | A singleton hosted service cannot inject scoped `MagavDbManager`/`SmsReminderService`; opening a fresh scope per tick gives a clean per-run DB context | matches CLAUDE.md DI note | HIGH |
| SHA256-hashed refresh tokens (not encrypted/plaintext) | `Services/AuthService.cs:64,170-171` | A DB leak cannot reveal usable refresh tokens; lookup is by hash, rotation on refresh limits replay window | `HashRefreshToken` + `GetByRefreshTokenHashAsync` | HIGH |
| `ISmsProvider` abstraction over InforUMobile | `Services/Sms/ISmsProvider.cs:3`, `InforUMobileSmsProvider.cs:12` | Decouple reminder logic from the SMS vendor; provider never throws (returns `SmsResult`) so one bad number can't abort a run | interface + always-catch provider | HIGH |
| Two-tier dedup (per-shift SmsLog + per-run RunLog UNIQUE) | `SmsReminderService.cs:61-67,191`, `DbInitializer.cs:203` | SmsLog NOT-EXISTS prevents re-texting a volunteer for the same reminder type; RunLog UNIQUE ensures a config processes a target date once even across restarts within the firing minute | both guards present | HIGH |
| DayGroup = send-day (holiday-aware), DaysBeforeShift = look-ahead | `SmsSchedulerService.cs:95,108-124,149-165` | Lets ops configure "what to send on Fri vs Sun–Thu" independently of shift dates; holiday override reuses Sat/Fri behavior on chag/erev-chag | effective-group priority ladder | HIGH |
| WeekdayAdvance pull-back window | `SmsSchedulerService.cs:114-119`, `SmsReminderService.cs:109-112` | Advance reminders for shifts whose natural send-day is a non-working day get sent on the prior working day instead; per-shift date derivation keeps `{תאריך}`/`{יום}` correct across the wider window | half-open window + per-shift `BuildMessage` | HIGH |
| Same-day-only location append | `SmsReminderService.cs:113-114` | Location may change before the shift; only the same-day reminder (and explicit LocationUpdate) carries the address/Waze link | guarded by `ReminderType==SameDay` | HIGH |
| Idempotent migrations + unconditional WeekdayAdvance seed | `DbInitializer.cs:269-272,400-438,740-761` | Existing user DBs (where the fresh-DB seed branch never runs) still receive new columns/config rows safely (ALTER…ADD, CREATE INDEX IF NOT EXISTS, INSERT OR IGNORE) | comments `:269-272,736-739` | HIGH |
| Lazy repository facade | `Database/MagavDbManager.cs:36-61` | Per-request scoped manager only instantiates repositories actually touched, sharing one `DbHelper` | `??=` lazy props | HIGH |
| In-memory once-per-month cleanup guard | `ShiftCleanupService.cs:12,60-64,100` | Cheap idempotency without a persisted "last run" row; restart re-runs harmlessly (deletes already-gone rows) | `_lastCleanupMonth` field | MEDIUM |
| Hash-based volunteer identity | `VolunteersRepository.cs:19-24` | Volunteer national/internal IDs are stored only as SHA256 hashes (PII minimization), matched by hash on import/approval | `HashInternalId` + lookups | HIGH |

---

### Summary
- **Business rules:** 30 (BR-server:001–030; 023–030 added 2026-08-17 for shift-type isolation, the type-agnostic carve-outs, the import data-loss guard, the admin group key, the AdminAdvance window reuse, by-name template resolution, and the widened location-delete guard). **Workflows:** 11 (WF-server:001–011; 010 admin one-shot send, 011 admin placeholder strip/collapse). **Integration points:** 6 (IP-server:001–006, unchanged). **Repositories:** 10 (+`AppSettingsRepository`).
- Most non-obvious fact (unchanged): the scheduler's **DayGroup is the day the SMS is SENT (holiday-aware effective group of "now"), not the shift's day**, and **WeekdayAdvance** uses a half-open `[today+N, NextWorkingDay+N)` window to pull shifts whose natural advance-send-day lands on Fri/Sat/holiday back onto a working day — with `{תאריך}`/`{יום}` derived per-shift (`SmsSchedulerService.cs:104-127`, `SmsReminderService.cs:123-126`). **`AdminAdvance` now reuses that exact machinery**, which is why its `DaysBeforeShift` is pinned at 1 (the only value for which the window is gap/overlap-free) and its `DayGroup` is `SunThu` (so it fires only on working days).
- Most non-obvious fact (new): **shift-type isolation is enforced query-by-query, not by a single gate.** There is no global filter — each read either carries `ShiftType = 'Operational'` or is deliberately type-agnostic, and the code marks the deliberate exemptions in-comment (`GetByVolunteerIdAsync`, `GetByIdAsync`, the monthly cleanup). A new shift query that forgets the predicate is a latent cross-type leak with nothing to catch it — the same class of trap as the `IsCanceled = 0` convention (BR-server:005), now doubled.
