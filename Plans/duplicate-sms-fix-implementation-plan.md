# Duplicate-SMS Fix — Implementation Plan (v3, PRODUCTION-READY)

> Status: **v3 — production-ready.** Two full adversarial validation rounds are integrated: round 1 (5 lenses: accuracy / regression / .NET / client-parity / design) and round 2 (4 fresh lenses: incident simulation / implementability / new-risk red team / production readiness — all verdicts READY_WITH_MINOR_FIXES, every fix folded in below). Round 2 re-verified every load-bearing file:line cite against the working tree and simulated all incident scenarios against the post-fix system: **no duplicate is reachable; silent loss is confined to two stated, visible cases.**
> Scope: **Android app only** (user decision 2026-08-16). React work ships inside the APK. .NET gets one constant line (parity-lint) and nothing else; .NET behavioral findings are archived in the Appendix.
> Incident: 15–16/08/2026 — byte-identical reminder batches ×2/×3/×5. Root cause (verified): re-dispatch cycles — dedup saw only `Status='Success'` rows while delivered sends were logged `Fail` (15s sent-broadcast timeout) or not logged at all (cancelled worker); no run-level protection since `9afc0f1`; amplified by Messages-app resends of "failed"-looking messages (RCS-labeled copies prove non-app sends).

## Doctrine

**At-most-once automatic dispatch per (ShiftId, ReminderType).** A message handed to the radio is treated as sent unless *definitively* known to have failed; even definitive failures are never retried automatically, only manually. The send path is fail-closed: no DB record ⇒ no dispatch.

**Zero Room schema migration.** No `@Entity` is touched; `Dispatched` is a new *value* in the existing TEXT `Status` column. `@Database` stays **11** (`MagavDatabase.kt:44`). Avoids the ADR-004 data-wipe hazard class entirely; also makes rollback schema-safe (see Rollback).

**Ship Phases 1–4 in ONE APK** (round-2-verified as genuinely binding, not caution): without Phase 4 the log page renders Dispatched as red "נכשל" (the incident's resend trigger); without Phase 3 a timed-out manual send 500s and red-toasts for a delivered message while its Fail row suppresses the automatic reminder; without Phase 2 Phase 1 cannot distinguish Dispatched from Fail at all.

**Version target:** versionCode **83**, versionName **1.5.0** (behavior change, not a patch).

---

## Phase 0 — Preconditions & accepted behavior changes

1. **No-migration invariant**: `git diff` over `android/.../db/entity/` stays empty. Trap: `SmsLogEntity.Status` has `defaultValue = SUCCESS` — every write-ahead insert must pass `status = SmsStatuses.DISPATCHED` **explicitly**.
2. **Accepted change A**: a definitively failed send no longer auto-retries (its Fail row blocks re-dispatch). Verified: no auto-retry flow exists today. Remediation = per-shift manual send (log page has no resend button — noted follow-up).
3. **Accepted change B**: unknown-outcome sends (sent-broadcast timeout) are recorded `Dispatched`, not `Fail`, and block re-dispatch.
4. **Accepted change C**: the manual route maps `templateId 1→SameDay / 2→Advance` ([ShiftRoutes.kt:492](android/app/src/main/java/com/magav/app/api/routes/ShiftRoutes.kt#L492)); a failed/unknown manual SameDay/Advance attempt now blocks that shift's automatic reminder. Deliberate (any dispatch attempt counts; manual send has no dedup, so the operator can always override). Do NOT remap failures to `Manual`.
5. **Accepted change D (round 2)**: a crash in the milliseconds between the write-ahead INSERT and the radio handoff leaves a blocking `Dispatched` row with no message sent. Visible (amber badge), remediated by manual send — the price of at-most-once.
6. **Preserved behavior (verified)**: a same-day config-time edit re-fires today and, with per-shift dedup, sends only shifts added since. Caveat: `KEEP` silently drops the re-fire while the earlier work item is still pending in retry backoff (window ≤ ~1 min; accepted).
7. **Residual races (accepted, now tiny)**: with the manual route also write-ahead (Phase 3.4), the manual-vs-scheduler race window shrinks from ~60s to milliseconds. `smsSentAt` is write-only system-wide — no consumer impact.
8. **Dispatched rows are terminal by design**: a sent-broadcast arriving after the timeout is dropped (receiver unregistered), so an amber row never upgrades to Success. Accepted; late-confirmation reconcile is a noted follow-up, and the runbook covers it (5.4).

---

## Phase 1 — Android core: write-ahead dispatch log

Files: [SmsReminderService.kt](android/app/src/main/java/com/magav/app/service/SmsReminderService.kt), [SmsLogDao.kt](android/app/src/main/java/com/magav/app/db/dao/SmsLogDao.kt), [SmsSchedulerWorker.kt](android/app/src/main/java/com/magav/app/scheduler/SmsSchedulerWorker.kt), [Constants.kt](android/app/src/main/java/com/magav/app/util/Constants.kt).

1. **Constant**: `Constants.kt:29-32` → add `const val DISPATCHED = "Dispatched"`.
2. **Dedup counts every row**: new DAO query `SELECT * FROM SmsLog WHERE ShiftId IN (:shiftIds) AND ReminderType = :reminderType` (NO status filter); switch `execute()` (:66) to it. (`getSuccessfulByShiftIdsAndReminderType` has exactly one caller — this path.)
3. **Write-ahead per shift** (restructure :110-181) — exact shape (round 2):
   - `var writeAheadId: Long? = null` declared immediately before the per-shift `try`.
   - (a) Build message (unchanged, :114-140).
   - (b) *Race-narrowing re-check*: **new dedicated DAO** `SELECT COUNT(*) FROM SmsLog WHERE ShiftId = :shiftId AND ReminderType = :reminderType` (status-filter-FREE — do **not** reuse the Phase 1.8 query, whose status filter serves a different purpose); skip if > 0.
   - (c) `writeAheadId = insert(SmsLogEntity(status = SmsStatuses.DISPATCHED, …))` (insert already returns `Long`, SmsLogDao.kt:45). Send **only** if the insert succeeded.
   - (d) UPDATE by id after the send: `Success` / `Fail`+error / leave `Dispatched` (unknown). New DAO: `@Query("UPDATE SmsLog SET Status = :status, Error = :error WHERE Id = :id")`, `id: Long` (PascalCase columns verified). Update failure = log-only (row stays Dispatched — safe direction). `smsSentAt` (:158) under confirmed-success only.
   - (e) Per-shift catch: (1) `if (e is kotlinx.coroutines.CancellationException) throw e`; (2) `smsFailed++`; (3) `writeAheadId?.let { update-to-Fail }`. A pre-insert exception thus leaves no row (no dispatch attempted ⇒ next run may retry — intended); the old nested Fail-INSERT (:169-180) is deleted.
4. **Cancellation rule (blanket, round 2)**: **every** catch added or touched by this plan re-throws `CancellationException` first — the per-shift catch, the `doWork` catch (:93-96), the update-failure catch, and the Phase 5.2 detector wrapper.
5. **Serialize scheduler executions**: process-global `Mutex` around `execute()`. Rationale (corrected r1): `checkAllConfigs` is unreachable dead code; the real races are (a) two configs at the same minute → parallel work items; (b) yesterday's still-retrying work item vs today's fresh one. Single process ⇒ companion-object mutex covers all paths. `smsMutex` stays (radio serialization).
6. **Retry cap**: at `doWork` entry, `if (runAttemptCount >= 2) return Result.failure()` + error notification. **Correct semantics (round 2): initial run + 1 executing retry** — the attempt with `runAttemptCount = 2` only fires the failure notification. Notification: NEW small helper on **`magav_error_channel`** (IMPORTANCE_HIGH, `MagavApplication.kt:64-71`) with a fresh id (100/102 taken) — `showSmsSummaryNotification` is not reusable (private, early-returns on `totalEligible==0`).
7. **Foreground send loop — MANDATORY**: `setForeground(...)` at `doWork` entry, before mutex acquisition, try/catch-wrapped → degrade to non-foreground on `ForegroundServiceStartNotAllowedException` (never fail the run); same guard on the existing `waitForCallToEnd` site (:186). **Notification id must be per-worker-unique (round 2): `103 + configId`** — two same-minute workers ARE concurrent by this plan's own model, and a shared id lets worker A's completion cancel worker B's foreground notification (WorkManager cancels by id), stripping B's foreground protection mid-batch. Id 102 stays only for the intra-worker `waitForCallToEnd` update. Manifest verified ready (FGS permissions + specialUse override); channel exists.
8. **`alreadySentSms` prompt fix**: `getByShiftIdAndReminderType` (SmsLogDao.kt:47; callers ShiftRoutes.kt:679/:806) → `Status IN ('Success','Dispatched')` — else a delivered-but-unconfirmed SameDay send suppresses the location-change re-notify offer. (LocationUpdate *sending* verified un-suppressible — no dedup, no LocationUpdate configs.)
9. **`doWork` entry order (pinned, round 2)**: `isDatabaseReady` check → retry-cap check (cheapest exit) → guarded `setForeground` → `waitForCallToEnd` (outside the mutex) → mutex-wrapped `execute()`.

---

## Phase 2 — Android: send-confirmation fidelity

Files: [AndroidSmsProvider.kt](android/app/src/main/java/com/magav/app/sms/AndroidSmsProvider.kt), [SmsProvider.kt](android/app/src/main/java/com/magav/app/sms/SmsProvider.kt).

1. **Additive tri-state**: keep `success: Boolean`; add `val outcome: Outcome = if (success) CONFIRMED else FAILED` (`CONFIRMED / FAILED / UNKNOWN`) — valid Kotlin (default may reference an earlier param); all verified consumers read only `.success`/`.error` and compile unchanged. (Line cites drift 2-11 lines vs r1 — refresh anchors while implementing.)
2. **Outcome mapping**: all parts `RESULT_OK` → CONFIRMED; any `RESULT_ERROR_*` → FAILED; timeout → UNKNOWN (`success=false` preserved). **Exceptions**: before `sendTextMessage`/`sendMultipartTextMessage` → FAILED (nothing reached the radio); after dispatch → UNKNOWN. Structure so the send call is last in its guarded block.
3. **Track ALL multipart parts**: parts already draw unique requestCodes from the companion `AtomicInteger` (:109-116) but are untracked — give every part a tracked action + receiver counting completions; replace the single `resumed` flag; unregister everything on completion AND cancellation.
4. **Timeout 15s → 60s** — a single **named constant** (deliberately: the forced-UNKNOWN certification test (h) temporarily shrinks it).

---

## Phase 3 — Manual-send handling (Ktor + React — ships in the APK)

1. **Route outcome mapping** ([ShiftRoutes.kt:489-515](android/app/src/main/java/com/magav/app/api/routes/ShiftRoutes.kt#L489)): CONFIRMED → 200 "הודעת SMS נשלחה בהצלחה" (Success row, `smsSentAt`); UNKNOWN → **200** "ההודעה שוגרה — טרם התקבל אישור שליחה" (Dispatched row, no `smsSentAt`); FAILED → 500 + error (Fail row).
2. **React plumbing (exact, round 2)**: the note must travel as the `ApiResponse` **data** payload (BaseApiClient returns only `result.data` and throws on undefined data) — keep both 200 responses as `ApiResponse.ok(<Hebrew string>)`, retype `sendShiftSms` to `Promise<string>` (`this.post<string>`), toast the returned string in `handleSendSms`; the second caller (ShiftsManagementPage.tsx:369) ignores the return — no change.
3. **Ktor CIO idle-timeout fix (round-2 major)**: `KtorServer.kt:27` runs CIO with defaults — `connectionIdleTimeoutSeconds` = 45s, but an UNKNOWN manual send now holds the response ~60s (up to ~2 min behind one in-flight scheduler send on the fair per-message `smsMutex`). Without this fix the coordinator gets a network-error red toast for a delivered message — the amplifier again, via transport. Set `connectionIdleTimeoutSeconds = 180` in the `embeddedServer(CIO, …)` config. Test (h) gates this. Note the new worst-case manual-send latency (~2 min) in the runbook; the existing per-row spinner suffices.
4. **Manual route write-ahead (round 2)**: apply the same INSERT-Dispatched-before-send / UPDATE-after pattern to this route (reuses Phase 1's DAO methods). Closes the manual-path unlogged-dispatch duplicate hole and shrinks the Phase 0.7 race to milliseconds.
5. **Consistency (adopted)**: the cancel-shift (:281-289) and send-location-update (:888-896) inserts map UNKNOWN → `DISPATCHED` instead of `FAIL` (2 lines each) — else a delivered cancellation SMS still shows a red badge. Cancel/cancel-group/delete-group/admin counters treat UNKNOWN as sent.

---

## Phase 4 — Status surfacing + parity

1. **Summary buckets**: `SmsLogDao.getSummary` (:29-31) → `SentSuccess` counts `Status IN ('Success','Dispatched')` (fold; zero client plumbing — the page consumes count fields).
2. **Log page three-way branch**: [SmsLogsPage.tsx:98-101](web/client/src/pages/SmsLogsPage.tsx#L98) — add: `Dispatched` → amber badge (`bg-amber-100 text-amber-800 border-amber-300`), label **"שוגר (ללא אישור מסירה)"**. Verified the only status→label/color logic in the client.
3. **Constants parity**: exactly two edits — `MagavConstants.cs:39-43` + the Phase 1.1 Kotlin constant. Lint script needs zero changes; no React SmsStatuses mirror exists (don't add dead code). Gate: `node tools/parity-lint.mjs` exit 0.
4. **Doc checklist (round 2)**: same commit as the code — root `CLAUDE.md` (two-tier-dedup bullet → count-every-row + Dispatched; SmsStatuses triple; ReminderTypes count 5→6), `android/CLAUDE.md` ("15s timeout" → 60s + tri-state; SmsStatuses line), `tools/parity.md` ("In sync today" line).

---

## Phase 5 — Device & ops hardening

1. **Battery-optimization prompt**: manifest already declares the permission (:14). In `requestPermissions()`: `if (!pm.isIgnoringBatteryOptimizations(packageName)) startActivity(Intent(ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))`. **Sequencing (round 2)**: fire it only when `needed.isEmpty()` (upgrade path) or from the permission-launcher callback — on a fresh install, launching an activity over the pending runtime-permission dialog can cancel it on some OEMs (risking SEND_SMS denied). System dialog is OS-localized; no custom dialog.
2. **Duplicate-send detector (corrected, round-2 major)**: end of each scheduler run, **bounded to the current run** and **blind to remediation noise**:
   `SELECT ShiftId, ReminderType, COUNT(*) FROM SmsLog WHERE ReminderType IN ('SameDay','Advance','WeekdayAdvance','AdminAdvance') AND SentAt >= :runStartIso AND Status != 'Fail' GROUP BY ShiftId, ReminderType HAVING COUNT(*) > 1`
   (`:runStartIso` = doWork start minus 1 min). The unbounded r2 draft would have alerted **forever on the incident's own historical duplicate rows** (which survive the upgrade) and on every legitimate Fail→manual-resend remediation. Wrap the whole detector in its own log-only try/catch (rethrow CancellationException) — a post-batch exception must not map to `Result.retry()` and burn a capped attempt. Alert via the Phase 1.6 error-channel helper.
3. ~~Settings explainer fix~~ — dropped (r1: text already correct — Thursday covers Fri/Sat).
4. **Runbook (no code)**: battery exemption stays on; **never resend from the Messages app**; amber "שוגר (ללא אישור מסירה)" = most likely delivered — verify in the Messages conversation WITHOUT resending; red "נכשל" = definitive failure → resend IN-APP via the per-shift send; manual sends can take up to ~2 min during a scheduled batch — wait for the spinner.

---

## Phase 6 — Verification, rollout & rollback

**Build gates:** `node tools/parity-lint.mjs` exit 0 · `tsc --noEmit` clean · `dotnet build` 0 errors · `gradlew assembleDebug` success · `git diff android/.../db/entity/` empty · `@Database` still 11.

**On-device protocol (populated DEV device first — the coordinator phone gets the APK only after ALL rows pass):**

| # | Scenario | Expected |
|---|----------|----------|
| a | Normal send | 1 SMS, one `Success` row |
| b | Airplane mode during scheduled run | prompt `RESULT_ERROR` → **Fail** rows; zero re-send next run |
| c | `adb shell am force-stop` mid-batch, then **reopen the app** (WorkManager resumes on next launch) | no unlogged dispatch; next run sends only never-dispatched shifts |
| d | Edit config time to later today + add a shift in between | second run sends only the new shift |
| e | Long Hebrew multipart message | all parts tracked, one `Success` row, one delivered message |
| f | Two configs at the same HH:mm | mutex serializes (log timestamps); **both** foreground notifications (distinct ids 103+configId) show and clear correctly; no duplicates |
| g | Manual send in airplane mode | **FAILED path**: HTTP 500 + red toast, `Fail` row (corrected — airplane mode yields a prompt error, not a timeout) |
| h | **Forced-UNKNOWN** (test build: shrink the Phase 2.4 timeout constant to ~1ms), scheduled + manual | rows stay `Dispatched`; next run re-sends **nothing**; amber badge; manual returns **200 + note** (not a network error — gates the CIO fix); `alreadySentSms` still true |
| i | Doze: `adb shell dumpsys deviceidle whitelist` lists com.magav.app, then `cmd deviceidle force-idle` before the config time | alarm fires ≈ on schedule; FGS notification visible during the batch; batch completes |
| j | Retry cap: force a pre-send throw twice (temporary) | 3rd attempt → `Result.failure()` + error-channel notification, no endless retry |
| k | Foreground degrade: app background-restricted (API 31+) | run proceeds non-foreground; no crash, no spurious retry |

**Rollout (ordered):**
1. Build on **this machine** with the existing debug keystore — `DeviceAllowlist` is keystore-scoped and fail-CLOSED (CLAUDE.md [5124870]); another machine's build locks the coordinator phone out.
2. **Archive the current v82 APK** to a named path first (`build-apk.bat` overwrites `app-debug.apk`) — it is the rollback artifact.
3. Full protocol a–k passes on the dev device.
4. **Backup the coordinator phone's DB**: `adb exec-out run-as com.magav.app cat databases/<db-file> > backup-YYYYMMDD.db` (encrypted SQLCipher blob; passphrase stays on-device — valid restore artifact). `allowBackup=false` means there is no other backup path.
5. Bump versionCode **83** / versionName **1.5.0** (managed region) → `build-apk.bat` → report the full APK path.
6. `adb install -r` on the coordinator phone → **OPEN the app** (the battery prompt fires from `onCreate`, not on install) → accept the battery dialog → verify `dumpsys deviceidle whitelist` lists the app → verify app notifications are enabled (Settings › Apps › Notifications — API 33+ denial would silently mute the error/detector alerts).
7. **Monitor the next 3 scheduled runs — concrete health criteria**: (1) SmsLogsPage: exactly ONE row per (shift, type); green or occasionally amber; red = definitive failure → in-app manual resend only. (2) SmsLogSummaryPage: `SentSuccess + SentFail + NotSent = TotalVolunteers` for every group. (3) Zero detector notifications. (4) Coordinator confirms volunteers received each reminder exactly once. Any detector alert or any (shift,type) with 2+ non-Fail rows ⇒ investigate before the next run.

**Rollback (round-2 addition — prefer roll-forward):**
- Rollback = `adb install -r -d <archived-v82.apk>` (`-d` permits the versionCode downgrade; works on debug builds). **NEVER uninstall/reinstall** — `allowBackup=false` makes the SQLCipher DB unrecoverable; uninstalling also wipes the entire dedup history (next run re-sends everything in-window).
- Semantics under v82 (schema-safe both directions — TEXT column, `@Database` 11 unchanged): v82's Success-only dedup treats `Dispatched` rows as never-sent → **bounded duplicate re-exposure** for shifts still inside an active window, and the old binary UI shows them as red "נכשל". If rollback is unavoidable on a day with sent reminders: disable the scheduler configs in the settings UI first, or accept the one-time re-sends.

**Out of scope:** Room migrations; UNIQUE partial index on SmsLog; restoring the `existsForConfigAndDate` hard gate (superseded); deleting dead `checkAllConfigs` (separate cleanup); RCS/Messages-app behavior; log-page resend button (follow-up); late-confirmation upgrade of terminal Dispatched rows (follow-up); optional AppSettings kill-switch for write-ahead (skip — failure mode already visible via the existing failure-summary notification + Failed run-log); all .NET behavioral work (Appendix).

---

## Appendix B — simplify-pass record (2026-08-16, post-implementation)

**Applied (behavior-preserving, gate-verified):** `Outcome.logStatus` + `Outcome.countsAsSent` extensions beside the enum (the 3-status contract now has ONE definition; 7 inline copies collapsed); dedup query → `SELECT DISTINCT ShiftId` (no full-entity hydration); point re-check → `SELECT EXISTS`; unified resume-once receiver body in `AndroidSmsProvider` (one unregister site); dead `putExtra("part")` dropped; `runStart` captured after the call-wait (tight detector window); `SUMMARY_NOTIFICATION_ID` constant; React `warning` Badge variant (theme-token, replaces raw amber) + admin page now surfaces the server send-note (`sendAdminShiftSms: Promise<string>`); `requestPermissions()` → `ensureOsCapabilities()`.

**Skipped deliberately (follow-ups — do NOT "modernize" casually):**
1. Invert `SmsResult`: constructor takes `outcome`, `success` derived — the most valuable follow-up; deferred pre-ship because it redefines the type's source of truth on the send path.
2. The 7 `if (e is CancellationException) throw e` guards stay EXACTLY as written — `runCatching` would swallow cancellation (a bug), `ensureActive()` is not semantics-preserving. Recorded so no cleanup pass "improves" them.
3. `SmsLogEntity.Status` Kotlin default `SUCCESS` — dropping it would force explicit status at every construction site, but the SQL half is a Room migration (ADR-004 territory). Untouched.
4. Detector's `ReminderType IN (…)` SQL literals → bind from a `ReminderTypes` set (adds a param to a reviewed safety query).
5. Notification channel-id/id literals across 3 files → a small registry object (2 files outside this diff).
6. `SettingsRoutes` test-SMS still binary success/fail — a diagnostic reporting strictly may be intended; confirm before changing.
7. Battery/exact-alarm `startActivity` stacking asymmetry in `MainActivity.ensureOsCapabilities` (pre-existing for exact-alarm); scheduler pre-loop snapshot + point-check duality (snapshot kept: cheap after the DISTINCT change, and it short-circuits re-runs); `writeAheadId` rename; shared `insertWriteAhead` DAO helper.

## Appendix — archived .NET findings (future web work only)

(1) Eligibility SQL `SmsReminderService.cs:75-81`: dropping `AND sl.Status = @3` **requires renumbering `@4`→`@3` at line 70** — positional args; a miss silently kills ALL web sends (swallowed by the tick catch). (2) Write-ahead: NPoco writes the id back onto the poco (`smsLog.Id`); update via the `ExecuteQueryAsync` UPDATE precedent (:148-150) or `Repository.UpdateAsync(entity)`; **avoid** `UpdateAsync(item, onlyFields)` (DbHelper.cs:524 — untranslatable reflection in its WHERE). (3) `ISmsProvider.SmsResult` is bi-state; `InforUMobileSmsProvider` collapses timeout/network/HTTP/parse errors AND definitive gateway rejections (:109-119) into `Success=false` — tri-state needs an additive field set only in the parsed-rejection branch. (4) `/api/sms-log/summary` (Program.cs:2262-2272) has the same closed-set bucket bug. (5) The .NET manual endpoint (Program.cs:1173) has the same templateId→SameDay/Advance mapping (change C applies). (6) No .NET double-tick (single sequential BackgroundService loop ≥60s apart); replay risk = restart-in-the-minute only. ISS-006 run-log semantics unchanged. `MagavConstants.ReminderTypes` has SIX values — CLAUDE.md's "5" is stale (fixed by Phase 4.4).
