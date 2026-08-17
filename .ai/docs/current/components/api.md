<!-- DeepInit Extract | Component: api
DeepInit C8 update | Run ID: deepinit-2026-08-17 | Generated: 2026-08-17 (commit cfb8e36 administrative-shifts + general-locations: Program.cs 2249→2718 LOC; 8 NEW endpoints — 4 administrative-shift + 2 admin-scheduler + 2 admin-template-role; GET /api/locations becomes type-filtered (?type=, default Vehicle) and POST/PUT gain type handling; operational scheduler GET/PUT/PUT-by-id now exclude the AdminAdvance row; cancel-group + sms-log + sms-log/summary gain the Operational predicate; NEW DTOs + the AdminSendHelpers static class)
Run ID: deepinit-2026-06-18 · Updated: deepinit-2026-06-24 (incremental --update over commit 2989b01: secrets externalized + JWT startup guard [ISS-007 appsettings half / ADR-017], Results.Problem→ApiResponse.Fail [ISS-005]) — note: appsettings.Development.json in the input list below was deleted/gitignored
Input files processed: web/server/Magav.Api/Program.cs, web/server/Magav.Api/appsettings.json, web/server/Magav.Api/appsettings.Development.json, web/server/Magav.Api/Properties/launchSettings.json
Generated: 2026-06-18 -->

# Component: api (`web/server/Magav.Api/`)

## 1. Component Overview

**Purpose:** The ASP.NET 8 Minimal-API entry point and HTTP surface of the Magav web backend. A single `Program.cs` (**2718 LOC** as of 2026-08-17) wires up configuration, DI, middleware, CORS, JWT bearer auth, authorization policies, rate limiting, and defines **every** REST endpoint (auth, users, volunteers, shifts, locations, holidays, scheduler config, message templates, SMS log, public SMS-approval, health). It is the top layer: depends on `Magav.Server` (services/repositories/scheduler) and `Magav.Common` (models/`ApiResponse`/`MagavConstants`). [HIGH] (`web/server/Magav.Api/Program.cs:5-14`)

**Tech stack:** .NET 8 Minimal APIs (`WebApplication.CreateBuilder`, `app.MapGet/MapPost/MapPut/MapDelete`); `Microsoft.AspNetCore.Authentication.JwtBearer`; `Microsoft.AspNetCore.RateLimiting`; `Microsoft.IdentityModel.Tokens`; `BCrypt.Net` (password hashing at endpoint level); `System.Text.RegularExpressions` (input validation). Excel import via `Magav.Server` services. [HIGH] (`Program.cs:1-14`)

**Entry point:** `web/server/Magav.Api/Program.cs` — top-level statements; `app.Run()` near the end. Request/response DTO records declared after `app.Run()`, now followed by the `AdminSendHelpers` static class (`Program.cs:2658-2718`). [HIGH]

**Complexity:** **Complex — god object.** All **56** endpoints + DI + middleware + DTOs live in one 2718-line file (see §10). [HIGH]

**Certainty:** [HIGH] — `Program.cs` read in full; both appsettings files and `launchSettings.json` read; git-tracking of config confirmed.

---

## 2. Features & Capabilities

Endpoint groups (method + representative path → source line, certainty all [HIGH] unless noted):

**Auth** (`Program.cs:180-290`)
- `POST /api/auth/login` (`:180`) — public; `AuthService.LoginAsync`.
- `POST /api/auth/refresh` (`:202`) — public; rotates tokens.
- `POST /api/auth/logout` (`:224`) — `.RequireAuthorization()`; clears refresh token from JWT `sub`/`NameIdentifier` claim.
- `POST /api/auth/change-password` (`:249`) — `.RequireAuthorization()`; validates new password (≥6 chars, 1 letter + 1 digit), BCrypt-hashes via `Security:BcryptWorkFactor`.
- `GET /api/health` (`:290`) — public; returns `{status, timestamp}`.

**Volunteers** (`Program.cs:296-368`, `2181-2209`)
- `GET /api/volunteers` (`:296`) — `CanManageMessages`; projects DTO (no internal-id hash).
- `POST /api/volunteers/import` (`:321`) — `CanImportVolunteers` + `.DisableAntiforgery()`; Excel upload (full validation pattern, §3 WF-api:006); delegates to `VolunteersImportService`.
- `POST /api/volunteers/revoke-sms-approval` (`:2181`) — `CanManageMessages`; validates internal-id regex `^[0-9]{1,8}$`.

**Shifts** (`Program.cs:656-1397`)
- `POST /api/shifts/import` (`:656`) — `CanImportVolunteers` + `.DisableAntiforgery()`; Excel upload; `ShiftsImportService`.
- `GET /api/shifts/by-date?date=` (`:719`), `GET /api/shifts/dates-with-shifts?from=&to=` (`:768`) — `CanManageMessages`.
- `POST /api/shifts` create (`:1206`), `PUT /api/shifts/update-group` (`:1279`), `PUT /api/shifts/update-group-location` (`:1345`) — `CanManageMessages`.
- `DELETE /api/shifts/{id}` (`:799`) — hard-delete + cascade SmsLog delete; `CanManageMessages`.
- `POST /api/shifts/delete-group` (`:823`) — hard-delete a group, optional cancel SMS (template 3); `CanManageMessages`.
- `POST /api/shifts/{id}/cancel` (`:909`) — **soft-cancel** single (sets `IsCanceled=1`,`CanceledAt`); optional SMS; `CanManageMessages`.
- `POST /api/shifts/cancel-group` (`:982`) — **soft-cancel** team for Date+ShiftName+CarId (only `IsCanceled=0` rows); optional SMS; `CanManageMessages`.
- `GET /api/shifts/canceled?month=YYYY-MM` (`:1077`) — lists `IsCanceled=1`; `CanManageMessages`.
- `POST /api/shifts/{id}/send-sms` (`:1105`) — manual SMS; auto-picks template 1 (same-day, +location) or 2 (advance) by Israel-local date; `CanManageMessages`.
- `POST /api/shifts/send-location-update` (`:1375`) — `SmsReminderService.SendLocationUpdateAsync`; `CanManageMessages`.

**Administrative shifts** (`Program.cs:1403-1649`) — NEW 2026-07-14, all `CanManageMessages`:
- `GET /api/shifts/administrative/by-week?weekStart=YYYY-MM-DD` (`:1404`) — the Sun→Sat week of `AdminShiftRow`s.
- `POST /api/shifts/administrative` (`:1424`) — create one row per volunteer; `Description` required (it also becomes `ShiftName`); `ShiftTime` normalized to `HH:mm`; **skips volunteers already active in the same `(Date, ShiftTime, Description)` group**, which is what makes the client's add-volunteers-in-edit re-POST idempotent; optional `SendSms` uses the **assignment** template.
- `PUT /api/shifts/administrative/update-group` (`:1529`) — keyed on the OLD `(Date, OldShiftTime, OldDescription)`; editing re-buckets the group.
- `POST /api/shifts/administrative/cancel-group` (`:1571`) — soft-cancel by `(Date, ShiftTime, Description)`; never reuses the operational ShiftName+CarId path.
- `POST /api/shifts/administrative/{id}/send-sms` (`:1598`) — per-volunteer send; picks the **today** template when the shift is on today's Israel-local date, else the **assignment** template; rejects a canceled shift, an unresolved volunteer, a phoneless volunteer, or a non-approved volunteer.

**Admin scheduler + template roles** (`Program.cs:1651-1755`) — NEW 2026-07-14:
- `GET /api/admin-scheduler/config` (`:1655`, `CanManageMessages`) / `PUT /api/admin-scheduler/config` (`:1675`, **`AdminOnly`**) — the single `AdminAdvance` row; the PUT writes **only** `Time`/`IsEnabled`/`MessageTemplateId` (DayGroup, ReminderType and `DaysBeforeShift` are server-owned and left exactly as stored).
- `GET /api/admin-settings/templates` (`:1716`, `CanManageMessages`) / `PUT /api/admin-settings/templates` (`:1736`, **`AdminOnly`**) — the assignment + today template-role ids, stored in `AppSettings`; the PUT verifies both templates exist before upserting.

**Locations** (`Program.cs:387-513`) — `GET` list **`?type=Vehicle|General|All`, defaulting to `Vehicle`** (`:388`), `GET /{id}`, `POST` (default type `Vehicle`), `PUT /{id}` (**preserve-on-omit: an omitted `Type` keeps the row's existing type — defaulting to `Vehicle` would silently flip a `General` row**, `:488`), `DELETE /{id}` (blocked if referenced by a future shift as mission **or** vehicle location). All `CanManageMessages`.

**Jewish Holidays** (`Program.cs:548-655`) — `GET` (`:548`), `POST` (`:565`), `PUT /{id}` (`:598`), `DELETE /{id}` (`:632`). Date validated `^\d{4}-\d{2}-\d{2}$`. All `CanManageMessages`.

**Users** (`Program.cs:1929-2175`) — `GET` list (`:1929`), `GET /{id}` (`:1958`), `POST` create (`:1989`), `PUT /{id}` (`:2057`), `DELETE /{id}` (`:2139`). All `AdminOnly`. Self-protection rules (§4).

**SMS Log** (`Program.cs:2216-2283`) — `GET /api/sms-log?days=` (`:2216`), `GET /api/sms-log/summary?days=` (`:2249`); lookback clamped 1–90 days; raw parameterized SQL. `CanManageMessages`.

**Scheduler Config** (`Program.cs:2290-2436`) — `GET /api/scheduler/config` (`:2290`, `CanManageMessages`, **operational rows only**); `PUT /api/scheduler/config` bulk (`:2309`, `AdminOnly`); `PUT /api/scheduler/config/{id}` single (`:2377`, `AdminOnly`, 404s on the admin row); `GET /api/scheduler/run-log` (`:2422`, `CanManageMessages`).

**Message Templates** (`Program.cs:2443-2554`) — `GET` (`:2443`, `CanManageMessages`); `POST` (`:2460`), `PUT /{id}` (`:2494`), `DELETE /{id}` (`:2528`) all `AdminOnly`. Content must contain `{שם}` and `{תאריך}`, ≤500 chars; cannot delete last template or an in-use template.

**Public SMS-approval** (`Program.cs:1764-1913`) — `POST /api/public/sms-approval/{accessKey}/verify` (`:1764`), `POST /api/public/sms-approval/{accessKey}/submit` (`:1832`). No auth; `.RequireRateLimiting("sms-approval")`; access-key validated against `PublicPages:SmsApprovalAccessKey`.

---

## 3. Workflows & Behaviors

**WF-api:001 — Application startup & middleware pipeline order**
- Type: startup. Trigger: process launch.
- Steps: bind `Jwt` settings (throw if missing) → `Program.cs:22-23`; bind `AllowedOrigins` (fallback `http://localhost:8080`) → `:25-26`; register CORS policy `AllowClient` → `:33-42`; register JWT bearer → `:45-59`; register authorization policies → `:61-71`; register services (DbInitializer/MagavDbManager/AuthService/SMS provider HttpClient/SmsReminderService) → `:74-96`; `AddHostedService<SmsSchedulerService>` + `AddHostedService<ShiftCleanupService>` → `:97-98`; register rate limiter → `:101-118`; (prod-only) HTTPS redirect + HSTS → `:124-138`; `app.Build()` → `:140`; `await dbInitializer.InitializeAsync()` → `:147-148`; (prod) `app.UseHsts()` → `:151-154`; `app.UseCors("AllowClient")` → `:157`; `app.UseRateLimiter()` → `:160`; `app.UseAuthentication()` → `:163`; `app.UseAuthorization()` → `:164`; map endpoints; `app.Run()` → `:2150`.
- Middleware order: **HSTS → CORS → RateLimiter → Authentication → Authorization**. [HIGH]
- Certainty: HIGH.

**WF-api:002 — JWT bearer authentication setup**
- Type: auth config. Trigger: startup (`Program.cs:45-59`).
- Steps: `TokenValidationParameters` validates issuer (`Jwt:Issuer`), audience (`Jwt:Audience`), lifetime, signing key (HMAC over UTF-8 `Jwt:SecretKey`); **`ClockSkew = TimeSpan.Zero`** (no skew tolerance, `:57`). Endpoints read user id from `JwtRegisteredClaimNames.Sub` with fallback `ClaimTypes.NameIdentifier` (`:215-216,239-240,1663-1664,1744-1745`); username from `ClaimTypes.Name` (`:1937,1985`). Token issuance/lockout live in `Magav.Server.AuthService` (see server.md WF-server:003).
- Certainty: HIGH.

**WF-api:003 — Authorization policies**
- Type: auth config (`Program.cs:61-71`).
- `CanImportVolunteers` = roles Admin + SystemManager (`:63-64`); `AdminOnly` = role Admin (`:66-67`); `CanManageMessages` = Admin + SystemManager (`:69-70`). Applied per-endpoint via `.RequireAuthorization("<policy>")`.
- Certainty: HIGH.

**WF-api:004 — Rate limiting (public SMS-approval)**
- Type: middleware. Trigger: requests to endpoints tagged `.RequireRateLimiting("sms-approval")`.
- Steps: fixed-window limiter — `Window=5min`, `PermitLimit=3`, `QueueLimit=0`, `AutoReplenishment=true` (`:111-117`); rejection returns HTTP 429 with `ApiResponse.Fail("יותר מדי בקשות, נסה שוב מאוחר יותר")` as JSON (`:103-110`). Only the two `/api/public/sms-approval/{accessKey}/*` endpoints opt in (`:1425,1509`).
- Certainty: HIGH.

**WF-api:005 — CORS**
- Type: middleware (`:33-42,157`).
- Policy `AllowClient`: `WithOrigins(allowedOrigins)` + `AllowAnyHeader` + `AllowAnyMethod` + `AllowCredentials`. Origins from `AllowedOrigins` config (committed value: `http://localhost:8080`). Credentials allowed but origins restricted (not wildcard). [HIGH]
- Certainty: HIGH.

**WF-api:006 — File-upload validation pattern (volunteers + shifts import)**
- Type: request handler (`Program.cs:305-363` volunteers; `:617-677` shifts — identical pattern).
- Steps: (1) CSRF: require header `X-Requested-With == XMLHttpRequest`, else 400 `"בקשה לא תקינה"` (`:312-316,624-628`); (2) read form, require `file` present + non-empty (`:319-324`); (3) size ≤ `MaxFileSize=10MB` (`:307,327-328`); (4) extension `.xlsx`/`.xls` only (`:331-333`); (5) copy to `MemoryStream` (in-memory only, never disk) (`:336-338`); (6) magic bytes: `0x50 0x4B` (ZIP/PK = xlsx) or `0xD0 0xCF` (OLE = xls), else 400 (`:341-348`); then `ImportFromExcelAsync(memoryStream, db)`. Endpoint adds `.DisableAntiforgery()` because the custom-header CSRF check replaces antiforgery for file uploads (`:362-363,676-677`).
- Certainty: HIGH.

**WF-api:007 — Standard error-handling pattern**
- Type: cross-cutting. Trigger: any endpoint catch block.
- Steps: `catch (Exception ex)` → `Console.Error.WriteLine($"...: {ex}")` (full detail server-side only) → return `Results.Json(ApiResponse<object>.Fail("<generic Hebrew>"), statusCode: 500)`. Used by the vast majority of endpoints (e.g. `:296-302,431-437,1226-1232`).
- **Deviation — RESOLVED 2026-06-19 (`2989b01`):** login/refresh/logout and the volunteers-import 500 path previously used `Results.Problem("…English…")`; all were converted to `Results.Json(ApiResponse<T>.Fail("<Hebrew>"), 500)`. **Zero `Results.Problem` references remain** — the pattern is now followed uniformly. (ISS-005 resolved) [HIGH]
- Certainty: HIGH.

**WF-api:008 — Public SMS-approval verify/submit**
- Type: public (no-auth) handler (`:1360-1509`).
- Verify steps: validate access key against `PublicPages:SmsApprovalAccessKey` (`:1371-1378`); validate internal-id `^[0-9]{1,8}$` (same generic error as "not found" to prevent format discovery, `:1381-1386`); look up volunteer by internal id; return status `already_approved` / `pending_approval` / generic fail. `finally` logs IP + result with NO PII (`:1419-1424`).
- Submit steps: access-key check; internal-id, first/last name (`^[֐-׿a-zA-Z\s\-']{1,20}$`), Israeli mobile (`^(0|(\+)?972)?5[0-9]{8}$`) validation; normalize phone (`NormalizeIsraeliPhone`, `:1511-1518`); `UpdateSmsApprovalAsync` (one-way — refuses re-approval per server.md BR-server:016); `finally` logs IP + success, no PII (`:1503-1508`).
- Certainty: HIGH.

**WF-api:009 — Manual shift SMS (auto template + reminder type)**
- Type: handler (`:1062-1160`).
- Steps: reject canceled shift / unresolved volunteer / no phone / not-approved; if no `TemplateId` supplied, compute Israel-local today, reject past shifts, pick template 1 (same-day) or 2 (advance) (`:1086-1097`); build message; if template 1, append location text via `BuildLocationText` (`:1117-1125`); send; insert `SmsLog` with `ReminderType` SameDay/Advance/Manual mapped from templateId (`:1129-1137`); on success set `Shifts.SmsSentAt` (`:1139-1144`).
- Certainty: HIGH.

---

## 4. Business Rules

| ID | Rule | Criticality | Source |
|---|---|---|---|
| BR-api:001 | Every endpoint MUST be authorized unless intentionally public (CLAUDE.md). All mutating/sensitive endpoints carry `.RequireAuthorization("<policy>")` except the four public ones below | Core | `Program.cs` (per-endpoint `.RequireAuthorization`) |
| BR-api:002 | Intentionally-public (no `.RequireAuthorization`): `POST /api/auth/login` (`:170`), `POST /api/auth/refresh` (`:190`), `GET /api/health` (`:274`), and the two `POST /api/public/sms-approval/{accessKey}/{verify,submit}` (`:1360,1428`, rate-limited) | Core | `Program.cs:170,190,274,1360,1428` |
| BR-api:003 | Public SMS-approval requires the request `accessKey` to equal `PublicPages:SmsApprovalAccessKey`; mismatch/empty → generic "המספר האישי אינו קיים במערכת" (no oracle) | Core | `Program.cs:1371-1378,1439-1445` |
| BR-api:004 | Public SMS-approval is rate-limited to 3 requests / 5 min (fixed window) | Core | `Program.cs:111-117,1425,1509` |
| BR-api:005 | API responses are wrapped in `ApiResponse<T>` (`Ok`/`Fail`) — invariant across all data endpoints | Core | e.g. `Program.cs:175,294,2033` |
| BR-api:006 | Cancelling a shift is a SOFT-cancel (set `IsCanceled=1`+`CanceledAt`), not delete; cancel-group only touches `IsCanceled=0` rows; cancel SMS failure does NOT block the cancel | Core | `Program.cs:870-940,943-1031` |
| BR-api:007 | Error responses never leak exception detail — full `ex` only to `Console.Error`; client gets generic Hebrew via `ApiResponse.Fail` + 500. The former auth/import `Results.Problem` deviation was converted to this pattern in `2989b01` (no deviations remain; ISS-005 resolved) | Core | `Program.cs:296-302` + auth/import catch blocks |
| BR-api:008 | File uploads: CSRF `X-Requested-With` header + ext `.xlsx/.xls` + magic bytes (PK / OLE) + ≤10MB + in-memory only | Core | `Program.cs:312-348,624-660` |
| BR-api:009 | Admin cannot deactivate self, remove own Admin role, delete self, or delete the last remaining Admin | Core | `Program.cs:1669-1674,1750-1758` |
| BR-api:010 | Valid user roles enforced server-side: `Admin`/`User`/`SystemManager`; password ≥6 chars + 1 letter + 1 digit; username `^[֐-׿a-zA-Z0-9_]{3,50}$` (case-insensitive uniqueness) | Supporting | `Program.cs:1597-1613,1678-1688` |
| BR-api:011 | Scheduler bulk PUT requires the submitted id-set to EXACTLY match the stored id-set (no missing/unknown/duplicate ids) — avoids a hardcoded count breaking save when configs are added/removed | Supporting | `Program.cs:1911-1919` |
| BR-api:012 | Scheduler config: `ReminderType`/`DayGroup` are server-owned (read from stored row, body ignored); shared validation via `SchedulerConfigValidation.Validate` (Time `HH:mm`, IsEnabled∈{0,1}, DaysBeforeShift 0–7, SameDay⇒0, Advance/WeekdayAdvance⇒≥1, template must exist) | Supporting | `Program.cs:1965-1993,2197-2219` |
| BR-api:013 | Message template content must contain `{שם}` and `{תאריך}`, length 1–500; last template + in-use template cannot be deleted | Supporting | `Program.cs:2052-2056,2121-2126` |
| BR-api:014 | SMS-log lookback `days` clamped to 1–90 (default 90); summary query filters `IsCanceled=0` | Supporting | `Program.cs:1816-1818,1848-1852,1863` |
| BR-api:015 | Location cannot be deleted while referenced by future shifts | Supporting | `Program.cs:483-484` |
| BR-api:016 | `DELETE /api/shifts/{id}` and `delete-group` HARD-delete and cascade-delete `SmsLog WHERE ShiftId=@0` first | Supporting | `Program.cs:769-770,850-854` |
| BR-api:017 | **Administrative endpoints are read/write at `CanManageMessages`; the two admin *configuration* writes are `AdminOnly`** (`PUT /api/admin-scheduler/config`, `PUT /api/admin-settings/templates`) — the same read-vs-configure split as the operational scheduler | Core | `Program.cs:1414,1521,1560,1590,1640` (`CanManageMessages`) vs `:1712,1755` (`AdminOnly`) |
| BR-api:018 | **`Description` is required on every admin create/update** because it is also written into the NOT-NULL `ShiftName`; `ShiftTime` is normalized to zero-padded `HH:mm` so `"8:00"` and `"08:00"` bucket into the same group | Core | `Program.cs:1432-1441,1536-1543`; `AdminSendHelpers.NormalizeShiftTime` `:2705-2711` |
| BR-api:019 | **Admin create is idempotent per volunteer:** volunteers already ACTIVE in the target `(Date, ShiftTime, Description)` group are skipped, so the client's "add volunteers while editing" (update-group, then re-POST the whole group) never double-inserts | Core | `Program.cs:1450,1462` |
| BR-api:020 | **Vehicle location — "id wins":** when `VehicleLocationId` is supplied, the free-text `VehicleLocation` is stored as NULL; the free text is used only when no id was picked. Applied identically on create and update | Supporting | `Program.cs:1444-1448,1546-1550` |
| BR-api:021 | **`GET /api/locations` defaults to `type=Vehicle`** (not "all") so pre-feature clients keep seeing exactly today's set; `All` is accepted explicitly; anything else → 400 "סוג מיקום לא תקין". **`PUT` preserves the row's existing type when `Type` is omitted** — defaulting to `Vehicle` there would silently re-bucket a `General` row | Core | `Program.cs:392-396,440-441,488-491` |
| BR-api:022 | **The operational scheduler endpoints must never see the `AdminAdvance` row:** `GET /api/scheduler/config` and the bulk `PUT` both read `GetOperationalAsync` (if the admin row leaked into the bulk read, the exact id-set equality check of BR-api:011 would reject every operational save), and `PUT /api/scheduler/config/{id}` returns the same 404 as a missing row when the target is the admin config | Core | `Program.cs:2294,2322-2324,2389-2393` |
| BR-api:023 | **SMS-log reporting is operational-only:** both `GET /api/sms-log` and `GET /api/sms-log/summary` filter `s.ShiftType = 'Operational'`, so administrative sends never appear in the operational SMS report | Supporting | `Program.cs:2234,2269` |
| BR-api:024 | **`POST /api/shifts/cancel-group` carries `ShiftType = 'Operational'`** — an admin group whose `ShiftName` (== `Description`) happens to match an operational `(ShiftName, CarId)` request would otherwise be wrongly canceled here while the Android mirror skips it. The predicate MUST stay byte-identical to the Android `cancelShiftGroup` DAO query | Core | `Program.cs:1052-1059` |

---

## 5. Data Models

Request/response DTOs are `record`/`class` declared at the bottom of `Program.cs` (`:2152-2249`). `ApiResponse<T>` itself is owned by `Magav.Server.Services` (per server.md §5) and consumed here.

| DTO | Kind | Fields | Source |
|---|---|---|---|
| `LoginRequest` | record | Username, Password | `Program.cs:2156` |
| `RefreshTokenRequest` | record | RefreshToken | `:2157` |
| `ChangePasswordRequest` | record | NewPassword | `:2158` |
| `CreateUserRequest` | record | FullName, UserName, Password, Role, IsActive=true, MustChangePassword=true | `:2159` |
| `UpdateUserRequest` | record | FullName, UserName, NewPassword?, Role, IsActive, MustChangePassword | `:2160` |
| `VerifyVolunteerRequest` | record | InternalId | `:2163` |
| `VerifyVolunteerResponse` | record | Status | `:2164` |
| `SubmitSmsApprovalRequest` | record | InternalId, FirstName, LastName, MobilePhone, ApproveToReceiveSms | `:2165` |
| `RevokeSmsApprovalRequest` | record | InternalId | `:2166` |
| `SmsLogDto` | class | Id, SentAt, Status, Error?, ShiftDate, ShiftName, VolunteerName (raw-SQL projection) | `:2169-2178` |
| `SmsLogSummaryDto` | class | ShiftDate, ShiftName, TotalVolunteers, SentSuccess, SentFail, NotSent | `:2180-2188` |
| `SchedulerConfigUpdateDto` | record | Id, Time, DaysBeforeShift, IsEnabled, MessageTemplateId (editable fields only) | `:2191` |
| `SchedulerConfigValidation` | static class | `Validate(dto, reminderType, template?) → string?` shared validator | `:2197-2219` |
| `CreateMessageTemplateRequest` / `UpdateMessageTemplateRequest` | record | Name, Content | `:2222-2223` |
| `SendShiftSmsRequest` | record | TemplateId? | `:2226` |
| `CreateShiftRequest` | record | ShiftDate, ShiftName, CarId, VolunteerId, LocationId?, CustomLocationName?, CustomLocationNavigation? | `:2227-2228` |
| `UpdateShiftGroupRequest` | record | Date, OldShiftName, OldCarId, NewShiftName, NewCarId, LocationId?, CustomLocationName?, CustomLocationNavigation? | `:2229-2230` |
| `ShiftWithVolunteerDto` | record | Id, ShiftDate, ShiftName, CarId, VolunteerId?, VolunteerName, VolunteerPhone?, VolunteerApproved, IsUnresolved, LocationId?, LocationName?, LocationNavigation?, LocationCity? | `:2231-2233` |
| `DateShiftInfo` | record | Date, HasUnresolved | `:2234` |
| `DeleteShiftGroupRequest` | record | Date, ShiftName, CarId, SendNotifications | `:2235` |
| `DeleteGroupResult` | record | DeletedCount, SmsSentCount, SmsFailedCount | `:2236` |
| `CancelShiftRequest` | record | SendNotification | `:2237` |
| `CancelShiftGroupRequest` | record | Date, ShiftName, CarId, SendNotifications | `:2238` |
| `CancelGroupResult` | record | CanceledCount, SmsSentCount, SmsFailedCount | `:2239` |
| `LocationRequest` | record | Name, Address?, City?, Navigation? | `:2242` |
| `UpdateGroupLocationRequest` | record | Date, ShiftName, CarId, LocationId?, CustomLocationName?, CustomLocationNavigation? | `:2243-2244` |
| `SendLocationUpdateRequest` | record | Date, ShiftName, CarId | `:2245` |
| `JewishHolidayRequest` | record | Date, Name | `:2657` |
| `LocationRequest` | record | Name, Address?, City?, Navigation?, **`Type = null`** (Vehicle\|General; null ⇒ default-on-POST / preserve-on-PUT) | `:2650` |
| `CreateAdminShiftRequest` | record | Description, Date, ShiftTime, Address?, VehicleLocation?, CarId?, LocationId?, CustomLocationName?, CustomLocationNavigation?, VehicleLocationId?, VolunteerIds[], SendSms | `:2662-2668` |
| `UpdateAdminShiftGroupRequest` | record | Date, OldShiftTime, OldDescription, NewDescription, NewShiftTime, + the same optional location/vehicle fields | `:2670-2676` |
| `CancelAdminShiftGroupRequest` | record | Date, ShiftTime, Description | `:2678` |
| `AdminSchedulerConfigUpdateDto` | record | Time, IsEnabled, MessageTemplateId (the ONLY editable fields) | `:2681` |
| `AdminTemplatesDto` / `AdminTemplatesUpdateDto` | record | AssignmentTemplateId?, TodayTemplateId? / non-null pair | `:2684-2685` |
| `AdminSendHelpers` | static class | `ResolveAdminTemplateAsync(db, appSettingKey)` (AppSettings value → template, null if unset/non-numeric/missing) + `NormalizeShiftTime(raw)` (zero-pad to `HH:mm`, falls back to the trimmed input) | `:2688-2718` |

Also: anonymous-object DTOs are constructed inline for `GET /api/volunteers` (`:285-293`) and users (`:1530-1541`), deliberately omitting sensitive fields (PasswordHash, InternalIdHash, refresh-token fields). `ApiResponse<T>` shape (from server.md): `{ success, data, message }`. [HIGH]

---

## 6. Integration Points

| ID | Name | Type | Direction | Target | Source |
|---|---|---|---|---|---|
| IP-api:001 | REST API (React client) | HTTP/JSON | inbound | browser SPA (`web/client`) / Android Ktor mirror | all `app.Map*` endpoints |
| IP-api:002 | `MagavDbManager` (scoped) | DI call | outbound | `Magav.Server` repositories → SQLCipher DB | `Program.cs:75-80` + every handler param |
| IP-api:003 | `AuthService` (scoped) | DI call | outbound | `Magav.Server` JWT/login/lockout | `Program.cs:81-86,170,190,210` |
| IP-api:004 | `ISmsProvider` (InforUMobile, HttpClient) | DI call → HTTP | outbound | InforUMobile XML API (`InforUMobile:BaseUrl`, 30s timeout) | `Program.cs:89-93,785,871,944,1063` |
| IP-api:005 | `SmsReminderService` (scoped) | DI call | outbound | `Magav.Server` SMS build/send/log | `Program.cs:96,1341-1342`; static `BuildMessage`/`BuildLocationText` used inline (`:836,906,996,1115,1124`) |
| IP-api:006 | `SmsSchedulerService` + `ShiftCleanupService` | hosted services | n/a | background (registered, not invoked by handlers) | `Program.cs:97-98` |
| IP-api:007 | `DbInitializer` (singleton) | DI call | outbound | DB create/migrate/seed at startup | `Program.cs:74,147-148` |
| IP-api:008 | `VolunteersImportService` / `ShiftsImportService` | direct `new` | outbound | Excel parsing in `Magav.Server` | `Program.cs:351,663` |
| IP-api:009 | `IConfiguration` (appsettings) | config | inbound | `Jwt:*`, `AllowedOrigins`, `Security:*`, `InforUMobile:*`, `PublicPages:SmsApprovalAccessKey`, `Database:*`, `Kestrel:*` | `Program.cs:22,25,91,255,1371,1439,1615,1706` |
| IP-api:010 | Public SMS-approval surface | HTTP/JSON (no auth) | inbound | volunteers via `/sms-approval/:accessKey` page | `Program.cs:1360,1428` |

---

## 7. User Roles & Access

- **Roles** (case-sensitive strings, validated at create/update): `Admin`, `SystemManager`, `User` (`Program.cs:1611,1686`). Client receives `roles[]` array (server stores single `User.Role`; wrapping done in `AuthService`, see server.md BR-server:014). [HIGH]
- **Authorization policies** (`Program.cs:61-71`):
  - `AdminOnly` (Admin) → all `/api/users/*` (`:1551,1582,1650,1732,1771`), scheduler config PUT bulk + single (`:1963,2004`), message-template POST/PUT/DELETE (`:2076,2110,2138`).
  - `CanManageMessages` (Admin + SystemManager) → volunteers GET + revoke, locations CRUD, holidays CRUD, all shift read/write/cancel/send-SMS, sms-log GET + summary, scheduler config GET, run-log GET, message-templates GET (numerous `.RequireAuthorization("CanManageMessages")` sites).
  - `CanImportVolunteers` (Admin + SystemManager) → `POST /api/volunteers/import` (`:362`), `POST /api/shifts/import` (`:676`).
- **JWT config** (`Jwt` section, `Program.cs:45-59`): HMAC-SHA256 over `Jwt:SecretKey`; validates issuer/audience/lifetime/key; `ClockSkew=0`. Access-token 15 min, refresh 7 days (config keys `AccessTokenExpirationMinutes`/`RefreshTokenExpirationDays`; issuance in `AuthService`). **Since `2989b01`, `Jwt:SecretKey`/`Issuer`/`Audience` are externalized (env/user-secrets) and a startup guard (`Program.cs:26-34`) throws if any is empty** — fail-loud rather than failing at first token validation (ADR-017). The refresh TTL (7d) intentionally diverges from the Android mirror (3d) — accepted (`tools/parity.md` #1).
- **Lockout** (`Security` section): `MaxFailedLoginAttempts=5`, `LockoutMinutes=15`, `BcryptWorkFactor=12` — enforced in `AuthService`; `BcryptWorkFactor` also read at endpoint level for password hashing (`Program.cs:255,1615,1706`). [HIGH]

---

## 8. Interfaces Exposed (REST contract — mirrored by React client + Android Ktor server)

| Group | Endpoints | Auth |
|---|---|---|
| Auth | `POST /api/auth/login`, `POST /api/auth/refresh` | public |
| Auth | `POST /api/auth/logout`, `POST /api/auth/change-password` | authenticated |
| Health | `GET /api/health` | public |
| Public SMS-approval | `POST /api/public/sms-approval/{accessKey}/verify`, `.../submit` | public + rate-limited (3/5min) + access-key |
| Volunteers | `GET /api/volunteers`, `POST /api/volunteers/revoke-sms-approval` | CanManageMessages |
| Volunteers | `POST /api/volunteers/import` | CanImportVolunteers |
| Shifts | `POST /api/shifts/import` | CanImportVolunteers |
| Shifts | `GET /api/shifts/by-date`, `GET /api/shifts/dates-with-shifts`, `GET /api/shifts/canceled`, `POST /api/shifts`, `PUT /api/shifts/update-group`, `PUT /api/shifts/update-group-location`, `DELETE /api/shifts/{id}`, `POST /api/shifts/delete-group`, `POST /api/shifts/{id}/cancel`, `POST /api/shifts/cancel-group`, `POST /api/shifts/{id}/send-sms`, `POST /api/shifts/send-location-update` | CanManageMessages |
| Locations | `GET /api/locations`, `GET /api/locations/{id}`, `POST/PUT/DELETE /api/locations[/{id}]` | CanManageMessages |
| Jewish Holidays | `GET/POST /api/jewish-holidays`, `PUT/DELETE /api/jewish-holidays/{id}` | CanManageMessages |
| SMS Log | `GET /api/sms-log`, `GET /api/sms-log/summary` | CanManageMessages |
| Scheduler | `GET /api/scheduler/config`, `GET /api/scheduler/run-log` | CanManageMessages |
| Scheduler | `PUT /api/scheduler/config`, `PUT /api/scheduler/config/{id}` | AdminOnly |
| Message Templates | `GET /api/message-templates` | CanManageMessages |
| Message Templates | `POST /api/message-templates`, `PUT/DELETE /api/message-templates/{id}` | AdminOnly |
| Users | `GET/POST /api/users`, `GET/PUT/DELETE /api/users/{id}` | AdminOnly |
| **Administrative shifts** | `GET /api/shifts/administrative/by-week`, `POST /api/shifts/administrative`, `PUT /api/shifts/administrative/update-group`, `POST /api/shifts/administrative/cancel-group`, `POST /api/shifts/administrative/{id}/send-sms` | CanManageMessages |
| **Admin scheduler** | `GET /api/admin-scheduler/config` · `GET /api/admin-settings/templates` | CanManageMessages |
| **Admin scheduler** | `PUT /api/admin-scheduler/config` · `PUT /api/admin-settings/templates` | AdminOnly |

All responses wrapped in `ApiResponse<T>` (`success`/`data`/`message`); errors are generic Hebrew + appropriate status code. [HIGH]

**Contract-mirror status of the 2026-07-14 additions:** unlike `/api/settings/sms-sim` and `/api/callback-config` (Android-only by design), **all 9 new endpoints above are implemented on BOTH backends** — the Android twins live in `android/.../api/routes/AdminShiftRoutes.kt` and `AdminSchedulerRoutes.kt`. They are ordinary members of the triplicated contract (ISS-004), not a new accepted divergence. [HIGH]

---

## 9. Interfaces Consumed

| External component | What imported | Import location |
|---|---|---|
| `Magav.Server.Database` | `MagavDbManager` (scoped facade over repositories), `DbInitializer` | `Program.cs:9,74-80,147` |
| `Magav.Server.Services` | `AuthService`, `ShiftCleanupService`, `ShiftsImportService`/`VolunteersImportService`, `AuthException`, `LoginResponse`, `JwtSettings`, `SecuritySettings`, `ApiResponse<T>` | `Program.cs:10,81-86,98,351,663` |
| `Magav.Server.Services.Sms` | `ISmsProvider`, `InforUMobileSmsProvider`, `SmsReminderService`, `SmsSchedulerService`, `ShiftVolunteerDto` | `Program.cs:11,89-97,824,1341` |
| `Magav.Common` | `MagavConstants` (`ReminderTypes`, `SmsStatuses`) | `Program.cs:5,913,1129,1866` |
| `Magav.Common.Database` | `DbHelper` (`CreateSqliteDbHelper`) | `Program.cs:6,78` |
| `Magav.Common.Models` | `Location`, `Shift`, `SmsLog`, `User`, `MessageTemplate`, `SchedulerConfig`, `SchedulerRunLog`, `JewishHoliday`, `ImportResult`, `CanceledShiftRow` | `Program.cs:7,418,1188,1617 etc.` |
| `Magav.Common.Models.Auth` | auth model types | `Program.cs:8` |
| `BCrypt.Net` | `BCrypt.HashPassword` for create/change/update password | `Program.cs:256,1621,1707` |
| `Microsoft.AspNetCore.Authentication.JwtBearer` / `Microsoft.IdentityModel.Tokens` | bearer scheme + `TokenValidationParameters` | `Program.cs:12,14,45-59` |
| `Microsoft.AspNetCore.RateLimiting` | fixed-window limiter | `Program.cs:13,101-118` |
| `System.IdentityModel.Tokens.Jwt` / `System.Security.Claims` | claim names for user-id/username extraction | `Program.cs:1,2,215,1937` |

---

## 10. Legacy Warnings

- **God object (grew 21%):** `Program.cs` = **2718 LOC** (was 2249) — every endpoint (**56**), all DI, middleware, auth/policy config, and all request/response DTOs in one file. No endpoint modularization (no route groups / extension methods). High change-collision risk; hard to navigate. The administrative-shifts feature added 9 endpoints + 7 DTO records + a helper class straight into it rather than extracting a route group. [HIGH]
- **Admin create is non-transactional and can partially succeed.** `POST /api/shifts/administrative` inserts one `Shift` per volunteer inside a loop, and returns `404 "מתנדב {id} לא נמצא"` the moment a volunteer id doesn't resolve — leaving the rows created for the *earlier* ids in the DB (`Program.cs:1460-1487`). The blast radius is limited because the dup-volunteer guard (BR-api:019) makes a retry idempotent, and the Android mirror behaves identically (`AdminShiftRoutes.kt:204-231`), so it is a consistent design rather than cross-platform drift. Still: a caller reading the 404 has no signal that a partial group now exists. [HIGH]
- **The admin template roles are referenced from `AppSettings`, which the template-delete guard does not check** — see ISS-011. `MessageTemplateRepository.IsInUseAsync` counts only `SchedulerConfig.MessageTemplateId` rows (`Database/Repositories/MessageTemplateRepository.cs:13-18`), so the assignment/today templates are deletable while in use. [HIGH]
- **✅ RESOLVED 2026-06-19 (`2989b01`) — secrets externalized out of tracked `appsettings.json`:** `Jwt:SecretKey`, `Database:Password`, and the `PublicPages:SmsApprovalAccessKey` block were **removed** from the tracked file → supplied via environment variables in prod / .NET user-secrets in dev (`<UserSecretsId>` added to `Magav.Api.csproj`; `appsettings.Development.json` gitignored). A **fail-loud startup guard** (`Program.cs:26-34`) throws if `Jwt:SecretKey`/`Issuer`/`Audience` resolve empty. (ISS-007, appsettings half resolved — ADR-017.) ⚠️ The *separate* hardcoded `MagavConstants.PasswordKey` in `common` still persists (ISS-007 stays open; see common.md §10). (`web/server/Magav.Api/appsettings.json`, `Program.cs:26-34`, `Magav.Api.csproj`)
- **✅ RESOLVED 2026-06-19 (`2989b01`) — error-handling pattern:** login/refresh/logout and the volunteers-import 500-path no longer use `Results.Problem(...)` — all converted to `Results.Json(ApiResponse<T>.Fail("<Hebrew>"), 500)`. Zero `Results.Problem` remain; messages are Hebrew. (ISS-005 resolved)
- **Authorization audit — all mutating/sensitive endpoints ARE protected.** Every data-mutating or data-exposing endpoint carries `.RequireAuthorization(...)`. The only no-auth endpoints are the four intentionally-public ones (login, refresh, health, sms-approval verify/submit), and the public sms-approval pair is additionally gated by access-key + 3/5min rate limit. **No endpoint was found that mutates data or exposes sensitive info while missing `.RequireAuthorization()`.** [HIGH]
  - Note: `POST /api/auth/logout` reads JWT claims but is correctly behind `.RequireAuthorization()` (`:230`) so an unauthenticated caller can't invoke it.
- **`launchSettings.json` is stale/scaffold:** profiles still reference the ASP.NET template `launchUrl: "weatherforecast"` and ports `5228/7207/2811` that do NOT match the real Kestrel binding `http://localhost:5015` (`appsettings.json:32-36`) documented in CLAUDE.md. Running via a `launchSettings` profile would bind the wrong port and a 404 launch URL. [HIGH] (`Properties/launchSettings.json:14,17,27`)
- **CORS `AllowCredentials` + `AllowAnyHeader`/`AllowAnyMethod`:** permissive on headers/methods, but origins ARE restricted to the configured allow-list (not `*`), which is required when `AllowCredentials` is set. Default fallback origin is `http://localhost:8080`. Production must supply real origins via `AllowedOrigins`; an over-broad production list would be a CSRF/exfiltration risk. [MEDIUM] (`Program.cs:25-42`)
- **TODO/FIXME/HACK markers:** 0 found in `Program.cs` (grep). [HIGH]
- **Missing tests:** none (project-wide, per CLAUDE.md). [HIGH]
- **Magic template IDs hardcoded:** cancellation/notification logic hardcodes message-template id `3` (`:808,891,968`) and same-day/advance ids `1`/`2` (`:1096,1117,1129`). Brittle if seed ids change. [MEDIUM]
- **Inline service instantiation:** `VolunteersImportService`/`ShiftsImportService` are `new`-ed directly in handlers (`:351,663`) and `SmsReminderService` is `new`-ed in `send-location-update` (`:1341`) rather than DI-resolved, despite `SmsReminderService` being registered scoped (`:96`) — inconsistent DI usage. [MEDIUM]

---

## 11. Design Rationale

| Pattern | Location | Rationale | Evidence | Certainty |
|---|---|---|---|---|
| Single-file Minimal API | `Program.cs` (whole) | Small team, mirrors Android Ktor's flat route surface; minimal ceremony for ~50 endpoints | all endpoints inline; DTOs as records at bottom | HIGH |
| `ApiResponse<T>` over `Results.Problem` | most catch blocks (`:299-302` etc.) | Uniform `{success,data,message}` contract for the client; avoids `Results.Problem` leaking exception detail in dev (CLAUDE.md) | generic Hebrew Fail + 500; full `ex` only to `Console.Error` | HIGH |
| File-upload defense-in-depth | `:312-348,624-660` | Layered: custom-header CSRF (forms can't set `X-Requested-With`), extension allow-list, magic-byte signature, size cap, in-memory processing (never touch disk) — defeats content-type spoofing + path attacks | five sequential validations + `.DisableAntiforgery()` | HIGH |
| Access-key public pages vs JWT | `:1371-1378,1439-1445` | Volunteers self-serve SMS consent without accounts; a shared secret key + generic errors (no enumeration oracle) + IP logging without PII keeps it lightweight yet not anonymous-open | key compare + uniform error messages | HIGH |
| Rate limiting only on public endpoints | `:111-117,1425,1509` | Public, unauthenticated approval surface is the abuse vector; 3/5min fixed window throttles brute-force of internal-ids while authenticated endpoints rely on JWT | limiter scoped to `sms-approval` tag only | HIGH |
| Server-owned scheduler `ReminderType`/`DayGroup` | `:1965-1993` | These define SMS semantics; letting the client set them via body would let a misbehaving client break send logic — route id is authoritative, body fields ignored | comment + read from stored row | HIGH |
| Exact id-set match for bulk scheduler save | `:1911-1919` | Replaces a hardcoded "6 configs" count so adding/removing a config row never silently breaks saving (ties to MEMORY scheduler-config-seeding gotcha) | `SetEquals` + count check, explanatory comment | HIGH |
| `ClockSkew = TimeSpan.Zero` | `:57` | Tight token-lifetime enforcement (no default 5-min grace) — short 15-min access tokens expire exactly on time | explicit zero skew | MEDIUM |
| Soft-cancel + cascade hard-delete on purge | `:870-940,760-781` | Cancel preserves audit trail (`IsCanceled`/`CanceledAt`); explicit hard-delete cascades `SmsLog` to avoid orphans (CLAUDE.md soft-cancel convention) | UPDATE vs DELETE + `DELETE FROM SmsLog` | HIGH |

---

### Summary
- **Business rules:** 24 (BR-api:001–024; 017–024 added 2026-08-17 for the administrative endpoints, typed locations, scheduler isolation and the operational-only SMS-log reporting). **Workflows:** 9 (WF-api:001–009, unchanged in shape). **Integration points:** 10 (IP-api:001–010, unchanged).
- **Authorization audit re-run 2026-08-17 and still CLEAN.** `Program.cs` declares **56** `app.Map*` endpoints and **51** `.RequireAuthorization(...)` calls; the difference of 5 is exactly the intentionally-public set — `POST /api/auth/login` (`:180`), `POST /api/auth/refresh` (`:202`), `GET /api/health` (`:290`), and the access-key + rate-limited `POST /api/public/sms-approval/{accessKey}/{verify,submit}` pair (`:1764`, `:1832`). **All 9 new administrative endpoints carry a policy** (7 × `CanManageMessages`, 2 × `AdminOnly`). [HIGH — counted]
- **Standing concern:** the god-object `Program.cs`, now 2718 LOC. The residual secret risk (the hardcoded `MagavConstants.PasswordKey`) still lives in `common`, not here (ISS-007 open).
- **2026-06-24 `--update`:** the two former top concerns were remediated in `2989b01` — `appsettings.json` secrets externalized + fail-loud JWT guard (ADR-017; ISS-007 appsettings half), and the `Results.Problem` error-pattern deviation converted to `ApiResponse.Fail`/Hebrew (ISS-005). The standing api concern is now the **god-object `Program.cs` (~2250 LOC)**; the residual secret risk (the hardcoded `MagavConstants.PasswordKey`) lives in `common`, not here (ISS-007 open).
