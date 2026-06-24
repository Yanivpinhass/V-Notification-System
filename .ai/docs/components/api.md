<!-- DeepInit Extract | Component: api
Run ID: deepinit-2026-06-18 · Updated: deepinit-2026-06-24 (incremental --update over commit 2989b01: secrets externalized + JWT startup guard [ISS-007 appsettings half / ADR-017], Results.Problem→ApiResponse.Fail [ISS-005]) — note: appsettings.Development.json in the input list below was deleted/gitignored
Input files processed: web/server/Magav.Api/Program.cs, web/server/Magav.Api/appsettings.json, web/server/Magav.Api/appsettings.Development.json, web/server/Magav.Api/Properties/launchSettings.json
Generated: 2026-06-18 -->

# Component: api (`web/server/Magav.Api/`)

## 1. Component Overview

**Purpose:** The ASP.NET 8 Minimal-API entry point and HTTP surface of the Magav web backend. A single `Program.cs` (2249 LOC) wires up configuration, DI, middleware, CORS, JWT bearer auth, authorization policies, rate limiting, and defines **every** REST endpoint (auth, users, volunteers, shifts, locations, holidays, scheduler config, message templates, SMS log, public SMS-approval, health). It is the top layer: depends on `Magav.Server` (services/repositories/scheduler) and `Magav.Common` (models/`ApiResponse`/`MagavConstants`). [HIGH] (`web/server/Magav.Api/Program.cs:5-14`)

**Tech stack:** .NET 8 Minimal APIs (`WebApplication.CreateBuilder`, `app.MapGet/MapPost/MapPut/MapDelete`); `Microsoft.AspNetCore.Authentication.JwtBearer`; `Microsoft.AspNetCore.RateLimiting`; `Microsoft.IdentityModel.Tokens`; `BCrypt.Net` (password hashing at endpoint level); `System.Text.RegularExpressions` (input validation). Excel import via `Magav.Server` services. [HIGH] (`Program.cs:1-14`)

**Entry point:** `web/server/Magav.Api/Program.cs` — top-level statements; `app.Run()` at `Program.cs:2150`. Request/response DTO records declared after `app.Run()` (`Program.cs:2152-2249`). [HIGH]

**Complexity:** **Complex — god object.** All ~50 endpoints + DI + middleware + DTOs live in one 2249-line file (see §10). [HIGH]

**Certainty:** [HIGH] — `Program.cs` read in full; both appsettings files and `launchSettings.json` read; git-tracking of config confirmed.

---

## 2. Features & Capabilities

Endpoint groups (method + representative path → source line, certainty all [HIGH] unless noted):

**Auth** (`Program.cs:166-274`)
- `POST /api/auth/login` (`:170`) — public; `AuthService.LoginAsync`.
- `POST /api/auth/refresh` (`:190`) — public; rotates tokens.
- `POST /api/auth/logout` (`:210`) — `.RequireAuthorization()`; clears refresh token from JWT `sub`/`NameIdentifier` claim.
- `POST /api/auth/change-password` (`:233`) — `.RequireAuthorization()`; validates new password (≥6 chars, 1 letter + 1 digit), BCrypt-hashes via `Security:BcryptWorkFactor`.
- `GET /api/health` (`:274`) — public; returns `{status, timestamp}`.

**Volunteers** (`Program.cs:280-363`, `1777-1805`)
- `GET /api/volunteers` (`:280`) — `CanManageMessages`; projects DTO (no internal-id hash).
- `POST /api/volunteers/import` (`:305`) — `CanImportVolunteers` + `.DisableAntiforgery()`; Excel upload (full validation pattern, §3 WF-api:006); delegates to `VolunteersImportService`.
- `POST /api/volunteers/revoke-sms-approval` (`:1777`) — `CanManageMessages`; validates internal-id regex `^[0-9]{1,8}$`.

**Shifts** (`Program.cs:617-1353`)
- `POST /api/shifts/import` (`:617`) — `CanImportVolunteers` + `.DisableAntiforgery()`; Excel upload; `ShiftsImportService`.
- `GET /api/shifts/by-date?date=` (`:680`), `GET /api/shifts/dates-with-shifts?from=&to=` (`:729`) — `CanManageMessages`.
- `POST /api/shifts` create (`:1163`), `PUT /api/shifts/update-group` (`:1236`), `PUT /api/shifts/update-group-location` (`:1302`) — `CanManageMessages`.
- `DELETE /api/shifts/{id}` (`:760`) — hard-delete + cascade SmsLog delete; `CanManageMessages`.
- `POST /api/shifts/delete-group` (`:784`) — hard-delete a group, optional cancel SMS (template 3); `CanManageMessages`.
- `POST /api/shifts/{id}/cancel` (`:870`) — **soft-cancel** single (sets `IsCanceled=1`,`CanceledAt`); optional SMS; `CanManageMessages`.
- `POST /api/shifts/cancel-group` (`:943`) — **soft-cancel** team for Date+ShiftName+CarId (only `IsCanceled=0` rows); optional SMS; `CanManageMessages`.
- `GET /api/shifts/canceled?month=YYYY-MM` (`:1034`) — lists `IsCanceled=1`; `CanManageMessages`.
- `POST /api/shifts/{id}/send-sms` (`:1062`) — manual SMS; auto-picks template 1 (same-day, +location) or 2 (advance) by Israel-local date; `CanManageMessages`.
- `POST /api/shifts/send-location-update` (`:1332`) — `SmsReminderService.SendLocationUpdateAsync`; `CanManageMessages`.

**Locations** (`Program.cs:370-496`) — `GET` list (`:370`), `GET /{id}` (`:387`), `POST` (`:406`), `PUT /{id}` (`:441`), `DELETE /{id}` (`:475`, blocked if referenced by future shifts). All `CanManageMessages`.

**Jewish Holidays** (`Program.cs:509-611`) — `GET` (`:509`), `POST` (`:526`), `PUT /{id}` (`:559`), `DELETE /{id}` (`:593`). Date validated `^\d{4}-\d{2}-\d{2}$`. All `CanManageMessages`.

**Users** (`Program.cs:1525-1771`) — `GET` list (`:1525`), `GET /{id}` (`:1554`), `POST` create (`:1585`), `PUT /{id}` (`:1653`), `DELETE /{id}` (`:1735`). All `AdminOnly`. Self-protection rules (§4).

**SMS Log** (`Program.cs:1812-1877`) — `GET /api/sms-log?days=` (`:1812`), `GET /api/sms-log/summary?days=` (`:1844`); lookback clamped 1–90 days; raw parameterized SQL. `CanManageMessages`.

**Scheduler Config** (`Program.cs:1884-2021`) — `GET /api/scheduler/config` (`:1884`, `CanManageMessages`); `PUT /api/scheduler/config` bulk (`:1901`, `AdminOnly`); `PUT /api/scheduler/config/{id}` single (`:1968`, `AdminOnly`); `GET /api/scheduler/run-log` (`:2007`, `CanManageMessages`).

**Message Templates** (`Program.cs:2028-2138`) — `GET` (`:2028`, `CanManageMessages`); `POST` (`:2045`), `PUT /{id}` (`:2079`), `DELETE /{id}` (`:2113`) all `AdminOnly`. Content must contain `{שם}` and `{תאריך}`, ≤500 chars; cannot delete last template or an in-use template.

**Public SMS-approval** (`Program.cs:1360-1509`) — `POST /api/public/sms-approval/{accessKey}/verify` (`:1360`), `POST /api/public/sms-approval/{accessKey}/submit` (`:1428`). No auth; `.RequireRateLimiting("sms-approval")`; access-key validated against `PublicPages:SmsApprovalAccessKey`.

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
| `JewishHolidayRequest` | record | Date, Name | `:2248` |

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

All responses wrapped in `ApiResponse<T>` (`success`/`data`/`message`); errors are generic Hebrew + appropriate status code. [HIGH]

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

- **God object:** `Program.cs` = **2249 LOC** — every endpoint (~50), all DI, middleware, auth/policy config, and all request/response DTOs in one file. No endpoint modularization (no route groups / extension methods). High change-collision risk; hard to navigate. [HIGH]
- **✅ RESOLVED 2026-06-19 (`2989b01`) — secrets externalized out of tracked `appsettings.json`:** `Jwt:SecretKey`, `Database:Password`, and the `PublicPages:SmsApprovalAccessKey` block were **removed** from the tracked file → supplied via environment variables in prod / .NET user-secrets in dev (`<UserSecretsId>` added to `Magav.Api.csproj`; `appsettings.Development.json` gitignored). A **fail-loud startup guard** (`Program.cs:26-34`) throws if `Jwt:SecretKey`/`Issuer`/`Audience` resolve empty. (ISS-007, appsettings half resolved — ADR-017.) ⚠️ The *separate* hardcoded `MagavConstants.PasswordKey` in `common` still persists (ISS-007 stays open; see common.md §10). (`web/server/Magav.Api/appsettings.json`, `Program.cs:26-34`, `Magav.Api.csproj`)
- **✅ RESOLVED 2026-06-19 (`2989b01`) — error-handling pattern:** login/refresh/logout and the volunteers-import 500-path no longer use `Results.Problem(...)` — all converted to `Results.Json(ApiResponse<T>.Fail("<Hebrew>"), 500)`. Zero `Results.Problem` remain; messages are Hebrew. (ISS-005 resolved)
- **Authorization audit — all mutating/sensitive endpoints ARE protected.** Every data-mutating or data-exposing endpoint carries `.RequireAuthorization(...)`. The only no-auth endpoints are the four intentionally-public ones (login, refresh, health, sms-approval verify/submit), and the public sms-approval pair is additionally gated by access-key + 3/5min rate limit. **No endpoint was found that mutates data or exposes sensitive info while missing `.RequireAuthorization()`.** [HIGH]
  - Note: `POST /api/auth/logout` reads JWT claims but is correctly behind `.RequireAuthorization()` (`:230`) so an unauthenticated caller can't invoke it.
- **`launchSettings.json` is stale/scaffold:** profiles still reference the ASP.NET template `launchUrl: "weatherforecast"` and ports `5228/7207/2811` that do NOT match the real Kestrel binding `http://localhost:5015` (`appsettings.json:37-43`) documented in CLAUDE.md. Running via a `launchSettings` profile would bind the wrong port and a 404 launch URL. [HIGH] (`Properties/launchSettings.json:14,17,27`)
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
- **Business rules:** 16 (BR-api:001–016). **Workflows:** 9 (WF-api:001–009). **Integration points:** 10 (IP-api:001–010).
- Authorization audit is CLEAN — no data-mutating/sensitive endpoint lacks `.RequireAuthorization()`; the only public endpoints are login, refresh, health, and the access-key + rate-limited sms-approval pair.
- **2026-06-24 `--update`:** the two former top concerns were remediated in `2989b01` — `appsettings.json` secrets externalized + fail-loud JWT guard (ADR-017; ISS-007 appsettings half), and the `Results.Problem` error-pattern deviation converted to `ApiResponse.Fail`/Hebrew (ISS-005). The standing api concern is now the **god-object `Program.cs` (~2250 LOC)**; the residual secret risk (the hardcoded `MagavConstants.PasswordKey`) lives in `common`, not here (ISS-007 open).
