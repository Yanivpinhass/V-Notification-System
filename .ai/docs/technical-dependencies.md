<!-- DeepInit C8 update | Run ID: deepinit-2026-06-30 | Generated: 2026-06-30
Component: system-wide
Updated: deepinit-2026-06-30 (Auto-Callback-to-Gate — Android-only /api/callback-config endpoint as a NEW accepted three-way-contract divergence [ISS-004], like /api/settings/sms-sim; new android.telecom/android.telephony/AlarmManager platform deps; Room schema 8→9, §4.2/§4.3/§4.7) · prior: deepinit-2026-06-25b (commit 5124870 — a THIRD web↔android runtime JS bridge window.NativeClip on the device-block page, §4.6) · prior: deepinit-2026-06-25 (commit 970cdcc — Duty Log: html2canvas added to web-client (lazy); a SECOND web↔android runtime JS bridge window.NativeMedia, §4.6)
Input files processed: the 5 component docs + discovery.md
Generated: 2026-06-18 -->

# Technical Dependencies — Magav V-Notification-System

System-wide synthesis of how the five components depend on one another, where coupling concentrates, and what cascades when a contract changes.

---

## 1. Dependency Graph

### 1.1 Edge table

| From | To | Edge type | Mechanism | Evidence | Certainty |
|---|---|---|---|---|---|
| `server` | `common` | **COMPILE-TIME** (project ref) | `Magav.Server.csproj` `<ProjectReference>` → `Magav.Common`; imports `DbHelper`, `Models.*`, `MagavConstants` | `web/server/Magav.Server/Magav.Server.csproj:16-18`; `web/server/Magav.Server/Database/Repository.cs:5` | HIGH |
| `api` | `server` | **COMPILE-TIME** (project ref) | imports `MagavDbManager`, `AuthService`, `SmsReminderService`, `SmsSchedulerService`, `ShiftCleanupService`, `DbInitializer`, import services | `web/server/Magav.Api/Program.cs:9-11,74-98` | HIGH |
| `api` | `common` | **COMPILE-TIME** (project ref) | imports `Models.*`, `MagavConstants`, `DbHelper.CreateSqliteDbHelper`, `ApiResponse<T>` (the last re-exported via `Magav.Server.Services`) | `web/server/Magav.Api/Program.cs:5-8,78` | HIGH |
| `web-client` | `api` | **RUNTIME** (HTTP/JSON) | browser SPA calls `/api/*`; no source/compile edge into .NET | `web/client/src/services/*` (see web-client.md §6, IP-web-client:001-022) | HIGH |
| `android` (Ktor) | `api` | **RUNTIME / CONTRACT-MIRROR** | Android re-implements the same REST contract in Kotlin Ktor routes; not a code import — a hand-maintained parallel implementation | `android/.../api/routes/*` mirror the .NET endpoint set (api.md §8 ↔ android.md §8) | HIGH |
| `web-client` | `android` | **BUILD-TIME** (asset copy) | `build-apk.bat` builds React `dist/` and copies it into `android/app/src/main/assets/web/`; the Android WebView then loads it from `http://localhost:5015` | discovery.md §3; android.md IP-android:002; web-client.md §8 | HIGH |
| `web-client` | `android` (Ktor at runtime) | **RUNTIME** (HTTP, in-process) | inside the APK, the same SPA's `/api/*` calls hit the embedded localhost Ktor server instead of the .NET API | web-client.md BR-web-client:009 (default `apiBaseUrl = http://localhost:5015`); android.md IP-android:001-002 | HIGH |
| `server` → `common.DbHelper` → SQLCipher DB | runtime | DB I/O | NPoco over encrypted SQLite | server.md IP-server:002-003 | HIGH |
| `android` → Room → SQLCipher DB | runtime | DB I/O | Room DAOs over encrypted SQLite (a SEPARATE physical DB on the device) | android.md §5, IP-android:011 | HIGH |

### 1.2 Sketch

```
COMPILE-TIME (.NET, acyclic):

   common  ◄──────  server  ◄──────  api
  (leaf:               (services/         (Program.cs:
   Models,              repositories,      ~50 endpoints,
   DbHelper,            SMS subsystem,     DI, middleware,
   MagavConstants,      DbInitializer,     auth policies)
   Excel, crypto)       Auth, scheduler)

         efferent →               ← afferent
   (api depends on server+common; common depends on nothing internal)

RUNTIME / CONTRACT (no compile edge):

   web-client (React SPA, ONE build)
        │  HTTP /api/*
        ├───────────────► api  (Magav.Api, .NET)         [web deployment]
        └───────────────► android Ktor @ localhost:5015  [APK deployment]
                                  │
   build-apk.bat copies dist/ ──► android assets/web/  (WebView loads it)

   THREE-WAY API CONTRACT MIRROR:
      .NET api  ⇄  android Ktor  ⇄  consumed by web-client
      (same endpoint paths/DTOs implemented twice, consumed once)
```

```mermaid
graph LR
  subgraph dotnet[".NET — compile-time, acyclic"]
    common["common<br/>(leaf hub)"]
    server["server"]
    api["api / Program.cs"]
    common --> server --> api
    common --> api
  end
  client["web-client<br/>(React SPA, one build)"]
  android["android<br/>(Ktor @ localhost:5015)"]
  client -. "HTTP /api/* (runtime)" .-> api
  client -. "HTTP /api/* (runtime, in-process)" .-> android
  client == "dist/ copied (build-time)" ==> android
  api -. "contract mirror (hand-maintained)" .- android
```

`-->` solid = compile-time project reference; `-.->` dotted = runtime HTTP; `==>` = build-time asset copy; `-.-` = contract-mirror obligation (no code edge).

---

## 2. Circular Dependencies

**NONE among the .NET projects.** The chain `common → server → api` is strictly acyclic: `Magav.Common` has zero internal project references (it is the leaf, `Magav.Common.csproj:9-37`, confirmed common.md §4 boundary rules); `Magav.Server` references only `Magav.Common` (`Magav.Server.csproj:16-18`); `Magav.Api` references both but nothing references `Magav.Api`. No back-edge (`common`→`server`, `server`→`api`, or `api`→anything-internal) exists. **(IF-8 negative — no cycles.)** [HIGH]

At the runtime/contract layer there is also no cycle: `web-client` and `android` are sinks that consume the API contract; neither is imported by the .NET projects. The `web-client → android` asset copy and the `web-client → {api|android-ktor}` HTTP calls are one-directional. [HIGH]

The only relationship that *resembles* a cycle is the **contract-mirror** between `api` and `android` (each implements the same REST surface). This is NOT a dependency cycle — there is no code edge in either direction; it is a *replication obligation* (see §4 cascade risk). [HIGH]

---

## 3. Coupling Analysis

Afferent coupling (Ca) = number of components that depend ON this one. Efferent coupling (Ce) = number this one depends on. Compile-time edges only, except where noted.

| Component | Afferent (depended-on-by) | Efferent (depends-on) | Notes | Certainty |
|---|---|---|---|---|
| **common** | 2 (`server`, `api`) — **the shared hub** | 0 internal | Highest afferent in the system; every model/constant/DbHelper change radiates outward. Stable (changes should be rare); in practice churns moderately (DbInitializer-adjacent models). | HIGH |
| **server** | 1 (`api`) | 1 (`common`) | Middle layer; owns scheduler + auth + repositories. | HIGH |
| **api** | 0 (compile) / 2 runtime consumers of its *contract* (`web-client`, `android`-mirror) | 2 (`server`, `common`) | Top of the .NET stack; `Program.cs` is the single API hub (§3.1). | HIGH |
| **web-client** | 0 | runtime: `api` (web) OR `android` Ktor (APK); build-time consumer of `android` (its dist is copied there) | Pure sink at compile time; runtime-couples to whichever backend hosts it. | HIGH |
| **android** | build-time: consumes `web-client` dist | runtime-mirrors `api` contract; platform APIs (SmsManager/AlarmManager/Room, + new `TelecomManager`/`TelephonyManager` for Auto-Callback-to-Gate, §4.7) | Self-contained second implementation of the whole stack; some endpoints are Android-only native settings with no .NET counterpart (§4.2, ISS-004 accepted). | HIGH |

### 3.1 Identified hubs (high-fan-in / high-fan-out single files)

- **`common` is the shared data/utility hub.** Both `server` and `api` import its `Models.*` and `MagavConstants`; `server` additionally imports `DbHelper`. It is the single most-depended-on unit (Ca=2, the max for an internal .NET project here). `DbHelper.cs` (960 LOC) is itself a god object inside the hub — every repository in `server` funnels through it. [HIGH] (common.md §1, §10; structural-graph.json `common.imported_by`)
- **`Program.cs` (api) is the API hub — 2249 LOC.** Every one of ~50 endpoints, all DI registration, middleware, auth policies, and request/response DTOs live in this one file (api.md §10). High change-collision risk; it is the single point through which all web HTTP traffic is wired. [HIGH]
- **Android `ShiftRoutes.kt` is the Android API hub — 907 lines, 13 endpoints** with inline SMS-send logic duplicated across cancel/delete/send-sms/location-update (android.md §10). It is the Android-side counterpart to the shifts portion of `Program.cs`. [HIGH]
- **Secondary god objects** (size hubs, not dependency hubs): `web-client` `ShiftsManagementPage.tsx` (1135 lines), `common` `DbHelper.cs` (960), `server` `DbInitializer.cs` (859). [HIGH] (discovery.md §7)

---

## 4. Cascade Risk — "if X changes, what is affected?"

### 4.1 `common` Model / `MagavConstants` / `DbHelper` change → fans out to all of .NET (+ obligates Android)

A change to a `Magav.Common.Models.*` entity, to `MagavConstants` (the canonical `ReminderTypes` / `SmsStatuses` / `DayGroups` strings), or to the `DbHelper` API surface cascades **compile-time** into `server` (repositories, scheduler, auth) and `api` (DTO mapping, endpoint handlers), because both reference `common`. [HIGH] (structural-graph.json; common.md §8; server.md §9; api.md §9)

Because the persisted string values and the schema are **mirrored verbatim on Android** (CLAUDE.md "use the constants, never inline the strings"; android.md BR-android:006), the same change *also* obligates a matching edit in Android `util/Constants.kt` and the corresponding Room entity — but the compiler will NOT catch a missed Android update (no code edge). This is the first non-obvious cascade: **a `common` change is compiler-enforced inside .NET but only convention-enforced toward Android.** [HIGH]

A `DbHelper` behavioral change (e.g. the retry/transaction semantics in WF-common:001-004) cascades to every repository in `server` silently — no signature change, so it is the most dangerous kind of `common` edit. [MEDIUM — inferred from the fact that all repositories route through DbHelper]

### 4.2 API-contract change → THREE-WAY mirror cascade (the key non-obvious risk)

**The same REST endpoint contract is implemented THREE times:**
1. **.NET `api`** — `Program.cs` `app.Map*` endpoints (api.md §8).
2. **Android Ktor** — `android/.../api/routes/*` re-implement the identical paths/DTOs in Kotlin (android.md §8).
3. **Consumed by `web-client`** — the single React SPA's `services/*` call `/api/*` and expect the `ApiResponse<T>` `{success,data,message}` envelope (web-client.md §6, BR-web-client:007).

Therefore **any change to an endpoint's path, request DTO, response shape, auth policy, or validation rule obligates THREE coordinated edits**: the .NET handler, the Android Ktor route, AND the React service/typing — or the two backends silently diverge for the one shared client. [HIGH]

- Because `web-client` is one build served by BOTH backends, a contract change that lands in only one backend means the SAME UI works against the web deployment and breaks (or silently misbehaves) inside the APK, or vice-versa. The compiler catches none of this; there are no contract tests (§5 cross-references / 0 tests). [HIGH]
- Concrete live examples of where the three implementations are already kept in lockstep by hand: the file-upload validation pattern (CSRF header + ext + magic bytes + 10MB) appears in api.md BR-api:008, android.md BR-android:015, and is honored client-side by `X-Requested-With` (web-client.md BR-web-client:008); the soft-cancel convention (api.md BR-api:006, android.md WF-android:006, web-client.md IP-014); the "exact id-set match" bulk-scheduler-save rule (api.md BR-api:011 ↔ android.md BR-android:020). Each of these is a triple that must move together. [HIGH]
- **Accepted ASYMMETRIES (Android-only native-setting endpoints — NOT a divergence defect) [ISS-004 accepted]:** a small number of endpoints exist in the Android Ktor surface ONLY, with NO .NET `Magav.Api` counterpart, because they configure a device-local native capability the web build cannot run. The React page for each is gated to the Android WebView (presence-detected, e.g. `window.NativeMedia`), so it never ships behind the web deployment. Known instances: (1) `GET/PUT /api/settings/sms-sim` — SIM-selection for native SMS (`android/.../api/routes/SettingsRoutes.kt:53,68`); (2) **NEW — `GET/PUT /api/callback-config`** — the Auto-Callback-to-Gate setting, wired only in Android `KtorServer.kt:87` (`callbackConfigRoutes(database)`, right after `settingsRoutes`, before the static catch-all) and served by `android/.../api/routes/CallbackConfigRoutes.kt`; consumed by the Android-gated React page `web/client/src/pages/CallbackSettingsPage.tsx` via `web/client/src/services/callbackConfigService.ts`. There is intentionally NO `Program.cs` handler and NO web-served implementation. This is the SAME accepted "Android-only native setting" pattern as `/api/settings/sms-sim` — **accepted by design, not a contract drift to reconcile.** [HIGH]

### 4.3 Schema change → dual-schema cascade (two independent DDL definitions)

The DB schema is defined **independently twice**: .NET `DbInitializer.cs` CREATE TABLE/migrations (server.md WF-server:005) and Android Room `@Entity` + migrations to `@Database(version=9)` (`android/.../db/MagavDatabase.kt:44`; android.md BR-android:001-003). A column added on one side does NOT propagate to the other; on Android a botched entity change without the version-bump + migration triple **silently wipes the entire device DB** (CLAUDE.md 🚨; android.md BR-android:001-002). See `data-layer.md` §3 for the actual code-vs-code drift already present. [HIGH]

**Schema is now version 9 (was 8)** with the new `CallbackConfigEntity` as the 11th `@Entity` (`MagavDatabase.kt:42`). `MIGRATION_8_9` (`MagavDatabase.kt:146-168`) is a worked second example of the full migration ritual done CORRECTLY: it is **additive-only** (`CREATE TABLE IF NOT EXISTS CallbackConfig` + `INSERT OR IGNORE` the singleton row; touches NO existing table, so existing user data is preserved), the migration's column list + `NOT NULL` + `DEFAULT` clauses match the entity exactly (Room schema-hash verified via `exportSchema`), and it is registered in BOTH `addMigrations(...)` sites in `MagavApplication.kt` (initial build + SQLCipher-recovery rebuild) with `fallbackToDestructiveMigration` still ABSENT. Belt-and-suspenders: `DatabaseInitializer.seedCallbackConfig()` also seeds the singleton idempotently on the fresh-install path. NOTE: because this is an Android-only table backing an Android-only setting, there is NO matching .NET `DbInitializer.cs` DDL — the dual-schema rule does not apply here (one side intentionally has no counterpart, mirroring the §4.2 endpoint asymmetry). [HIGH]

### 4.4 Background-service / scheduler change → behavioral mirror

The SMS-scheduler semantics (DayGroup = send-day, holiday-aware effective group, WeekdayAdvance pull-back window) are implemented in `server` (`SmsSchedulerService`/`SmsReminderService`, server.md WF-server:001-002,009, BR-server:003,007,008) AND in Android (`SmsSchedulerWorker`/`SmsReminderService`, android.md WF-android:002, BR-android:009,010), AND previewed in the client (`schedulerPreview.ts`, web-client.md BR-web-client:010,011). A change to the eligibility window or day-group ladder obligates all three to stay aligned, or the two platforms send different reminders from the same config. (MEMORY: "WeekdayAdvance window coupling" and "DayGroup semantics" call out exactly these coupling traps.) [HIGH]

### 4.6 WebView JS-bridge couplings (`NativeAuth` + `NativeMedia` + `NativeClip`) — runtime, not in the import graph

There are now **three** `window.*` JS↔native bridges the shared React build consumes only when running inside the Android WebView: `NativeAuth` (session persistence — `authService` ↔ `auth/NativeAuthBridge.kt`); **`NativeMedia`** (Duty Log save/share — `exportDutyLogPng` ↔ `media/MediaBridge.kt`), new in `970cdcc`; and **`NativeClip`** (`copyDeviceId()` on the device-block page — `MainActivity.buildDeviceBlockHtml` ↔ `license/DeviceClipboardBridge.kt`), new in `5124870` — all registered at `MainActivity.kt:115-119`. Each is a **runtime coupling with no code edge** in the structural graph, so the compiler catches nothing: changing a JS method name on the React side OR a Kotlin `@JavascriptInterface` signature on the Android side silently breaks the other. The React side always feature-detects (`if (window.NativeMedia)`) so the plain-web deployment (bridge absent) degrades to `<a download>`. Additional Android-only guard: R8 strips un-kept `@JavascriptInterface` methods, so `proguard-rules.pro` carries a generic keep — forgetting it would no-op the bridge in a release build only. [HIGH] (web-client.md IP-023/024; android.md IP-013/015; decisions.md KL-integration:003/006)

### 4.7 Auto-Callback-to-Gate — new Android platform dependencies (Android-only, no .NET / no cross-component cascade)

The `callback/` package (`CallbackLogic` + `CallbackPhoneStateReceiver` + `CallbackAlarmReceiver`) adds NEW Android-platform API dependencies that exist ONLY in the android component — the web build cannot reference them, and .NET (`common/server/api`) is UNCHANGED. They are leaf platform edges (Android → OS), not internal-component edges, so nothing else in the system cascades from them. [HIGH]

| New platform dependency | Used for | Permission | Evidence | Certainty |
|---|---|---|---|---|
| `android.telecom.TelecomManager` — `endCall()` / `placeCall(tel:…, EXTRA_PHONE_ACCOUNT_HANDLE)` | reject the ringing call, then auto-dial the Gate | `ANSWER_PHONE_CALLS` (reject) + `CALL_PHONE` (dial) | `android/.../callback/CallbackLogic.kt:13,159,179,181` | HIGH |
| `android.telephony.TelephonyManager` — `callState` (fire-time RINGING re-check) + `createForSubscriptionId(subId).phoneAccountHandle` | the SINGLE authoritative gate is `callState==RINGING`; resolve the `PhoneAccountHandle` for the SMS-selected SIM | (read state) | `CallbackLogic.kt:14,209-211`; fire receiver re-check in `callback/CallbackAlarmReceiver.kt` | HIGH |
| `AlarmManager` exact one-shot — `setExactAndAllowWhileIdle(ELAPSED_REALTIME_WAKEUP, now+20s)` | the 20s unanswered wait; a single live alarm per ringing call (fixed `requestCode=770042`, `FLAG_IMMUTABLE`) | `SCHEDULE_EXACT_ALARM` (canScheduleExactAlarms guard) | `CallbackLogic.kt:34,110,116` | HIGH |

- **Reuses, does NOT duplicate, the existing alarm pattern.** The one-shot exact alarm follows the same `AlarmScheduler` / `SmsAlarmReceiver` mechanism the SMS scheduler already uses (manifest `BroadcastReceiver` + exact `AlarmManager`), and the Gate call **reuses the existing SMS SIM setting** `AppSettings 'sms_sim_subscription_id'` to pick the dialing SIM (`CallbackLogic.kt:175`). No new `AppSettings` key, no new SQL — eligibility joins the EXISTING `shiftDao().getByDateRange(today-1, today+1)` (already `IsCanceled=0`) against `volunteerDao().getAll()` in Kotlin, the same join shape as `SmsReminderService`. [HIGH]
- **Decoupled from the SMS subsystem.** Despite sharing the alarm/SIM patterns, the feature touches NO SMS file and NOT `MagavServerService` — `CallbackLogic.kt:22-30` (file header) states it is fully decoupled. So a change to the SMS scheduler/worker does NOT cascade here, and vice-versa; the only shared surface is the read-only `sms_sim_subscription_id` setting. [HIGH] [ADR-021]
- New `MainActivity.requestPermissions()` entries (`CALL_PHONE`/`ANSWER_PHONE_CALLS`/`READ_CALL_LOG`) reuse the existing `permissionLauncher`; missing perms ⇒ feature inert (fail-safe), never a crash. The fire receiver `CallbackAlarmReceiver` is `exported=false`; the phone-state receiver listens on the protected `PHONE_STATE` broadcast (exported-safe). [HIGH]

### 4.5 Cascade summary

| Change at | Compile-time blast radius | Convention/contract obligation (NOT compiler-checked) |
|---|---|---|
| `common` Model / `MagavConstants` / `DbHelper` | `server` + `api` | Android `Constants.kt` + Room entity; client TS types |
| `server` service signature | `api` | Android service equivalent |
| `api` endpoint contract | (none — it's the top) | **Android Ktor route + web-client service** (three-way) |
| Android-only native-setting endpoint (`/api/settings/sms-sim`, `/api/callback-config`) | (none) | Android Ktor route + WebView-gated web-client page ONLY — intentionally NO .NET handler (§4.2, ISS-004 accepted asymmetry) |
| DB schema | `server` DbInitializer + repos | Android Room entity+migration (data-loss risk); Android-only tables (e.g. `CallbackConfig`, schema v9) have NO .NET DDL counterpart |
| Scheduler/window logic | within `server` | Android worker + client `schedulerPreview.ts` |

---

### Summary
- .NET projects form an acyclic chain `common → server → api`; **no circular dependencies (IF-8 negative).**
- `common` is the shared hub (Ca=2); `Program.cs` and Android `ShiftRoutes.kt` are the large API hubs.
- The dominant non-obvious risk is the **three-way API-contract mirror** (.NET api / Android Ktor / consumed by one React client): an endpoint change must land in all three by hand, with no compiler or test to catch divergence.
