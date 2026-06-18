<!-- DEEPINIT:START (managed — regenerated on each `deep-init` run; edit OUTSIDE these markers) -->
# Magav V-Notification-System — Agent Context

Hebrew RTL volunteer-shift management + SMS-reminder system for patrol ("ניידת") coordination. Manages volunteers, Excel-imported shifts, and scheduled SMS reminders, with Hebrew/RTL admin tooling. **Two deployment targets share ONE React frontend:** (1) **Web** — .NET 8 Minimal API + React SPA on Ubuntu (Nginx/systemd); (2) **Android** — Kotlin app embedding a Ktor server + WebView (same React build), sending SMS natively via `SmsManager`.

## Architecture
Hybrid, layered. Web backend = .NET project chain `Magav.Common → Magav.Server → Magav.Api` (acyclic). React SPA served by the API and by the Android WebView. Android = embedded Ktor server (localhost:5015) mirroring the .NET API surface. Components map to `.ai/docs/components/`.

## Components (5)
- **common** — shared .NET lib: Models, the custom `DbHelper`/NPoco ORM wrapper, `MagavConstants`, Excel, encryption. → `.ai/docs/components/common.md`
- **server** — .NET business logic: SMS scheduler subsystem, JWT auth, repositories, `DbInitializer`. → `.ai/docs/components/server.md`
- **api** — .NET 8 Minimal-API entry: all endpoints + DI + middleware live in one `Program.cs`. → `.ai/docs/components/api.md`
- **web-client** — React 18 + TS + Vite SPA (Tailwind/Shadcn, RHF+Zod, PWA); shared by web + Android. → `.ai/docs/components/web-client.md`
- **android** — Kotlin: Ktor + Room/SQLCipher + AlarmManager/WorkManager + native SMS. → `.ai/docs/components/android.md`

## Critical to know (non-obvious, load-bearing)
- **The same REST contract + domain model is implemented THREE times with no shared code and no tests** — .NET `web/server/Magav.Api/Program.cs`, Android Ktor `android/.../api/routes/*`, consumed by React `web/client/src/services/*` (entities triplicated: .NET Models / Room entities / TS types). A contract or rule change must be applied to ALL THREE or it silently drifts. Drift is already present (refresh-token TTL 7d .NET vs 3d Android; the Volunteer entity below). [ISS-004]
- **Room schema changes can SILENTLY WIPE ALL USER DATA if done wrong.** Any `@Entity` change requires: bump `@Database(version=N)` in `android/.../db/MagavDatabase.kt` (currently **8**), add `MIGRATION_N_(N+1)`, and register it in BOTH `addMigrations(...)` sites in `MagavApplication.kt`. `initializeDatabase()` (`android/.../MagavApplication.kt:102-137`) deliberately omits `fallbackToDestructiveMigration` and recovers ONLY on SQLCipher key/corruption errors — every other error (incl. a forgotten-migration schema-hash mismatch) is re-thrown so it crashes VISIBLY instead of wiping data. Verify on a populated dev device before shipping. [ADR-004 — born from a real data-loss incident]
- **DayGroup = the day the SMS is SENT (run day), not the shift's day**; `DaysBeforeShift` is the look-ahead. Holiday-aware ladder (Sat → today/tomorrow-is-holiday → Fri → SunThu). `web/server/Magav.Server/Services/Sms/SmsSchedulerService.cs`; mirrored `android/.../scheduler/SmsSchedulerWorker.kt:268`. Easy to get backwards.
- **Same-day reminders APPEND the location** (city/name + Waze link) after the template; **Advance / WeekdayAdvance / Manual do NOT** (location may change before the shift). Changing a location after the same-day SMS went out triggers a `LocationUpdate` re-notify.
- **SMS dedup is two-tier:** `SmsLog` indexed on (ShiftId, ReminderType) + `SchedulerRunLog` UNIQUE on (ConfigId, TargetDate, ReminderType). Caveat: `SchedulerRunLogRepository.InsertAsync` (`web/server/Magav.Server/Database/Repositories/SchedulerRunLogRepository.cs:24`) catches ALL exceptions as "already ran" — a transient DB error reads as a dedup hit. [ISS-006]
- **Soft-cancel:** cancelling sets `IsCanceled=1` + `CanceledAt` (never deletes). **EVERY query listing active shifts MUST filter `IsCanceled = 0`** (eligibility, by-range, available-dates…). Hard-delete only via the canceled-shifts page after soft-cancel.
- **5 ReminderTypes:** `SameDay, Advance, WeekdayAdvance, LocationUpdate, Manual` (`web/server/Magav.Common/MagavConstants.cs:11-15`). `WeekdayAdvance` uses a half-open `[today+N, NextWorkingDay(today)+N)` window to pull weekend/holiday advance-sends onto a working day (`SmsSchedulerService.cs:114`). **`MagavConstants` is canonical; Android `util/Constants.kt` MUST mirror it exactly** — verified in sync today (incl. SmsStatuses Success/Fail, DayGroups SunThu/Fri/Sat).
- **`user.roles` is a string ARRAY** (`["Admin"]`), NOT `user.role` — always `roles.includes("Admin")`. Roles: `Admin`, `SystemManager`, `User`. localStorage keys: `accessToken`, `refreshToken`, `user`.
- **Bump `versionCode`** in `android/app/build.gradle.kts` (currently **62** / 1.4.13) before EVERY APK build — the WebView caches the PWA service worker; `MainActivity.clearCacheOnVersionChange()` clears it on a version bump. Forgetting = users stuck on the old UI.
- **Seeding (scheduler configs + message templates) runs ONLY on a fresh DB** — new seed rows do NOT reach existing installs (`DbInitializer.cs` / Android `DatabaseInitializer.kt`); add such rows in all the hardcoded seed sites.
- **RTL gotchas:** dialog close (X) is on the LEFT (`left-4`); `Switch` needs `dir="ltr"` to stop transform-mirroring (`components/ui/switch.tsx`); Android WebView does NOT move `position:fixed` for the keyboard, so dialogs are TOP-aligned + scrollable — do not rely on `dvh`/`visualViewport`/bottom-sheets (`components/ui/dialog.tsx`).
- **`DbHelper` method names differ from NPoco defaults:** `FetchAllAsync()` (all rows, no-arg), `FetchAsync<T>(expr | sql,args)`, `ExecuteQueryAsync` (NOT `ExecuteAsync`), `ExecuteScalarAsync<T>`, `SingleOrDefaultByIdAsync` (`web/server/Magav.Common/Database/DbHelper.cs`). `DbHelper` appears vendored from another codebase ("Avidov.Common") — treat as a library, not first-party.
- **Timezone is Israel / Asia-Jerusalem everywhere** (scheduling, dates, holidays).

## Security (the project's "Security First" mandate)
- Parameterized queries only (`@0,@1…` .NET; Room `@Query` params) — never concatenate SQL.
- Every endpoint `.RequireAuthorization()` unless intentionally public. The ONLY public endpoints: `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/health`, `POST /api/public/sms-approval/{accessKey}/*` (access-key + rate-limited 3/5min). Authorization audit is currently clean.
- Use `Results.Json(ApiResponse<T>.Fail("<Hebrew>"))`, never `Results.Problem` (can leak detail in dev) — note current deviations [ISS-005]. Never expose exception detail; full details server-side only.
- File uploads: CSRF `X-Requested-With` header + `.xlsx/.xls` ext + magic-byte check (`0x50 0x4B` / `0xD0 0xCF`) + in-memory, max 10MB.
- Validate all inputs server-side even if validated client-side.

## Where to look
- Component detail → `.ai/docs/components/<name>.md`
- Why decisions were made (15 ADRs + Knowledge Log) → `.ai/docs/decisions.md`
- Domain language, the triplicated model, ownership → `.ai/docs/domain-model.md`
- End-to-end workflows (SMS send, shift import, auth) → `.ai/docs/functional-workflows.md`
- Dependencies, the three-way cascade, no cycles → `.ai/docs/technical-dependencies.md`
- Schema-from-code + code-vs-code drift → `.ai/docs/data-layer.md`
- **Known issues** (9: committed dev creds + hardcoded `PasswordKey`, dead public SMS-approval route, divergent password policy, …) → `.ai/docs/issues.md`
<!-- DEEPINIT:END -->

<!-- HUMAN-AUTHORED — carried forward; edit freely. DeepInit never regenerates or validates this region. The full pre-run CLAUDE.md is preserved verbatim in the dated CLAUDE.md.*.bak and its reference depth was relocated into .ai/docs/. -->

## Build & run (quick reference)
- **Web client** (`web/client/`): `npm install` · `npm run dev` (→ http://localhost:8080, proxies `/api/*` → :5015) · `npm run build` · `npm run lint`
- **Web server** (`web/server/Magav.Api/`): `dotnet build` · `dotnet run` (→ http://localhost:5015). Both must run together for web dev.
- **Android**: `build-apk.bat` (builds React → copies `dist/` to `android/app/src/main/assets/web/` → `gradlew assembleDebug`). Install: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`. **Bump `versionCode` first** (see managed region).
- **Publish (Linux)**: `dotnet publish -c Release -r linux-x64 --self-contained false`; deploy to `/opt/magav/` (systemd `magav.service`, Nginx). DB reset = delete `/opt/magav/db/magav.db` + restart.

## Default dev credentials
- Web/.NET: `admin` / `Admin123!` · Android (seeded): password `12345`. (Dev-only.)

## Notes
- No automated tests in this project.
- The full original CLAUDE.md (architecture deep-dive, Excel format spec, deployment runbook, PRD pointers) is in `CLAUDE.md.<date>.bak` and relocated across `.ai/docs/`.
