<!-- DeepInit Extract | Component: android
DeepInit C8 update | Run ID: deepinit-2026-06-30 | Generated: 2026-06-30 (commit auto-callback-to-gate: Android-only AUTO-CALLBACK-TO-GATE — new callback/ pkg [CallbackLogic object + CallbackPhoneStateReceiver + CallbackAlarmReceiver], new api/routes/CallbackConfigRoutes.kt [GET/PUT /api/callback-config, Android-Ktor-ONLY surface — ISS-004 accepted divergence], new db/entity/CallbackConfigEntity.kt + db/dao/CallbackConfigDao.kt, @Database version 8→9 + MIGRATION_8_9 [additive singleton table], 3 new perms [CALL_PHONE/ANSWER_PHONE_CALLS/READ_CALL_LOG] + 2 manifest receivers, versionCode 75→76 / 1.4.26; ISS-010 new: root .gitignore `db/` rule ignores the new db/ source files) · prior: deepinit-2026-06-25b (commit 5124870: Android-only DEVICE-ALLOWLIST gate at WebView launch — new license/DeviceAllowlist.kt [fail-CLOSED hardcoded Settings.Secure.ANDROID_ID set; EMPTY set blocks ALL] + license/DeviceClipboardBridge.kt [window.NativeClip], Hebrew block page MainActivity.buildDeviceBlockHtml, versionCode 69→75 / 1.4.25; NO Room/@Entity/@Database change) · prior: deepinit-2026-06-25 (commit 970cdcc: Duty Log media bridge — media/MediaBridge.kt as window.NativeMedia [save-to-gallery + FileProvider share], res/xml/file_paths.xml, manifest FileProvider, proguard JS-interface keep + POI -dontwarn, versionCode 63→69) · prior: deepinit-2026-06-24 (commit 2989b01: versionCode 63, run-log dedup tightened, VolunteerEntity divergence accepted/ADR-016)
Input files processed: android/app/build.gradle.kts, android/app/src/main/AndroidManifest.xml, android/app/src/main/java/com/magav/app/MagavApplication.kt, MainActivity.kt, MagavServerService.kt, db/MagavDatabase.kt, db/DatabaseInitializer.kt, db/entity/{UserEntity,VolunteerEntity,ShiftEntity,SmsLogEntity,SchedulerConfigEntity,SchedulerRunLogEntity,AppSettingEntity,MessageTemplateEntity,LocationEntity,JewishHolidayEntity,CallbackConfigEntity}.kt, db/dao/{UserDao,VolunteerDao,ShiftDao,SmsLogDao,SchedulerConfigDao,SchedulerRunLogDao,AppSettingDao,MessageTemplateDao,LocationDao,JewishHolidayDao,CallbackConfigDao,SmsLogDetailDto,AiQueryDtos}.kt, api/KtorServer.kt, api/auth/JwtConfig.kt, api/models/{ApiResponse,RequestDtos}.kt, api/routes/{Auth,User,Volunteer,Shift,Location,JewishHoliday,SmsLog,Scheduler,MessageTemplate,Settings,Health,CallbackConfig}Routes.kt, callback/{CallbackLogic,CallbackPhoneStateReceiver,CallbackAlarmReceiver}.kt, scheduler/{AlarmScheduler,SmsSchedulerWorker,SmsAlarmReceiver,BootReceiver,ShiftCleanupWorker}.kt, service/{AuthService,SmsReminderService,ShiftsImportService,ShiftScheduleParser,VolunteersImportService}.kt, sms/{SmsProvider,AndroidSmsProvider}.kt, auth/{SessionManager,BiometricAuthHelper,NativeAuthBridge}.kt, media/MediaBridge.kt, license/{LicenseValidator,DeviceAllowlist,DeviceClipboardBridge}.kt, util/{Constants,DateExtensions}.kt
Generated: 2026-06-18 · Updated: 2026-06-30 -->

# Component: `android`

## 1. Component Overview

**Purpose.** The Android target of Magav, a Hebrew RTL volunteer-shift management + SMS-reminder system. It is a **hybrid mobile-server app**: a foreground `Service` embeds a Ktor HTTP server bound to `127.0.0.1:5015`, which serves both the bundled React SPA (from `assets/web/`) and a REST API that mirrors the .NET backend. A WebView in `MainActivity` loads `http://localhost:5015`. SMS reminders are sent natively via Android `SmsManager`. [HIGH] (`android/app/src/main/java/com/magav/app/api/KtorServer.kt:27`, `MainActivity.kt:196`, `MagavServerService.kt:39`)

**Tech stack.** Kotlin 1.9.22 / Java 17, `compileSdk=35`, `minSdk=29`, `targetSdk=35`, `versionCode=76`, `versionName="1.4.26"` (bumped 63→76 across the Duty Log + device-allowlist + editable-hours + auto-callback iterations — each APK install needs a fresh code so `clearCacheOnVersionChange()` clears the cached PWA, BR/KL-mistake:001). Ktor 2.3.12 (CIO engine), Room 2.6.1 + SQLCipher 4.5.4 (`net.zetetic:android-database-sqlcipher`), Koin 3.5.6 DI, Apache POI 5.2.5 (Excel), AlarmManager + WorkManager 2.9.1, `com.auth0:java-jwt:4.4.0`, `at.favre.lib:bcrypt:0.10.2`, `androidx.security:security-crypto:1.1.0-alpha06`, `androidx.biometric:biometric:1.1.0`. [HIGH] (`android/app/build.gradle.kts:8-121`)

**Entry points.**
- `MagavApplication.onCreate()` — app process init: notification channels → SQLCipher DB → Koin. [HIGH] (`MagavApplication.kt:33`)
- `MainActivity.onCreate()` — WebView host, starts service, requests permissions, waits for server, session-aware load. [HIGH] (`MainActivity.kt:51`)
- `MagavServerService.onStartCommand()` — foreground service: DB seed, JWT init, schedule alarms + cleanup, start Ktor. [HIGH] (`MagavServerService.kt:29`)
- `BootReceiver.onReceive()` — re-launches service + re-schedules alarms on device boot. [HIGH] (`scheduler/BootReceiver.kt:13`)
- `CallbackPhoneStateReceiver.onReceive()` — manifest receiver for `PHONE_STATE`; on a RINGING eligible call arms a one-shot +20s callback alarm (auto-callback-to-gate). [HIGH] (`callback/CallbackPhoneStateReceiver.kt:19`)
- `CallbackAlarmReceiver.onReceive()` — the +20s alarm fire target; if still RINGING, rejects the call and dials the Gate. [HIGH] (`callback/CallbackAlarmReceiver.kt:20`)

**Complexity.** ~63 Kotlin files. God objects: `ShiftRoutes.kt` (907 lines) and `DatabaseInitializer.kt` (~390 lines, mostly the ~160-row holiday seed table). No automated tests in the component. [HIGH]

## 2. Features & Capabilities

| Feature | Entry point | Source files | Certainty |
|---|---|---|---|
| Embedded Ktor REST server (localhost:5015) | `createKtorServer()` | `api/KtorServer.kt`, all `api/routes/*` | HIGH |
| WebView host + native bridges (THREE) | `MainActivity.setupWebView()` | `MainActivity.kt:71`, `auth/NativeAuthBridge.kt` (`NativeAuth`), `media/MediaBridge.kt` (`NativeMedia`), `license/DeviceClipboardBridge.kt` (`NativeClip`) | HIGH |
| Duty Log media bridge — save-to-gallery + share PNG | `MediaBridge.saveImageToGallery` / `shareImage` | `media/MediaBridge.kt` (new in `970cdcc`), `res/xml/file_paths.xml`, manifest FileProvider | HIGH |
| **Device allowlist gate (fail-CLOSED) + Hebrew block page** | `DeviceAllowlist.isAllowed()` at WebView launch | `license/DeviceAllowlist.kt`, `license/DeviceClipboardBridge.kt` (`NativeClip`), `MainActivity.kt:191-194,299` (block HTML), new in `5124870` | HIGH |
| Static SPA serving from assets | catch-all `get("{...}")` | `api/KtorServer.kt:89` | HIGH |
| Encrypted Room DB (SQLCipher) | `MagavApplication.initializeDatabase()` | `MagavApplication.kt:102`, `db/MagavDatabase.kt`, `db/entity/*`, `db/dao/*` | HIGH |
| SMS scheduler (exact alarms, Israel tz) | `AlarmScheduler.scheduleAllAlarms()` | `scheduler/AlarmScheduler.kt`, `SmsAlarmReceiver.kt`, `SmsSchedulerWorker.kt`, `service/SmsReminderService.kt` | HIGH |
| Native SMS sending (dual-SIM, Mutex) | `AndroidSmsProvider.sendSms()` | `sms/SmsProvider.kt`, `sms/AndroidSmsProvider.kt` | HIGH |
| Excel import — shifts | `ShiftsImportService.importFromExcel()` | `service/ShiftsImportService.kt`, `service/ShiftScheduleParser.kt` | HIGH |
| Excel import — volunteers | `VolunteersImportService.importFromExcel()` | `service/VolunteersImportService.kt` | HIGH |
| JWT auth + lockout + refresh rotation | `AuthService` | `service/AuthService.kt`, `api/auth/JwtConfig.kt`, `api/routes/AuthRoutes.kt` | HIGH |
| Biometric re-auth + session persistence | `BiometricAuthHelper`, `SessionManager` | `auth/BiometricAuthHelper.kt`, `auth/SessionManager.kt` | HIGH |
| Soft-cancel shifts + canceled list + hard-delete | shift cancel routes | `api/routes/ShiftRoutes.kt:242,302,370` | HIGH |
| Car-location SMS appending + location-update reminder | same-day reminder + send-location-update | `service/SmsReminderService.kt:112`, `api/routes/ShiftRoutes.kt:817` | HIGH |
| Holiday-aware day-group resolution | `effectiveDayGroupForDate()` | `scheduler/SmsSchedulerWorker.kt:230` | HIGH |
| Monthly shift/run-log cleanup | `ShiftCleanupWorker` | `scheduler/ShiftCleanupWorker.kt` | HIGH |
| License gate (phone/expiry) | `LicenseValidator.isValid()` | `license/LicenseValidator.kt`, `MainActivity.kt:180` | HIGH |
| Call-aware SMS deferral | `waitForCallToEnd()` | `scheduler/SmsSchedulerWorker.kt:165` | HIGH |
| **Auto-callback-to-gate (Android-only)** — eligible incoming call rings unanswered 20s → reject + dial Gate | `CallbackPhoneStateReceiver` → +20s alarm → `CallbackAlarmReceiver` → `CallbackLogic.rejectAndDialGate()` | `callback/CallbackLogic.kt`, `callback/CallbackPhoneStateReceiver.kt`, `callback/CallbackAlarmReceiver.kt`, `api/routes/CallbackConfigRoutes.kt`, `db/entity/CallbackConfigEntity.kt`, `db/dao/CallbackConfigDao.kt` | HIGH |

## 3. Workflows & Behaviors

### WF-android:001 — System boot / startup sequence (THE system boot sequence) [background]
**Trigger:** App process start (launcher tap) or `ACTION_BOOT_COMPLETED`.
**Steps:**
1. `MagavApplication.onCreate()` → `createNotificationChannels()` creates 3 channels: `magav_server_channel` (LOW), `magav_error_channel` (HIGH), `magav_sms_summary_channel` (DEFAULT) → `MagavApplication.kt:37,50`
2. `initializeDatabase()` — derive/generate 32-byte SQLCipher key from EncryptedSharedPreferences, build Room DB with migrations 3→8, then **probe `openHelper.writableDatabase`** → `MagavApplication.kt:39,102,116`
3. `isDatabaseReady = true`; `initializeKoin()` registers DAOs + services → `MagavApplication.kt:40,42,174`
4. `MainActivity.onCreate()` → `setupWebView()` (incl. `clearCacheOnVersionChange()`), `startServerService()` (startForegroundService), `requestPermissions()`, `waitForServerAndLoad()` → `MainActivity.kt:51-61`
5. `MagavServerService.onStartCommand()` → `startForeground(1, ...)`; if `isDatabaseReady`, on IO scope: `DatabaseInitializer(database).initialize()` (seed admin/templates/configs/settings/holidays) → `getOrCreateJwtKey()` → `JwtConfig.initialize()` → `AlarmScheduler(...).scheduleAllAlarms()` → `scheduleMonthlyCleanup()` → `createKtorServer(...).start(wait=true)` → `MagavServerService.kt:39,55-69`
6. `MainActivity.waitForServerAndLoad()` polls `GET /api/health` up to 60×500ms (30s). On ready → **ordered gate chain: `LicenseValidator.isValid()` → `DeviceAllowlist.isAllowed()` →** `handleSessionAwareStartup()` (no session: load login; recent: silent refresh; stale + biometric: prompt). On timeout: Hebrew "שגיאה בהפעלת השרת". On invalid license: Hebrew "שגיאה בהפעלת המערכת". On a non-allowlisted device: the Hebrew block page `buildDeviceBlockHtml(deviceId)` (shows the device's ANDROID_ID + a "copy" button wired to `window.NativeClip.copyDeviceId()`), never the app. → `MainActivity.kt:151-215` (gate chain `:185-197`, block HTML `:299`)
**State transitions:** `isDatabaseReady` false→true; `serverStarting` guards double-start; `server` null until started.
**Error handling:** Any onCreate exception → high-priority "שגיאה באתחול המערכת" notification (`MagavApplication.kt:44`). Server start failure resets `serverStarting=false`, updates notification, returns `START_STICKY` (`MagavServerService.kt:70`).

### WF-android:002 — Scheduled SMS reminder (alarm → worker → send) [scheduled/background]
**Trigger:** Exact `AlarmManager` alarm fires for an enabled `SchedulerConfig` on a given weekday.
**Steps:**
1. `AlarmScheduler.scheduleAllAlarms()` cancels ALL config×7-day alarms, then re-schedules enabled configs for ALL 7 days (requestCode = `configId*10 + dayOfWeek.value`); past targets roll to +1 week → `AlarmScheduler.kt:18,50,60`
2. Alarm → `SmsAlarmReceiver.onReceive()` enqueues unique `SmsSchedulerWorker` keyed `sms_config_{id}_{today}` (`ExistingWorkPolicy.KEEP`), then re-schedules all alarms via `goAsync()` → `SmsAlarmReceiver.kt:18,31,38`
3. `SmsSchedulerWorker.doWork()`: read SIM `subscriptionId` from AppSettings, build `AndroidSmsProvider` + `SmsReminderService` → `waitForCallToEnd()` → load config, skip if disabled, **skip if `config.dayGroup != effectiveDayGroup`** (holiday-aware), compute `[windowStart,windowEnd)` + runLogDate → `SmsSchedulerWorker.kt:38,55-79`
4. `SmsReminderService.execute()`: resolve template; query `getByDateRange()` (active only); bulk-load volunteers, already-sent shiftIds (dedup), locations (SameDay only); per shift check volunteerId/approval/phone/dedup → build message → `smsProvider.sendSms()` → insert `SmsLog` (Success/Fail) → on success update `SmsSentAt` → 500ms inter-SMS delay → insert `SchedulerRunLog` (UNIQUE-guarded) → `SmsReminderService.kt:27-192`
5. Worker shows summary notification (channel `magav_sms_summary_channel`) → `SmsSchedulerWorker.kt:134`
**State transitions:** `SmsLog` row per attempt; `Shift.SmsSentAt` set on success; `SchedulerRunLog` upserted (dup = silent skip via UNIQUE).
**Error handling:** Worker outer catch → `Result.retry()`; per-config catch in `checkAllConfigs` continues; notification errors swallowed; SMS exception logs `SmsLog` Fail with generic "שגיאה פנימית".

### WF-android:003 — Device boot re-scheduling [background]
**Trigger:** `Intent.ACTION_BOOT_COMPLETED`.
**Steps:** `BootReceiver` `startForegroundService(MagavServerService)`; if `isDatabaseReady`, `goAsync()` → `AlarmScheduler.scheduleAllAlarms()` (belt-and-suspenders; service also schedules). → `BootReceiver.kt:13-31`
**Error handling:** alarm-schedule failure logged, `pendingResult.finish()` always called.

### WF-android:004 — Login + token refresh rotation [user-facing/background]
**Trigger:** `POST /api/auth/login` (public) or `POST /api/auth/refresh` (public); native silent refresh from `MainActivity.refreshTokenViaHttp()`.
**Steps:** `AuthService.login()` verifies BCrypt hash; on failure increments `FailedLoginAttempts`, locks for 15 min at 5; on success resets attempts, issues HMAC256 access token (15 min) + random refresh token (stored as SHA-256 hash, 3-day expiry) → `AuthService.kt:24-101`. Refresh rotates both tokens → `AuthService.kt:103`. WebView persists session through `NativeAuthBridge.onLoginSuccess()` into EncryptedSharedPreferences → `auth/NativeAuthBridge.kt:8`.
**Error handling:** generic Hebrew messages; lockout enforced before password check.

### WF-android:005 — Excel shift import [user-facing]
**Trigger:** `POST /api/shifts/import` (multipart, CSRF + size + extension + magic-byte checks).
**Steps:** `ShiftScheduleParser.parse()` reads all sheets, finds date rows (1900-era serial), 6-row team blocks (name+car+4 volunteers) → `ShiftScheduleParser.kt`. `ShiftsImportService` filters future-only shifts, matches volunteer by lowercased `MappingName` (unresolved → `VolunteerId=null` + `VolunteerName`), **deletes existing shifts in the imported date range then bulk-inserts** → `ShiftsImportService.kt:88-93`.
**Error handling:** "לא נמצאו משמרות עתידיות" when none future; per-import dedup keys.

### WF-android:006 — Soft-cancel + hard-delete shift [user-facing]
**Trigger:** `POST /api/shifts/{id}/cancel`, `POST /api/shifts/cancel-group`, `GET /api/shifts/canceled`, `DELETE /api/shifts/{id}`, `POST /api/shifts/delete-group`.
**Steps:** cancel sets `IsCanceled=1 + CanceledAt` (optionally sends template-3 SMS first; SMS failure does NOT block) → `ShiftRoutes.kt:242,302`. Canceled list reads `IsCanceled=1` rows for a month → `ShiftRoutes.kt:370`. Hard-delete removes SmsLogs then shift row → `ShiftRoutes.kt:163`.

### WF-android:007 — Monthly cleanup [scheduled]
**Trigger:** Periodic WorkManager (`shift_monthly_cleanup`, every 1 day, `KEEP`).
**Steps:** No-op unless `today.dayOfMonth == 1`; deletes `Shifts` and `SchedulerRunLog` older than (today − 1 month). → `ShiftCleanupWorker.kt:26-38`. Retry on DB-not-ready or failure.

### WF-android:008 — Auto-callback-to-gate (eligible incoming call → reject + dial Gate) [event-driven] (horizontal: WF-004)
**Trigger:** `TelephonyManager.ACTION_PHONE_STATE_CHANGED` broadcast (manifest receiver `CallbackPhoneStateReceiver`). Android-only — there is no web equivalent.
**Steps:**
1. **RINGING** → `goAsync()` + `GlobalScope(Dispatchers.IO)` → `CallbackLogic.isEligible(EXTRA_INCOMING_NUMBER)` (cheap-first order: `isDatabaseReady` → config `IsActive==1` → `isWithinWindow()` (Israel-tz `LocalTime`, midnight-wrap; All-day ⇒ always) → if `AllCallers==1` RETURN TRUE with NO number/query → else empty/withheld number ⇒ fail-safe skip → `shiftDao().getByDateRange(yesterday, tomorrow)` (already `IsCanceled=0`) + `volunteerDao().getAll()` Kotlin join → last-9-digit `israeliMsisdnKey` match). If eligible → `armAlarm()`: a SINGLE one-shot `setExactAndAllowWhileIdle(ELAPSED_REALTIME_WAKEUP, now+20s)`, fixed requestCode `770042`, `FLAG_IMMUTABLE`; no-ops if exact alarms not permitted. → `CallbackPhoneStateReceiver.kt:24-39`, `CallbackLogic.kt:70-121`
2. **OFFHOOK / IDLE** → `cancelAlarm()` (a battery optimization, NOT correctness — the fire-time re-check is authoritative). → `CallbackPhoneStateReceiver.kt:41-44`
3. **Alarm fires (+20s)** → `CallbackAlarmReceiver` `goAsync()`+IO → if `isDatabaseReady` && `tm.callState == CALL_STATE_RINGING` → `CallbackLogic.rejectAndDialGate()`. This single state re-check is THE authoritative gate (answered⇒OFFHOOK, hung-up⇒IDLE, busy⇒OFFHOOK; only still-ringing passes) — no state machine, no epoch, no wakelock. → `CallbackAlarmReceiver.kt:20-37`
4. `rejectAndDialGate()`: read Gate from config, sanitize to digits/`+`; `TelecomManager.endCall()` (needs `ANSWER_PHONE_CALLS`) → `delay(700)` → `placeCall(tel:gate, EXTRA_PHONE_ACCOUNT_HANDLE)` (handle from the SMS-selected SIM `sms_sim_subscription_id` via `TelephonyManager.createForSubscriptionId(subId).phoneAccountHandle`, omitted if null ⇒ default SIM; needs `CALL_PHONE`). Permissions re-checked; each native call try/catch-isolated; whole method fail-safe. → `CallbackLogic.kt:141-192`
**State transitions:** none persisted (no Room write; the 20s wait is a single transient exact alarm that exists only during a live eligible ring). Config is a singleton `CallbackConfig` row read fresh each step.
**Error handling:** every entry point is fail-safe — any exception / missing data / missing permission ⇒ does NOTHING (never crashes, never dials the wrong number). Call-waiting while already OFFHOOK never drops/disturbs the active call and never dials (the fire-time gate requires `callState==RINGING`) — do-nothing-while-busy by design.

## 4. Business Rules

| ID | Rule | Criticality | Source |
|---|---|---|---|
| BR-android:001 | **Room schema-change discipline:** any `@Entity`/`@Database` change requires bump `@Database(version=N)`, a new `MIGRATION_(N-1)_N`, and registration in BOTH `addMigrations(...)` call sites in `MagavApplication.kt` (initial build + recovery rebuild). Migration SQL must produce a schema whose hash matches entity annotations exactly (incl. every index AND every `@ColumnInfo(defaultValue=…)`). **`MIGRATION_8_9` is the latest correct example: additive `CREATE TABLE IF NOT EXISTS CallbackConfig` + `INSERT OR IGNORE` singleton, registered in BOTH `addMigrations` sites, entity↔migration `DEFAULT` clauses verified identical.** | CRITICAL | `db/MagavDatabase.kt:44,146-168`, `MagavApplication.kt:109,135`, `db/entity/CallbackConfigEntity.kt:11-13` |
| BR-android:002 | **Defensive DB-init recovery:** `initializeDatabase()` does NOT use `.fallbackToDestructiveMigration()`. Its catch recovers (deletes + recreates DB) ONLY when the error message contains `"file is not a database"` / `"file is encrypted"` / `"not a database"` (SQLCipher key/corruption). Every other error — incl. migration/schema-hash mismatch — is **re-thrown**, so a schema error crashes visibly instead of silently wiping user data. | CRITICAL | `MagavApplication.kt:112-137` |
| BR-android:003 | Current DB version is **9**. Registered migrations: 3→4 (rebuild Shifts, drop Notes-like cols), 4→5 (Locations + Shift location cols), 5→6 (JewishHolidays), 6→7 (`IsCanceled`+`CanceledAt`+index), 7→8 (no-op index re-validation), **8→9 (additive: `CREATE TABLE IF NOT EXISTS CallbackConfig` + `INSERT OR IGNORE` the Id=1 singleton; touches NO existing table)**. | CRITICAL | `db/MagavDatabase.kt:44,61-168` |
| BR-android:004 | SMS de-duplication: a shift is skipped if a `SmsLog` row with `(ShiftId, ReminderType, Status='Success')` already exists. | HIGH | `db/dao/SmsLogDao.kt:45,48`, `SmsReminderService.kt:60,95` |
| BR-android:005 | `SchedulerRunLog` has UNIQUE(`ConfigId`,`TargetDate`,`ReminderType`); the run-log insert catch (tightened in `2989b01`) swallows **only** `SQLiteConstraintException` = "already ran this tick"; any other DB error is `Log.e`'d distinctly and NOT rethrown (a rethrow would map to `Result.retry()` → duplicate SMS). Structurally identical to the .NET mirror. | HIGH | `db/entity/SchedulerRunLogEntity.kt:14`, `SmsReminderService.kt:188-200` |
| BR-android:006 | Canonical string constants must mirror .NET exactly: `ReminderTypes` = SameDay/Advance/LocationUpdate/Manual/**WeekdayAdvance**; `SmsStatuses` = Success/Fail; `DayGroups` = SunThu/Fri/Sat. Always use the constants. | HIGH | `util/Constants.kt:3-20` |
| BR-android:007 | Soft-cancel: every "active shift" query filters `IsCanceled = 0` (by-date, date-range, distinct-dates, group ops, SMS eligibility). | HIGH | `db/dao/ShiftDao.kt:12-67`, CLAUDE.md convention |
| BR-android:008 | Same-day (`SameDay`) reminders APPEND location (city/name + Waze `navigate=yes`); Advance/Manual/WeekdayAdvance do NOT. | HIGH | `SmsReminderService.kt:112-118,213` |
| BR-android:009 | `DayGroup` = the day the SMS is SENT (run day), holiday-aware: SAT > today-is-holiday > FRI > tomorrow-is-holiday > SunThu. A config only fires when `config.dayGroup == effectiveDayGroup`. | HIGH | `SmsSchedulerWorker.kt:70,230` |
| BR-android:010 | WeekdayAdvance uses a multi-day half-open window `[today+N, nextWorkingDay(today)+N)`, pulling shifts whose natural send-day lands on Fri/Sat/holiday onto this run; runLogDate = firing day. `{תאריך}/{יום}` derived per-shift. | MEDIUM | `SmsSchedulerWorker.kt:272-282`, `SmsReminderService.kt:106` |
| BR-android:011 | `WeekdayAdvance` config row is seeded DISABLED (`isEnabled=0`) and inserted via `insertOrIgnore` (UNIQUE DayGroup+ReminderType) on EVERY startup so it reaches upgraded DBs without overwriting admin edits. Keep defaults in sync with .NET `DbInitializer.cs MigrateSchedulerConfigAsync()`. | HIGH | `DatabaseInitializer.kt:170-193` |
| BR-android:012 | Eligibility per shift: non-null `VolunteerId` AND `approveToReceiveSms == 1` AND non-blank `mobilePhone` AND not already-sent. | HIGH | `SmsReminderService.kt:79-98` |
| BR-android:013 | Account lockout: 5 failed logins → 15-min lockout. Access token 15 min; refresh token 3 days, SHA-256-hashed server-side, rotated on each refresh. | HIGH | `AuthService.kt:16-18`, `JwtConfig.kt:16-17` |
| BR-android:014 | Seeded admin: userName `Admin`, password `12345` (BCrypt cost 10), role `Admin`, `MustChangePassword=1`. Seeded only when no `Admin` user exists. | HIGH | `DatabaseInitializer.kt:24-52` |
| BR-android:015 | File upload validation: CSRF `X-Requested-With: XMLHttpRequest`, ≤10MB, ext `.xlsx`/`.xls`, magic bytes ZIP `50 4B` or OLE `D0 CF`. | HIGH | `ShiftRoutes.kt:694-767`, `VolunteerRoutes.kt:187-260` |
| BR-android:016 | Shift import is destructive within range: deletes all shifts in `[minDate,maxDate]` then re-inserts parsed rows. | MEDIUM | `ShiftsImportService.kt:88-93` |
| BR-android:017 | Cannot delete: last Admin user, last MessageTemplate, a template used by a config, or a location attached to future shifts. | MEDIUM | `UserRoutes.kt:232`, `MessageTemplateRoutes.kt:162,171`, `LocationRoutes.kt:179` |
| BR-android:018 | Phone sanitization: strip non-digits, prefix `0` if missing leading zero. | MEDIUM | `VolunteerRoutes.kt:20`, `VolunteersImportService.kt:87` |
| BR-android:019 | License gate: app blocked if `LICENSE_EXPIRY_DATE` passed, or active SIM number not in `LICENSE_PHONES` (fail-open when phone perm missing / no SIM numbers readable). Build defaults: phones `0547504775,0506271989`, expiry `2026-10-06`. | MEDIUM | `LicenseValidator.kt:13-53`, `build.gradle.kts:19-22` |
| BR-android:020 | Bulk scheduler PUT validates the submitted id-set EXACTLY equals existing config ids (no hardcoded count) before any update. | MEDIUM | `SchedulerRoutes.kt:77` |
| BR-android:021 | **Device-allowlist gate (fail-CLOSED):** at WebView launch, after the license gate, a device is admitted ONLY if its `Settings.Secure.ANDROID_ID` (trimmed+lowercased) is in the hardcoded `DeviceAllowlist.ALLOWED` set; an unreadable/blank id OR an **EMPTY set blocks EVERY device** (the OPPOSITE of `LicenseValidator`, which fails open). ANDROID_ID is scoped to the APK signing keystore → regenerating the keystore / building on another machine / release signing invalidates the whole list and locks everyone out. Do NOT move into `util/Constants.kt` (parity-mirrored with .NET) — this is Android-only. | HIGH | `license/DeviceAllowlist.kt:22-41`, `MainActivity.kt:191-194` |
| BR-android:022 | **Auto-callback eligibility (Android-only):** a RINGING incoming call arms the +20s alarm ONLY if (cheap-order) `isDatabaseReady` AND config `IsActive==1` AND now ∈ window (`isWithinWindow` — Israel-tz `LocalTime`, midnight-wrap; All-day ⇒ always). Then **WHO filter:** if `AllCallers==1` → ALWAYS eligible (no number, no query); else the caller's last-9-digit `israeliMsisdnKey` must match a volunteer assigned to a shift dated today OR yesterday (`getByDateRange(yesterday,tomorrow)`, already `IsCanceled=0`, Kotlin-joined over `volunteerDao().getAll()`). Empty/withheld number ⇒ fail-safe skip. **NO `ApproveToReceiveSms` gating** (unlike SMS eligibility BR-android:012). | HIGH | `callback/CallbackLogic.kt:70-104`, `CallbackPhoneStateReceiver.kt:24-39` |
| BR-android:023 | **Auto-callback fire gate is a SINGLE fire-time re-check:** the +20s exact alarm fires `CallbackAlarmReceiver`, which dials the Gate ONLY if `tm.callState == CALL_STATE_RINGING` at fire (answered⇒OFFHOOK, hung-up⇒IDLE, busy/call-waiting⇒OFFHOOK; only still-ringing passes). No state machine, no epoch, no wakelock. Reject = `TelecomManager.endCall()` (`ANSWER_PHONE_CALLS`) → `delay(700)` → `placeCall(tel:gate)` (`CALL_PHONE`) on the SMS-selected SIM (`sms_sim_subscription_id` → `phoneAccountHandle`, default if null). Permissions re-checked at dial; every step fail-safe (missing perm/data ⇒ do nothing, never crash). Do-nothing-while-busy by design (an active OFFHOOK call is never dropped/disturbed). | HIGH | `callback/CallbackAlarmReceiver.kt:20-37`, `CallbackLogic.kt:106-192` |
| BR-android:024 | **`CallbackConfig` is a single-row singleton** (`@PrimaryKey Id=1`, `autoGenerate=false`). Seeded idempotently via `callbackConfigDao().insertOrIgnore(CallbackConfigEntity())` at the end of `DatabaseInitializer.initialize()` (fresh-install path) AND by `MIGRATION_8_9` (`INSERT OR IGNORE`, upgrade path) — belt-and-suspenders; neither clobbers admin edits (PK conflict ⇒ ignore). Route write path uses `@Upsert`. Every `@ColumnInfo(defaultValue=…)` MUST match the `MIGRATION_8_9` `DEFAULT` clauses (ADR-004 schema-hash). | HIGH | `db/entity/CallbackConfigEntity.kt:15-45`, `db/dao/CallbackConfigDao.kt:13-22`, `DatabaseInitializer.kt:23,31-33`, `db/MagavDatabase.kt:146-168` |

## 5. Data Models

**`@Database(version = 9, exportSchema = false)`** with 11 entities. [HIGH] (`db/MagavDatabase.kt:30-46`)

### UserEntity — table `Users` (`db/entity/UserEntity.kt`)
PK `Id` (autoGen Int). Cols: `FullName`, `UserName` (NOT NULL, **unique index**), `PasswordHash`, `IsActive` Int dflt 1, `Role` String dflt "User", `MustChangePassword` Int dflt 0, `FailedLoginAttempts` Int dflt 0, `LockoutUntil` String?, `RefreshTokenHash` String?, `RefreshTokenExpiry` String?, `LastConnected` String?, `CreatedAt`, `UpdatedAt`. Index: `index_Users_UserName` (unique).

### VolunteerEntity — table `Volunteers` (`db/entity/VolunteerEntity.kt`)
PK `Id`. Cols: `MappingName` (NOT NULL, **unique index**), `MobilePhone` String?, `ApproveToReceiveSms` Int dflt 0, `CreatedAt` String?, `UpdatedAt` String?. Index: `index_Volunteers_MappingName` (unique). **Intentionally OMITS the .NET-only `InternalIdHash`/`FirstName`/`LastName`/`RoleId` columns** — accepted-by-design per-target divergence (ADR-016; ISS-003 accepted), now documented in a file-header comment on `VolunteerEntity.kt` warning not to add columns for parity (a Room `@Entity` change → the ADR-004 data-wipe hazard). See `tools/parity.md` #3.

### ShiftEntity — table `Shifts` (`db/entity/ShiftEntity.kt`)
PK `Id`. Cols: `ShiftDate` (NOT NULL, ISO instant), `ShiftName` (NOT NULL), `CarId` String dflt '', `VolunteerId` Int? (FK → Volunteers.Id ON DELETE CASCADE), `VolunteerName` String?, `SmsSentAt` String?, `LocationId` Int?, `CustomLocationName` String?, `CustomLocationNavigation` String?, `IsCanceled` Int dflt 0, `CanceledAt` String?, `CreatedAt` String?, `UpdatedAt` String?. Indices: `ShiftDate`, `VolunteerId`, `IsCanceled`. FK: VolunteerId → Volunteers.

### SmsLogEntity — table `SmsLog` (`db/entity/SmsLogEntity.kt`)
PK `Id`. Cols: `ShiftId` Int (FK → Shifts.Id ON DELETE CASCADE), `SentAt` (NOT NULL), `Status` String dflt "Success", `Error` String?, `ReminderType` String dflt "SameDay". Indices: `ShiftId`, `SentAt`.

### SchedulerConfigEntity — table `SchedulerConfig` (`db/entity/SchedulerConfigEntity.kt`)
PK `Id`. Cols: `DayGroup`, `ReminderType`, `Time`, `DaysBeforeShift` Int dflt 0, `IsEnabled` Int dflt 1, `MessageTemplateId` Int dflt 1, `UpdatedAt` String?, `UpdatedBy` String?. Index: UNIQUE(`DayGroup`,`ReminderType`). No FK on MessageTemplateId (intentional — see BR-android:011).

### SchedulerRunLogEntity — table `SchedulerRunLog` (`db/entity/SchedulerRunLogEntity.kt`)
PK `Id`. Cols: `ConfigId` Int (FK → SchedulerConfig.Id CASCADE), `ReminderType`, `RanAt`, `TargetDate`, `TotalEligible` Int dflt 0, `SmsSent` Int dflt 0, `SmsFailed` Int dflt 0, `Status` String dflt "Pending", `Error` String?. Indices: `ConfigId`, `RanAt`, UNIQUE(`ConfigId`,`TargetDate`,`ReminderType`).

### AppSettingEntity — table `AppSettings` (`db/entity/AppSettingEntity.kt`)
PK `Key` (String). Col: `Value`. Used for `sms_sim_subscription_id` (default "-1").

### MessageTemplateEntity — table `MessageTemplate` (`db/entity/MessageTemplateEntity.kt`)
PK `Id`. Cols: `Name`, `Content`, `CreatedAt` String?, `UpdatedAt` String?. Seeded ids 1=same-day, 2=advance, 3=cancellation.

### LocationEntity — table `Locations` (`db/entity/LocationEntity.kt`)
PK `Id`. Cols: `Name` (NOT NULL, **unique index**), `Address` String?, `City` String?, `Navigation` String?, `CreatedAt`, `UpdatedAt`. Index: `index_Locations_Name` (unique).

### JewishHolidayEntity — table `JewishHolidays` (`db/entity/JewishHolidayEntity.kt`)
PK `Id`. Cols: `Date` (NOT NULL, **unique index**), `Name`. Seeded 2025–2035.

### CallbackConfigEntity — table `CallbackConfig` (`db/entity/CallbackConfigEntity.kt`)
**Singleton** PK `Id` Int=1 (`autoGenerate=false`). Cols (all with `@ColumnInfo(defaultValue=…)`): `IsActive` Int dflt 0, `GatePhone` String dflt '', `FromHour` String dflt '08:00', `ToHour` String dflt '20:00', `AllDay` Int dflt 0, `AllCallers` Int dflt 0, `UpdatedAt` String?, `UpdatedBy` String?. **New in DB v9 (`MIGRATION_8_9`).** Defaults MUST stay identical to the migration's `DEFAULT` clauses (file-header warns; ADR-004 schema-hash). Android-only auto-callback-to-gate config; no .NET/web counterpart. [HIGH]

**Query DTOs (not entities):** `SmsLogDetailDto`, `SmsLogSummaryDto` (`db/dao/SmsLogDetailDto.kt`); `AiShiftVolunteerDto` (`db/dao/AiQueryDtos.kt`) — **orphan/dead**, not referenced by any DAO query in the component (no `getShiftsWithVolunteers` found). [HIGH]

## 6. Integration Points

| ID | Name | Type | Direction | Target | Source |
|---|---|---|---|---|---|
| IP-android:001 | Ktor HTTP server | HTTP server | inbound | 127.0.0.1:5015 | `api/KtorServer.kt:27` |
| IP-android:002 | WebView → localhost API/SPA | HTTP client | outbound (in-process) | localhost:5015 | `MainActivity.kt:196,238`, `KtorServer.kt:89` |
| IP-android:003 | Native SMS send | platform API | outbound | Android `SmsManager` (dual-SIM via subscriptionId) | `sms/AndroidSmsProvider.kt:43-121` |
| IP-android:004 | Exact alarm scheduling | platform API | bidirectional | `AlarmManager` (RTC_WAKEUP) | `scheduler/AlarmScheduler.kt:81` |
| IP-android:005 | Deferred work execution | platform API | bidirectional | `WorkManager` (OneTime + Periodic) | `SmsAlarmReceiver.kt:31`, `MagavServerService.kt:121` |
| IP-android:006 | Boot broadcast | platform API | inbound | `BOOT_COMPLETED` | `BootReceiver.kt:14`, manifest:49 |
| IP-android:007 | SMS sent-status broadcast | platform API | inbound | dynamic `BroadcastReceiver` per send | `AndroidSmsProvider.kt:66-97` |
| IP-android:008 | SIM enumeration | platform API | inbound | `SubscriptionManager` | `SettingsRoutes.kt:142`, `LicenseValidator.kt:36` |
| IP-android:009 | Call-state polling | platform API | inbound | `TelephonyManager` | `SmsSchedulerWorker.kt:166` |
| IP-android:010 | Excel file import | file I/O | inbound | Apache POI (xlsx/xls in memory) | `ShiftScheduleParser.kt:29`, `VolunteersImportService.kt:19` |
| IP-android:011 | Encrypted secrets store | platform API | bidirectional | EncryptedSharedPreferences (`magav_secure_prefs`) | `MagavApplication.kt:140`, `MagavServerService.kt:99`, `SessionManager.kt:17` |
| IP-android:012 | Biometric prompt | platform API | inbound | `BiometricPrompt` (BIOMETRIC_STRONG) | `auth/BiometricAuthHelper.kt:48` |
| IP-android:013 | JS↔native bridge (auth) | WebView interface | bidirectional | `NativeAuth` JS interface | `MainActivity.kt:115`, `auth/NativeAuthBridge.kt` |
| IP-android:014 | tel: dialer | intent | outbound | `ACTION_DIAL` | `MainActivity.kt:85` |
| IP-android:015 | JS↔native bridge (media) — Duty Log save/share | WebView interface | inbound (JS→native) | `NativeMedia` JS interface: `saveImageToGallery(base64,name):Boolean`, `shareImage(base64,name)` | `MainActivity.kt:116`, `media/MediaBridge.kt` |
| IP-android:016 | Gallery write (scoped storage) | platform API | outbound | `MediaStore.Images` → `Pictures/Magav` (IS_PENDING flow, no runtime permission on minSdk 29) | `media/MediaBridge.kt` (`saveImageToGallery`) |
| IP-android:017 | Share-sheet intent (FileProvider) | intent | outbound | `ACTION_SEND image/png` via `FileProvider` authority `com.magav.app.fileprovider` (cacheDir/shared) | `media/MediaBridge.kt` (`shareImage`), `AndroidManifest.xml` (`<provider>`), `res/xml/file_paths.xml` |
| IP-android:018 | JS↔native bridge (clipboard) — copy device id on the block page | WebView interface | inbound (JS→native) | `NativeClip` JS interface: `copyDeviceId():String` — reads ANDROID_ID natively, marshals the clipboard write to the main looper (try/catch so an OEM exception can't crash the only screen a blocked device sees) | `MainActivity.kt:119`, `license/DeviceClipboardBridge.kt:20-34` |
| IP-android:019 | Device identity read | platform API | inbound | `Settings.Secure.ANDROID_ID` (allowlist check + block-page display) | `license/DeviceAllowlist.kt:33` |
| IP-android:020 | Phone-state broadcast (auto-callback) | platform API | inbound | `TelephonyManager.ACTION_PHONE_STATE_CHANGED` → manifest `CallbackPhoneStateReceiver` (exported=true; protected broadcast) | `callback/CallbackPhoneStateReceiver.kt:20`, `AndroidManifest.xml:62-68` |
| IP-android:021 | One-shot callback alarm (+20s) | platform API | bidirectional | `AlarmManager.setExactAndAllowWhileIdle(ELAPSED_REALTIME_WAKEUP)` fixed requestCode 770042 → `CallbackAlarmReceiver` (exported=false) | `callback/CallbackLogic.kt:107-135`, `CallbackAlarmReceiver.kt:20`, `AndroidManifest.xml:71-73` |
| IP-android:022 | Reject ringing call + place gate call | platform API | outbound | `TelecomManager.endCall()` (`ANSWER_PHONE_CALLS`) + `placeCall(tel:)` (`CALL_PHONE`) on SMS-selected SIM via `phoneAccountHandle` | `callback/CallbackLogic.kt:141-216` |
| IP-android:023 | Incoming-number read (auto-callback) | platform API | inbound | `TelephonyManager.EXTRA_INCOMING_NUMBER` (needs `READ_CALL_LOG`) | `callback/CallbackPhoneStateReceiver.kt:27` |

## 7. User Roles & Access

**Roles** (single string per user in `Role` column; surfaced to client as `roles: [role]`): `Admin`, `SystemManager`, `User`. Valid-role set enforced on user create/update. [HIGH] (`AuthService.kt:96`, `UserRoutes.kt:20`)

**JWT** — HMAC256, issuer `magav-app`, audience `magav-users`, access token 15 min with `name` + `role` + `jti` claims; refresh token = 64 random bytes hex, SHA-256-hashed in DB, 3-day expiry, rotated on refresh. Signing key persisted in EncryptedSharedPreferences (`jwt_secret_key`, 64 random bytes). [HIGH] (`api/auth/JwtConfig.kt`, `MagavServerService.kt:99`)

**Seeded admin:** `Admin` / `12345`, role Admin, `MustChangePassword=1`. [HIGH] (`DatabaseInitializer.kt:24`)

**Route authorization** — Ktor `authenticate("auth-bearer")` + `call.requireRole(...)`:
- Public (no auth): `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/health`, static SPA paths. [HIGH] (`AuthRoutes.kt:19,42`, `HealthRoutes.kt:13`, `KtorServer.kt:89`)
- Admin-only: all `/api/users/*`, scheduler config writes (`PUT /api/scheduler/config[/id]`), message-template writes, all `/api/settings/*`, callback-config write (`PUT /api/callback-config`). [HIGH] (`UserRoutes.kt:53`, `SchedulerRoutes.kt:64,117`, `MessageTemplateRoutes.kt:51,96,148`, `SettingsRoutes.kt:55,69,102`, `CallbackConfigRoutes.kt:61`)
- Admin + SystemManager: volunteers, shifts, locations, holidays, sms-log, scheduler reads, message-template reads, callback-config read (`GET /api/callback-config`). [HIGH] (`CallbackConfigRoutes.kt:53`)
- Self-protection: cannot self-deactivate, self-change-role, self-delete, or delete last admin. [HIGH] (`UserRoutes.kt:167-235`)

## 8. Interfaces Exposed

**Ktor REST API (localhost:5015 only, bound 127.0.0.1).** [HIGH] (`api/KtorServer.kt:27`, routes mounted at `KtorServer.kt:76-86`)
- Auth: `POST /api/auth/login`, `/refresh`, `/logout`, `/change-password`
- Health: `GET /api/health` (version + versionCode)
- Users: `GET|POST /api/users`, `GET|PUT|DELETE /api/users/{id}`
- Volunteers: `GET|POST /api/volunteers`, `GET|PUT|DELETE /{id}`, `POST /import`
- Shifts (`ShiftRoutes.kt`, 907 lines): `GET /by-date`, `GET /dates-with-shifts`, `DELETE /{id}`, `POST /delete-group`, `POST /{id}/cancel`, `POST /cancel-group`, `GET /canceled`, `POST /{id}/send-sms`, `POST /` (create), `PUT /update-group`, `POST /import`, `PUT /update-group-location`, `POST /send-location-update`
- Locations: `GET|POST /api/locations`, `GET|PUT|DELETE /{id}`
- Jewish holidays: `GET|POST /api/jewish-holidays`, `GET|PUT|DELETE /{id}`
- SMS log: `GET /api/sms-log`, `GET /api/sms-log/summary`
- Scheduler: `GET /api/scheduler/config`, `PUT /config`, `PUT /config/{id}`, `GET /run-log`
- Message templates: `GET|POST /api/message-templates`, `PUT|DELETE /{id}`
- Settings: `GET|PUT /api/settings/sms-sim`, `POST /api/settings/test-sms`
- Callback config (**Android-Ktor-ONLY surface** — no .NET/web counterpart, ISS-004 accepted divergence; same pattern as `/api/settings/sms-sim`): `GET /api/callback-config` (Admin+SystemManager), `PUT /api/callback-config` (Admin) — validates Gate phone (len≥9, `^[0-9+\-]+$`) when active, both times `HH:mm` when not All-day; `@Serializable` DTOs map `isActive`/`allDay`/`allCallers` Boolean↔Int 0/1. [HIGH] (`api/routes/CallbackConfigRoutes.kt:47-110`, wired `KtorServer.kt:87`)
- Static catch-all `get("{...}")` serves `assets/web/*` with SPA fallback to `index.html`.

**SMS provider interface:** `interface SmsProvider { suspend fun sendSms(phone, message): SmsResult }` — sole impl `AndroidSmsProvider`. [HIGH] (`sms/SmsProvider.kt:3`)

**JS bridges (THREE):** `NativeAuth` exposes `onLoginSuccess`/`onLogout`/`onTokenRefresh` (`auth/NativeAuthBridge.kt`); `NativeMedia` exposes `saveImageToGallery(base64,filename):Boolean` (MediaStore → `Pictures/Magav`, PNG-magic-verified, IS_PENDING flow, deletes the pending row on failure) + `shareImage(base64,filename)` (writes `cacheDir/shared/`, `FileProvider` → `ACTION_SEND` chooser with `FLAG_GRANT_READ_URI_PERMISSION` + `FLAG_ACTIVITY_NEW_TASK`); `NativeClip` exposes `copyDeviceId():String` — used ONLY by the device-block page to copy the device's ANDROID_ID (marshals the clipboard write to the main looper, try/catch-guarded). All three run on a WebView binder thread, return synchronously, touch no UI directly (clipboard write is posted to the main looper), and persist NOTHING in Room. [HIGH] (`media/MediaBridge.kt`, `license/DeviceClipboardBridge.kt`, `MainActivity.kt:115-119`)

## 9. Interfaces Consumed

| External component | What imported | Import location |
|---|---|---|
| Ktor server (CIO, auth, content-negotiation, cors, status-pages) | `io.ktor.server.*` | `api/KtorServer.kt:9-22`, all routes |
| kotlinx.serialization | `@Serializable`, `Json` | `api/models/*`, route DTOs |
| Room | `@Dao @Entity @Query`, `Room.databaseBuilder` | `db/**`, `MagavApplication.kt:8` |
| SQLCipher | `net.sqlcipher.database.{SQLiteDatabase,SupportFactory}` | `MagavApplication.kt:17-18` |
| Koin | `startKoin`, `module`, `inject`, `androidContext` | `MagavApplication.kt:19-21,174`, `MainActivity.kt:29` |
| Apache POI | `WorkbookFactory`, `DateUtil`, `FormulaEvaluator` | `ShiftScheduleParser.kt:1-9`, `VolunteersImportService.kt:6` |
| auth0 java-jwt | `JWT`, `Algorithm`, `DecodedJWT` | `api/auth/JwtConfig.kt:1-5`, `KtorServer.kt:2` |
| favre BCrypt | `at.favre.lib.crypto.bcrypt.BCrypt` | `AuthService.kt:3`, `DatabaseInitializer.kt:3`, `UserRoutes.kt:3` |
| androidx.security-crypto | `EncryptedSharedPreferences`, `MasterKeys` | `MagavApplication.kt:9-10`, `MagavServerService.kt:9-10`, `SessionManager.kt:4-5` |
| androidx.biometric | `BiometricManager`, `BiometricPrompt` | `auth/BiometricAuthHelper.kt:4-5` |
| WorkManager | `CoroutineWorker`, `WorkManager`, `PeriodicWorkRequestBuilder` | `SmsSchedulerWorker.kt`, `ShiftCleanupWorker.kt`, `SmsAlarmReceiver.kt`, `MagavServerService.kt:117` |
| Android framework | `AlarmManager`, `SmsManager`, `SubscriptionManager`, `TelephonyManager`, `WebView`, `NotificationManager` | `scheduler/*`, `sms/*`, `MainActivity.kt`, `SettingsRoutes.kt` |
| kotlinx.coroutines | `Mutex`, `withTimeoutOrNull`, `Dispatchers`, `suspendCancellableCoroutine` | `AndroidSmsProvider.kt`, `MagavServerService.kt`, `MainActivity.kt` |

## 10. Legacy Warnings

- **God objects:** `api/routes/ShiftRoutes.kt` (907 lines, 13 endpoints incl. inline SMS-send logic duplicated across cancel/delete/send-sms/location-update); `db/DatabaseInitializer.kt` (389 lines, ~160-row hardcoded holiday table 2025–2035). [HIGH]
- **No automated tests** in the component (consistent with project-wide "no tests"). [HIGH]
- **`versionCode` bump-per-build requirement:** `MainActivity.clearCacheOnVersionChange()` clears the WebView cache only when `versionCode` differs from the stored value. Forgetting to bump `versionCode` in `build.gradle.kts` leaves users on a stale cached React UI. Current `versionCode=75`, `versionName="1.4.25"` (bumped 63→75 across the Duty Log + device-allowlist + editable-hours iterations — each re-install needs a fresh code or the cached PWA serves the old UI). [HIGH] (`MainActivity.kt:295`, `build.gradle.kts:16`)
- **Device-allowlist is fail-CLOSED and keystore-coupled — a hard lockout footgun.** `DeviceAllowlist.ALLOWED` is a hardcoded set of `Settings.Secure.ANDROID_ID`s; an EMPTY set blocks EVERY device (opposite of `LicenseValidator`'s fail-open), and ANDROID_ID is scoped to the APK signing key — so regenerating the debug keystore, building the distributed APK on a different machine, or switching to release signing changes every device's id and **locks out all users**. Mitigations: always build the distributed APK on the same machine, back up the debug keystore, and add approved ids before distribution. Intentional + self-documented (`DeviceAllowlist.kt:11-20` header), tracked here as a caveat — NOT a formal issue. [HIGH] (`license/DeviceAllowlist.kt:11-41`)
- **`assembleRelease` (R8) was never exercised before `970cdcc`; release runtime is UNVALIDATED.** [HIGH] The team ships **debug** APKs (`build-apk.bat` runs `assembleDebug`). The first `assembleRelease` failed on Apache POI's optional transitive deps; fixed by adding `-dontwarn` for `aQute.bnd.annotation`, `com.google.j2objc.annotations`, `org.osgi.framework`, `org.slf4j`, `org.apache.logging.log4j`, `java.awt`, `com.graphbuilder` to `proguard-rules.pro` (runtime-safe). R8 now completes and keeps the `@JavascriptInterface` methods un-renamed (verified in the mapping). BUT: there is **no release `signingConfig`** (release APK is unsigned), and the release-config runtime (POI/SQLCipher/Ktor under full minify + `shrinkResources`) has not been device-tested. (`android/app/proguard-rules.pro`, `build.gradle.kts:25-33`)
- **Dead code:** `AiQueryDtos.kt` `AiShiftVolunteerDto` is defined but unreferenced (the `getShiftsWithVolunteers()` JOIN it documents does not exist in any DAO). [HIGH] (`db/dao/AiQueryDtos.kt`)
- **[ISS-010] New repo-hygiene issue — root `.gitignore` `db/` rule git-IGNORES the new `db/` SOURCE files (status: new/open, Medium).** Root `.gitignore` line 41 (under "# Database & Sensitive Data") is a **bare, unanchored `db/`** that greedily matches the Android source package `android/app/src/main/java/com/magav/app/db/`. Existing files there are tracked only because they predate the rule (gitignore never un-tracks). The TWO new files `db/entity/CallbackConfigEntity.kt` and `db/dao/CallbackConfigDao.kt` are therefore git-IGNORED — verified `git check-ignore -v` → `.gitignore:41:db/` for both, and `git ls-files` returns nothing → a plain `git add` silently skips them, breaking a fresh-checkout build/commit. **The running build is unaffected** (the Kotlin compiler reads disk, not the index). Workaround: `git add -f` the two files; proper fix: anchor the rule (`/db/` at repo root) or scope it to the SQLite data dir. [HIGH] (`.gitignore:41`)
- **Auto-callback-to-gate runtime cost / footguns:** event-driven (`PHONE_STATE` broadcast + a single transient +20s exact alarm) ⇒ ~zero idle battery. Requires runtime grant of `CALL_PHONE`/`ANSWER_PHONE_CALLS`/`READ_CALL_LOG` AND device battery set to Unrestricted (the static-guidance card in the React settings page tells the operator) — without them the feature silently no-ops. `TelecomManager.endCall()` is deprecated but used intentionally (try/catch-isolated). The `CallbackConfig` singleton must be reachable on upgraded DBs — covered by BOTH `MIGRATION_8_9` seed and the unconditional `DatabaseInitializer.seedCallbackConfig()`. [HIGH] (`callback/CallbackLogic.kt:159,181`, `DatabaseInitializer.kt:31-33`)
- **TODO/FIXME:** none found in Kotlin source; only `@Deprecated("Deprecated in Java")` on `MainActivity.onBackPressed()` (framework deprecation, intentional). [HIGH] (grep over `android/app/src/main`)
- **Cleartext + permissive CORS:** `usesCleartextTraffic="true"` (needed for localhost http) and Ktor CORS `anyHost()`. Acceptable because the server binds `127.0.0.1` only, but worth noting. [MEDIUM] (`AndroidManifest.xml:25`, `KtorServer.kt:36`)
- **`GlobalScope.launch`** used in `SmsAlarmReceiver`/`BootReceiver` re-scheduling (unstructured concurrency, by design tied to `goAsync()`). [LOW]
- **Permissions used:** `SEND_SMS`, `READ_PHONE_STATE`, `READ_PHONE_NUMBERS`, `RECEIVE_BOOT_COMPLETED`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SPECIAL_USE`, `SCHEDULE_EXACT_ALARM`, `INTERNET`, `WAKE_LOCK`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, `POST_NOTIFICATIONS`, plus (auto-callback, new) **`CALL_PHONE`**, **`ANSWER_PHONE_CALLS`**, **`READ_CALL_LOG`** — all three added to `MainActivity.requestPermissions()` (`CALL_PHONE`/`ANSWER_PHONE_CALLS` reuse the existing `permissionLauncher`; `READ_CALL_LOG` is its own CALL_LOG-group dialog). Missing perms ⇒ the callback feature is inert (fail-safe), never crashes. Foreground service type `specialUse`; `stopWithTask="false"` keeps the server alive when the task is swiped away. [HIGH] (`AndroidManifest.xml:5-73`, `MainActivity.kt:145-159`)

## 11. Design Rationale

| Pattern | Location | Rationale | Evidence | Certainty |
|---|---|---|---|---|
| Embedded Ktor server + WebView hybrid | `KtorServer.kt`, `MainActivity.kt`, `MagavServerService.kt` | Reuse the exact React SPA and REST contract from the .NET web target without rewriting UI; the phone becomes a self-contained server + SMS gateway with no cloud dependency | Same routes/DTOs mirror .NET; SPA served from `assets/web/`; server bound localhost-only | HIGH |
| Exact alarms in Asia/Jerusalem tz | `AlarmScheduler.kt:16,81` | SMS reminders must fire at precise local Israel times regardless of device tz; `setExactAndAllowWhileIdle` survives Doze; inexact fallback when exact-alarm permission denied | `ZoneId.of("Asia/Jerusalem")`, exact/inexact branch at :76-81 | HIGH |
| All-7-days alarm scheduling, runtime day-group gate | `AlarmScheduler.kt:42`, `SmsSchedulerWorker.kt:70` | Holiday-aware effective day group can shift which config applies; scheduling every day + filtering at fire time lets holidays re-map Fri/Sat behavior without re-deriving alarm calendars | worker skips when `config.dayGroup != effectiveDayGroup` | HIGH |
| Mutex-serialized, 15s-timeout SMS with per-send broadcast | `AndroidSmsProvider.kt:25,30-36,66` | Concurrent `SmsManager` sends collide on the shared sent-broadcast; a global `Mutex` + unique requestCode per send + timeout guards correctness and prevents hangs | `smsMutex.withLock`, `withTimeoutOrNull(15_000L)`, `AtomicInteger` requestCode | HIGH |
| No `fallbackToDestructiveMigration`; selective recovery | `MagavApplication.kt:112-137` | Destructive fallback would silently wipe all volunteer/shift/SMS data on any schema mismatch; recovering ONLY on SQLCipher key errors and re-throwing else makes schema bugs crash visibly | explicit message-string check + `throw e` | HIGH |
| Secrets in EncryptedSharedPreferences (AES256-GCM) | `MagavApplication.kt:140`, `MagavServerService.kt:99` | DB passphrase + JWT signing key must not be hardcoded; backed by Android Keystore master key; includes corrupted-prefs self-heal after reinstall | `MasterKeys.AES256_GCM_SPEC`, recreate-on-corrupt at :149 | HIGH |
| Dual-SIM via subscription id | `AndroidSmsProvider.kt:43`, `SettingsRoutes.kt`, AppSettings `sms_sim_subscription_id` | Volunteers' org may require a specific SIM; setting selects `getSmsManagerForSubscriptionId`, `-1` = system default | subscription branch + settings route | HIGH |
| Call-aware deferral (foreground upgrade, 20-min poll) | `SmsSchedulerWorker.kt:165` | Sending SMS mid-call can fail or interrupt; worker upgrades to foreground and waits for `CALL_STATE_IDLE` (max 20 min) then proceeds | `TelephonyManager.callState`, `setForeground` | HIGH |
| Persisted session + biometric re-auth | `SessionManager.kt`, `BiometricAuthHelper.kt`, `MainActivity.handleSessionAwareStartup()` | Avoid re-login on every launch while protecting after 15-min inactivity; native silent refresh injects tokens into the WebView localStorage | 15-min `BIOMETRIC_THRESHOLD_MS`, `injectTokensAndLoad` | HIGH |
| Duty Log save/share via a native media bridge (Option B), constructed with `applicationContext`, NO Room change | `media/MediaBridge.kt`, `MainActivity.kt:116` | The WebView can't save a `blob:`/`data:` PNG itself (no DownloadListener, no storage perms); a JS bridge writes via MediaStore (scoped storage, permission-free on minSdk 29) + FileProvider share. Built with applicationContext + a generic `@JavascriptInterface` proguard keep so R8 doesn't strip it. Persists nothing → Room schema hash unchanged → existing data safe on update (ADR-019) | `MediaStore.IS_PENDING` flow, `FileProvider.getUriForFile`, `-keepclassmembers ... @JavascriptInterface` | HIGH |
| Device-allowlist gate is **fail-CLOSED** (empty set blocks all) | `license/DeviceAllowlist.kt:11-41`, `MainActivity.kt:191-194` | Distribution is restricted to explicitly-approved devices; an unreadable id or a not-yet-populated list must DENY, not admit (the inverse of `LicenseValidator`'s fail-open phone/expiry check). A device pastes its ANDROID_ID (via the `NativeClip` bridge on the block page) to be added. Trade-off accepted: keystore-coupling means the list invalidates on a signing-key change (see Legacy Warnings) | explicit `isAllowed()` returns false on null/blank id; empty `ALLOWED` set; gate ordered after the license check | HIGH |
| Block-page clipboard write marshalled to the main looper + try/catch | `license/DeviceClipboardBridge.kt:20-34` | `@JavascriptInterface` methods run on a WebView binder thread; a clipboard write must hit the main looper, and an OEM/device-policy exception must NEVER crash the block page (the only screen a blocked device can reach) | `Handler(Looper.getMainLooper()).post { … }` wrapped in try/catch; id also shown in a selectable box as a fallback | HIGH |
| Auto-callback as event + ONE transient exact alarm + ONE fire-time re-check (no state machine) | `callback/CallbackLogic.kt`, `CallbackPhoneStateReceiver.kt`, `CallbackAlarmReceiver.kt` | A 20s "rang-unanswered" timer must cost ~zero idle battery and never disturb an answered/busy call. Instead of polling or a service, a `PHONE_STATE` broadcast arms a SINGLE one-shot `setExactAndAllowWhileIdle` (+20s); the alarm fire receiver re-reads `callState` ONCE — answered⇒OFFHOOK, hung-up⇒IDLE, busy/call-waiting⇒OFFHOOK, only still-RINGING dials — so no epoch/wakelock/state machine is needed and call-waiting-while-busy is do-nothing by design. Fully decoupled from SMS (touches no SMS file / `MagavServerService`); fixed alarm requestCode 770042; fire receiver `exported=false`. Every entry point fail-safe. | one-shot alarm, fire-time `callState==CALL_STATE_RINGING` gate, `endCall()`→`delay(700)`→`placeCall()`, all try/catch | HIGH |
| Auto-callback config is an Android-only Ktor endpoint (no .NET/web mirror) | `api/routes/CallbackConfigRoutes.kt`, page gated to the Android WebView | The feature is native-only (cannot run in the web build), so its `GET/PUT /api/callback-config` lives ONLY in the Android Ktor surface and the React settings page is gated by `window.NativeMedia` presence — the SAME accepted "Android-only native setting" pattern as `/api/settings/sms-sim` (SIM selection), NOT a new contract defect (ISS-004 accepted divergence) | Boolean↔Int 0/1 DTO mapping mirrors SchedulerConfig; SIM for the gate call reuses `sms_sim_subscription_id` | HIGH |
