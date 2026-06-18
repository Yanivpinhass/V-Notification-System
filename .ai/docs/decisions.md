<!-- DeepInit ADR/KL | Component: system-wide
Run ID: deepinit-2026-06-18
Input files processed: 5 component docs + git log + comments + CLAUDE.md
Generated: 2026-06-18 -->

# Architecture Decisions & Knowledge Log — Magav V-Notification-System

This document captures the **WHY** behind Magav's architecture: the intentional decisions (Section A) and the accumulated, hard-won operational knowledge (Section B). Magav is a Hebrew RTL volunteer-shift + SMS-reminder system with two deployment targets (a .NET 8 + React web stack, and a Kotlin Android app embedding a Ktor server) that share one React frontend and mirror one REST contract.

Evidence is cited as `file:line`, commit hash, or doc reference. Certainty reflects how directly the rationale is grounded (HIGH = explicit code/comment/commit; MEDIUM = strongly inferred; LOW = plausible).

---

## Section A — Architecture Decisions

## ADR-001: Android target = embedded Ktor server + WebView loading the shared React build
- Status: accepted
- Date: 2026-03-09 (inferred — commit `bc4718a`)
- Context: The system began as a cloud-deployed ASP.NET app. The operational requirement shifted to running entirely on a local Android phone that acts as the SMS gateway, with no cloud dependency — the phone must send SMS natively and keep working offline.
- Decision: Build the Android target as a **hybrid mobile-server app**: a foreground `Service` embeds a Ktor HTTP server bound to `127.0.0.1:5015` that serves both the bundled React SPA (from `assets/web/`) and a REST API mirroring the .NET endpoints; a WebView in `MainActivity` loads `http://localhost:5015`. SMS is sent via Android `SmsManager`.
- Why: Reuse the exact React UI and REST contract from the web target without rewriting the UI natively; the phone becomes a self-contained server + SMS gateway with no cloud dependency. The commit message states the migration intent explicitly: "Migrate from cloud ASP.NET deployment to local Android phone."
- Evidence: commit `bc4718a` ("Add Android app with Ktor server, reorganize project into web/ and android/"); `android/.../api/KtorServer.kt:27`, `MainActivity.kt:196`, `MagavServerService.kt:39`; android.md §1, §11.
- Consequences: (+) One frontend codebase, one mental model, one REST contract. (−) The REST surface is implemented TWICE (.NET `Program.cs` and Ktor routes) and must be kept in sync by hand; (−) the WebView caches the SPA, forcing the `versionCode`-bump discipline (KL-mistake:001); (−) Android-WebView-specific quirks leak into the shared UI (keyboard / `position:fixed`, KL-learning:003).
- Certainty: HIGH

## ADR-002: SQLCipher-encrypted database on BOTH targets (data-at-rest encryption for PII)
- Status: accepted
- Date: 2026-01-27 (web) / 2026-03-09 (Android) — inferred
- Context: The DB stores volunteer PII (phone numbers, names) and credentials. On Android the DB file lives on a user-accessible device; on the web server it is a file on disk.
- Decision: Use **SQLCipher-encrypted SQLite** on both platforms. Web: `Microsoft.Data.Sqlite` + `SQLitePCLRaw.bundle_e_sqlcipher`, passphrase via `Database:Password` config (itself encrypted at rest, see ADR-006), WAL mode + 30s busy timeout. Android: Room 2.6.1 + SQLCipher 4.5.4 (`net.zetetic:android-database-sqlcipher`), with a 32-byte key stored in EncryptedSharedPreferences (AES256-GCM, Android Keystore-backed).
- Why: Encrypt PII at rest so a stolen device or leaked DB file does not expose volunteer phone numbers/credentials. Volunteer national/internal IDs are additionally reduced to SHA256 hashes (PII minimization, ADR-009).
- Evidence: common.md §2 (`Magav.Common.csproj:14,31`), server.md WF-server:005 (`DbInitializer.cs:31-41` WAL+busy_timeout); android.md §11 + `MagavApplication.kt:102,140`; CLAUDE.md "Database: SQLCipher (encrypted SQLite)".
- Consequences: (+) PII protected at rest. (−) The encrypted DB cannot be inspected by tooling (DeepInit IF-2 live-drift checks were suppressed for exactly this reason — discovery.md §6); (−) introduces a key-management surface and the recovery edge cases in KL-debug:001.
- Certainty: HIGH

## ADR-003: Custom `DbHelper` facade over NPoco (vendored from an "Avidov" codebase)
- Status: accepted
- Date: unknown — inferred (pre-dates this repo)
- Context: The web backend needs an ergonomic, provider-agnostic data-access layer with retry, transaction wrapping, and PK-safety guards, so repositories never touch NPoco directly.
- Decision: Wrap NPoco in a custom `DbHelper` (`DbHelper.cs` + `DbHelperCore.cs`) exposing renamed CRUD methods (`FetchAllAsync`, `ExecuteQueryAsync`, `SingleOrDefaultByIdAsync`, …), per-call short-lived `NPoco.Database` instances, built-in retry, transaction wrappers, and update/delete safety guards (≤1 row affected, non-null PK required).
- Why: Centralize DB ergonomics + safety; provider-agnostic factory (`CreateSqliteDbHelper`/`CreateMySql…`/etc.) so the same code can target multiple DBs. Strong evidence shows this is a **vendored shared library carried in from another codebase**: build artifacts reference `Avidov.Common.AssemblyInfo.cs` (vs the project name `Magav.Common`); the email owner is `eladr@avidov.com`; the `DbBatchSize` comment references unrelated "lessons"/"activities" domains and a "PHASE 2 increase from 1000 to 5000" that does not match the actual constant (`1000`).
- Evidence: common.md §10–§11 (`DbHelperCore.cs:18-24` stale comment, `obj/.../Avidov.Common.AssemblyInfo.cs`); `DbHelperCore.cs:192-224` provider switch; safety guards `DbHelper.cs:457-551`.
- Consequences: (+) Repositories get a clean, safe, uniform API; the method-name conventions are load-bearing and documented in CLAUDE.md. (−) Two god-object files (960 + 523 LOC); multi-provider + AutoMapper/RepoDb dependencies are dead weight for a SQLite-only system; carries vendored bugs (KL-mistake:003 sync-retry sleep; KL-mistake:004 `IndexedList.RemoveItem` return value).
- Certainty: HIGH

## ADR-004: Defensive Room DB init — NO destructive fallback; recover only on SQLCipher key/corruption, re-throw everything else
- Status: accepted
- Date: 2026-05-17 (commit `e7fd42c`)
- Context: A data-loss incident occurred during development: adding the `IsCanceled` column without first declaring its index in `@Entity(indices=[...])` made Room's post-migration schema-hash validation fail, and a broad catch block then wiped the entire user database (volunteers, shifts, SMS history, scheduler configs).
- Decision: `MagavApplication.initializeDatabase()` does **NOT** use `.fallbackToDestructiveMigration()`. After building the DB it probes `openHelper.writableDatabase`; the catch block recovers (delete + recreate) ONLY when the error message indicates an SQLCipher key/corruption error (`"file is not a database"` / `"file is encrypted"` / `"not a database"`), and **re-throws everything else** — including Room migration / schema-hash mismatches — so the app crashes visibly with "שגיאה באתחול המערכת" instead of silently destroying data.
- Why: A schema bug that wipes irrecoverable production data (there is no device-side backup; Android Auto Backup was disabled in `43bc6f4` to avoid restoring stale encrypted DBs) is far worse than a visible crash. The incident is documented verbatim in commit `e7fd42c` and made top-of-file in CLAUDE.md so future agents cannot miss it.
- Evidence: commit `e7fd42c` (CRITICAL section); `MagavApplication.kt:112-137` (verified — explicit message-string check + `throw e`); android.md BR-android:002, §11; CLAUDE.md "🚨 CRITICAL: Room schema changes WILL DELETE USER DATA".
- Consequences: (+) Schema bugs surface loudly and preserve data. (−) Requires strict discipline on every `@Entity` change (bump `@Database(version)`, add a migration, register it in BOTH `addMigrations(...)` call sites — KL-mistake:002); a forgotten migration becomes a hard crash rather than a wipe (the intended trade).
- Certainty: HIGH

## ADR-005: `ApiResponse<T>` envelope + generic Hebrew errors over `Results.Problem`
- Status: accepted
- Date: 2026-01-27 (inferred — initial backend)
- Context: API error responses must never leak exception messages, stack traces, DB column names, or internal paths; the client also wants a uniform response shape.
- Decision: Wrap every data response in `ApiResponse<T>` (`{success, data, message}`); on error, log the full `ex` to `Console.Error` server-side only and return `Results.Json(ApiResponse<object>.Fail("<generic Hebrew>"), statusCode: 500)`. CLAUDE.md explicitly forbids `Results.Problem()` because it can leak details in dev mode.
- Why: Uniform client contract + no information disclosure. The client's `BaseApiClient.handleResponse` is built around unwrapping this envelope (throws on `!success`, returns `result.data`).
- Evidence: api.md §11, WF-api:007, BR-api:005/007 (`Program.cs:296-302` etc.); web-client.md BR-web-client:007 (`BaseApiClient.ts:74-118`); CLAUDE.md "Error Handling Pattern".
- Consequences: (+) No leakage, consistent client handling. (−) Known DEVIATIONS still in the code: `POST /api/auth/login` (`:186`), `POST /api/auth/refresh` (`:206`), and the volunteers-import 500 path (`:359`) use `Results.Problem(...)` with English messages — a CLAUDE.md violation (KL-mistake:006).
- Certainty: HIGH

## ADR-006: Encrypted connection-string password (decrypting config provider)
- Status: accepted
- Date: unknown — inferred (part of vendored `Magav.Common`)
- Context: The web DB passphrase is stored in `appsettings.json`; storing it in plaintext would expose the SQLCipher key in config.
- Decision: A custom `EncryptedConnectionStringsSource`/`Provider` intercepts every `IConfiguration` read of a `ConnectionStrings:*` key, parses the connection string, and decrypts the `password` token (via `EncryptionHelper.DecryptDataWithKey` keyed by `MagavConstants.PasswordKey`) unless `Integrated Security=True`. Callers see a normal, decrypted connection string transparently.
- Why: Keep the DB password encrypted at rest in config while letting all callers use a plain connection string.
- Evidence: common.md WF-common:005, §11 (`EncryptedConnectionStringsProvider.cs:28-51`, `ConfigurationHelper.cs:18-23`).
- Consequences: (+) Password not stored in plaintext. (−) The decryption key `PasswordKey = "Magav2019097748"` is a hardcoded literal in source (`MagavConstants.cs:7`, verified) — anyone with the source can decrypt, so this is obfuscation, not real secret management (KL-mistake:005). Crypto uses legacy `Rijndael` + default `Rfc2898DeriveBytes` iteration count (crypto smell).
- Certainty: HIGH

## ADR-007: Canonical string constants over enums, mirrored verbatim across platforms
- Status: accepted
- Date: 2026-02-01 (inferred — SMS scheduler subsystem) / extended 2026-06-16 (`82ba7d7`)
- Context: Reminder types, SMS statuses, and day groups are persisted to the DB as strings and must be interpreted identically by the .NET backend AND the Android Kotlin backend (two independent implementations of one contract).
- Decision: Define the values as `const string` pools rather than enums: `MagavConstants.ReminderTypes/SmsStatuses/DayGroups` (.NET) and the matching `ReminderTypes/SmsStatuses/DayGroups` objects in Android `util/Constants.kt`. CLAUDE.md mandates "use the constants, never inline the strings." Verified in sync: both define `SameDay/Advance/LocationUpdate/Manual/WeekdayAdvance`, `Success/Fail`, `SunThu/Fri/Sat`.
- Why: Strings persist cleanly across SQLite providers (no enum-ordinal coupling), and a shared constant pool prevents drift between the two backend implementations of the same logical scheduler.
- Evidence: common.md §8, BR-common:001-003 (`MagavConstants.cs:9-29`, verified); android.md BR-android:006 (`util/Constants.kt:3-20`, verified); CLAUDE.md "Canonical string constants".
- Consequences: (+) Cross-platform value safety. (−) No compiler enforcement that a given string is a valid member; (−) the docs drifted from the constants — `WeekdayAdvance` exists in BOTH constant pools but is absent from CLAUDE.md's documented ReminderTypes list (KL-mistake:007).
- Certainty: HIGH

## ADR-008: Two-tier SMS de-duplication (per-shift `SmsLog` + per-run `SchedulerRunLog` UNIQUE)
- Status: accepted
- Date: 2026-03-19 (commit `2164e6e`)
- Context: A `WorkManager` retry after a partial failure (and concurrent workers from the same alarm) caused volunteers to receive multiple identical SMS reminders.
- Decision: Two independent guards. (1) **Per-shift**: the eligibility query excludes any shift that already has a `SmsLog` row with the same `(ShiftId, ReminderType, Status='Success')` (`NOT EXISTS` subquery). (2) **Per-run**: `SchedulerRunLog` has `UNIQUE(ConfigId, TargetDate, ReminderType)`; a duplicate insert is swallowed (returns null) = "already ran this tick." On Android, the worker is additionally enqueued with a unique `config+date` key (`ExistingWorkPolicy.KEEP`) and notification errors are isolated in their own try/catch so they cannot trigger `Result.retry()`.
- Why: Defense in depth — the per-shift `SmsLog` guard is the source of truth that prevents re-texting a volunteer; the per-run guard + unique work key prevent wasteful re-execution and concurrent duplicate workers.
- Evidence: commit `2164e6e` ("Fix duplicate SMS on WorkManager retry", three layers); server.md BR-server:001/002 (`SmsReminderService.cs:61-67,191`, `DbInitializer.cs:203`); android.md BR-android:004/005; `SmsSchedulerWorker.kt:84` comment "Notification errors must not trigger Result.retry()".
- Consequences: (+) Idempotent sends across retries/restarts. (−) The `SchedulerRunLog` per-run guard was once *too* aggressive and blocked legitimate re-runs; it was loosened in `9afc0f1` ("Remove aggressive SchedulerRunLog dedup that blocked re-runs — shift-level SmsLog dedup is sufficient"). The .NET `SchedulerRunLogRepository.InsertAsync` swallows ALL exceptions as "already ran," not just UNIQUE violations (KL-mistake:008).
- Certainty: HIGH

## ADR-009: Hash-based volunteer identity (PII minimization)
- Status: accepted
- Date: 2026-01-27 (inferred — Volunteers table)
- Context: Volunteers are identified by a national/internal ID. Storing it in cleartext is an unnecessary PII exposure, especially since the public SMS-approval page accepts the internal ID over an unauthenticated endpoint.
- Decision: Store the internal ID only as a SHA256 hash (`Volunteer.InternalIdHash`); match by hash on import and on the public approval flow (`VolunteersRepository.HashInternalId` → `GetByInternalIdAsync`).
- Why: Minimize stored PII — a DB leak does not expose raw national IDs; lookups still work by hashing the supplied ID. Reinforced by the public endpoint returning identical generic errors for "bad format" and "not found" so the ID space cannot be probed.
- Evidence: server.md §11, BR-server:016 (`VolunteersRepository.cs:19-24`); common.md §5 (`Volunteer.InternalIdHash`); api.md WF-api:008 (no-oracle errors).
- Consequences: (+) Raw IDs never persisted. (−) Cannot recover the original ID; matching depends on consistent hashing input.
- Certainty: HIGH

## ADR-010: Soft-cancel convention for shifts (IsCanceled flag, not delete)
- Status: accepted
- Date: 2026-05-17 (commit `e7fd42c`)
- Context: Deleting a cancelled shift destroys the audit trail and orphans its SMS history; ops still need to see what was cancelled.
- Decision: Cancelling a shift sets `IsCanceled = 1` + `CanceledAt` on the `Shifts` row rather than deleting it. Every query that lists "active" shifts MUST filter `IsCanceled = 0` (eligibility, by-date, date-range, distinct-dates, calendar dots, SMS summary). Cancelled shifts surface only on the "משמרות מבוטלות" page (`GET /api/shifts/canceled?month=YYYY-MM`), from which they can be permanently hard-deleted (which also cascade-deletes `SmsLog WHERE ShiftId=@0`). Optional cancellation SMS (template 3) is sent first; SMS failure does NOT block the cancel.
- Why: Preserve an audit trail and let SMS history remain coherent; a normal shift is only hard-deleted after an explicit two-step (soft-cancel → purge).
- Evidence: commit `e7fd42c`; server.md BR-server:005, api.md BR-api:006/016, android.md BR-android:007 (`ShiftsRepository.cs` filters, `ShiftRoutes.kt:242,302,370`); CLAUDE.md "Soft-Cancel Convention".
- Consequences: (+) Audit trail + safe two-step deletion. (−) Every new shift query is a latent bug if it forgets the `IsCanceled = 0` filter (the convention is documented precisely because it is easy to miss).
- Certainty: HIGH

## ADR-011: Israel timezone everywhere; SMS semantics keyed on the SEND day (holiday-aware)
- Status: accepted
- Date: 2026-04-06 (commit `4e58dd1` — holiday awareness) / refined `82ba7d7`
- Context: SMS reminders must fire at precise local Israel times and respect the Israeli work week (Sun–Thu working, Fri/Sat weekend) and Jewish holidays — independent of the device/server timezone.
- Decision: All time logic uses Israel Standard Time (Windows) / `Asia/Jerusalem` (Linux/Android). The scheduler's `DayGroup` denotes **the day the SMS is SENT (the run/firing day)**, resolved through a holiday-aware effective-day-group ladder (Sat > today-is-holiday→Sat > Fri > tomorrow-is-holiday→Fri > SunThu); `DaysBeforeShift` (N) is the look-ahead offset added to "today" to find target shift dates. Android schedules exact alarms for ALL 7 weekdays and gates at fire time on `config.dayGroup == effectiveDayGroup` so a holiday can re-map Fri/Sat behavior without recomputing alarm calendars.
- Why: Correct local-time delivery + holiday re-mapping. DayGroup-as-send-day decouples "what to send on Fri vs Sun–Thu" from shift dates, but is famously easy to invert (it is the firing day, not the shift's day) — flagged in user MEMORY and documented in the client preview engine.
- Evidence: commit `4e58dd1`; server.md BR-server:003/008, WF-server:009 (`SmsSchedulerService.cs:95,149-165`); android.md BR-android:009 (`SmsSchedulerWorker.kt:70,230`); web-client.md BR-web-client:010 (`schedulerPreview.ts:2-5`); CLAUDE.md "Timezone: Israel"; MEMORY scheduler-daygroup-semantics.
- Consequences: (+) Robust to device tz + holidays. (−) The holiday seed table is hardcoded 2025–2035 in both backends and must be kept in sync (KL-integration:001); DayGroup semantics are a recurring source of confusion.
- Certainty: HIGH

## ADR-012: Two implementations of one scheduler — .NET 60s `BackgroundService` polling vs Android exact `AlarmManager` alarms
- Status: accepted
- Date: 2026-02-01 (web) / 2026-03-09 (Android) — inferred
- Context: The same logical SMS scheduler must run in two very different runtimes: a long-lived .NET server process and an Android app subject to Doze/battery management.
- Decision: Implement the scheduler twice against the shared `SchedulerConfig` model and shared constants. Web: a singleton `BackgroundService` (`SmsSchedulerService`) polls every 60s, fires a config when `config.Time == Israel-local HH:mm` exactly. Android: `AlarmScheduler` schedules exact `AlarmManager` alarms (`setExactAndAllowWhileIdle`, with inexact fallback when the exact-alarm permission is denied) per config × weekday, which enqueue a `SmsSchedulerWorker`.
- Why: A .NET server can afford a cheap 60s poll (exact `HH:mm` string match makes "fire once this minute" trivial without an external cron). Android cannot reliably poll under Doze — exact alarms that survive idle are required for precise, battery-friendly delivery. Both delegate to a per-platform `SmsReminderService` with the same eligibility + dedup logic.
- Evidence: server.md §11, WF-server:001 (`SmsSchedulerService.cs:33,50`); android.md §11, WF-android:002 (`AlarmScheduler.kt:16,81`); CLAUDE.md SMS subsystem sections.
- Consequences: (+) Each runtime uses its idiomatic, reliable scheduling primitive. (−) Two codebases implementing one concept — divergence risk; the `WeekdayAdvance` window and per-shift message-date logic had to be added to BOTH (`82ba7d7`).
- Certainty: HIGH

## ADR-013: `WeekdayAdvance` reminder type — weekday-only advance send with a half-open pull-back window
- Status: accepted
- Date: 2026-06-16 (commit `82ba7d7`)
- Context: Standard `Advance` reminders fire on a fixed offset before the shift, which can land the send on a Fri/Sat/holiday/holiday-eve — undesirable for an organization that wants advance reminders only on working days.
- Decision: Add a fifth reminder type, `WeekdayAdvance`, that texts volunteers N days before a shift but never dispatches on Fri/Sat/holiday/holiday-eve. It uses a **half-open send-day window `[today+N, nextWorkingDay(today)+N)`**, pulling the batch for shifts whose natural send-day is a non-working day back onto the previous working day. The `RunLog` target date = the firing day; `{תאריך}`/`{יום}` are derived from EACH shift's own date (not the window start). Implemented on both backends and the shared UI; seeded DISABLED via idempotent `INSERT OR IGNORE` so it reaches fresh AND existing DBs without overwriting admin edits.
- Why: Deliver advance reminders only on working days while still covering shifts that fall after the weekend, with correct per-shift dates across the widened window. Shipping it disabled + idempotent-seeded avoids both data loss and surprise behavior changes on upgrade.
- Evidence: commit `82ba7d7` (full body); server.md BR-server:007, WF-server:009; android.md BR-android:010/011; web-client.md (3rd reminder section, SunThu only); MEMORY weekday-advance-window-coupling.
- Consequences: (+) Working-day-only advance reminders. (−) Two non-obvious couplings that break if the eligibility window is widened (per-shift message date; a single date param shared by the query AND the run-log key) — captured in MEMORY (KL-learning:002). The commit notes "No Room schema/@Database/version change — zero data loss on upgrade" (deliberately avoided ADR-004's hazard).
- Certainty: HIGH

## ADR-014: Access-key + rate-limited public pages instead of accounts (volunteer SMS self-consent)
- Status: accepted
- Date: 2026-01-29 (commit `9a36b8d`)
- Context: Volunteers must give SMS consent themselves, but creating an account for each volunteer is impractical, and a fully anonymous-open endpoint would be an abuse vector for probing the internal-ID space.
- Decision: Expose `/sms-approval/:accessKey` as a public (no-JWT) page whose server endpoints (`POST /api/public/sms-approval/{accessKey}/{verify,submit}`) validate a shared secret access key against `PublicPages:SmsApprovalAccessKey`, are rate-limited to 3 requests / 5 min (fixed window), return identical generic errors for "bad format" vs "not found" (no enumeration oracle), and log only IP + result (no PII). Approval is one-way (re-approval refused — must contact an admin).
- Why: Lightweight self-service consent that is neither account-based nor anonymous-open; the shared key + rate limit + no-oracle errors throttle brute-forcing of internal IDs while authenticated endpoints rely on JWT.
- Evidence: commit `9a36b8d`; api.md §11, WF-api:008, BR-api:003/004; server.md BR-server:016; CLAUDE.md "Public Pages (Access Key Pattern)".
- Consequences: (+) Frictionless consent with abuse controls. (−) The React route for this page is currently NOT wired into the build (`App.tsx` registers only `/` and `*`) — the backend endpoints exist but the UI is unreachable from the shipped client (KL-mistake:009).
- Certainty: HIGH

## ADR-015: Single-file Minimal API (.NET) mirroring the flat Ktor route surface
- Status: accepted
- Date: 2026-01-27 (inferred — initial backend)
- Context: ~50 endpoints, a single primary author, and a parallel Android implementation whose Ktor routes are also relatively flat.
- Decision: Put every web endpoint, all DI/middleware/auth-policy config, and all request/response DTO records in a single `Program.cs` (~2249 LOC), with DTOs declared as records after `app.Run()`.
- Why: Minimal ceremony for a small team; mirrors Android's flat route surface, keeping the two implementations structurally comparable.
- Evidence: api.md §11, §10 (`Program.cs` whole); discovery.md §7 (god objects).
- Consequences: (+) Everything-in-one-place for a solo maintainer. (−) A 2249-line god object with high change-collision risk and no route-group modularization; magic template IDs (1/2/3) and inline service `new`-ing (instead of DI) accumulate here.
- Certainty: MEDIUM

---

## Section B — Knowledge Log

Format: `KL-{category}:NNN | insight/gotcha | evidence | certainty`

### Mistakes / Hazards

- **KL-mistake:001** | Android WebView caches the SPA via the service worker; you MUST bump `versionCode` in `android/app/build.gradle.kts` before every APK build, or `MainActivity.clearCacheOnVersionChange()` won't fire and users stay on the stale React UI. Multiple commits exist solely to bump it / fix cache (`62b4da2`, `072ce1a`, `43bc6f4`). | `MainActivity.kt:295`, `build.gradle.kts:16` (current `versionCode=62`); CLAUDE.md; android.md §10 | HIGH
- **KL-mistake:002** | Room schema discipline: ANY `@Entity`/`@Database` change (columns, indices, FKs, `defaultValue`, even declaring an existing index) requires bumping `@Database(version=N)`, adding a `MIGRATION_(N-1)_N`, AND registering it in BOTH `addMigrations(...)` call sites in `MagavApplication.kt` (initial build + recovery rebuild). The migration SQL must produce a schema whose hash matches the entity annotations exactly (including every index), or post-migration validation fails. | `MagavApplication.kt:109,135` (verified — two call sites); `MagavDatabase.kt`; CLAUDE.md; android.md BR-android:001/003 | HIGH
- **KL-mistake:003** | Vendored-DbHelper bug: the SYNC retry paths `Thread.Sleep(30000)` (30s) instead of the `DelayBetweenFails=1000ms` constant the async path uses — a failing sync query blocks the thread 30s before its single retry. | `DbHelperCore.cs:430,485` vs `:457`; common.md §10 | HIGH
- **KL-mistake:004** | Vendored-DbHelper bug: `IndexedList.RemoveItem` returns `_removeActions.Select(...).All(result => true)` which is ALWAYS true regardless of whether the item was actually removed (per-index removal result discarded). | `DataStructures/IndexedList.cs:78`; common.md §10 | HIGH
- **KL-mistake:005** | The connection-string decryption key is a hardcoded source literal `PasswordKey = "Magav2019097748"`. This makes ADR-006 obfuscation, not secret management — anyone with the source can decrypt the DB password. Crypto also uses legacy `Rijndael` + default `Rfc2898DeriveBytes` iterations. | `MagavConstants.cs:7` (verified); common.md §10 | HIGH
- **KL-mistake:006** | Error-handling deviation from CLAUDE.md: `POST /api/auth/login` (`:186`), `POST /api/auth/refresh` (`:206`), and the volunteers-import 500 path (`:359`) use `Results.Problem(...)` with ENGLISH messages instead of the mandated `Results.Json(ApiResponse.Fail("<Hebrew>"))`. CLAUDE.md warns `Results.Problem` can leak details in dev mode. | `Program.cs:186,206,359`; api.md §10, WF-api:007 | HIGH
- **KL-mistake:007** | Doc drift: `WeekdayAdvance` is a real, actively-scheduled reminder type present in BOTH constant pools (`MagavConstants.cs:15`, `Constants.kt:8` — verified) but is MISSING from CLAUDE.md's documented `ReminderTypes` list. The canonical constants drifted ahead of the human docs. | `MagavConstants.cs:15`, `util/Constants.kt:8`; CLAUDE.md "ReminderTypes" | HIGH
- **KL-mistake:008** | `.NET SchedulerRunLogRepository.InsertAsync` has a bare `catch (Exception)` that returns null and is interpreted upstream as "already ran (dedup hit)" — but a transient DB error during the run-log insert is indistinguishable from a real UNIQUE-constraint duplicate, silently masking failures. | `SchedulerRunLogRepository.cs:24-27` (verified); server.md §10 | HIGH
- **KL-mistake:009** | Orphaned public pages: `VolunteerSmsApprovalPage.tsx` and `RevokeSmsApprovalPage.tsx` are imported nowhere; `App.tsx` registers ONLY `/` and `*` (verified) — so the public `/sms-approval/:accessKey` route documented in CLAUDE.md is NOT wired into the shipped client build (backend endpoints still exist). Compounding: `RevokeSmsApprovalPage.tsx:33` calls `volunteersService.revokeSmsApproval(...)`, a method that doesn't exist in `volunteersService.ts` — a latent runtime error, masked only because the page is unreachable. | `App.tsx:22-25` (verified); web-client.md §10 | HIGH
- **KL-mistake:010** | `🚨 appsettings.json is git-tracked (verified) and ships real-looking, non-placeholder values for `Jwt:SecretKey`, `Database:Password`, and `PublicPages:SmsApprovalAccessKey` (a full GUID). A leaked JWT signing key enables token forgery. These belong in environment/secret stores with production overrides; rotate them out of source control. (`InforUMobile` user/pass/sender are empty placeholders — OK.) | `appsettings.json:9-36` (keys confirmed via `git ls-files` + grep; values not reproduced); api.md §10 | HIGH
- **KL-mistake:011** | `launchSettings.json` is stale ASP.NET scaffold: profiles still reference `launchUrl: "weatherforecast"` and ports `5228/7207/2811` that do NOT match the real Kestrel binding `http://localhost:5015`. Launching via a profile binds the wrong port + 404s. | `Properties/launchSettings.json:14,17,27`; api.md §10 | HIGH
- **KL-mistake:012** | `DbInitializer.SeedSampleDataAsync` (12 fake volunteers all sharing phone `050-4448246` with `ApproveToReceiveSms=1`, 4 teams, 84 shifts) runs UNCONDITIONALLY on every fresh web DB and is marked "remove before production" but still present. | `DbInitializer.cs:258,763-858`; server.md §10 | HIGH

### Learnings / Gotchas

- **KL-learning:001** | Scheduler-config seeding only runs on a FRESH DB (inside the `!dbExists` branch). New default config rows do NOT reach existing installs via the seed — they must be added via a SEPARATE idempotent migration (`INSERT OR IGNORE`, run unconditionally), exactly as `WeekdayAdvance` was. The "6 configs" default is effectively hardcoded in `DbInitializer` (.NET) + Android `DatabaseInitializer`. | `DbInitializer.cs:213,703-731` (seed) vs `:269-272,740-761` (migration); server.md §10; MEMORY scheduler-config-seeding-gotcha | HIGH
- **KL-learning:002** | `WeekdayAdvance` has two non-obvious couplings that break if the eligibility window is widened: (a) the message `{תאריך}`/`{יום}` must be derived from each shift's OWN date, not the window start; (b) a single date parameter is shared by both the eligibility query AND the run-log key. Refactoring the window must preserve both. | server.md BR-server:007; `SmsReminderService.cs:106-112`; MEMORY weekday-advance-window-coupling | HIGH
- **KL-learning:003** | Android WebView keyboard handling: `position:fixed` does NOT move for the soft keyboard, and `dvh`/`svh` units + `visualViewport`/`window.resize` are unreliable (`interactive-widget=resizes-content` is Chrome-only). The working fix (baked into the shared `dialog.tsx`): top-align the dialog, make it scrollable with generous bottom padding (`pb-[40vh]`), and `scrollIntoView({block:'start'})` on `focusin`. Apply to any new modal with inputs. | `components/ui/dialog.tsx:36-55`; web-client.md §11; CLAUDE.md | HIGH
- **KL-learning:004** | RTL directional-transform gotcha: Radix `Switch` uses `translate-x` for the thumb; under a global `dir="rtl"` the browser mirrors the whole component so the transform travels the wrong way. Fix: force `dir="ltr"` on the Switch root (already done in the vendored `switch.tsx`). Same pattern for any new component using directional transforms. Also: dialog close-X must sit on the LEFT (`left-4`) in RTL. | `components/ui/switch.tsx:11`, `dialog.tsx:85`; web-client.md §11; CLAUDE.md | HIGH
- **KL-learning:005** | The hardcoded Jewish-holiday seed runs out in 2035. Holiday awareness (which drives the effective day group) silently stops working after the last seeded year unless the table is extended (`82ba7d7` extended it from an earlier end to 2035). | `DbInitializer.cs:477-675`, `DatabaseInitializer.kt` (~160 rows); server.md §10 | HIGH
- **KL-learning:006** | `BcryptWorkFactor` is configurable (`SecuritySettings`, default 12) but the seeded web admin hardcodes work factor `12` instead of reading the setting — change the setting and the seed drifts. (Android seeds admin at BCrypt cost 10.) | `DbInitializer.cs:233` vs `AuthService.cs:233`; server.md §10 | MEDIUM

### Solutions / Debug

- **KL-debug:001** | Crash-on-reinstall fix: after an Android uninstall/reinstall the Keystore retains the old master key but the EncryptedSharedPreferences file is gone (and the DB may be encrypted with the wrong key). Recovery: catch the corrupted-prefs exception → delete + recreate the prefs file; on wrong-DB-key → delete + recreate the DB; Android Auto Backup was DISABLED to stop it restoring a stale encrypted DB; a `serverStarting` flag fixes a server double-init race. | commit `43bc6f4`; `MagavApplication.kt:149-154`; android.md §11 | HIGH
- **KL-debug:002** | "Disabled scheduler configs still sending SMS" was caused by cancelling alarms using only enabled configs' request codes. Fix: cancel alarms for ALL configs using the real request code formula `configId*10 + dayOfWeek`, and add an `isEnabled` guard inside `SmsSchedulerWorker` as defense-in-depth. | commit `cbeee68`; `AlarmScheduler.kt`; android.md WF-android:002 | HIGH
- **KL-debug:003** | SMS-during-call (DSDS) failure: sending SMS mid phone-call can fail/interrupt. Fix: the worker polls `TelephonyManager` call state, upgrades to a foreground worker, and waits for `CALL_STATE_IDLE` (max 20 min) before sending; native sends are Mutex-serialized with a 15s timeout and a unique requestCode per send to avoid sent-broadcast collisions. | commit `1cd38b4`; `SmsSchedulerWorker.kt:165`, `AndroidSmsProvider.kt:29` ("Serialize SMS sending to avoid broadcast receiver collisions"); android.md §11 | HIGH
- **KL-debug:004** | Waze link reliability: the Waze URL must be on its OWN line in the SMS body to stay clickable, and `?navigate=yes` is appended for direct navigation. (Same commit relaxed the over-aggressive run-log dedup — see ADR-008 consequences.) | commit `9afc0f1`; android.md BR-android:008 | HIGH
- **KL-debug:005** | Inter-SMS pacing: a deliberate ~500ms delay between sends avoids carrier rate-limiting during a batch run. | `SmsReminderService.kt:141` ("Add delay between SMS to avoid carrier rate limiting"); android.md WF-android:002 | HIGH

### Integration / Architecture

- **KL-integration:001** | The Jewish-holiday seed table (~160-180 rows, 2025–2035) is duplicated in `DbInitializer.cs` (.NET) and `DatabaseInitializer.kt` (Android) and MUST be kept in sync — there is an explicit in-code reminder. Both back the same holiday-aware day-group logic. | `DbInitializer.cs:476` comment "Keep holiday dates in sync with android/.../DatabaseInitializer.kt"; server.md §10 | HIGH
- **KL-integration:002** | The bulk scheduler-config save (`PUT /api/scheduler/config`) validates that the submitted id-set EXACTLY equals the stored id-set (no missing/unknown/duplicate ids) instead of checking a hardcoded "6 configs" count — so adding/removing a config (like WeekdayAdvance) never silently breaks saving. Mirrored on Android (`SchedulerRoutes.kt:77`). | `Program.cs:1911-1919`; api.md BR-api:011; android.md BR-android:020 | HIGH
- **KL-integration:003** | `window.NativeAuth` is the JS↔native session bridge: the shared React `authService` calls `window.NativeAuth.{onLoginSuccess,onTokenRefresh,onLogout}` (guarded `if present`) so the embedding Android app can persist/clear the JWT session into EncryptedSharedPreferences in sync with the web layer (enabling silent token injection on relaunch + biometric re-auth). On the plain web target the bridge is simply absent. | `authService.ts:74-79`; `auth/NativeAuthBridge.kt`; web-client.md IP-023, android.md IP-013 | HIGH
- **KL-integration:004** | Scoped-in-singleton DI: the singleton hosted services (`SmsSchedulerService`, `ShiftCleanupService`) cannot inject the scoped `MagavDbManager`/`SmsReminderService`, so they open a fresh `IServiceScopeFactory.CreateScope()` per tick to get a clean per-run DB context. | server.md BR-server:010, §11 (`SmsSchedulerService.cs:63-65`); CLAUDE.md DI section | HIGH
- **KL-integration:005** | InforUMobile (web SMS vendor) is hidden behind `ISmsProvider`; the provider NEVER throws — it returns `SmsResult{Success,Error}` with Hebrew messages and masks phone numbers to last-4 in logs — so one bad number can't abort a batch run. Android's `AndroidSmsProvider` implements the same `SmsProvider` contract over native `SmsManager`. | server.md §11 (`ISmsProvider.cs`, `InforUMobileSmsProvider.cs`); android.md §8 | HIGH

### Progress / Preference

- **KL-progress:001** | The system pivoted from cloud ASP.NET deployment to a local-Android-phone-as-SMS-gateway model (commit `bc4718a`, 2026-03-09), reorganizing into `web/` + `android/`. The web/.NET target still exists and is documented for Ubuntu deployment, so the project maintains BOTH targets in parallel against one frontend. | commit `bc4718a`; CLAUDE.md deployment sections | HIGH
- **KL-preference:001** | This is a single-author production system (bus factor ≈ 1) with NO automated tests anywhere (0 test files across all 5 components). Verification is manual; for Android, the documented gate is "install on a dev device with a populated DB and confirm data survives + no init-error notification" before shipping. Plan changes conservatively and validate thoroughly. | discovery.md §5/§7; CLAUDE.md "no automated tests"; MEMORY feedback_thorough_validation | HIGH

---

### Summary
- **ADRs:** 15 (ADR-001 … ADR-015). **Knowledge Log entries:** 28 (12 mistake, 6 learning, 5 debug, 5 integration, 2 progress/preference).
- **Highest-certainty / highest-impact ADR:** ADR-004 (defensive Room DB init — no destructive fallback) — grounded in an explicit documented data-loss incident (commit `e7fd42c`) and verified line-for-line in `MagavApplication.kt:112-137`.
