# Weekday-Only Advance SMS Reminder (`WeekdayAdvance`) — Implementation Plan

**Status:** Final, validated, ready to implement. No code written yet.
**Companion:** see `weekday-advance-reminder-PROMPT.md` for the original requirements.

This spec is the single source of truth. Every file:line anchor below was verified against the current tree. Five validation passes (anchor verification → correctness → regression safety → Samsung reliability → UX) are folded in. **All `🛡️ GUARD` items are mandatory** — they are the rules that keep existing SameDay/Advance reminders byte-identical and prevent data loss.

---

## 1. Goal

Add a NEW reminder type that texts a volunteer N days before their shift (admin picks N, e.g. 5/6/7), **but never dispatches on a Friday, Saturday, holiday, or holiday-eve**. When the natural send day lands on one of those, the SMS is pulled **earlier** to the previous working day. Reuse all existing reminder logic (eligibility, dedup, templates, logging) on **both** platforms (.NET web + Android).

**🔒 Non-negotiable:** installing/deploying on top of an existing install preserves ALL data (volunteers, shifts, `SmsLog`, `SchedulerRunLog`, existing configs, templates, settings) on both platforms. Any data loss is a release blocker.

---

## 2. Locked decisions (with rationale)

- **D1 — Send-day window.** On each tick, only when `EffectiveDayGroup(today) == SunThu` (a working day), dispatch `WeekdayAdvance` for shifts in the half-open window `[today+N, nextWorkingDay(today)+N)`. Proven exactly-once (windows tile the date axis under any holiday topology). Rejected: shift-date anchoring (would rewrite the core loop, risk regressing SameDay/Advance).
- **D2 — One seed row** `(SunThu, WeekdayAdvance)`, `IsEnabled=0`, `Time="06:00"`, `MessageTemplateId=2`. Total configs 6→7. Fri/Sat WeekdayAdvance rows would never fire (the window already covers Fri/Sat-dated shifts) → omit.
- **D3 — N range 1–7, enforce `>=1`** for WeekdayAdvance (0 is SameDay's domain), type-aware on all four validation layers.
- **D4 — Template works like every other config.** Carries its own `MessageTemplateId`; admin picks any template. Default = the existing Advance template (id 2, already seeded → FK valid). **No `templateId→ReminderType` switch change** (those classify only the manual send-now path).
- **D5 — `SchedulerRunLog.TargetDate` = firing day (`today`), NO new column.** Zero schema change = lowest data-loss risk. Surface the pull-back via structured logs, not a DB column.
- **D6 — Optional 3rd `ReminderSection`** on the SunThu card only, reusing the component unchanged (same `IsEnabled` Switch, `[1..7]` Select, time, template dropdown).

---

## 3. Corrections discovered during validation (read before implementing)

These are NOT in the original prompt. They are load-bearing.

- **🆕 A — Per-shift message date.** `BuildMessage`/`buildMessage` fill `{תאריך}`/`{יום}` from the run-level date. Correct today only because the window is single-day. A multi-day window prints the WRONG shift date in every non-anchor SMS. **Fix:** derive date/day from each shift's own `ShiftDate`. **This is byte-identical for SameDay/Advance** (see §7 — `targetDate` already equals the shift date for them), so do **NOT** add a type-aware overload.
- **🆕 B — Split the single date param.** `ExecuteAsync`/`execute` use ONE date for both the query range AND the RunLog key. The window forces these apart. **Fix:** pass `(windowStart, windowEnd, runLogTargetDate)`.
- **🛠️ Seed placement (.NET).** The `Migrate*` calls run **inside the `else` (existing-DB) branch** of `DbInitializer` (`DbInitializer.cs:260-267`), NOT every startup. A seed placed there would skip fresh installs. **Fix:** add `MigrateSchedulerConfigAsync` as an **unconditional call after the `if/else` closes** (~line 268).
- **✏️ Android DAO.** `SchedulerConfigDao` has **no** `insertOrIgnore` (only `insert`/`update`) — add one `@Insert(onConflict = OnConflictStrategy.IGNORE)` (DAO method = not a schema change, no Room version bump).

---

## 4. Date helpers (single source of truth per platform)

### 4.1 Generalize `EffectiveDayGroup` to a pure per-date function
Current helpers (`SmsSchedulerService.cs:128-145` sole caller line 76; Android `SmsSchedulerWorker.kt:218-226`) reason about today/tomorrow. Generalize, preserving the exact priority/short-circuit order:

```
EffectiveDayGroup(date):
  if date.DayOfWeek == Saturday        -> Sat
  if IsHoliday(date)                   -> Sat        // the holiday itself
  if date.DayOfWeek == Friday          -> Fri
  if IsHoliday(date + 1 day)           -> Fri        // holiday-eve
  else                                 -> SunThu
IsWorkingDay(date) = EffectiveDayGroup(date) == SunThu
nextWorkingDay(d)  = smallest x > d with IsWorkingDay(x)   // bounded walk
```

> 🛡️ **GUARD (regression):** the existing tick gate's try/catch fallback to a plain weekday group must stay **in the caller** (`SmsSchedulerService.cs:~74-82`); the generalized helper must **propagate** exceptions, not swallow them. Use `date.AddDays(1).ToString("yyyy-MM-dd")` matching the current line-140 pattern; caller passes `now.Date`.

> 🛡️ **GUARD:** `nextWorkingDay` gets its **own** try/catch (fall back to plain weekday on DB error) and a **bounded loop** (cap ~14 iterations) so it cannot crash or loop forever past the holiday-data horizon.

### 4.2 Worked date math (N = 5)

| Firing day `today` | `nextWorkingDay` | Window `[today+5, nWD+5)` (shift dates) | Covers natural-send-day |
|---|---|---|---|
| **Mon** (mid-week) | Tue | `{Sat}` (single day) | Mon — unchanged |
| **Thu** (pre-weekend) | Sun | `{Tue, Wed, Thu}` | Thu + Fri-send pulled + Sat-send pulled (~3× batch) |
| Fri-send shift (dated Wed) | — | ∈ Thu window | Fri (non-working) → **Thu** ✓ |
| Sat-send shift (dated Thu) | — | ∈ Thu window | Sat (non-working) → **Thu** ✓ |
| **Holiday-eve** (Wed=eve, Thu=חג) → last working **Tue** | Sun(next) | Tue..Sat collapse onto **Tue** | eve+חג chained over ✓ |
| **2-day block** (Mon–Tue=חג, Sun=eve) → prev **Thu** | Wed | 6-day span onto **Thu**; Wed resumes | ✓ |

**No catch-up:** a missed working-day run is not re-covered (windows are disjoint by design). Matches existing reminders — documented, not a bug. See §12.

---

## 5. Data & seed changes

### 5.1 New constant (byte-identical)
- **.NET** `Magav.Common/MagavConstants.cs` (after line 14): `public const string WeekdayAdvance = "WeekdayAdvance";`
- **Android** `util/Constants.kt` (in `ReminderTypes`): `const val WEEKDAY_ADVANCE = "WeekdayAdvance"`

### 5.2 Idempotent existing-DB seed (must reach upgraded installs)
- **.NET** — add `MigrateSchedulerConfigAsync(connection)`: a single parameterized `INSERT OR IGNORE INTO SchedulerConfig (DayGroup, ReminderType, Time, DaysBeforeShift, IsEnabled, MessageTemplateId) VALUES ('SunThu','WeekdayAdvance','06:00',5,0,2)`. **Call it unconditionally after the `if/else` block (~`DbInitializer.cs:268`)** so it runs on fresh AND existing DBs. Leave `SeedSchedulerConfigAsync` (6 rows, fresh-only) unchanged.
- **Android** — add `insertOrIgnore` to `SchedulerConfigDao`; add `migrateSchedulerConfigs()` to `DatabaseInitializer` called **inside `initialize()` after `seedSchedulerConfigs()`** (mirrors `seedJewishHolidays`, which is already idempotent every startup). Template id 2 is seeded earlier in `initialize()` (line 17) and there is **no Room `@ForeignKey`** on `MessageTemplateId`, so the insert can't throw an FK error.

> 🛡️ **GUARD (data loss):** the seed is `INSERT OR IGNORE` keyed on `UNIQUE(DayGroup,ReminderType)` — it **never UPDATEs or DELETEs**, so admin edits and all existing rows survive. Ship `IsEnabled=0`.

### 5.3 No Room schema migration
New value + new row + new DAO method are all data/DAO-level. `@Database(version=8)` stays. **Bump `versionCode 60→61`, `versionName 1.4.11→1.4.12`** (`build.gradle.kts:16-17`) for WebView cache-clear. Keep `MagavApplication.initializeDatabase()` without `fallbackToDestructiveMigration` and its narrow catch.

### 5.4 Dynamic count validation (replace the "exactly 6" magic number)
Replace with: accept the payload iff the submitted config id-set **equals** the existing config id-set (reject unknown ids AND reject missing ids). Do **NOT** hardcode `!= 7`.
- **.NET** `Program.cs:1909-1910` (the loop already 404s unknown ids and pairs by id, so order-safe — just replace the count check + update the Hebrew error).
- **Android** `SchedulerRoutes.kt:84-89` (pairs by `getById(update.id)` — order-safe).

### 5.5 Holiday horizon
`JewishHolidays` is seeded **2025–2030** on both platforms. Past 2030, `IsWorkingDay` treats holidays as working days. **Extend both seed lists to ~2035** (byte-identical) as part of this work, or flag an ops refresh.

---

## 6. Scheduler refactor (🆕 B)

Refactor the executor to separate the query range from the RunLog key:
- **.NET** `SmsReminderService.ExecuteAsync(config, targetDate, ct)` → `ExecuteAsync(config, DateTime windowStart, DateTime windowEnd, DateTime runLogTargetDate, ct)`.
- **Orchestrator** (`SmsSchedulerService`, after the gate at `:94-103`) computes via a thin branch:
  ```
  if config.ReminderType == WeekdayAdvance:
      windowStart = today + N;  windowEnd = nextWorkingDay(today) + N;  runLogDate = today
  else:  // SameDay / Advance — byte-identical to today
      windowStart = today + N;  windowEnd = windowStart + 1day;        runLogDate = windowStart
  ```
- **Android** mirror: `SmsSchedulerWorker` computes the window; build bounds from Israel-local `LocalDate`s via `toIsoInstant()` per endpoint (NOT `toIsoRange`, which forces end=start+1). `getByDateRange(from,to)` already accepts an arbitrary range and filters `IsCanceled=0`.

> 🛡️ **GUARD (regression):** for SameDay/Advance the orchestrator MUST pass `windowStart` as **midnight** (`now.Date.AddDays(N)`) and `runLogTargetDate = windowStart`, so the `'o'` query bounds and `yyyy-MM-dd` RunLog string are byte-identical to today.

> 🛡️ **GUARD:** .NET has **TWO** RunLog write sites — early failed-template (`SmsReminderService.cs:~79`) AND success (`~:166`). **Both** must switch to `runLogTargetDate`. Android has one (`~:160`).

> 🛡️ **GUARD:** `SendLocationUpdateAsync` (`SmsReminderService.cs:~235-291`) is a **separate** path — do **NOT** modify it.

### 6.1 Per-shift message date (🆕 A)
In `BuildMessage` (.NET `:187-203`, currently `targetDate` at `:193`) and Android `buildMessage` (`:176-191`, `targetDate` at `:180`), derive `{תאריך}`/`{יום}` from the shift's own date. **WeekdayAdvance must NOT append location** — keep the SameDay-only guard (`SmsReminderService.cs:96-97` / `.kt:92-98`).

> 🛡️ **GUARD:** use the already-deserialized `shift.ShiftDate` (DTO `DateTime` / `ShiftEntity.shiftDate`) — do **NOT** re-parse the stored string with a new timezone assumption. Single shared change, no type-aware overload (see §7 for why it's byte-identical for SameDay/Advance).

---

## 7. Why 🆕 A does NOT break SameDay/Advance (ruling on an agent disagreement)

On both platforms `targetDate = today + DaysBeforeShift` (`SmsSchedulerService.cs:103`, `SmsSchedulerWorker.kt:73`), and the eligibility query matches shifts **on exactly that date**. So today **`targetDate` already equals the shift's own date** for SameDay (N=0) and Advance (N≥1) — the SMS already shows the shift date, not the send date. Deriving the message date from `shift.ShiftDate` therefore yields the **identical** string for them (the query guarantees `shift.ShiftDate ∈ [windowStart, windowEnd)` → same calendar day → same Hebrew day-of-week). The date-consistency is self-proving: the existing single-day query already depends on it and works in production.

---

## 8. File-by-file change list

### .NET (`web/server/`)
| File / anchor | Change |
|---|---|
| `Magav.Common/MagavConstants.cs:14` | + `WeekdayAdvance` constant |
| `Magav.Server/Services/Sms/SmsSchedulerService.cs:128-145` | Generalize `EffectiveDayGroupAsync(date)`; add `IsWorkingDayAsync`, `NextWorkingDayAsync` (bounded, own try/catch); update gate call (`:76`) |
| `…/SmsSchedulerService.cs:94-110` | Thin branch computing `windowStart/windowEnd/runLogDate` |
| `…/Sms/SmsReminderService.cs:24-58,79,166` | 🆕B signature; query uses range; **both** RunLog sites use `runLogTargetDate` |
| `…/SmsReminderService.cs:187-203` | 🆕A: date/day from `shift.ShiftDate`. Keep location guard `:96-97` |
| `Magav.Server/Services/DbInitializer.cs:268` | + `MigrateSchedulerConfigAsync` (unconditional, INSERT OR IGNORE); extend holidays to ~2035 |
| `Magav.Api/Program.cs:1909-1910` | Dynamic count/id-set validation |
| `…/Program.cs:1929-1936` | + WeekdayAdvance branch `DaysBeforeShift >= 1` |
| `…/Program.cs:1129`, `:808/891/968`, `SendLocationUpdateAsync` | **Untouched** (verified orthogonal) |

### Android (`android/app/src/main/java/com/magav/app/`)
| File / anchor | Change |
|---|---|
| `util/Constants.kt` | + `WEEKDAY_ADVANCE` |
| `db/dao/SchedulerConfigDao.kt` | + `insertOrIgnore` (`@Insert(onConflict=IGNORE)`) — not a schema change |
| `db/DatabaseInitializer.kt` | + `migrateSchedulerConfigs()` inside `initialize()` after `seedSchedulerConfigs()`; extend holidays to ~2035 |
| `scheduler/SmsSchedulerWorker.kt:218-226` | Generalize `effectiveDayGroup(date)`; add `isWorkingDay`, `nextWorkingDay` (bounded, own try/catch); update gate (`:65-76`) |
| `…/SmsSchedulerWorker.kt:73,114-116` | Thin branch → window + runLogDate |
| `service/SmsReminderService.kt:25,38,160,176-191` | 🆕B range from Israel-local `toIsoInstant`; RunLog uses `runLogTargetDate`; 🆕A date from `shift.shiftDate`; keep location guard `:92-98` |
| `api/routes/SchedulerRoutes.kt:84-89` | Dynamic count/id-set validation |
| `…/SchedulerRoutes.kt:122-129` | + WeekdayAdvance branch `>= 1` |
| `api/routes/ShiftRoutes.kt:491`, `:478` | **Untouched** |
| `build.gradle.kts:16-17` | `versionCode 60→61`, `versionName 1.4.11→1.4.12` |
| `db/MagavDatabase.kt`, `MagavApplication.kt:109,135`, `scheduler/AlarmScheduler.kt` | **No change** (no schema migration; worker gates at runtime; `SchedulerRoutes` PUT already calls `scheduleAllAlarms()` at `:147` so enabling fires immediately; new config id=7 → requestCodes 71-77, no collision) |

### Frontend (`web/client/src/`)
| File / anchor | Change |
|---|---|
| `pages/SchedulerSettingsPage.tsx:113-117` | Grouping ALSO captures the WeekdayAdvance config per group (only SunThu has it); **do NOT change the `g.sameDay && g.advance` filter predicate** (would drop Fri/Sat cards) |
| `…/SchedulerSettingsPage.tsx:58-76` | Additive WeekdayAdvance validation branch (`>=1`); `handleSave` already maps the full `configs` array — keep it |
| `pages/components/DayGroupConfigCard.tsx:136-151` | Add optional 3rd `ReminderSection` rendered **only when** a WeekdayAdvance config exists (`weekdayAdvanceConfig && <ReminderSection.../>`); + `helperText` prop (see §10) |
| `services/schedulerService.ts:37-42` | No change (`getConfig` returns all rows; PUT sends all) |
| `pages/SchedulerRunLogPage.tsx:18-21` | + `WeekdayAdvance` Hebrew label in `REMINDER_TYPE_LABELS` |

---

## 9. Dedup / `SchedulerRunLog`
- **SmsLog dedup** (`NOT EXISTS … ReminderType + Status=Success`): WeekdayAdvance is a new lane → no collision with the SunThu Advance config (a volunteer can legitimately get both — by design), no self-double-send.
- **`SchedulerRunLog UNIQUE(ConfigId, TargetDate, ReminderType)`**: `TargetDate = firing day` → one row per windowed run; blocks same-day re-runs. SmsLog dedup is the real backstop if two ticks race.

---

## 10. UI / UX changes
- Add the optional 3rd `ReminderSection` (label `תזכורת מוקדמת (ימי חול בלבד)`), reusing controls unchanged. RTL is already correct (Switch `dir="ltr"`, Selects `dir="rtl"`); the page is scrollable on mobile/WebView; touch targets are adequate.
- **Label disambiguation (required):** the SunThu card will show two near-identical "תזכורת מוקדמת" headings. Add an optional `helperText?: string` prop to `ReminderSection` (render as muted text, like the existing template preview) explaining the difference — regular advance can land on Fri/Sat; weekday-only pulls back to the previous working day. Also clarifies "why only on the Sun–Thu card."
- **Validation string (required):** the WeekdayAdvance error must NOT say "שבת". Use `'תזכורת מוקדמת (ימי חול בלבד) חייבת להיות לפחות יום אחד לפני'` (matches the existing pattern at `SchedulerSettingsPage.tsx:69,72`).
- **Pre-existing, out of scope:** toggling `IsEnabled` OFF does not disable the time/days/template inputs (only `isReadOnly` does) — applies to all 6 existing sections; leave it.

---

## 11. Manual verification checklist
**Android upgrade (zero-data-loss gate):** install new APK over a populated prior-version DB → (a) all existing data visible, no `שגיאה באתחול המערכת`; (b) the WeekdayAdvance row appears; (c) it is disabled.
**Web:** run server + client → saving still works after the dynamic count fix; the new section renders, is editable, persists across reload; enable it and verify it fires on the right day and is pulled back from Fri-send, Sat-send, a holiday, and a holiday-eve; 🆕A: in a Thursday window, Fri-/Sat-dated volunteers get **their own** shift date; volume: a multi-day Thursday window sends the full batch.
**Both:** enabling both Advance + WeekdayAdvance on SunThu yields two SMS by design; a missed run is not retroactively sent.

---

## 12. Rollout, known limitations & out of scope
**Rollout:** additive only (INSERT OR IGNORE / ALTER ADD COLUMN; never DROP/recreate/delete the DB); ship disabled; per-platform atomic deploy; bump Android version; reuse the existing send loop (Thursday ≈3× volume — confirm it completes within WorkManager/foreground limits, keep the foreground notification, note InforU rate limits); monitoring INFO logs per run (firing day, effective group, window range, eligible count, pull-back count) + post-deploy `SchedulerRunLog WHERE ReminderType='WeekdayAdvance'` check; rollback = toggle `IsEnabled` OFF.

**Samsung / runtime reliability (operational, not a plan defect):** WeekdayAdvance reuses the existing alarm→worker→SMS path, so it fires exactly as reliably as current reminders. Existing mitigations: `setExactAndAllowWhileIdle(RTC_WAKEUP)` (survives Doze), exact-alarm permission prompt, `BootReceiver` reschedule, server-independent send path. Unmitigated (affects all reminders): no runtime battery-optimization prompt (user must whitelist Magav from "Sleeping apps"), no missed-run catch-up, worker only foreground when a call is active. **Net-new exposure:** the no-catch-up window means a missed Thursday run loses the whole pre-weekend batch. Optional hardening (defer unless required): a runtime battery-opt prompt + a daily catch-up worker scanning `SchedulerRunLog`.

**Out of scope:** changing SameDay/Advance behavior; `LocationUpdate`; the pre-existing `toIsoRange` UTC quirk (beyond not letting the new window regress); automated holiday-calendar sync; the IsEnabled-doesn't-disable-inputs UX gap.

---

## 13. Implementation order (suggested)
1. **Data-layer slice (no shared-path risk):** constants (both platforms) → idempotent seed (.NET unconditional call + Android DAO method/migrate) → dynamic count validation → version bump. Verify the upgrade/no-data-loss gate.
2. **Scheduler slice (honor §4/§6 guards):** generalize `EffectiveDayGroup` + `nextWorkingDay`; refactor `ExecuteAsync`/`execute`; 🆕A per-shift date; type-aware `>=1` validation.
3. **UI slice:** 3rd `ReminderSection` (conditional) + grouping + `helperText` + Hebrew error + run-log label.
4. **Rollout:** extend holiday seed; monitoring; manual verification on both platforms.
