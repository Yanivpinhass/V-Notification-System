# Plan: Auto-Callback-to-Gate on Unanswered Incoming Call (Android-only)

> **Status:** Approved research + implementation plan, ready to build in a fresh session. Validated (read every load-bearing file firsthand + adversarially red-teamed) and simplified for minimal moving parts / maximum reuse.

## 0. How to implement this plan (kickoff for the build session)

Implement in **vertical slices with on-device verification gates** — do not write everything then test. Suggested kickoff prompt for the new session:

> "Implement the plan at `Plans/auto-callback-to-gate.md`. Read it in full plus `CLAUDE.md` / `android/CLAUDE.md` first. Work in phases with on-device gates — start with the DB migration (Steps 1-2) and **prove data preservation on a populated device before writing anything else**. Don't commit or push. Bump `versionCode` and build the APK at the end."

**Phases:**
1. **DB + migration (highest risk, do alone first).** Steps 1-2. Then build a test APK and **prove data preservation**: install current v8 with real volunteers/shifts → `adb install -r` v9 → confirm every record survives **and** the `CallbackConfig` row exists. Verify the schema hash via `exportSchema=true` first. **Stop at this gate before continuing.**
2. **Settings API + UI (low risk).** Steps 3-4. Verify config saves/reloads in the WebView.
3. **Native detection (needs real calls).** Steps 5-6. Test with a second phone: eligible unanswered → reject + gate dial; ineligible → nothing; answered <20s → nothing; on-a-call (busy) → nothing.
4. **Ship.** Step 7: bump `versionCode`, build the final APK, run the §6 matrix.

**Prep before building:** back up the debug keystore and build on the **same machine** (different signing key → forced uninstall → data loss); have a **populated dev device** + a **second phone** for test calls + an admin login; grant the 3 new runtime permissions and confirm `SCHEDULE_EXACT_ALARM` is allowed.

---

## 1. Context

The on-duty patrol phone is a **Samsung Galaxy S25 (Android 15 / API 35, One UI 7)** running the Magav app, which already hosts a persistent `specialUse` foreground service (`MagavServerService`). Today an unanswered incoming call is simply missed. The dispatcher wants the phone to **fall back to the Gate**: if an *eligible* incoming call is not answered within **20 seconds**, the app **rejects the ringing call and auto-dials a configured Gate Phone number**.

"Eligible" = the caller's number belongs to a volunteer assigned to a shift dated **today or yesterday** (Israel time), the feature toggle is **on**, and the current time is inside the configured **[from, to]** window (or **All day** is ticked). **No `ApproveToReceiveSms` gating** (SMS opt-in, irrelevant here). Any other caller triggers nothing.

**"All callers" override (setting).** A separate **All callers** toggle bypasses the *who* filter: when **on**, the trigger fires for **any** incoming call (not just today/yesterday volunteers) — the caller number is not even needed. The **Active** toggle and the **time window / All-day** (the *when* filter) **still apply**. So there are two independent "all" switches: **All callers** (who) and **All day** (when). *Note: with All callers on, an unanswered spam/wrong-number call during the active window will also be rejected and dial the gate — by design.*

This is **Android-native only** (like the SIM-selection setting) — it cannot work in the web build. **Primary constraint: battery.** The design is fully event-driven (the OS invokes us only when a call arrives) and costs ~zero while idle; the 20-second wait is a **single one-shot exact alarm** that exists only during a live, eligible incoming call.

**Confirmed product decisions:** (1) detection = manifest `PHONE_STATE` + `READ_CALL_LOG`; (2) gate-call UX = the standard system in-call screen is acceptable (`TelecomManager.placeCall()`, no dialer role); (3) the time window may span midnight (e.g. 20:00→06:00).

---

## 2. Research Report — Android 15 / S25 telephony

Validated against official Android docs + AOSP and adversarially re-verified. Confidence **high** unless noted.

### 2.1 Incoming-call detection — manifest `PHONE_STATE` + `READ_CALL_LOG` (CHOSEN)
`ACTION_PHONE_STATE_CHANGED` is on the **implicit-broadcast exemption allowlist**, so a manifest receiver is legal/functional on Android 8+ and delivers state transitions (RINGING/OFFHOOK/IDLE); with `READ_CALL_LOG`, `EXTRA_INCOMING_NUMBER` carries the number (works for **all** callers incl. saved contacts). Event-driven, ~0 idle cost, delivered in-process while the persistent FGS keeps the app warm (and able to cold-start otherwise). **No telecom role** — avoiding the single biggest reliability risk of `CallScreeningService` (Samsung Smart Call contests the screening role → *silent total failure*).

> ⚠️ **An empty/withheld RINGING number is a FAIL-SAFE SKIP (do nothing).** Do **not** recover it by reading the call log — Telecom doesn't write the `CallLog.Calls` row until the call *ends*, so mid-ring the "latest entry" is the *previous* caller → could dial the gate for the wrong person. If the S25 proves to deliver empty numbers in practice (§6.2), adopt the §2.6 `CallScreeningService` fallback.

Alternatives considered: `TelephonyCallback` (no number — state only); `CallScreeningService` (no `READ_CALL_LOG` but contested role + skips contacts unless `READ_CONTACTS`) → documented **fallback only** (§2.6).

### 2.2 Rejecting the still-ringing call after 20s — CONFIRMED
`TelecomManager.endCall()` (API 28+): *"If there is a ringing call, calling this method rejects the ringing call."* Server-side gates **only** on `ANSWER_PHONE_CALLS` — no default-dialer role / `ROLE_CALL_SCREENING` / InCallService (the self-managed/VoIP carve-out doesn't apply to carrier calls). Soft-deprecated but functional on API 35 → isolate behind one helper. *(S25: Samsung "Call Assist" can auto-manage calls — verify on-device.)*

### 2.3 Auto-dialing the Gate — `placeCall()` only (ACTION_CALL REFUTED)
`TelecomManager.placeCall(Uri, Bundle)` with `CALL_PHONE` works from a background/receiver context with no visible activity — the **system Telecom service** places the call (the Telephony service is the documented **BAL exception**), so the app never `startActivity()`s. **`ACTION_CALL` from the background is REFUTED** (BAL-blocked). Dual-SIM: pass `EXTRA_PHONE_ACCOUNT_HANDLE` (from `sms_sim_subscription_id` via `getPhoneAccountHandleForSubscriptionId(subId)`) to pre-select the SIM; **omit the extra if the handle is null**. The normal system in-call screen shows (accepted).

### 2.4 Samsung battery management — TWO layers (manual steps REQUIRED)
`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (held) handles only the **stock Doze allowlist**. One UI's separate "Background usage limits" (Sleeping/Deep-sleeping) can suppress system `PHONE_STATE` delivery once an app deep-sleeps. **The user must:** set the app to **Unrestricted** (Settings → Apps → Magav → Battery → Unrestricted — the strongest control; also removes it from the sleeping lists), confirm it's **not** sleeping, and ideally disable **"Put unused apps to sleep"** (One UI re-sleeps unused apps after ~3 days). These also keep exact alarms + broadcasts firing. Settings can revert after OS updates → re-verify.

### 2.5 Permissions & onboarding
New runtime **dangerous** permissions: `CALL_PHONE`, `ANSWER_PHONE_CALLS`, `READ_CALL_LOG` (separate CALL_LOG-group dialog). Already held: `READ_PHONE_STATE`, `READ_PHONE_NUMBERS`, `SCHEDULE_EXACT_ALARM` (requested at launch). **No role needed.** Requested by **extending the existing launch-time `MainActivity.requestPermissions()`** (reuse). Missing perms make the feature *inert* (fail-safe), never crash.

### 2.6 Fallback (only if §6.2 shows `EXTRA_INCOMING_NUMBER` unreliable on the S25)
Add a `CallScreeningService` (`ROLE_CALL_SCREENING`, `RoleManager.createRequestRoleIntent`) to source the number without `READ_CALL_LOG`; costs the Samsung role contest + `READ_CONTACTS` for contact callers. Keep in reserve; don't build unless needed.

### 2.7 The 20s wait — a single one-shot **exact alarm** (no FGS, no wakelock)
During a live call the device isn't dozing, so the timer is precise — but rather than hold a process alive, **schedule one `setExactAndAllowWhileIdle` alarm at +20s** (reusing the app's existing `SCHEDULE_EXACT_ALARM` grant and the `AlarmScheduler`/`SmsAlarmReceiver` pattern). The alarm **survives process death and cold-starts the fire receiver**, so there is **no foreground service, no WakeLock, no TelephonyCallback, no Handler, and no process-longevity concern**. It is one-shot (armed on the ringing call, canceled when the call resolves) — not a repeating alarm or poll. *(Requires exact-alarm permission, already granted/requested; the inexact fallback would fire ~15 min late and is unusable for a 20s callback — so the feature depends on exact alarms being allowed, surfaced in onboarding.)*

---

## 3. Recommended Architecture (minimal: 2 receivers + 1 helper)

New package **`com.magav.app.callback`**, fully decoupled from the SMS subsystem; **nothing** in `MagavServerService` or any SMS file changes.

```
Incoming call ─→ CallbackPhoneStateReceiver  (manifest; exported=true; PHONE_STATE)
   RINGING ──── goAsync() [≤10s, then finish()]:
                  if !isDatabaseReady → skip
                  if config inactive / outside window (Israel tz) → skip      ← cheap checks first
                  if config.allCallers == 1 → ARM   (any caller — number not needed)
                  else: number empty/withheld → FAIL-SAFE skip (no call-log fallback)
                        normalize number; not in today/yesterday eligible set → skip; else ARM
                  ARM → CallbackLogic.armAlarm(context)   // setExactAndAllowWhileIdle(+20s)
   OFFHOOK / IDLE ─→ CallbackLogic.cancelAlarm(context)        // cheap optimization

(+20s) ─────────→ CallbackAlarmReceiver  (manifest; exported=false; explicit PendingIntent target)
   goAsync() [≤10s]:
       if TelephonyManager.callState != RINGING → do nothing   ← the ONE authoritative gate
       (answered → OFFHOOK; caller hung up → IDLE; only still-ringing passes)
       re-check CALL_PHONE + ANSWER_PHONE_CALLS; read gate from config
       GateCaller.reject()  → delay ~700ms → GateCaller.dialGate(gate)   [each try/catch]
```

**Why this is correct *and* simple:** correctness rests on a **single re-check at fire** (`callState == RINGING`), which cleanly distinguishes answered / hung-up / still-ringing — so cancellation is only a battery optimization, not a correctness requirement, and there is **no state machine, no epoch, no wakelock**. Re-entrancy is trivial: the outgoing gate call is OFFHOOK (never RINGING) so it can't re-arm; a single fixed alarm slot (`requestCode`, `FLAG_UPDATE_CURRENT`) means a new call just replaces the slot. **Security:** the fire receiver is `exported=false` (like `SmsAlarmReceiver`) so no external app can trigger reject+dial.

**Call-waiting / busy-line behavior — DO NOTHING while busy (decided).** `PHONE_STATE`/`TelephonyManager.callState` is a single **aggregate** device state, not per-call. If the on-duty person is already on a call (`OFFHOOK`) when an eligible volunteer calls in (call-waiting): the active call is **never** dropped or disturbed, and the gate is **not** dialed while that call is in progress — because the fire-time gate requires `callState == RINGING`, which is false while the line is `OFFHOOK`. On most devices the waiting call won't even arm the alarm (the legacy API stays `OFFHOOK` and emits no `RINGING`). The *only* path that acts is if the first call **ends** within the 20s and the volunteer's call is **still ringing unanswered** at +20s → then it correctly rejects + dials the gate. (Even `endCall()`, were it ever reached during call-waiting, rejects the *ringing* call, never the active one.) This is fail-safe by construction; no extra guard code is needed. *Trade-off accepted: a genuinely busy on-duty phone usually gives the volunteer no gate fallback. Making that work would need a per-call detector (CallScreeningService/InCallService) + mid-call dialing — out of scope. Verify on the S25 whether call-waiting surfaces `RINGING` at all via the legacy API (§6).*

**Eligibility & matching** (`CallbackLogic`): check `MagavApplication.isDatabaseReady`; read `CallbackConfigEntity` (skip if `isActive==0`); window check uses Asia/Jerusalem `LocalTime` with **midnight-wrap** (`if (from<=to) from<=now&&now<=to else now>=from||now<=to`); **if `allCallers==1` → eligible immediately (no number read, no query)**; otherwise (last, only if needed) the empty-number fail-safe + the shift/volunteer query. Number matching keys on the **last 9 digits** (national significant number), reconciling `+972…/972…/0…` and the malformed `0972…` the import can produce:
```kotlin
fun israeliMsisdnKey(raw: String?): String? {
    val digits = raw?.filter { it.isDigit() } ?: return null
    if (digits.isEmpty()) return null
    val d = when { digits.startsWith("972") -> digits.removePrefix("972")
                   digits.startsWith("0")   -> digits.removePrefix("0")
                   else -> digits }
    return if (d.length >= 9) d.takeLast(9) else d
}
```
Eligible-set query **reuses existing DAOs** (no new query, no SQL JOIN — the codebase joins in Kotlin): `today = LocalDate.now(Asia/Jerusalem)`; `shiftDao().getByDateRange(today.minusDays(1).toIsoInstant(), today.plusDays(1).toIsoInstant())` (already `IsCanceled = 0`; UTC-midnight bounds match how `ShiftDate` is stored); `volunteerDao().getAll().associateBy { it.id }`; map each shift's `mobilePhone` through `israeliMsisdnKey` into a `Set`. **No `ApproveToReceiveSms` filter.**

### Code reuse (no duplication)
| Need | Reuse |
|---|---|
| Exact-alarm arm/cancel | `AlarmScheduler.kt` pattern (`getBroadcast`+`FLAG_IMMUTABLE`, `setExactAndAllowWhileIdle`, `FLAG_NO_CREATE` cancel) |
| Manifest fire receiver | `SmsAlarmReceiver` (exported=false, explicit-intent target) |
| Date range / Israel-tz "today" | `util/DateExtensions.kt` (`toIsoInstant`), `LocalDate.now(ZoneId.of("Asia/Jerusalem"))` |
| Eligible shifts/volunteers | `shiftDao().getByDateRange` + `volunteerDao().getAll()` (Kotlin join, per `SmsReminderService`) |
| SIM for the gate call | `appSettingDao().getByKey("sms_sim_subscription_id")?.value?.toIntOrNull() ?: -1` |
| Call-state read | `@Suppress("DEPRECATION") tm.callState` (same as `SmsSchedulerWorker`) |
| API envelope / auth / DTO | `ApiResponse.ok`/`fail<Unit>`, `requireRole`, `getUserName`, `@Serializable` (per `SchedulerRoutes`) |
| React service / form / RTL | `BaseApiClient` (`get`/`put`), `<Switch>`/`<Input type=time>`/`toast`/`isUserAdmin`, `SmsSettingsPage` Card+static-guidance layout |
| Android-only gating | existing `window.NativeMedia` presence (duty-log convention) — **no new bridge** |

---

## 4. Step-by-Step Implementation Plan (exact files)

> Do the DB/migration ritual first and verify on a **populated** device before the rest.

### 🛡️ DATA-PRESERVATION GUARANTEE — the update must NEVER wipe the existing DB
The on-device data (volunteers, shifts, SMS logs, scheduler configs, holidays, users) **must survive** the v8→v9 update. Three independent guarantees + two install requirements make this safe:
1. **Additive migration only.** `MIGRATION_8_9` runs exactly `CREATE TABLE IF NOT EXISTS CallbackConfig` + `INSERT OR IGNORE` one row. It does **not** `ALTER`/`DROP`/rewrite any existing table, and **no existing `@Entity` is changed** — so every existing table is untouched.
2. **No destructive fallback.** `fallbackToDestructiveMigration()` is deliberately **absent** and MUST stay absent (the only setting that can auto-wipe).
3. **Errors crash, never wipe.** A missing/incorrect migration makes Room throw and `MagavApplication.initializeDatabase()` **re-throw** (it recovers only from SQLCipher key/corruption errors) → visible crash with data **intact on disk**, never silent deletion (ADR-004).
4. **Same signing keystore (install requirement).** Android refuses to update an APK signed with a different key and forces uninstall+reinstall (= data loss). Build the new APK **on the same machine with the same debug keystore** as the installed app; back up that keystore.
5. **Update, don't uninstall (install requirement).** Use `adb install -r …/app-debug.apk` (or tap-to-update over the existing app). **Never `adb uninstall` first** — uninstall deletes app data (`allowBackup=false`).
> **Mandatory pre-ship gate:** on a dev device, install the **current v8** build, create real volunteers/shifts/configs, then `adb install -r` the **v9** build and confirm **every** record is still present *and* the `CallbackConfig` row exists. Verify the schema hash first via `exportSchema=true` (Step 1). Do not ship until this passes.

### Step 1 — Typed config table (data-loss-critical; ADR-004)
- **Create** `db/entity/CallbackConfigEntity.kt` — singleton modeled on `SchedulerConfigEntity`; **keep** `@ColumnInfo(defaultValue=…)` (the migration `DEFAULT` clauses must match these exactly):
  ```kotlin
  @Entity(tableName = "CallbackConfig")
  data class CallbackConfigEntity(
      @PrimaryKey @ColumnInfo(name = "Id") val id: Int = 1,                  // autoGenerate=false (fixed singleton)
      @ColumnInfo(name = "IsActive",  defaultValue = "0")     val isActive: Int = 0,
      @ColumnInfo(name = "GatePhone", defaultValue = "")      val gatePhone: String = "",
      @ColumnInfo(name = "FromHour",  defaultValue = "08:00") val fromHour: String = "08:00",
      @ColumnInfo(name = "ToHour",    defaultValue = "20:00") val toHour: String = "20:00",
      @ColumnInfo(name = "AllDay",     defaultValue = "0")    val allDay: Int = 0,
      @ColumnInfo(name = "AllCallers", defaultValue = "0")    val allCallers: Int = 0,   // ON = trigger for ANY caller (skip the volunteer filter)
      @ColumnInfo(name = "UpdatedAt") val updatedAt: String? = null,
      @ColumnInfo(name = "UpdatedBy") val updatedBy: String? = null
  )
  ```
- **Create** `db/dao/CallbackConfigDao.kt`:
  ```kotlin
  @Dao interface CallbackConfigDao {
      @Query("SELECT * FROM CallbackConfig WHERE Id = 1") suspend fun get(): CallbackConfigEntity?
      @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun insertOrIgnore(c: CallbackConfigEntity): Long  // seed: never clobber
      @Upsert suspend fun upsert(c: CallbackConfigEntity)                                                        // route write
  }
  ```
- **Edit** `db/MagavDatabase.kt`: add `CallbackConfigEntity::class` to `@Database(entities=[…])`; bump `version = 8` → **`9`**; add `abstract fun callbackConfigDao(): CallbackConfigDao`; add `MIGRATION_8_9` (creates the table **and** seeds the singleton via `INSERT OR IGNORE`):
  ```kotlin
  val MIGRATION_8_9 = object : Migration(8, 9) {
      override fun migrate(db: SupportSQLiteDatabase) {
          db.execSQL("""
              CREATE TABLE IF NOT EXISTS `CallbackConfig` (
                  `Id` INTEGER NOT NULL, `IsActive` INTEGER NOT NULL DEFAULT 0,
                  `GatePhone` TEXT NOT NULL DEFAULT '', `FromHour` TEXT NOT NULL DEFAULT '08:00',
                  `ToHour` TEXT NOT NULL DEFAULT '20:00', `AllDay` INTEGER NOT NULL DEFAULT 0,
                  `AllCallers` INTEGER NOT NULL DEFAULT 0,
                  `UpdatedAt` TEXT, `UpdatedBy` TEXT, PRIMARY KEY(`Id`)
              )""".trimIndent())
          db.execSQL("INSERT OR IGNORE INTO `CallbackConfig` " +
              "(`Id`,`IsActive`,`GatePhone`,`FromHour`,`ToHour`,`AllDay`,`AllCallers`,`UpdatedAt`,`UpdatedBy`) " +
              "VALUES (1,0,'','08:00','20:00',0,0,NULL,NULL)")
      }
  }
  ```
- **Edit** `MagavApplication.kt` — append `MagavDatabase.MIGRATION_8_9` to **BOTH** `addMigrations(...)` calls (initial build **:109** AND SQLCipher-recovery rebuild **:135**). *Optional hardening: extract one shared `val MIGRATIONS = arrayOf(...)` used by both builders.*
- ⚠️ **Schema-hash is the data-loss risk.** Entity and migration must **agree exactly** (both carry the defaults shown — do not drop one side). Verify by temporarily `exportSchema = true` + diff `schemas/.../9.json` `createSql` (or read the first-open *"Expected … Found …"* crash), then **test an 8→9 upgrade on a populated dev device** (ADR-004).

### Step 2 — Seeding (one idempotent call)
- **Edit** `db/DatabaseInitializer.initialize()` — add a single unconditional `database.callbackConfigDao().insertOrIgnore(CallbackConfigEntity())` (idempotent on PK=1; reaches fresh + existing installs), modeled on `migrateSchedulerConfigs()`. No separate guarded seed. *Android-only → no `.NET` mirror.*

### Step 3 — Android Ktor API (typed GET/PUT)
- **Create** `api/routes/CallbackConfigRoutes.kt` — `fun Route.callbackConfigRoutes(database: MagavDatabase)` (**no `context`**), wrapped in `authenticate("auth-bearer") { route("/api/callback-config") { … } }`. Imports: `com.magav.app.api.requireRole`/`getUserName`, `…api.models.ApiResponse`, `kotlinx.serialization.Serializable`, `java.time.Instant`.
  - **Declare local regexes here** (the `TIME_REGEX` in `SchedulerRoutes.kt:48` is `private`): `private val TIME_REGEX = Regex("^([01]\\d|2[0-3]):[0-5]\\d$")` + a permissive gate-phone check that **accepts** `+972…/972…/0…` (mirror `SettingsRoutes.kt:108`'s `^[0-9+\\-]+$`, length ≥ 9).
  - `GET` → `requireRole("Admin","SystemManager")`; `val cfg = callbackConfigDao().get() ?: CallbackConfigEntity()`; respond `ApiResponse.ok(toDto(cfg))`.
  - `PUT` → `requireRole("Admin")`; `val dto = call.receive<UpdateCallbackConfigDto>()`; validate (when `isActive`: gate phone required + valid; when not `allDay`: both times match `TIME_REGEX`); **no NPE** — `val existing = callbackConfigDao().get() ?: CallbackConfigEntity(); callbackConfigDao().upsert(existing.copy(…, updatedAt = Instant.now().toString(), updatedBy = call.getUserName() ?: "unknown"))`; respond `ApiResponse.ok(...)`. Fails: `call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("<Hebrew>")); return@put`.
  - `@Serializable` DTOs + `private fun toDto(...)` at the top of the file. Fields: `isActive`/`allDay`/**`allCallers`** as `Boolean` (mapped to/from Int 0/1 in `toDto`/`copy`), `gatePhone`/`fromHour`/`toHour` as `String`. Include **`allCallers`** in both `CallbackConfigDto` and `UpdateCallbackConfigDto`.
- **Edit** `api/KtorServer.kt` — call `callbackConfigRoutes(database)` in `routing { … }` (near :84-86), before the static `get("{...}")` catch-all.

### Step 4 — React settings page + service (Android-only)
- **Create** `web/client/src/services/callbackConfigService.ts` — `extends BaseApiClient`; `getConfig()`→`this.get<CallbackConfig>('/callback-config')`, `updateConfig(b)`→`this.put<CallbackConfig>('/callback-config', b)`; singleton export. **No `/api` prefix.**
- **Create** `web/client/src/pages/CallbackSettingsPage.tsx` — named `export const … : React.FC`. **Reuse the `SmsSettingsPage` Card layout**: a config Card (`<Switch>` Active, `<Switch>` **All callers** [Hebrew label e.g. „כל המתקשרים — לא רק מתנדבים במשמרת היום/אתמול"], `<Switch>` All-day [no `dir`], `<Input type="time">` from/to [disabled when All-day], text `<Input>` Gate phone, Save `<Button>`) + a static-guidance Card (Hebrew: grant call permissions + set battery to *Unrestricted*). `isReadOnly = !isUserAdmin()`; `toast` for results. **Android-only gate:** if `window.NativeMedia` is absent (web), render a Hebrew "available only in the Android app" notice instead of the form (reuse the duty-log convention; **no new bridge**).
- **Edit** `components/layout/menuItems.ts` — add to the `settings` group: `{ id: 'callback-settings', title: 'חיוג חוזר לשער', path: '/settings/callback' }`.
- **Edit** `pages/Index.tsx` — import + `case 'callback-settings': return <CallbackSettingsPage />;`. *(Not `App.tsx`; a missing case silently falls through to `PlaceholderPage`.)*

### Step 5 — Native detection + alarm fire (new `callback` package — 3 files)
- **Create** `callback/CallbackLogic.kt` — shared helpers (no duplication): `israeliMsisdnKey()`, `isWithinWindow(cfg, now)`, `suspend fun isEligible(context, number): Boolean` (DB-readiness guard + config + window + eligible-set), `fun armAlarm(context)` / `fun cancelAlarm(context)` (reuse the `AlarmScheduler` PendingIntent pattern; fixed `requestCode`, explicit Intent → `CallbackAlarmReceiver`, `setExactAndAllowWhileIdle(ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime()+20_000, pi)`), and `suspend fun rejectAndDialGate(context)` (read gate from config; sanitize to `tel:` via `filter { it.isDigit() || it=='+' }`; SIM handle from `sms_sim_subscription_id`, omit if null; re-check `CALL_PHONE`+`ANSWER_PHONE_CALLS`; `endCall()` → `delay(700)` → `placeCall()`, each in try/catch).
- **Create** `callback/CallbackPhoneStateReceiver.kt` — `BroadcastReceiver`; on `PHONE_STATE`: `goAsync()` → on **RINGING** run `CallbackLogic.isEligible(...)` (empty number → skip) and if eligible `armAlarm`; on **OFFHOOK/IDLE** `cancelAlarm`; `finish()` (≤10s).
- **Create** `callback/CallbackAlarmReceiver.kt` — `BroadcastReceiver` (exported=false); `goAsync()` → if `MagavApplication.isDatabaseReady` && `tm.callState == CALL_STATE_RINGING` → `CallbackLogic.rejectAndDialGate(context)`; `finish()`.

### Step 6 — Manifest + permissions (reuse existing launcher)
- **Edit** `AndroidManifest.xml`:
  - add `<uses-permission>` for `CALL_PHONE`, `ANSWER_PHONE_CALLS`, `READ_CALL_LOG`.
  - `<receiver android:name=".callback.CallbackPhoneStateReceiver" android:exported="true"><intent-filter><action android:name="android.intent.action.PHONE_STATE"/></intent-filter></receiver>` (protected broadcast → `exported="true"` safe, like `BootReceiver`).
  - `<receiver android:name=".callback.CallbackAlarmReceiver" android:exported="false"/>` (explicit alarm target, like `SmsAlarmReceiver` — **not** externally triggerable).
- **Edit** `MainActivity.requestPermissions()` (lines 127-147) — add `CALL_PHONE`, `ANSWER_PHONE_CALLS`, `READ_CALL_LOG` to the `needed` list (reuses the existing `permissionLauncher`; `READ_CALL_LOG` is its own CALL_LOG dialog). **No new bridge, no other MainActivity change.**

### Step 7 — Build housekeeping
- **Edit** `android/app/build.gradle.kts` — bump `versionCode` (managed region, currently 75); run `build-apk.bat`; report the APK path.

---

## 6. On-device verification checklist (S25 / One UI 7)
1. **DB upgrade non-destructive:** v8 (populated) → v9 keeps all data and creates the `CallbackConfig` row; verify schema hash via `exportSchema=true` first (ADR-004).
2. **`EXTRA_INCOMING_NUMBER` populated** with `READ_CALL_LOG` (incl. dual-SIM/VoLTE/Wi-Fi-calling); else fail-safe skip / §2.6 fallback.
3. **Exact alarm fires at ~20s** during a ringing call (screen off); `SCHEDULE_EXACT_ALARM` granted; also test from a **cold-started** (recently-killed) process.
4. **`endCall()` rejects** the ringing call with only `ANSWER_PHONE_CALLS` (check Samsung "Call Assist" isn't interfering).
5. **`placeCall()` dials the gate** backgrounded/screen-off; `EXTRA_PHONE_ACCOUNT_HANDLE` routes the correct SIM with no chooser.
6. **Battery survival:** Unrestricted + un-opened 3+ days → still triggers; re-check after reboot/OS update.
7. **State correctness:** eligible→triggers; spam/unknown→nothing (**All callers OFF**); answered <20s→nothing; caller hangs up <20s→nothing; hangup at ~20s→nothing (callState re-check); outgoing gate call doesn't re-trigger; `+972`/`0`/`972` all match; midnight-wrap boundaries. **All callers ON → ANY unanswered caller (incl. spam) triggers**; toggling All callers off restores the volunteer-only filter.
8. **Call-waiting / busy line:** while on-duty is on a call, an eligible call-waiting volunteer must **never** drop/disturb the active call and must **not** dial the gate (decided behavior, §3). Confirm whether the S25 even emits `RINGING` for a call-waiting call via the legacy API; either way the active call stays untouched.

## 7. Risks & open items
- **🔴 Room migration data-loss (ADR-004):** highest risk — both `addMigrations` sites, exact entity↔migration default agreement, `exportSchema=true` verify, populated-device test. `fallbackToDestructiveMigration` stays absent.
- **🟠 `EXTRA_INCOMING_NUMBER` reliability** (§6.2) — fail-safe skip; CallScreeningService fallback (§2.6).
- **🟠 Exact-alarm permission + OEM battery** — feature needs `SCHEDULE_EXACT_ALARM` granted (already requested) + the manual Unrestricted/never-sleep steps (§2.4); surface in onboarding.
- **🟡 `endCall()` soft-deprecation** (API 35 OK); **🟡 no automated tests** → §6 matrix; **🟡 Android-only menu link** also shows on web (page-level `window.NativeMedia` notice handles it).
- **Decisions:** **All callers toggle** bypasses the volunteer filter (any caller triggers); the **Active** toggle + **time window/All-day** still apply (who-filter only). **Call-waiting while busy → do nothing** (never disturb the active call / never dial gate mid-call — §3); gate sanitized to digits/`+`; gate call reuses the SMS SIM; eligibility reuses `getByDateRange` + Kotlin join; one fixed alarm slot; PUT requires a valid gate phone when `isActive`.

## 8. Validation & simplifications applied (audit trail)
- **Replaced** the guard-FGS + WakeLock + TelephonyCallback + Handler + epoch state machine with **one one-shot exact alarm** → removes 2 files and the entire process-longevity risk class; more battery-minimal; correctness now rests on a single `callState==RINGING` re-check at fire.
- **Dropped the native bridge** → settings page gates on existing `window.NativeMedia` + static guidance (reuses `SmsSettingsPage` pattern); `MainActivity` edit is just 3 perms on the existing launcher.
- **Kept** Room entity+migration defaults in agreement (reverted an unsafe "drop defaults" idea); **removed** the stale call-log fallback (→ fail-safe skip); **fixed** Ktor `TIME_REGEX` scope + PUT NPE; **`isDatabaseReady` guard**; `goAsync()` ≤10s; perm re-check + null-handle omit + `tel:` sanitize; alarm fire receiver `exported=false` (security).
- **Reuse over new code:** `AlarmScheduler`/`SmsAlarmReceiver` pattern, `getByDateRange`+`getAll()` Kotlin join, `DateExtensions`, `sms_sim_subscription_id` read, `BaseApiClient`/`ApiResponse`/`requireRole`, `SmsSettingsPage` layout, `window.NativeMedia` gate, existing permission launcher.

## 9. Files touched
**New (Android, 5):** `db/entity/CallbackConfigEntity.kt`, `db/dao/CallbackConfigDao.kt`, `api/routes/CallbackConfigRoutes.kt`, `callback/CallbackLogic.kt`, `callback/CallbackPhoneStateReceiver.kt`, `callback/CallbackAlarmReceiver.kt`.
**Edit (Android):** `db/MagavDatabase.kt`, `MagavApplication.kt`, `db/DatabaseInitializer.kt`, `api/KtorServer.kt`, `AndroidManifest.xml`, `MainActivity.kt`, `app/build.gradle.kts` (versionCode, build time).
**New (React, 2):** `services/callbackConfigService.ts`, `pages/CallbackSettingsPage.tsx`.
**Edit (React):** `components/layout/menuItems.ts`, `pages/Index.tsx`.
**Not touched:** SMS code (`SmsSchedulerWorker`/`AndroidSmsProvider`/`SmsReminderService`/`AlarmScheduler`), `MagavServerService`, `ShiftDao`/`VolunteerDao` (reused as-is), and the `.NET`/`Magav.Api` side.
