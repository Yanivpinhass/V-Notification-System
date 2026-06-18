<!-- DeepInit Horizontal | Component: system-wide
Run ID: deepinit-2026-06-18
Input files processed: the 5 component docs + discovery.md
Generated: 2026-06-18 -->

# Cross-References — Magav V-Notification-System

Maps business rules to the workflows that enforce them, flags coverage gaps, consolidates the per-component tech-debt registers, and traces the core capabilities end-to-end.

---

## 1. Business-Rule → Workflow map

Each row links a business rule (from the component docs) to the workflow(s) that enforce it. IDs are as published in the component docs (`BR-<component>:NNN`, `WF-<component>:NNN`).

### 1.1 SMS reminder / scheduler

| BR | Rule (short) | Enforced by workflow(s) | Certainty |
|---|---|---|---|
| BR-server:001 / BR-android:004 | Per-shift SMS dedup (`SmsLog` Success on ShiftId+ReminderType) | WF-server:002 / WF-android:002 | HIGH |
| BR-server:002 / BR-android:005 | Per-run dedup (`SchedulerRunLog` UNIQUE) | WF-server:002 / WF-android:002 | HIGH |
| BR-server:003 / BR-android:009 / BR-web-client:010 | DayGroup = SEND day (holiday-aware), DaysBeforeShift = look-ahead | WF-server:001+009 / WF-android:002 / scheduler preview (WF-web-client:007) | HIGH |
| BR-server:004 / BR-android:008 / BR-web-client:011 | SameDay appends location; Advance/WeekdayAdvance/Manual do not | WF-server:002 / WF-android:002 / preview | HIGH |
| BR-server:007 / BR-android:010 | WeekdayAdvance half-open pull-back window `[today+N, NextWorkingDay+N)` | WF-server:001 / WF-android:002 | HIGH |
| BR-server:008 / BR-android:009 | Holiday-aware effective day-group ladder (Sat>holiday>Fri>eve>SunThu) | WF-server:009 / WF-android:002 | HIGH |
| BR-server:009 / BR-android:001-003 (alarm) | Fire only on exact HH:mm + enabled config | WF-server:001 / WF-android:002 | HIGH |
| BR-server:005 / BR-android:007 | Active-shift queries filter `IsCanceled=0` | WF-server:002 eligibility query / WF-android:002 | HIGH |
| BR-server:006 | LocationUpdate re-notify (not deduped) | WF-server:002 (`SendLocationUpdateAsync`) | HIGH |
| BR-api:014 | SMS-log lookback clamp 1–90 days | WF-api (sms-log endpoints) | HIGH |

### 1.2 Auth / users / access

| BR | Rule (short) | Enforced by workflow(s) | Certainty |
|---|---|---|---|
| BR-server:011 / BR-android:013 | Lockout after 5 fails for 15 min | WF-server:003 / WF-android:004 | HIGH |
| BR-server:012 / BR-android:013 | HMAC-SHA256 access token + SHA256-hashed rotated refresh token | WF-server:003 / WF-android:004 | HIGH |
| BR-server:013 | Login never reveals which credential was wrong | WF-server:003 | HIGH |
| BR-server:014 / BR-web-client:001 | Server stores single `Role`; client gets `roles[]` | WF-server:003 wraps; WF-web-client:001/003 consumes | HIGH |
| BR-api:001/002 | Every endpoint authorized unless intentionally public | WF-api:001-003 | HIGH |
| BR-api:003/004 / BR-web-client (volunteerSmsService) | Public SMS-approval: access-key + 3/5min rate limit + no-oracle errors | WF-api:004+008 / WF-web-client:005 | HIGH |
| BR-api:009 / BR-android:017 self-protection | Admin can't self-deactivate/self-demote/self-delete/delete-last-admin | WF-api (users PUT/DELETE) / android UserRoutes | HIGH |
| BR-api:010 / BR-android:014 | Valid roles `Admin`/`SystemManager`/`User`; password policy | WF-api (user create/update); WF-server:003 (validator) | HIGH |
| BR-web-client:002 | localStorage keys `accessToken`/`refreshToken`/`user` | WF-web-client:001/002/004 | HIGH |
| BR-web-client:012 | Single-flight token refresh on 401 | WF-web-client:002 | HIGH |

### 1.3 Import / data lifecycle / config

| BR | Rule (short) | Enforced by workflow(s) | Certainty |
|---|---|---|---|
| BR-server:017 / BR-android:016 | Shift import is destructive within `[minDate,maxDate]` (delete-then-bulk-insert), future-only | WF-server:008 / WF-android:005 | HIGH |
| BR-server:018 / BR-android:018 | Volunteer import: phone sanitize; .NET caps 10000 rows | WF-server:007 / WF-android (volunteer import) | HIGH |
| BR-api:008 / BR-android:015 / BR-web-client:008 | File-upload defense (CSRF header + ext + magic bytes + 10MB + in-memory) | WF-api:006 / WF-android:005 / WF-web-client:006 | HIGH |
| BR-server:016 / BR-api (WF-api:008) | Volunteer SMS-approval is one-way (refuses re-approval) | WF-api:008 / WF-web-client:005 | HIGH |
| BR-server:019 / BR-android:007 | Monthly cleanup hard-deletes old shifts/logs (day 1) | WF-server:006 / WF-android:007 | HIGH |
| BR-server:020 / BR-api:015 / BR-android:017 | Location not deletable while referenced by future shift | WF-api (locations DELETE) / android LocationRoutes | HIGH |
| BR-server:021 / BR-api:013 / BR-android:017 | Template not deletable if in-use / last template | WF-api (templates DELETE) / android MessageTemplateRoutes | HIGH |
| BR-server:022 / BR-android:011 | 6 default configs + WeekdayAdvance (disabled) seeded separately | WF-server:005 / WF-android:001 | HIGH |
| BR-api:006 / BR-android:006 / BR-web-client (IP-014) | Soft-cancel sets `IsCanceled`+`CanceledAt`; SMS failure doesn't block | WF-api:009-adjacent / WF-android:006 | HIGH |
| BR-api:011 / BR-android:020 | Bulk scheduler PUT requires exact id-set match (no hardcoded count) | WF-api (scheduler PUT) / android SchedulerRoutes | HIGH |
| BR-api:012 | Scheduler ReminderType/DayGroup server-owned; shared `SchedulerConfigValidation` | WF-api (scheduler config) | HIGH |
| BR-common:005-007,014 | DbHelper write safety (≤1-row onlyFields update, PK required, delete-count guard, PK declared) | WF-common:002-004 | HIGH |
| BR-common:001-003 | Canonical constant value sets | (data invariant; consumed by all SMS workflows) | HIGH |

---

## 2. Coverage Gaps

### 2.1 No automated tests — system-wide (the dominant gap)

**0 test files across all 5 components** (discovery.md §7; CLAUDE.md "There are no automated tests"; each component doc §10). Every business rule above is enforced only by hand-written production code with no regression guard. This is most acute for the rules that are **mirrored across three implementations** (file-upload defense, soft-cancel, scheduler day-group/window, dedup) — there is nothing to catch the .NET / Android / client implementations silently diverging. [HIGH]

### 2.2 Documented-but-unwired public SMS-approval page (orphaned feature)

CLAUDE.md documents a public route `/sms-approval/:accessKey` → `VolunteerSmsApprovalPage`. **The React client does not wire it up:** `App.tsx:22-25` registers ONLY `/` and `*`, and `VolunteerSmsApprovalPage.tsx` / `RevokeSmsApprovalPage.tsx` are imported nowhere (web-client.md §10). So:
- The **server endpoints exist and are fully enforced** (api.md WF-api:008, BR-api:003/004; Android `VolunteerRoutes` mirror) — verify/submit are reachable over HTTP.
- The **client page that would call them is unreachable** in the built SPA — the volunteer-facing self-service consent flow has no UI entry point.
- A latent bug compounds it: `RevokeSmsApprovalPage.tsx:33` calls `volunteersService.revokeSmsApproval(...)`, **a method that does not exist** in `volunteersService.ts` — a runtime error if the page were ever mounted (masked only because it is unreachable). [HIGH]

This is a BR enforced by a backend workflow (BR-api:003/004, BR-server:016) with **no live client workflow consuming it** — a coverage gap in the opposite direction from the usual (rule has server enforcement but the intended UI is dead). [HIGH]

### 2.3 BRs with weak or asymmetric enforcement

- **`Manual` reminder type** is in the canonical constants (BR-common:001) and CLAUDE.md, but server.md notes no `Manual` send originates in the `server` component — it is driven from the API layer (api.md WF-api:009 maps templateId→Manual). Enforced, but only at the api edge. [MEDIUM]
- **`WeekdayAdvance`** is actively scheduled (server.md WF-server:007; android.md WF-android:002) and in `MagavConstants`, but is **absent from CLAUDE.md's documented ReminderTypes list** — docs lag the code (common.md §8; server.md §10). [HIGH]
- **Volunteer-identity rules don't cross platforms:** BR-server:016 (one-way approval keyed on `InternalIdHash`) has no Android column equivalent (see `data-layer.md` §3 D-1/D-3) — the rule is enforced on .NET but the underlying schema can't host it on Android. [HIGH]

---

## 3. Known Deficiencies — consolidated tech-debt register

Pulled from §10 of each component doc, ranked by blast radius / severity.

| Rank | Deficiency | Component(s) | Severity | Source |
|---|---|---|---|---|
| 1 | **Committed secrets in `appsettings.json`** (git-tracked): real-looking `Jwt:SecretKey`, `Database:Password`, `PublicPages:SmsApprovalAccessKey` GUID. Leaked JWT key → token forgery. Rotate to env/secret store. | api | **CRITICAL** | api.md §10 (`appsettings.json:9-36`) |
| 2 | **Room schema change wipes data if done wrong** — any `@Entity` change needs version bump + migration + dual `addMigrations` registration, or the device DB is silently destroyed (mitigated by no destructive-fallback + selective recovery). | android | **CRITICAL (process)** | android.md BR-001/002; CLAUDE.md 🚨 |
| 3 | **God object `Program.cs` — 2249 LOC**: all ~50 endpoints + DI + middleware + DTOs in one file; high change-collision, no route modularization. | api | HIGH | api.md §10 |
| 4 | **God object `ShiftsManagementPage.tsx` — 1135 LOC**, ~25 `useState` hooks. | web-client | HIGH | web-client.md §10 |
| 5 | **God object `DbHelper.cs` — 960 LOC** (multi-provider facade); + `DbHelperCore.cs` 523. | common | HIGH | common.md §10 |
| 6 | **God object Android `ShiftRoutes.kt` — 907 lines**, 13 endpoints with duplicated inline SMS-send logic. | android | HIGH | android.md §10 |
| 7 | **God object `DbInitializer.cs` — 859 LOC**, ~180-row hardcoded holiday table (2025–2035) — system stops being holiday-aware after 2035; must be kept in sync with Android's ~160-row table. | server | HIGH | server.md §10 |
| 8 | **Swallowed-exception dedup:** `SchedulerRunLogRepository.InsertAsync` catches ALL exceptions as "already ran," not just UNIQUE violations — transient DB errors look like dedup hits. | server | HIGH | server.md §10 |
| 9 | **Migrations swallow errors** — every `Migrate*` catches-logs-continues; a failed in-place migration leaves a partially-upgraded schema without stopping startup. | server | HIGH | server.md §10 |
| 10 | **Error-handling deviation (CLAUDE.md):** auth login/refresh + volunteers-import 500 path use `Results.Problem` (can leak in dev) instead of mandated `Results.Json(ApiResponse.Fail)`; login/refresh messages in English not Hebrew. | api | HIGH | api.md §10 |
| 11 | **Code-vs-code schema drift (Volunteers):** .NET has `InternalIdHash/FirstName/LastName/RoleId` + hash-keyed identity; Android has only unique `MappingName`. Volunteer records not portable; .NET approval flow has no Android column. | server / android | HIGH | data-layer.md §3 |
| 12 | **Scheduler-config seeding only on fresh DB** — `SeedSchedulerConfigAsync` runs only in the `!dbExists` branch; new defaults need a separate idempotent `INSERT OR IGNORE` migration (the WeekdayAdvance pattern). The "6 configs" value is effectively hardcoded across .NET + Android. (MEMORY gotcha.) | server / android | MEDIUM | server.md §10; android.md BR-011 |
| 13 | **Dead code:** `AiQueryDtos.kt` `AiShiftVolunteerDto` (unreferenced); React `VolunteerSmsApprovalPage`/`RevokeSmsApprovalPage` (orphaned) + missing `revokeSmsApproval` method; commented-out `BulkInsertWithIdsAsync` (~60 lines) in `DbHelper.cs`. | android / web-client / common | MEDIUM | android.md §10; web-client.md §10; common.md §10 |
| 14 | **`DbHelper` appears vendored from "Avidov.Common"** — obj assembly names + stale "lessons/activities" batch-size comment; unused `AutoMapper` + full `RepoDb` family referenced; likely-bug sync-retry `Thread.Sleep(30000)`; `IndexedList.RemoveItem` always returns true. | common | MEDIUM | common.md §10 |
| 15 | **Sample data ships in initializer** — `SeedSampleDataAsync` (12 fake volunteers/4 teams/84 shifts) runs on every fresh .NET DB; all share one phone; marked "remove before production" but present. | server | MEDIUM | server.md §10 |
| 16 | **Magic template IDs hardcoded** (`1`/`2`/`3`) for same-day/advance/cancellation across api + android — brittle if seed ids change. | api / android | MEDIUM | api.md §10 |
| 17 | **Imports without transaction** — volunteer + shift imports are not transactional; a mid-import crash leaves partial data / lost shifts (delete-then-insert gap). | server / android | MEDIUM | server.md §10 |
| 18 | **Stale `launchSettings.json`** — scaffold ports `5228/7207/2811` + `weatherforecast` launchUrl don't match real `5015` binding. | api | LOW | api.md §10 |
| 19 | **TanStack Query mounted but unused**; relaxed TS (`strictNullChecks:false`); inline `new`-ed services in api handlers despite scoped DI registration; permissive Android CORS `anyHost()` (mitigated by localhost-only bind). | web-client / api / android | LOW | web-client.md §10; api.md §10; android.md §10 |
| 20 | **Crypto smells (common):** `Rfc2898DeriveBytes` default iteration count + legacy `Rijndael`; hardcoded `PasswordKey` literal used to decrypt connection-string passwords. | common | MEDIUM | common.md §10 |

---

## 4. Traceability — core capabilities (feature → component → workflow → rule → file:line)

### 4.1 SMS reminder send (the system's reason to exist)

| Layer | Component | Workflow | Rule(s) | file:line |
|---|---|---|---|---|
| Trigger (web) | server | WF-server:001 (60s poll, exact HH:mm) | BR-server:003,008,009 | `web/server/Magav.Server/Services/Sms/SmsSchedulerService.cs:29,99,108-124,149-165` |
| Trigger (Android) | android | WF-android:002 (exact alarm → worker) | BR-android:009,010 | `android/.../scheduler/AlarmScheduler.kt:18`; `scheduler/SmsSchedulerWorker.kt:38,70,230` |
| Eligibility + send + log | server | WF-server:002 | BR-server:001,002,004,005 | `web/server/Magav.Server/Services/Sms/SmsReminderService.cs:24,46-67,113-114,178-197` |
| Eligibility + send + log | android | WF-android:002 | BR-android:004,005,008,012 | `android/.../service/SmsReminderService.kt:27-192` |
| Provider (web) | server | WF-server:004 (InforUMobile XML) | — | `web/server/Magav.Server/Services/Sms/InforUMobileSmsProvider.cs:36,97-136` |
| Provider (Android) | android | native SmsManager (Mutex, 15s) | BR-android (dual-SIM) | `android/.../sms/AndroidSmsProvider.kt:43-121` |
| Manual send | api | WF-api:009 (auto template 1/2, Manual) | BR-api (template ids) | `web/server/Magav.Api/Program.cs:1062-1160` |
| Dedup constraints | common+both | (data) | BR-common:001-002; BR-server:001-002 / BR-android:004-005 | `Magav.Common/Models/SmsLog.cs:13,15`; `DbInitializer.cs:203`; `SchedulerRunLogEntity.kt:14` |
| Client preview | web-client | WF-web-client:007 | BR-web-client:010,011 | `web/client/src/pages/scheduler/schedulerPreview.ts:2-5,39-43` |

### 4.2 Shift import (Excel → shifts)

| Layer | Component | Workflow | Rule(s) | file:line |
|---|---|---|---|---|
| Upload + validate | api | WF-api:006 (CSRF+ext+magic+10MB) | BR-api:008 | `web/server/Magav.Api/Program.cs:617-677` |
| Upload (client) | web-client | WF-web-client:006 | BR-web-client:008 | `web/client/src/services/api/BaseApiClient.ts:178-228` |
| Parse + match + replace | server | WF-server:008 | BR-server:017 | `web/server/Magav.Server/Services/ShiftsImportService.cs:9,104-114`; `Helpers/ShiftScheduleParser.cs:27` |
| Excel read primitives | common | WF-common:007 | BR-common:010 | `web/server/Magav.Common/Excel/ExcelHelper.cs:55` |
| Android equivalent | android | WF-android:005 | BR-android:015,016 | `android/.../service/ShiftsImportService.kt:88-93`; `api/routes/ShiftRoutes.kt:694-767` |

### 4.3 Authentication (login / refresh / lockout)

| Layer | Component | Workflow | Rule(s) | file:line |
|---|---|---|---|---|
| Endpoint + JWT setup | api | WF-api:001-003 | BR-api:001,002 | `web/server/Magav.Api/Program.cs:45-71,170,190,210` |
| Login/refresh/logout logic | server | WF-server:003 | BR-server:011,012,013,014 | `web/server/Magav.Server/Services/AuthService.cs:27,84,123,136-171` |
| Password policy | server | (validator) | BR-server:015 | `web/server/Magav.Server/Helpers/PasswordValidator.cs:7,29` |
| Auth model + hashes | common | — | BR-common (User fields) | `web/server/Magav.Common/Models/Auth/User.cs:12-19` |
| Client login + token mgmt | web-client | WF-web-client:001,002,004 | BR-web-client:001,002,012 | `web/client/src/services/authService.ts:42-122`; `services/api/BaseApiClient.ts:44-68` |
| Android equivalent | android | WF-android:004 | BR-android:013,014 | `android/.../service/AuthService.kt:24-103`; `api/auth/JwtConfig.kt` |

---

### Summary
- BR→WF maps cover SMS/scheduler, auth, and import/lifecycle across all five components; every core BR has an enforcing workflow.
- Coverage gaps: **0 tests system-wide**, and the **public SMS-approval page is server-enforced but client-orphaned** (route unregistered + a missing `revokeSmsApproval` method).
- Tech-debt is ranked with committed `appsettings.json` secrets and the Room data-loss discipline at the top, followed by five god objects (Program.cs 2249 / ShiftsManagementPage 1135 / DbHelper 960 / ShiftRoutes 907 / DbInitializer 859), swallowed-exception dedup, the Volunteers code-vs-code schema drift, and the vendored-DbHelper / fresh-DB-only-seeding gotchas.
