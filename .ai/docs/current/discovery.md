<!-- DeepInit Detect | Component: system-wide
Run ID: deepinit-2026-06-18 · Updated: deepinit-2026-08-17 (re-measured through 339a89c: 78 commits; source sizing recounted from `git ls-files`; component registry refreshed — Graphify IS now available and the structural graph was rebuilt deterministically at Step 0b) · prior: deepinit-2026-06-25b (re-verified through 778a2dd — + Duty Log feature (features/duty-log/* + editable-hours preview), + Android device-allowlist gate (license/DeviceAllowlist.kt, DeviceClipboardBridge.kt); detect-stage provenance — a full `deep-init` run recomputes the structural graph + scc sizing) · prior: deepinit-2026-06-24 (incremental --update; versionCode 63, secrets externalized)
Input files processed: git ls-files (252 source candidates), package.json, *.csproj, build.gradle.kts, appsettings*.json, git log
Generated: 2026-06-18 -->

# Discovery — Magav V-Notification-System

## 1. Project Overview
Magav is a **Hebrew RTL volunteer-shift management + SMS-reminder system** for patrol ("ניידת") shift coordination. It manages volunteers, shifts (imported from Excel), and sends scheduled SMS reminders, plus admin tooling for users/volunteers/shifts/locations/message-templates. The UI is entirely Hebrew, right-to-left.

Two deployment targets share **one React frontend**:
1. **Web** — .NET 8 Minimal-API backend + React SPA, on an Ubuntu server (Nginx + systemd).
2. **Android** — Kotlin app embedding a Ktor server + WebView (same React build), sending SMS natively via `SmsManager`.

## 2. Tech Stack
- **Frontend:** React 18.3 + TypeScript + Vite; Tailwind + Shadcn/UI (Radix); React Hook Form + Zod; Sonner toasts; vite-plugin-pwa. 37 deps / 18 devDeps.
- **Web backend:** ASP.NET 8 Minimal APIs (net8.0); NPoco ORM via custom `DbHelper`; SQLCipher (encrypted SQLite), WAL + 30s busy timeout; JWT auth.
- **Android:** Kotlin 1.9.22 / Java 17; Ktor 2.3.12 (CIO, `connectionIdleTimeoutSeconds=180`); Room 2.6.1 + SQLCipher 4.5.4 (**`@Database(version=11)`**); Koin DI; Apache POI 5.2.5; AlarmManager + WorkManager; native SmsManager. **versionCode 83 / 1.5.0.** minSdk 29 / target 35.
- **SMS provider (web):** InforUMobile XML API. **(Android:** native `SmsManager` with the v1.5.0 at-most-once dispatch scheme.**)**
- **Source size (recounted 2026-08-17 from `git ls-files` + `wc -l`):** **~31.7k source lines / 257 tracked source files.** Breakdown: web-client **15.6k** (124 .ts/.tsx), android **8.9k** (71 .kt — all of `db/` now tracked after the ISS-010 fix), .NET **~7.3k** (62 .cs: common 35 / server 22 / api 5). Growth since 2026-06-18 is concentrated in the two feature commits (~4.1k inserted lines across all five components).

## 3. Architecture Style
**Hybrid / multi-target — confidence HIGH (method: explicit CLAUDE.md docs + directory heuristics, no conflict).**
- Web backend = **layered .NET** with a 3-project dependency chain `Magav.Common → Magav.Server → Magav.Api` (Common = models/DbHelper/Excel/encryption; Server = services/repositories/SMS; Api = Minimal-API endpoints + DI + middleware).
- Web frontend = **React SPA** (two-tier nav: React Router for public routes + state-based internal navigation).
- Android = **hybrid embedded server** — a Ktor HTTP server (localhost:5015) inside a foreground service, mirroring the .NET API surface, with a WebView loading the same React UI.

## 4. Component Registry
| Component | Path | Type | Files | Src lines | Tests | README | Architecture |
|-----------|------|------|-------|-----------|-------|--------|--------------|
| **common** | `web/server/Magav.Common` | .NET shared lib (Models, DbHelper/NPoco, Excel, encryption, extensions) | 35 .cs | ~3.7k | none | no | Layered (leaf) |
| **server** | `web/server/Magav.Server` | .NET business logic (Services, Repositories, SMS subsystem, DbInitializer) | 22 .cs | ~3.6k | none | no | Layered (→common) |
| **api** | `web/server/Magav.Api` | .NET 8 Minimal-API entry (`Program.cs` — 56 endpoints, DI, middleware, auth) | 5 | ~2.7k | none | no | Layered (→server,common) |
| **web-client** | `web/client/src` | React 18 + TS SPA, shared by web + Android WebView | 124 .ts/.tsx | ~15.6k | none | no | SPA (HTTP→api) |
| **android** | `android/app/src/main` | Kotlin: Ktor server + Room DB + native SMS scheduler | 71 .kt | ~8.9k | none | no | Hybrid (mirrors api) |

**Dependency order (toposort):** Wave 2a leaves = `common`, `web-client`, `android`; Wave 2b = `server` (→common); Wave 2c = `api` (→server, common). `web-client`/`android` have **no compile-time edge** into .NET — they integrate over HTTP / re-implement the API surface, so the React build is a runtime dependency only.

## 5. Git Intelligence Summary
**78 commits**, active 2026-01-27 → 2026-08-17 (~6.7 months); **not shallow** → IF-5 signals reliable. Top churn: `android/app/build.gradle.kts` (37 — version bumps per APK build), `ShiftsManagementPage.tsx` (22), `Program.cs` (18), `Index.tsx` / `menuItems.ts` / `SmsSchedulerWorker.kt` / `ShiftRoutes.kt` / `MagavApplication.kt` (13 each), `service/SmsReminderService.kt` / `RequestDtos.kt` (12 each). Single primary author (Yanivpinhass, all 78) ⇒ **bus_factor ≈ 1 system-wide** — IF-5 weights this. See `git-intelligence.md` for the full table and the incident-commit signal.

## 6. Database Connectivity
- **Web dev:** SQLCipher-encrypted SQLite at `db/magav.db` (gitignored, with `db/Pass.txt` passphrase + WAL files — **all untracked, local-only**).
- **Android:** Room + SQLCipher, passphrase in EncryptedSharedPreferences.
- **Access method:** no `sqlcipher`/MCP DB tool detected; DB is encrypted; per **global-rules §R7 the DB will NOT be connected**. Schema is documented **from code** (`DbInitializer.cs`, Room `@Entity` classes) in `data-layer.md`; **IF-2 live-drift checks are SUPPRESSED** (no approved live read) — stated, not silently skipped.

## 7. Legacy Health Flags
- **No automated tests anywhere** (0 test files across all 5 components — confirmed by CLAUDE.md). Raises IF-5 coverage term for every component. The two 2026 feature commits substitute multi-agent plan validation + adversarial review and an on-device manual gate.
- **God objects (re-measured 2026-08-17):** `Program.cs` (**2718** LOC, single endpoint file), `ShiftsManagementPage.tsx` (**1162**), `DbInitializer.cs` (**1148**), `DbHelper.cs` (960), Android `ShiftRoutes.kt` (**923**), `AdminShiftsPage.tsx` (587), Android `AdminShiftRoutes.kt` (466).
- **No per-component READMEs.** Single-author bus factor.
- **Vendored UI:** `web/client/src/components/ui/*` is Shadcn/UI (generated/3rd-party-derived; `sidebar.tsx` 761, `chart.tsx` 363) — treat as convention, not first-party logic.

## 8. Structural Analysis Status
- **Graphify is now available** (`graphify-out/graph.json` present; the project's own CLAUDE.md mandates it). At Step 0b of this run the graph was rebuilt deterministically with `graphify update .` — **3021 nodes / 4996 edges / 184 communities over 326 files**, 0 LLM tokens. Earlier runs fell back to grep-inferred imports; the Map and the IF-8/IF-3a edge inputs now reflect current code.
- `graphify-out/` is gitignored (added in `cfb8e36`) and is in the always-skip set for analysis.
- **Exclusions counted:** `node_modules`/`dist`/`build`/`bin`/`obj`/`.gradle` dirs skipped; binaries/fonts/minified/lockfiles skipped; `db/` gitignored (DB + passphrase, **not analyzed**). `web/client/src/components/ui/` retained for tech-stack detection but treated as vendored for component logic.
- **Redaction posture:** `appsettings.json` is tracked and carries `Jwt` (Issuer/Audience/TTLs)/`Database` (Path)/`Security`/`InforUMobile` sections — **values never emitted**; only structure/intent documented (R5 gate over all output). As of `2989b01` the secret keys (`Jwt:SecretKey`, `Database:Password`, `PublicPages:SmsApprovalAccessKey`) were removed from the tracked file → env/user-secrets (ADR-017); `appsettings.Development.json` is now gitignored.

## 9. Cost Estimate & Profile
- **Profile:** depth=deep, review=thorough (2 cycles + adaptive 3rd if the cycle-2 gate fails), issues=on (all shipped families), dashboard/SARIF on. Bare-run defaults.
- **Right-sizing:** target is ~28k lines / 5 components — **above Small, below Large**. Deep+thorough is appropriate (no auto-downgrade); the user's standing preference is thorough validation on this production system.
- **Estimate (grep fallback, no Graphify discount):** base ≈ 28.2k × 1.2 × 1.4 ≈ ~47k structural-pass tokens; with the per-component LLM extraction + horizontal + review + issue pass, expect a real **~250–450k-token / mid-single-digit-$ run** (S/M fixed-overhead floor dominates the LOC term — `detection.md` calibration). Issue pass: IF-2 suppressed (no DB), IF-5/IF-8/IF-3b deterministic; IF-1/IF-3a/IF-4/IF-7(a) semantic over the 5 components.
