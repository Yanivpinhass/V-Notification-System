<!-- DeepInit Horizontal | Component: system-wide
Run ID: deepinit-2026-06-18 · Updated: deepinit-2026-06-24 (incremental --update over commit 2989b01; UC-006 route wired, WA-008 dedup tightened)
Input files processed: the 5 component docs + discovery.md
Generated: 2026-06-18 -->

# Functional Workflows — Magav V-Notification-System

System-wide use cases, the feature→component map, end-to-end cross-component traces, user stories, and load-bearing workarounds. Where a workflow differs between the .NET web backend and the Android on-device backend, both variants are given. Citations are `file:line`; certainty `[HIGH]`/`[MEDIUM]`/`[LOW]`.

---

## 1. Use Cases (`UC-NNN`)

### UC-001 — Admin imports a shift schedule (Excel)
- **Actor:** Admin or SystemManager (policy `CanImportVolunteers`). [HIGH]
- **Goal:** Load a month of patrol shifts from an `.xlsx` schedule into the system.
- **Preconditions:** Authenticated; volunteers already imported (so name-matching can resolve). File is a real xlsx/xls ≤10MB.
- **Main flow:** Upload via the import page → CSRF + extension + magic-byte + size validation → parser reads all sheets, finds weekly date rows + 6-row team blocks → match each volunteer name to a `Volunteer` by trimmed/lowercased `MappingName` → unresolved names become shifts with `VolunteerId=null` + `VolunteerName` → DELETE all existing shifts in `[minDate,maxDate]` → bulk-insert the new shifts → return `ImportResult` (inserted/updated/errors/unresolved). [HIGH] (`web/server/Magav.Api/Program.cs:617-677`; `web/server/Magav.Server/Services/ShiftsImportService.cs:9-114`; Android `api/routes/ShiftRoutes.kt:694-767`, `service/ShiftsImportService.kt:88-93`)
- **Alternates:** No future shifts → Hebrew "לא נמצאו משמרות עתידיות"; parse failure → "שגיאה בקריאת הקובץ"; DB error mid-import → partial loss (delete+insert not transactional — DR-015). Magic-byte/extension/CSRF failure → 400. [HIGH]

### UC-002 — Admin manages volunteers
- **Actor:** Admin/SystemManager (`CanManageMessages` for list/revoke; `CanImportVolunteers` for import). [HIGH]
- **Goal:** Maintain the volunteer roster + SMS-consent state.
- **Preconditions:** Authenticated.
- **Main flow:** List volunteers (DTO omits `InternalIdHash`); import from a 3-column Excel (InternalId/Name/Phone, ≤10000 rows) → per-row validate + sanitize phone (digits-only, leading `0`) → `UpsertByInternalIdAsync` (updates only MappingName+MobilePhone on existing rows); admin may revoke a volunteer's SMS approval (`POST /api/volunteers/revoke-sms-approval`, internal-id regex `^[0-9]{1,8}$`). [HIGH] (`Program.cs:280-363,1777-1805`; `Services/VolunteersImportService.cs:12-100`; `Database/Repositories/VolunteersRepository.cs:55-103`)
- **Alternates:** >10000 rows rejected (DoS guard); per-row error collected, import continues (no transaction). [HIGH]

### UC-003 — The scheduler sends SMS reminders (background)
- **Actor:** System (background scheduler) — no human in the loop. [HIGH]
- **Goal:** Send the right reminder to eligible volunteers at the configured time.
- **Preconditions:** ≥1 enabled `SchedulerConfig`; its `Time` matches Israel-local now; eligible shifts exist; volunteers approved + have phones.
- **Main flow (web):** `SmsSchedulerService` polls every 60s → compute effective holiday-aware day-group of "now" → for each enabled config where `DayGroup==effectiveGroup` AND `Time==HH:mm` → compute window + runLogTargetDate → `SmsReminderService.ExecuteAsync` → query eligible shifts (active, approved, phoned, not-already-sent) → build message from template → send via `ISmsProvider` → log `SmsLog` + `SchedulerRunLog`. [HIGH] (`Services/Sms/SmsSchedulerService.cs:29-131`; `Services/Sms/SmsReminderService.cs:24-197`)
- **Main flow (android):** `AlarmScheduler` sets exact alarms for all enabled configs × all 7 weekdays → alarm fires → `SmsAlarmReceiver` enqueues `SmsSchedulerWorker` → worker waits for any active call to end → same day-group gate + window + eligibility → `SmsReminderService.execute()` → native `AndroidSmsProvider.sendSms()` (Mutex-serialized, 500ms inter-SMS) → log → summary notification. [HIGH] (`scheduler/AlarmScheduler.kt:18-81`, `SmsAlarmReceiver.kt:18-38`, `SmsSchedulerWorker.kt:38-134`, `service/SmsReminderService.kt:27-192`)
- **Alternates:** Template missing → write a Failed run-log, return; per-shift exception isolated (logs Fail SmsLog, continues); duplicate run-log → swallowed (already ran, DR-006b); SMS provider failure → recorded as Fail SmsLog, never aborts the run. WeekdayAdvance widens the window (DR-008). [HIGH]

### UC-004 — Admin soft-cancels a shift (+ optional cancellation SMS)
- **Actor:** Admin/SystemManager (`CanManageMessages`). [HIGH]
- **Goal:** Cancel a shift/team while preserving an audit trail and optionally notifying the team.
- **Preconditions:** Authenticated; target shift(s) currently `IsCanceled=0`.
- **Main flow:** Single (`POST /api/shifts/{id}/cancel`) or group (`POST /api/shifts/cancel-group` over Date+ShiftName+CarId, only active rows) → if `SendNotification`, send cancellation SMS first using **template 3** (SMS failure does NOT block the cancel) → set `IsCanceled=1` + `CanceledAt`. Canceled shifts later appear on the canceled-shifts page (`GET /api/shifts/canceled?month=YYYY-MM`), from which they can be permanently hard-deleted (cascade-deletes SmsLog). [HIGH] (`Program.cs:870-1031,760-781`; `ShiftRoutes.kt:242,302,370,163`)
- **Alternates:** Cancel-group matches zero active rows → 0 canceled; SMS send partial → counts returned, cancel still proceeds. [HIGH]

### UC-005 — Admin updates a car location (triggers LocationUpdate SMS)
- **Actor:** Admin/SystemManager (`CanManageMessages`). [HIGH]
- **Goal:** Change a team's parking location and re-notify the team if the same-day reminder already went out.
- **Preconditions:** Authenticated; the team exists.
- **Main flow:** `PUT /api/shifts/update-group-location` sets the new `LocationId` or `CustomLocation*` on all rows of the group → admin triggers `POST /api/shifts/send-location-update` → `SmsReminderService.SendLocationUpdateAsync(date, shiftName, carId)` re-notifies the whole team with the new location text, logged as `ReminderType=LocationUpdate` (NOT deduped — intended to re-send, DR-006a exemption). [HIGH] (`Program.cs:1302-1353`; `Services/Sms/SmsReminderService.cs:252-308`; `ShiftRoutes.kt:817`)
- **Alternates:** Location can't be deleted while referenced by a future shift (`BR-server:020`). [HIGH]

### UC-006 — A volunteer approves/revokes SMS consent via the public page
- **Actor:** Volunteer (unauthenticated; identified by personal/internal id). [HIGH]
- **Goal:** Self-serve opt-in (or opt-out) to receive SMS reminders, without an account.
- **Preconditions:** Volunteer knows the page URL (carries the access key) + their personal id.
- **Main flow (server side — exists):** `POST /api/public/sms-approval/{accessKey}/verify` validates the access key against `PublicPages:SmsApprovalAccessKey` + internal-id regex → returns `already_approved` / `pending_approval` / generic-fail → `POST .../submit` validates name + Israeli mobile regex, normalizes phone, calls `UpdateSmsApprovalAsync` (one-way, refuses re-approval). Rate-limited 3 req / 5 min; IP logged without PII. [HIGH] (`Program.cs:1360-1518`; Android `api/routes/VolunteerRoutes.kt`)
- **Client route — now wired (RESOLVED 2026-06-19, `2989b01`):** `web/client/src/App.tsx:25` registers `<Route path="/sms-approval/:accessKey" element={<VolunteerSmsApprovalPage />} />` (imported at `:8`), so the opt-in flow is reachable from the built SPA; `volunteerSmsService` verify/submit drive it. The orphan `RevokeSmsApprovalPage` (which called a nonexistent `volunteersService.revokeSmsApproval`) was deleted — there is **no revoke flow** (opt-out is admin-mediated, consistent with the one-way server approval). [HIGH] (`web/client/src/App.tsx:8,25` (verified); `web/client/src/pages/VolunteerSmsApprovalPage.tsx`) — ISS-001/002 resolved. NOTE: the access key must now be supplied via env/user-secrets (ADR-017).

### UC-007 — User logs in / session is kept alive (token refresh)
- **Actor:** Any admin-account user. [HIGH]
- **Goal:** Authenticate and stay authenticated across short access-token lifetimes.
- **Preconditions:** Active account, not locked out.
- **Main flow:** Login (BCrypt verify + lockout) → receive access token (15 min) + refresh token (7d web / 3d Android) + user → client stores all three in localStorage and (if embedded) notifies `window.NativeAuth` → on any 401, `BaseApiClient` single-flight-refreshes via `POST /api/auth/refresh` and retries → both tokens rotate. [HIGH] (`Services/AuthService.cs:27-171`; `web/client/src/services/authService.ts:42-122`; `web/client/src/services/api/BaseApiClient.ts:44-68`; Android `service/AuthService.kt:24-103`)
- **Alternates:** ≥5 failed logins → 15-min lockout; inactive account → distinct message; login never reveals whether username or password was wrong; refresh failure → logout + reload to login screen. On Android, a stale (>15 min) session prompts biometric re-auth before silent refresh. [HIGH]

### UC-008 — Admin manages scheduler settings
- **Actor:** Admin to write (`AdminOnly`), Admin/SystemManager to read (`CanManageMessages`). [HIGH]
- **Goal:** Tune when/what reminders are sent without breaking send logic.
- **Main flow:** Read `GET /api/scheduler/config` → per-row toggle/edit in the redesigned per-row UI → save via `PUT /api/scheduler/config/{id}` (single) or bulk `PUT /api/scheduler/config` → server ignores client-supplied `ReminderType`/`DayGroup` (server-owned), validates Time `HH:mm`, IsEnabled∈{0,1}, DaysBeforeShift 0–7 (SameDay⇒0, Advance/WeekdayAdvance⇒≥1), template exists; bulk save requires the submitted id-set to EXACTLY equal the stored set. [HIGH] (`Program.cs:1884-2021,2197-2219`; `web/client/src/pages/SchedulerSettingsPage.tsx:40-122`; Android `api/routes/SchedulerRoutes.kt:64-117`)

---

## 2. Feature → Component Map

| Feature | Collaborating components / classes | Certainty |
|---|---|---|
| **SMS reminder send (web)** | `SchedulerConfig` (DB) → `SmsSchedulerService` (BackgroundService, 60s) → `SmsReminderService` (eligibility query + template build) → `ISmsProvider`/`InforUMobileSmsProvider` (XML HTTP) → `SmsLog` + `SchedulerRunLog` (DB) | HIGH |
| **SMS reminder send (android)** | `SchedulerConfig` (Room) → `AlarmScheduler` (exact alarms ×7 days) → `SmsAlarmReceiver` → `SmsSchedulerWorker` (WorkManager, day-group gate + call-defer) → `SmsReminderService` → `AndroidSmsProvider` (native SmsManager, Mutex) → `SmsLog` + `SchedulerRunLog` | HIGH |
| **Excel shift import** | React import page → `BaseApiClient.postFormData` (XHR + CSRF) → `POST /api/shifts/import` (validation) → `ShiftScheduleParser` (EPPlus/POI) → `ShiftsImportService` (match by MappingName) → `ShiftsRepository`/`ShiftDao` (delete-range + bulk-insert) | HIGH |
| **Login / token refresh** | `AuthScreen` (Zod) → `authService` → `POST /api/auth/login` → `AuthService` (BCrypt + lockout + JWT) → `UsersRepository`/`UserDao` → localStorage + `window.NativeAuth` ↔ Android `SessionManager`/`NativeAuthBridge` (EncryptedSharedPreferences) | HIGH |
| **Soft-cancel + cancellation SMS** | React `ShiftsManagementPage` → `shiftsService.cancelShift`/`cancelShiftGroup` → cancel endpoints → (optional) template-3 SMS via `SmsReminderService`/provider → `Shifts.IsCanceled=1` → `CanceledShiftsPage` → hard-delete (cascade SmsLog) | HIGH |
| **Car location + LocationUpdate** | `LocationsManagementPage` → `locationsService` → Locations CRUD; `ShiftsManagementPage` → `update-group-location` + `send-location-update` → `SmsReminderService.SendLocationUpdateAsync` → SmsLog (`LocationUpdate`) | HIGH |
| **Public SMS approval** | `VolunteerSmsApprovalPage` (route `/sms-approval/:accessKey`, wired in `App.tsx:25`) → `volunteerSmsService` → `POST /api/public/sms-approval/{accessKey}/{verify,submit}` (access-key + rate-limit) → `VolunteersRepository.UpdateSmsApprovalAsync` | HIGH |
| **Holiday-aware day-group** | `JewishHolidays` (DB seed 2025–2035) → `GetEffectiveDayGroupAsync`/`effectiveDayGroupForDate()` → scheduler config gate | HIGH |
| **Monthly cleanup** | `ShiftCleanupService` (web, hourly+guard) / `ShiftCleanupWorker` (android, daily) → hard-delete old Shifts/SmsLog/SchedulerRunLog | HIGH |
| **DB init / migrate / seed** | `DbInitializer` (web, startup) / `DatabaseInitializer` + Room migrations (android) → seed admin/templates/6 configs/holidays | HIGH |

---

## 3. End-to-End Traces (`WF-NNN`)

### WF-001 — Scheduled SMS reminder send (both variants)

**(a) Web variant — BackgroundService**
1. `action: 60s poll tick` → `web/server/Magav.Server/Services/Sms/SmsSchedulerService.cs:33` *(server)*
2. `open DI scope, resolve MagavDbManager + SmsReminderService` → `SmsSchedulerService.cs:63-65` *(server)*
3. `compute Israel-local now + HH:mm; load enabled configs` → `SmsSchedulerService.cs:67-70` → `Database/Repositories/SchedulerConfigRepository.cs:17` *(server)*
4. `resolve holiday-aware effective day-group` → `SmsSchedulerService.cs:73-82,151-165` (queries `JewishHolidaysRepository`) *(server)*
5. `skip config if DayGroup≠effective OR Time≠now; else compute window + runLogTargetDate` → `SmsSchedulerService.cs:95-124` *(server)*
6. `SmsReminderService.ExecuteAsync(config, window, runLogDate)` → `Services/Sms/SmsReminderService.cs:24` *(server)*
7. `eligibility query: Shifts⋈Volunteers⟕Locations, IsCanceled=0, Approved, phone, NOT EXISTS success SmsLog` → `SmsReminderService.cs:46-67` (`ShiftsRepository`/`SmsLogRepository`) *(server→common DbHelper)*
8. `resolve template; per shift BuildMessage(shift.ShiftDate); if SameDay append BuildLocationText` → `SmsReminderService.cs:83-114` *(server)*
9. `_smsProvider.SendSmsAsync(phone,message)` → `Services/Sms/InforUMobileSmsProvider.cs:36` → HTTP POST `SendMessageXml.ashx` *(server→external InforUMobile)*
10. `insert SmsLog Success/Fail; on success UPDATE Shifts.SmsSentAt` → `SmsReminderService.cs:118-141` *(server→common)*
11. `insert SchedulerRunLog (UNIQUE-guarded, dup→null→warn)` → `SmsReminderService.cs:178-197` → `SchedulerRunLogRepository.cs:17-29` *(server→common)*

**(b) Android variant — AlarmManager + Worker**
1. `action: AlarmScheduler schedules exact alarms for enabled configs ×7 weekdays (requestCode=configId*10+dow)` → `scheduler/AlarmScheduler.kt:18-81` *(android)*
2. `alarm fires → SmsAlarmReceiver enqueues unique SmsSchedulerWorker (KEEP), re-schedules alarms` → `scheduler/SmsAlarmReceiver.kt:18-38` *(android)*
3. `worker reads SIM subscriptionId from AppSettings; waitForCallToEnd()` → `scheduler/SmsSchedulerWorker.kt:38-79,165` *(android)*
4. `skip if config disabled OR dayGroup≠effectiveDayGroup (holiday-aware); compute window + runLogDate` → `SmsSchedulerWorker.kt:55-79,230` *(android)*
5. `SmsReminderService.execute(): template + getByDateRange (active) + bulk volunteers/locations/already-sent` → `service/SmsReminderService.kt:27-98` *(android→Room DAOs)*
6. `per shift: eligibility (VolunteerId, approval, phone, not-sent) → build message (SameDay appends location)` → `SmsReminderService.kt:79-118` *(android)*
7. `AndroidSmsProvider.sendSms() — Mutex-serialized, 15s timeout, per-send broadcast` → `sms/AndroidSmsProvider.kt:43-121` *(android→SmsManager)*
8. `insert SmsLog; on success update SmsSentAt; 500ms inter-SMS delay; insert SchedulerRunLog (UNIQUE)` → `SmsReminderService.kt:120-192` *(android→Room)*
9. `worker posts summary notification` → `SmsSchedulerWorker.kt:134` *(android)*

Both variants converge on the SAME domain rules: DR-002/003 (day-group gate), DR-004 (same-day location), DR-006 (two-tier dedup), DR-008 (WeekdayAdvance window), DR-010 (Israel tz). [HIGH]

### WF-002 — Excel shift import (upload → validate → parse → match → insert)
1. `action: user drops .xlsx in import page (client-side ext/size guard)` → `web/client/src/pages/ShiftsImportPage.tsx` (FileDropzone) *(web-client)*
2. `postFormData → XHR with Authorization + X-Requested-With CSRF, 60s timeout` → `web/client/src/services/api/BaseApiClient.ts:178-228` *(web-client)*
3. `POST /api/shifts/import` *(web-client→api)*
4. `validate: CSRF header, file present, ≤10MB, ext .xlsx/.xls, copy to MemoryStream, magic bytes 50 4B / D0 CF` → `web/server/Magav.Api/Program.cs:624-660` *(api)*
5. `ShiftsImportService.ImportFromExcelAsync(memoryStream, db)` → `web/server/Magav.Server/Services/ShiftsImportService.cs:9` *(api→server)*
6. `ShiftScheduleParser.Parse: scan col A for week-date rows (serial Year>1901), 4 teams ×6 rows (name+car+4 vols), cols A–G` → `web/server/Magav.Server/Helpers/ShiftScheduleParser.cs:78-151` *(server→common Excel/EPPlus)*
7. `filter Date≥today; build Volunteer lookup by trimmed MappingName (case-insensitive)` → `ShiftsImportService.cs:34-51` *(server)*
8. `match → Shift{VolunteerId} else unresolved Shift{VolunteerName}; dedup by (Date,ShiftName,VolunteerId,VolunteerName)` → `ShiftsImportService.cs:58-98` *(server)*
9. `DELETE shifts in [minDate,maxDate] then BulkInsertAsync(newShifts)` → `ShiftsImportService.cs:104-114` → `Database/Repositories/ShiftsRepository.cs` + `Magav.Common/Database/DbHelper.cs` (`BulkInsertAsync`) *(server→common)*
10. `return ImportResult (inserted/errors/unresolved)` rendered in the page. *(api→web-client)*
(Android mirror: `ShiftRoutes.kt:694-767` → `ShiftScheduleParser.kt` → `ShiftsImportService.kt:88-93`, identical shape.) [HIGH]

### WF-003 — Login + token refresh
1. `action: submit AuthScreen (Zod loginSchema)` → `web/client/src/components/AuthScreen.tsx:35` *(web-client)*
2. `authService.login → POST /api/auth/login` → `web/client/src/services/authService.ts:42-53` *(web-client→api)*
3. `AuthService.LoginAsync: GetByUserName, lockout check, BCrypt.Verify, IsActive` → `web/server/Magav.Server/Services/AuthService.cs:27-50` *(api→server→common UsersRepository/DbHelper)*
4. `reset attempts + LastConnected; issue HMAC256 access token (15m) + 32-byte refresh token` → `AuthService.cs:53-66` *(server)*
5. `store SHA256(refresh)+expiry(7d) on User; persist` → `AuthService.cs:64-66` *(server→common)*
6. `return LoginResponse {AccessToken, RefreshToken, ExpiresAt, User{roles:[Role]}, MustChangePassword}` → `AuthService.cs:68-81` *(server→api→web-client)*
7. `client stores accessToken/refreshToken/user in localStorage; notify window.NativeAuth.onLoginSuccess` → `authService.ts:69-79` *(web-client; Android `NativeAuthBridge.kt:8` persists to EncryptedSharedPreferences)*
8. `action: later request returns 401 → BaseApiClient single-flight refresh (static refreshPromise)` → `BaseApiClient.ts:50-57` *(web-client)*
9. `authService.refreshToken → POST /api/auth/refresh {refreshToken} + access header` → `authService.ts:88-118` → `AuthService.RefreshTokenAsync` (`AuthService.cs:84-121`: hash lookup, expiry/active check, ROTATE both tokens) *(web-client→api→server)*
10. `rotate all three localStorage values; notify NativeAuth.onTokenRefresh; retry original request` → `authService.ts:115-122`, `BaseApiClient.ts:60-62` *(web-client)*
11. `refresh failure → authService.logout() clears localStorage; BaseApiClient reloads to login` → `authService.ts:127`, `BaseApiClient.ts:63-68` *(web-client)*
(Android adds: stale-session biometric prompt before silent refresh — `MainActivity.handleSessionAwareStartup()`, `auth/BiometricAuthHelper.kt`.) [HIGH]

---

## 4. User Stories (`US-NNN`) + BDD

- **US-001:** As an admin, I want to import a monthly shift Excel so volunteers are auto-matched and unmatched names are flagged for me to fix. (UC-001)
- **US-002:** As an admin, I want reminders sent automatically at configured times for the right work-week day so I never hand-send routine reminders. (UC-003)
- **US-003:** As an admin, I want to cancel a shift/team and optionally notify them, without losing the record. (UC-004)
- **US-004:** As an admin, I want changing a car's location to re-notify a team that already got its same-day reminder. (UC-005)
- **US-005:** As a volunteer, I want to opt in to SMS reminders via a link, using only my personal id, without an account. (UC-006 — server + client route both wired as of `2989b01`)
- **US-006:** As any user, I want to stay logged in across short token lifetimes without re-typing my password. (UC-007)
- **US-007:** As an admin, I want to tune scheduler timing without accidentally breaking the send semantics (reminder type / day group are protected). (UC-008)

**BDD — key journeys**

```gherkin
Scenario: Same-day reminder includes the car location
  Given an enabled SchedulerConfig with ReminderType "SameDay" and DaysBeforeShift 0
    And it is the configured HH:mm in Asia/Jerusalem on a working day matching the config's DayGroup
    And an active (IsCanceled=0) shift today has an approved volunteer with a phone
    And no successful SameDay SmsLog exists for that shift
  When the scheduler tick runs
  Then the volunteer receives an SMS built from the template
    And the message has the location city/name + Waze navigate link appended
    And a Success SmsLog (ShiftId, ReminderType=SameDay) and a SchedulerRunLog row are written
  # SmsReminderService.cs:46-141 ; DR-004, DR-006
```

```gherkin
Scenario: WeekdayAdvance pulls a Friday-shift reminder onto a working day
  Given the enabled WeekdayAdvance config fires today (a working day)
    And a shift's natural advance send-day would land on Friday
  When the scheduler computes the window [today+N, NextWorkingDay(today)+N)
  Then that shift falls inside the wider window and is notified today
    And {תאריך}/{יום} are rendered from the shift's OWN date, not the window start
  # SmsSchedulerService.cs:114-119 ; SmsReminderService.cs:109-112 ; DR-008
```

```gherkin
Scenario: A volunteer cannot re-approve once approved
  Given a volunteer who is already ApproveToReceiveSms = 1
  When they submit the public SMS-approval form again
  Then the system refuses and tells them to contact an admin
  # VolunteersRepository.cs:55-103 ; DR-014  (client route wired at App.tsx:25 — UC-006)
```

```gherkin
Scenario: Soft-cancel preserves the record
  Given an active shift
  When an admin cancels it (optionally sending a template-3 SMS)
  Then IsCanceled becomes 1 with a CanceledAt timestamp (the row is not deleted)
    And an SMS-send failure does not block the cancel
    And the shift no longer appears in any active-shift query
  # Program.cs:870-940 ; DR-005
```

---

## 5. Workarounds (`WA-NNN`)

| ID | Workaround | Why it exists | Source | Certainty |
|---|---|---|---|---|
| **WA-001** | **Android-WebView keyboard / fixed-position dialog fix:** dialogs are top-aligned + scrollable (`top-2 bottom-2 overflow-y-auto`), padded `pb-[40vh]` on mobile, and `scrollIntoView({block:'start'})` is called on `focusin`. | In Android WebView, `position:fixed` does not move for the soft keyboard, and `dvh`/`visualViewport`/`window.resize` are all unreliable; a bottom-sheet dialog gets hidden behind the keyboard. | `web/client/src/components/ui/dialog.tsx:36-55,70-84`; CLAUDE.md | HIGH |
| **WA-002** | **`dir="ltr"` forced on the Switch root** while the thumb uses `translate-x-5`. | Radix Switch positions its thumb with a CSS `translate-x`; RTL mirrors the whole component so the transform travels the wrong way. Pinning the root LTR fixes thumb travel inside the RTL app. | `web/client/src/components/ui/switch.tsx:11`; CLAUDE.md | HIGH |
| **WA-003** | **`versionCode` must be bumped on every APK build** to invalidate the WebView's cached PWA/service-worker. | `MainActivity.clearCacheOnVersionChange()` clears the WebView cache only when the stored versionCode differs; forgetting to bump leaves users on a stale cached React UI. Current `versionCode=63`. | `android/.../MainActivity.kt:295`, `android/app/build.gradle.kts:16`; CLAUDE.md | HIGH |
| **WA-004** | **WeekdayAdvance half-open look-ahead window** `[today+N, NextWorkingDay(today)+N)` with per-shift date derivation. | Advance reminders whose natural send-day lands on Fri/Sat/holiday/holiday-eve must be pulled back onto a working day; the window widening + per-shift `{תאריך}`/`{יום}` keeps each message's date correct. Coupled (per MEMORY): the per-shift message date and the single date param for query+runlog both break if the window is widened naively. | `web/server/Magav.Server/Services/Sms/SmsSchedulerService.cs:114-119`; `SmsReminderService.cs:76,109-112`; Android `SmsSchedulerWorker.kt:272-282` | HIGH |
| **WA-005** | **Idempotent `INSERT OR IGNORE` migration for new default SchedulerConfigs** (the WeekdayAdvance row) run unconditionally on every startup, OUTSIDE the fresh-DB seed branch; bulk-save validates id-set equality instead of a hardcoded count. | The 6-config seed runs ONLY on a fresh DB, so new defaults never reach existing user DBs; the unconditional idempotent migration delivers them without overwriting admin edits (per MEMORY scheduler-config-seeding gotcha). | `DbInitializer.cs:269-272,740-761`; `DatabaseInitializer.kt:170-193`; `Program.cs:1911-1919` | HIGH |
| **WA-006** | **Android selective DB-recovery (no `fallbackToDestructiveMigration`):** the init catch recovers ONLY on SQLCipher key/corruption message strings and re-throws everything else (incl. schema-hash mismatch). | Destructive fallback would silently wipe all volunteer/shift/SMS data on any schema mismatch; re-throwing makes a schema bug crash visibly instead of destroying data. Requires the strict Room schema-change discipline (BR-android:001/002). | `android/.../MagavApplication.kt:112-137`; CLAUDE.md | HIGH |
| **WA-007** | **Native session bridge `window.NativeAuth`** — the React layer notifies `onLoginSuccess`/`onTokenRefresh`/`onLogout` (guarded `if present`); Android persists the JWT into EncryptedSharedPreferences and re-injects on silent refresh. | The WebView's localStorage session must stay in sync with the native app's persisted/biometric-gated session so users aren't re-prompted every launch. | `web/client/src/services/authService.ts:74-79,120-122,152-154`; `android/.../auth/NativeAuthBridge.kt` | HIGH |
| **WA-008** | **`SchedulerRunLogRepository.InsertAsync` per-run dedup catch** swallows **only** the SQLite UNIQUE violation as "already ran"; any other DB error is logged distinctly and returned-null **without rethrowing** (a rethrow would re-run the batch → duplicate SMS). | Implements the per-run dedup cheaply while no longer masking real DB errors as dedup hits. The Android mirror (`SmsReminderService.kt`) catches `SQLiteConstraintException` only, identically. (Tightened in `2989b01`; was a bare catch-all — ISS-006 resolved.) | `web/server/Magav.Server/Database/Repositories/SchedulerRunLogRepository.cs:25-44`; `android/.../service/SmsReminderService.kt:188-200` | HIGH |

---

### Summary
- **Captured:** 8 use cases (UC-001–008), 3 end-to-end traces (WF-001–003, WF-001 with both web+android variants), 7 user stories, 8 workarounds (WA-001–008).
- **Single most important cross-component workflow risk:** the SMS-reminder send path (WF-001) is implemented **twice and independently** (web `BackgroundService` vs Android `AlarmManager`+Worker), governed by subtle shared rules (DayGroup=send-day, holiday ladder, two-tier dedup, WeekdayAdvance half-open window) that must stay byte-identical across .NET, Kotlin, and the client preview with no shared code or tests — so a fix or rule change applied to one backend that is forgotten on the other will silently mis-send or fail to send reminders. (The new `tools/parity-lint.mjs` guards only the string value-sets, not the send-path logic.) The former secondary risk — the unwired public SMS-approval client route (UC-006) — was **resolved** in `2989b01` (route wired at `App.tsx:25`).
