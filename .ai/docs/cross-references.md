<!-- DeepInit C8 update | Run ID: deepinit-2026-06-30 | Generated: 2026-06-30
Run ID: deepinit-2026-06-18 · Updated: deepinit-2026-06-30 (Auto-Callback-to-Gate, Android-only — CallbackConfig 11th @Entity / Room v9; the GET/PUT /api/callback-config Android-only contract divergence under ISS-004; ADR-021 ↔ WF-004 ↔ ISS-010; the bare `db/` .gitignore rule ignoring the new db-package source files) · prior: deepinit-2026-06-25b (through 778a2dd — + WA-009 Android device-allowlist keystore-coupling caveat; + window.NativeClip, the THIRD WebView JS bridge, in technical-dependencies §4.6; ADR-020) · prior: deepinit-2026-06-25 (commit 970cdcc — Duty Log: tech-debt rows 21 (release-R8 unvalidated) + 22 (cmdk unused); the window.NativeMedia bridge in technical-dependencies §4.6) · prior: deepinit-2026-06-24 (commit 2989b01)
Input files processed: the 5 component docs + discovery.md
Generated: 2026-06-18 · Updated: 2026-06-30 -->

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

### 1.4 Auto-callback-to-gate (Android-only — feature 2026-06-30)

Android-native feature; **no .NET/web-served counterpart** (the React page is gated to the Android WebView). Horizontal id **WF-004** ↔ component `WF-android:008`. See §4.5 for the end-to-end trace and ADR-021 (decisions.md) for the one-shot-alarm rationale.

| BR | Rule (short) | Enforced by workflow(s) | Certainty |
|---|---|---|---|
| BR-android:022 / BR-web-client:020 | Callback eligibility: config `IsActive==1` + in `[from,to]`/All-day window; `AllCallers==1` bypasses the WHO filter, else last-9-digit match vs today/yesterday volunteers (`IsCanceled=0`). **No `ApproveToReceiveSms` gating** | WF-android:008 / WF-web-client:009 (client mirror) | HIGH |
| BR-android:023 | Fire gate is a SINGLE +20s fire-time `callState==CALL_STATE_RINGING` re-check (answered⇒OFFHOOK, hung-up⇒IDLE, busy⇒OFFHOOK; do-nothing-while-busy by design) → reject (`ANSWER_PHONE_CALLS`) + dial Gate (`CALL_PHONE`) on the SMS-selected SIM | WF-android:008 | HIGH |
| BR-android:024 | `CallbackConfig` is a single-row singleton (`Id=1`), seeded idempotently by BOTH `MIGRATION_8_9` and `DatabaseInitializer.seedCallbackConfig()`; every `@ColumnInfo(defaultValue=…)` MUST match the migration `DEFAULT` clauses (ADR-004 schema-hash) | WF-android:001 (init/seed) | HIGH |
| BR-web-client:019 | Callback settings page is ANDROID-ONLY — gated on `window.NativeMedia` presence; web build shows a Hebrew "Android-app-only" notice and makes ZERO API calls | WF-web-client:009 | HIGH |
| BR-web-client:021 | `callbackConfigService` (extends `BaseApiClient`) targets `GET/PUT /callback-config` — an Android-Ktor-ONLY endpoint (ISS-004 accepted divergence; same pattern as `/settings/sms-sim`) | WF-web-client:009 | HIGH |

---

## 2. Coverage Gaps

### 2.1 No automated tests — system-wide (the dominant gap)

**0 test files across all 5 components** (discovery.md §7; CLAUDE.md "There are no automated tests"; each component doc §10). Every business rule above is enforced only by hand-written production code with no regression guard. This is most acute for the rules that are **mirrored across three implementations** (file-upload defense, soft-cancel, scheduler day-group/window, dedup) — there is nothing to catch the .NET / Android / client implementations silently diverging. [HIGH]

### 2.2 Public SMS-approval page — now wired (RESOLVED 2026-06-19, commit `2989b01`)

CLAUDE.md documents a public route `/sms-approval/:accessKey` → `VolunteerSmsApprovalPage`. This was an orphaned feature at the 2026-06-18 run (the route was unregistered and the page imported nowhere). The remediation **closed the gap:**
- `web/client/src/App.tsx:8,25` now imports `VolunteerSmsApprovalPage` and registers `<Route path="/sms-approval/:accessKey" …>` — the volunteer-facing self-service consent flow has a UI entry point again.
- The orphan `RevokeSmsApprovalPage.tsx` (which called a nonexistent `volunteersService.revokeSmsApproval`) was **deleted** — the latent missing-method runtime error is gone (ISS-001/002 resolved).
- The **server endpoints remain fully enforced** (api.md WF-api:008, BR-api:003/004; Android `VolunteerRoutes` mirror). NOTE: the access-key is now externalized out of tracked config (ADR-017) — supply `PublicPages:SmsApprovalAccessKey` via env/user-secrets or the public endpoints will reject. [HIGH]

### 2.3 BRs with weak or asymmetric enforcement

- **`Manual` reminder type** is in the canonical constants (BR-common:001) and CLAUDE.md, but server.md notes no `Manual` send originates in the `server` component — it is driven from the API layer (api.md WF-api:009 maps templateId→Manual). Enforced, but only at the api edge. [MEDIUM]
- **`WeekdayAdvance`** is actively scheduled (server.md WF-server:007; android.md WF-android:002) and in `MagavConstants` — now also listed in the regenerated CLAUDE.md ReminderTypes (the earlier doc-lag is closed). [HIGH]
- **Volunteer-identity rules don't cross platforms:** BR-server:016 (one-way approval keyed on `InternalIdHash`) has no Android column equivalent (see `data-layer.md` §3 D-1/D-3) — the rule is enforced on .NET but the underlying schema can't host it on Android. [HIGH]
- **Auto-callback config is an Android-only slice of the triplicated contract (ISS-004 accepted divergence):** `GET/PUT /api/callback-config` exists in the **Android Ktor surface ONLY** (`api/routes/CallbackConfigRoutes.kt`) — there is NO .NET `Magav.Api` counterpart and NO web-served implementation; the React `CallbackSettingsPage` is gated to the Android WebView (`window.NativeMedia`). This is the SAME accepted "Android-only native setting" pattern as the SIM-selection endpoint (`/api/settings/sms-sim`), **not a new defect** — a reviewer scanning for the usual three-way mirror will (correctly) find only one backend. Recorded in `issues.md` ISS-004's accepted-divergence list. [HIGH]

---

## 3. Known Deficiencies — consolidated tech-debt register

Pulled from §10 of each component doc, ranked by blast radius / severity.

| Rank | Deficiency | Component(s) | Severity | Source |
|---|---|---|---|---|
| 1 | **Hardcoded `MagavConstants.PasswordKey` encryption-key constant** (`common`, `MagavConstants.cs:7`), used by `EncryptedConnectionStringsProvider.cs:46` — a symmetric key in source defeats the at-rest encryption. *(The tracked-`appsettings.json` credentials half was RESOLVED in `2989b01` — secrets externalized + fail-loud JWT guard, ADR-017.)* | common (was api) | HIGH | common.md §10; issues.md ISS-007 (persisting) |
| 2 | **Room schema change wipes data if done wrong** — any `@Entity` change needs version bump + migration + dual `addMigrations` registration, or the device DB is silently destroyed (mitigated by no destructive-fallback + selective recovery). | android | **CRITICAL (process)** | android.md BR-001/002; CLAUDE.md 🚨 |
| 3 | **God object `Program.cs` — 2249 LOC**: all ~50 endpoints + DI + middleware + DTOs in one file; high change-collision, no route modularization. | api | HIGH | api.md §10 |
| 4 | **God object `ShiftsManagementPage.tsx` — 1135 LOC**, ~25 `useState` hooks. | web-client | HIGH | web-client.md §10 |
| 5 | **God object `DbHelper.cs` — 960 LOC** (multi-provider facade); + `DbHelperCore.cs` 523. | common | HIGH | common.md §10 |
| 6 | **God object Android `ShiftRoutes.kt` — 907 lines**, 13 endpoints with duplicated inline SMS-send logic. | android | HIGH | android.md §10 |
| 7 | **God object `DbInitializer.cs` — 859 LOC**, ~180-row hardcoded holiday table (2025–2035) — system stops being holiday-aware after 2035; must be kept in sync with Android's ~160-row table. | server | HIGH | server.md §10 |
| 8 | ~~Swallowed-exception dedup~~ **RESOLVED 2026-06-19 (`2989b01`):** `SchedulerRunLogRepository.InsertAsync` now swallows only the UNIQUE violation; other DB errors are logged distinctly and returned-null without rethrow (Android mirror matched). | server | resolved | server.md §10; ISS-006 |
| 9 | **Migrations swallow errors** — every `Migrate*` catches-logs-continues; a failed in-place migration leaves a partially-upgraded schema without stopping startup. | server | HIGH | server.md §10 |
| 10 | ~~Error-handling deviation~~ **RESOLVED 2026-06-19 (`2989b01`):** the 4 `Results.Problem` auth/import responses were converted to `Results.Json(ApiResponse<T>.Fail("<Hebrew>"), 500)`; zero `Results.Problem` remain. | api | resolved | api.md §10; ISS-005 |
| 11 | **Code-vs-code schema drift (Volunteers):** .NET has `InternalIdHash/FirstName/LastName/RoleId` + hash-keyed identity; Android has only unique `MappingName`. Volunteer records not portable; .NET approval flow has no Android column. | server / android | HIGH | data-layer.md §3 |
| 12 | **Scheduler-config seeding only on fresh DB** — `SeedSchedulerConfigAsync` runs only in the `!dbExists` branch; new defaults need a separate idempotent `INSERT OR IGNORE` migration (the WeekdayAdvance pattern). The "6 configs" value is effectively hardcoded across .NET + Android. (MEMORY gotcha.) | server / android | MEDIUM | server.md §10; android.md BR-011 |
| 13 | **Dead code:** `AiQueryDtos.kt` `AiShiftVolunteerDto` (unreferenced); commented-out `BulkInsertWithIdsAsync` (~60 lines) in `DbHelper.cs`. *(`2989b01` cleared the React orphans — `VolunteerSmsApprovalPage` is now wired, `RevokeSmsApprovalPage` deleted; and deleted the dead `PasswordValidator.cs`.)* | android / common | LOW | android.md §10; common.md §10 |
| 14 | **`DbHelper` appears vendored from "Avidov.Common"** — obj assembly names + stale "lessons/activities" batch-size comment; unused `AutoMapper` + full `RepoDb` family referenced; likely-bug sync-retry `Thread.Sleep(30000)`; `IndexedList.RemoveItem` always returns true. | common | MEDIUM | common.md §10 |
| 15 | **Sample data ships in initializer** — `SeedSampleDataAsync` (12 fake volunteers/4 teams/84 shifts) runs on every fresh .NET DB; all share one phone; marked "remove before production" but present. | server | MEDIUM | server.md §10 |
| 16 | **Magic template IDs hardcoded** (`1`/`2`/`3`) for same-day/advance/cancellation across api + android — brittle if seed ids change. | api / android | MEDIUM | api.md §10 |
| 17 | **Imports without transaction** — volunteer + shift imports are not transactional; a mid-import crash leaves partial data / lost shifts (delete-then-insert gap). | server / android | MEDIUM | server.md §10 |
| 18 | **Stale `launchSettings.json`** — scaffold ports `5228/7207/2811` + `weatherforecast` launchUrl don't match real `5015` binding. | api | LOW | api.md §10 |
| 19 | **TanStack Query mounted but unused**; relaxed TS (`strictNullChecks:false`); inline `new`-ed services in api handlers despite scoped DI registration; permissive Android CORS `anyHost()` (mitigated by localhost-only bind). | web-client / api / android | LOW | web-client.md §10; api.md §10; android.md §10 |
| 20 | **Crypto smells (common):** `Rfc2898DeriveBytes` default iteration count + legacy `Rijndael`; hardcoded `PasswordKey` literal used to decrypt connection-string passwords. | common | MEDIUM | common.md §10 |
| 21 | **`assembleRelease` (R8) never validated at runtime** — release builds were never run before `970cdcc`; the first one needed POI `-dontwarn` rules and there is no release `signingConfig` (release APK unsigned). R8 build now passes + keeps `@JavascriptInterface` names, but POI/SQLCipher/Ktor under full minify is untested on a device. The team ships debug APKs. | android | MEDIUM | android.md §10; decisions.md KL-mistake:013 |
| 22 | **`cmdk` + `components/ui/command.tsx` installed but unused** — added (`f432dce`) for a Duty Log combobox that ended up using Radix `Select`; dead dependency. | web-client | LOW | web-client.md §10 |
| 23 | **[ISS-010 — new/open] Root `.gitignore` `db/` rule git-IGNORES the new Android db-package source files.** Line 41 (under "# Database & Sensitive Data") is a **bare, unanchored `db/`** that greedily matches the Android source package `android/app/src/main/java/com/magav/app/db/`. Existing files there are tracked only because they predate the rule (gitignore never un-tracks); the TWO new files `db/entity/CallbackConfigEntity.kt` + `db/dao/CallbackConfigDao.kt` are git-IGNORED (verified `git check-ignore -v` → `.gitignore:41:db/`; `git ls-files` returns nothing) — a plain `git add` silently skips them, breaking a fresh-checkout build/commit. **Running build is unaffected** (compiler reads disk). Fix: `git add -f`, or anchor the rule (`/db/`) / scope it to the SQLite data dir. | android (repo-hygiene) | MEDIUM | issues.md ISS-010; android.md §10; `.gitignore:41` |

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
| Password policy | api | (inline in `change-password`) | BR-server:015 (now inline) | `web/server/Magav.Api/Program.cs` change-password (≥6 + letter + digit; the unused `Helpers/PasswordValidator.cs` was deleted in `2989b01`) |
| Auth model + hashes | common | — | BR-common (User fields) | `web/server/Magav.Common/Models/Auth/User.cs:12-19` |
| Client login + token mgmt | web-client | WF-web-client:001,002,004 | BR-web-client:001,002,012 | `web/client/src/services/authService.ts:42-122`; `services/api/BaseApiClient.ts:44-68` |
| Android equivalent | android | WF-android:004 | BR-android:013,014 | `android/.../service/AuthService.kt:24-103`; `api/auth/JwtConfig.kt` |

### 4.5 Auto-callback-to-gate (Android-only — feature 2026-06-30)

Event-driven, fully Android-native (no .NET/web build can run it). Horizontal **WF-004** ↔ `WF-android:008`; rationale in **ADR-021** (decisions.md — one event + ONE transient +20s exact alarm + ONE fire-time `callState` re-check, no state machine/epoch/wakelock). Reuses the SMS subsystem's `AlarmManager` exact-alarm pattern (cf. `scheduler/AlarmScheduler.kt` / `scheduler/SmsAlarmReceiver.kt`) but is **fully decoupled** — its own `callback/` package, own fixed alarm requestCode `770042`, touches NO SMS file. SIM for the gate call reuses the SMS SIM setting (`AppSettings 'sms_sim_subscription_id'`).

| Layer | Component | Workflow | Rule(s) | file:line |
|---|---|---|---|---|
| Ring → eligibility → arm | android | WF-android:008 | BR-android:022 | `android/.../callback/CallbackPhoneStateReceiver.kt:24-39`; `callback/CallbackLogic.kt:70-121` |
| +20s fire → reject + dial | android | WF-android:008 | BR-android:023 | `android/.../callback/CallbackAlarmReceiver.kt:20-37`; `callback/CallbackLogic.kt:141-192` |
| Config singleton + seed | android | WF-android:001/008 | BR-android:024 | `android/.../db/entity/CallbackConfigEntity.kt:15-45`; `db/dao/CallbackConfigDao.kt:13-22`; `db/DatabaseInitializer.kt:23,31-33`; `db/MagavDatabase.kt:44,146-168` |
| Config endpoint (Android-only) | android | (Ktor route) | BR-web-client:021 | `android/.../api/routes/CallbackConfigRoutes.kt:47-110`; wired `api/KtorServer.kt:87` |
| Permissions + manifest receivers | android | WF-android:008 | BR-android:023 | `android/.../AndroidManifest.xml:18-20,63,72`; `MainActivity.kt:145-159` |
| Settings page (android-gated) + service | web-client | WF-web-client:009 | BR-web-client:019,020,021 | `web/client/src/pages/CallbackSettingsPage.tsx:18-19,90-105`; `services/callbackConfigService.ts:19-25`; menu `components/layout/menuItems.ts:64`; route `pages/Index.tsx:88-89` |

`CallbackConfig` is the **11th Room `@Entity`** and the schema is now **version 9** (was 8); the additive `MIGRATION_8_9` is the latest correct example of the full migration ritual (dual `addMigrations` registration + entity↔migration `DEFAULT` agreement) — see `data-layer.md` (CallbackConfig table) and the Room data-loss gotcha (§3 row 2 / ADR-004). [HIGH]

---

### Summary
- BR→WF maps cover SMS/scheduler, auth, and import/lifecycle across all five components; every core BR has an enforcing workflow.
- Coverage gaps: **0 tests system-wide** remains the dominant gap. The public SMS-approval page is now wired (`2989b01`) — that orphan gap is closed.
- **2026-06-24 `--update`:** rows 8 (swallowed-exception dedup) and 10 (`Results.Problem` deviation) are RESOLVED; row 13 (dead code) shrank; row 1 narrowed to the persisting hardcoded `PasswordKey` (the committed-`appsettings.json` secrets were externalized — ADR-017). The top standing concerns are now the Room data-loss discipline, the five god objects (Program.cs ~2250 / ShiftsManagementPage 1135 / DbHelper 960 / ShiftRoutes 907 / DbInitializer 859), the hardcoded `PasswordKey`, the Volunteers code-vs-code drift (accepted — ADR-016), and the vendored-DbHelper / fresh-DB-only-seeding gotchas.
- **2026-06-30 `--update` (Auto-Callback-to-Gate, Android-only):** added §1.4 (callback BR→WF map) and §4.5 (end-to-end trace); ADR-021 ↔ WF-004 ↔ `WF-android:008` linked. The `GET/PUT /api/callback-config` endpoint is a new **ISS-004 accepted divergence** (Android-Ktor-only; same pattern as `/api/settings/sms-sim`) — noted in §2.3. New tech-debt **row 23 = ISS-010** (bare `db/` `.gitignore` rule ignores the new `CallbackConfigEntity.kt`/`CallbackConfigDao.kt` source files; verified via `git check-ignore` + empty `git ls-files`). `CallbackConfig` is the 11th Room `@Entity`; schema is now v9 with additive `MIGRATION_8_9` (the latest correct full-ritual example, ADR-004).
