<!-- DEEPINIT:START (managed — regenerated on each `deep-init` run; edit OUTSIDE these markers) -->
# android — scoped context

Kotlin hybrid app (source in `app/src/main/`): embeds a Ktor HTTP server (localhost:5015) in a foreground service that mirrors the .NET API, with a WebView loading the same React build; SMS sent natively via `SmsManager`. Room + SQLCipher, Koin DI, AlarmManager + WorkManager. Full detail → `.ai/docs/components/android.md`.

## 🚨 Room schema changes can SILENTLY WIPE ALL USER DATA
Any `@Entity` change requires, every time: (1) bump `@Database(version=N)` in `app/src/main/java/com/magav/app/db/MagavDatabase.kt` (currently **8**); (2) add `MIGRATION_N_(N+1)` (idempotent SQL); (3) register it in **BOTH** `addMigrations(...)` sites in `MagavApplication.kt` (initial build AND recovery rebuild); (4) make the migration's resulting schema match the entity exactly (every index). `initializeDatabase()` (`MagavApplication.kt:102-137`) deliberately omits `fallbackToDestructiveMigration` and recovers ONLY on SQLCipher key/corruption errors — every other error (incl. a forgotten-migration schema-hash mismatch) is re-thrown so it crashes VISIBLY. **Verify on a populated dev device before shipping.** [ADR-004 — born from a real data-loss incident]

## Critical to know
- **Bump `versionCode`** in `app/build.gradle.kts` (currently **62** / 1.4.13) before EVERY APK build — the WebView caches the PWA service worker; `MainActivity.clearCacheOnVersionChange()` clears it only on a version-code bump. Forgetting = users stuck on old UI.
- **Constants must mirror .NET `MagavConstants` exactly** — `util/Constants.kt` (5 ReminderTypes incl. `WeekdayAdvance`, SmsStatuses, DayGroups). Verified in sync.
- **Scheduler:** exact `AlarmManager` alarms in **Israel tz** per enabled `SchedulerConfig`/day-group → `SmsAlarmReceiver` → `SmsSchedulerWorker` (WorkManager) → query eligible shifts (filter `IsCanceled=0`), check approval+phone+dedup via `SmsLog`, build from template, `AndroidSmsProvider` (Mutex-serialized, 15s timeout). `BootReceiver` re-schedules on boot.
- **`VolunteerEntity` diverges from the .NET `Volunteer` model** — it keys on a unique `MappingName` and lacks `InternalIdHash`/`FirstName`/`LastName`/`RoleId`, so the .NET hashed-id SMS-approval flow has no Android landing column. [ISS-003]
- Secrets (DB passphrase, JWT key) in EncryptedSharedPreferences; SIM choice in the `AppSettings` table (`sms_sim_subscription_id`, -1 = default). Seeded admin password `12345`.
- `db/dao/AiQueryDtos.kt` is orphan/dead code. Largest files: `api/routes/ShiftRoutes.kt` (907), `db/DatabaseInitializer.kt` (389).
<!-- DEEPINIT:END -->
