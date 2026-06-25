# Planning Prompt — Weekday-Only Advance SMS Reminder (never Fri/Sat/holiday)

> **Produce a detailed, step-by-step implementation plan from this prompt. Do NOT write code yet.**
> All file:line anchors below were verified against the current codebase — treat them as ground truth and build on them rather than re-deriving.

## Goal

Add a NEW reminder type that texts a volunteer a configurable number of days before their
shift (e.g. 5/6/7 — admin's choice), **but never dispatches the SMS on a Friday, Saturday,
holiday-eve, or holiday** (Shabbat/חג). When the natural send day lands on one of those days,
the reminder must still go out — pulled **earlier**, to the preceding working day (see
**Collision Policy**). It must reuse all existing reminder logic (eligibility, dedup, template
placeholders, logging) on **both** platforms (.NET web + Android).

**🔒 Non-negotiable acceptance criterion — zero data loss on upgrade.** Installing/deploying this
version on top of an EXISTING install MUST preserve ALL current data — volunteers, shifts,
`SmsLog` history, `SchedulerRunLog`, existing scheduler configs, message templates, app settings —
on **both** platforms. The upgrade adds data (a new config row); it never resets or recreates the
database. **Any data loss is a release blocker, not a follow-up fix.** (Mechanics in the
🚨 Production rollout section.)

## Engineering principles (the plan MUST honor these throughout)

- **Find the simplest viable approach.** Prefer the smallest change that satisfies the
  requirement. (The send-day *window* over a full re-architecture is exactly this spirit —
  keep choosing the lighter option whenever correctness is equal.)
- **Reuse, don't duplicate.** Extend the existing reminder pipeline — eligibility query, dedup,
  template/placeholder builder, SMS provider call, `SchedulerRunLog`, and the `ReminderSection`
  UI component — by adding the new type as a thin branch/parameter, **not** a parallel copy.
  No copy-pasted send/build/log blocks.
- **Single source of truth per platform.** Put the new date logic (`IsWorkingDay`,
  `nextWorkingDay`, the window calc) in **one** helper on each platform and call it from the
  relevant sites — do not inline the same math in multiple places. Keep the .NET and Android
  versions structurally mirrored so they stay in sync.
- **Efficiency.** Keep queries set-based and parameterized; the widened window must remain a
  **single range query**, not a per-day loop of N queries. Avoid extra round-trips, N+1 access,
  and re-loading data already in hand.
- **Code quality.** Match each platform's existing style/naming/idioms; centralize the
  type-aware validation per layer; no dead config rows; **no magic numbers** — replace the
  `!= 6` count checks with the dynamic/derived check rather than hardcoding `!= 7`.
- **Justify new surface.** For every new file, class, or function the plan proposes, state why
  existing code cannot be reused first.

## Locked decisions (from the requester — implement as stated)

1. **NEW, separate reminder type** — e.g. `ReminderTypes.WeekdayAdvance` (value `"WeekdayAdvance"`).
   Do not modify or repurpose the existing `Advance` reminder. The two can coexist; the admin
   controls overlap via `IsEnabled`. Do not force mutual exclusion in code.
2. **Collision = send EARLIER**, to the previous working day (normal week → Thursday). Never
   later (Sunday) and never skip.
3. **Holidays count as non-working** — holiday-eve (already mapped to `Fri`) and holiday
   (already mapped to `Sat`) are skipped too, and the walk-back chains over them.

## Verified current state (ground truth — file:line)

- **Constants** — `Magav.Common/MagavConstants.cs:9-15` (.NET, e.g. `ReminderTypes.Advance =
  "Advance"`) mirrored in `android/.../util/Constants.kt:3-18` (Kotlin uses SCREAMING_SNAKE
  names: `ReminderTypes.SAME_DAY = "SameDay"`, `ADVANCE = "Advance"`, `LOCATION_UPDATE`,
  `MANUAL`; `DayGroups.SUN_THU/FRI/SAT`; `SmsStatuses.SUCCESS/FAIL`). **Values must stay byte-identical across platforms.**
- **Config model** — `SchedulerConfig.cs:7-18` and `SchedulerConfigEntity.kt:8-42`:
  `Id, DayGroup, ReminderType, Time (HH:mm string), DaysBeforeShift (int, validated 0–7),
  IsEnabled (int), MessageTemplateId (int), UpdatedAt, UpdatedBy`. **UNIQUE (DayGroup,
  ReminderType)** — `DbInitializer.cs:182` / `SchedulerConfigEntity.kt:11`.
- **Scheduling is SEND-DAY anchored** (verified both platforms):
  - .NET `SmsSchedulerService.cs`: fires when `config.Time == nowHHmm` **and** `config.DayGroup
    == GetEffectiveDayGroupAsync(today)` (lines 68–100); then `targetDate =
    now.Date.AddDays(config.DaysBeforeShift)` (line 103).
  - Android `SmsSchedulerWorker.kt`: same gating (lines 65–76, time check line 114);
    `targetDate = LocalDate.now(israelTz).plusDays(config.daysBeforeShift)` (line 73).
  - So **send day = today**, **shift day = today + N**, i.e. **send day = shiftDate − N**.
- **Eligibility query is SINGLE-DAY** — .NET `SmsReminderService.cs:26-27,47`
  (`ShiftDate >= targetDate AND < targetDate+1`); Android `SmsReminderService.kt:25` via
  `targetDate.toIsoRange()`. **The Android `ShiftDao.getByDateRange(from,to)` (`ShiftDao.kt:12`)
  already accepts an arbitrary range**, and the .NET query is already a `>= start AND < end`
  form — so widening to a multi-day window is a small change on both.
- **Holiday-aware day group** — `GetEffectiveDayGroupAsync` (`SmsSchedulerService.cs:128-145`):
  Saturday→`Sat`, today-is-holiday→`Sat`, Friday→`Fri`, **tomorrow-is-holiday→`Fri`**, else
  `SunThu`. ⚠️ It reasons about **today/tomorrow relative to a single `now`** — it is NOT a
  general "is date D a working day?" function (see Collision Policy).
- **Dedup** — eligibility uses `NOT EXISTS(SmsLog where ShiftId + ReminderType +
  Status='Success')` (`SmsReminderService.cs:52-58`); `SchedulerRunLog` has **UNIQUE(ConfigId,
  TargetDate, ReminderType)** (`DbInitializer.cs:203`). A new ReminderType gets its own dedup
  lane automatically.
- **Location text appended ONLY for SameDay** — `SmsReminderService.cs:96-97` /
  `SmsReminderService.kt:92-98`. WeekdayAdvance must NOT append location (location may change).
- **Templates** — `DbInitializer.cs:586-610` seeds **3**: 1=SameDay, 2=Advance, 3=Cancellation.
  Cancellation template (3) is used at `Program.cs:808,891,968`.
- **templateId → ReminderType switch (falls through to Manual)** — `Program.cs:1129`
  (`1=>SameDay, 2=>Advance, _=>Manual`) and Android `ShiftRoutes.kt:491` (same). Used by the
  manual-send path.
- **Update endpoint** — **PUT** `/api/scheduler/config`. .NET validates **exactly 6** records
  (`Program.cs:1909`, `configs.Count != 6`); Android validates **exactly 6**
  (`SchedulerRoutes.kt:84`, `updates.size != 6`, error `נדרשות בדיוק 6 הגדרות`). Per-type
  validation: SameDay⇒`DaysBeforeShift==0`, Advance⇒`>=1`, range 0–7
  (`Program.cs:1929-1936`; `SchedulerRoutes.kt:105,122,127`).
- **Seed = 6 rows** (SunThu/Fri/Sat × SameDay/Advance) — `DbInitializer.cs:612-640` /
  `DatabaseInitializer.kt:89-167`.
- **Frontend** — `SchedulerSettingsPage.tsx:113-117` groups configs into **3 day-group cards**;
  each `DayGroupConfigCard.tsx:136-151` renders **exactly 2** sections (SameDay
  `תזכורת ליום המשמרת`, Advance `תזכורת מוקדמת`). Days-before is a Select hardcoded `[1..7]`,
  shown only for Advance (`DayGroupConfigCard.tsx:67-89`). Client validation at
  `SchedulerSettingsPage.tsx:68-73`. Save: `schedulerService.ts:41-42` `put('/scheduler/config', configs)`.
- **Android Room** — `@Database(version = 8)` (`MagavDatabase.kt:41`), migrations `MIGRATION_3_4
  … MIGRATION_7_8` (lines 57–133), **two** `addMigrations(...)` sites in `MagavApplication.kt`
  (initial **:109**, recovery rebuild **:135** — BOTH must be updated). `build.gradle.kts:16-17`:
  `versionCode = 60`, `versionName = "1.4.11"`.
- **Android alarm model** — `AlarmScheduler.kt:18-48` cancels then schedules every enabled
  config for **all 7 weekdays** (requestCode `config.id*10 + dayOfWeek`); the **worker decides
  at runtime** whether `config.dayGroup == effectiveGroup`. ⇒ **No AlarmScheduler change is
  needed** for a new type; a `SunThu`-only config simply never matches Fri/Sat at runtime.

## 🚨 Load-bearing "exactly 6 configs" assumption (MUST fix)

Adding even one WeekdayAdvance row makes the config set ≠ 6, which **breaks saving** until all
three are updated:
1. .NET `Program.cs:1909` `configs.Count != 6`.
2. Android `SchedulerRoutes.kt:84` `updates.size != 6`.
3. Frontend grouping/render assumes 3 cards × 2 sections; a new config that isn't loaded,
   rendered, **and re-submitted** is silently dropped from the PUT payload (data-integrity bug).

**Recommended fix:** replace the magic-number checks with **dynamic validation** — accept the
submitted set iff it exactly matches the set of existing `(DayGroup, ReminderType)` rows (or
the known valid pair set). Then adding types never requires touching the count again.

## Collision Policy — "send earlier", implemented as a SEND-DAY window (recommended)

The locked rule "if the natural send day (shiftDate − N) is non-working, send on the previous
working day" is **mathematically equivalent** to this send-day-anchored formulation, which fits
the existing architecture with minimal change:

> On each working-day run (`today` where `effectiveDayGroup(today) == SunThu`), dispatch
> WeekdayAdvance for every shift whose **send day = shiftDate − N** maps back to `today` — i.e.
> query shifts with **`shiftDate ∈ [today + N, nextWorkingDay(today) + N)`** and send them now.

- On a normal Sun–Wed, `nextWorkingDay = today+1`, so the window is the single day `today+N`
  (unchanged behavior).
- On **Thursday**, `nextWorkingDay = Sunday`, so the window is `{Thu+N, Fri+N, Sat+N}` — the
  Fri/Sat-send shifts get pulled back to Thursday automatically.
- Holiday blocks widen the window further (the run on the last working day before the block
  covers the whole block). **Windows are disjoint and cover every day ⇒ each shift is sent
  exactly once; no double-send, no gaps.** The `SmsLog` dedup is a backstop.

**Why this over a full re-architecture:** the alternative — shift-date anchoring (iterate all
shifts, compute each adjusted send date, dispatch if `== today`) — would rewrite the core
scheduler loop and risk regressing SameDay/Advance. The window approach reuses the existing
loop, day-group gating, and range-capable queries. *(Document shift-date anchoring as the
rejected heavier alternative.)*

**Required helper (NEW — does not exist today):** `GetEffectiveDayGroup`
(`SmsSchedulerService.cs:128-145`) implicitly reasons about *today/tomorrow* and is not callable
for an arbitrary date. Cleanest move: **generalize that exact logic into `EffectiveDayGroup(date)`**
— Saturday→`Sat`; `IsHolidayAsync(date)`→`Sat`; Friday→`Fri`; `IsHolidayAsync(date+1)`→`Fri`
(holiday-eve); else `SunThu` — then `IsWorkingDay(date) = EffectiveDayGroup(date) == SunThu`. This
reuses the existing per-date `JewishHolidaysRepository.IsHolidayAsync` (`SmsSchedulerService.cs:134,141`)
and in one place excludes Fri, Sat, holidays, **and holiday-eves**. `nextWorkingDay(today)` =
smallest `d > today` with `IsWorkingDay(d)`. Mirror on **both** platforms (Android has the
equivalent holiday DAO). Plan must show worked date math for: a mid-week shift, a Fri-send, a
Sat-send, a **holiday-eve send**, and one behind a **multi-day holiday**.

**No catch-up:** consistent with existing reminders, a missed run is not retroactively sent.
State this explicitly so manual verification doesn't flag it as a bug.

## Remaining design decisions (state a choice + rationale)

1. **Scheduling approach** — *Recommended: send-day window (above).* Confirm and specify the
   exact query change on both platforms (`SmsReminderService` .NET single-day → range; Android
   pass a wider `from/to` to `getByDateRange`).
2. **Seed rows** — *Recommended: ONE row, `(SunThu, WeekdayAdvance)`* (total configs → **7**),
   seeded **`IsEnabled = 0` (disabled)** with a sensible default `Time` (e.g. `06:00`) and
   `MessageTemplateId = 2`. Disabled-by-default = opt-in: the admin reviews time/days/template
   and turns it on in the UI, so it can never mass-send on deploy day. Fri/Sat WeekdayAdvance
   rows would never fire (the window already covers Fri/Sat shifts) and only inflate counts —
   omit them. Honor UNIQUE(DayGroup, ReminderType). Seed in BOTH `DbInitializer.cs:612-640` and
   `DatabaseInitializer.kt:89-167`, **AND make the row reach existing deployments** (current
   seeding only runs on a fresh DB — see the 🚨 Production rollout section). Update the count
   checks (see the other 🚨 section).
3. **N range** — keep **1–7**, enforce `>=1` for WeekdayAdvance (0 is SameDay's domain). Make
   validation **type-aware** on all four layers (.NET PUT, Ktor route, client validate, client
   dropdown). The 5/6/7 in the goal is the admin's typical pick, not a new bound.
4. **Message template — works exactly like the other scheduler configs.** The WeekdayAdvance
   config carries its own `MessageTemplateId`, set by the admin through the same template
   dropdown used by SameDay/Advance (`DayGroupConfigCard` template Select). The admin can pick
   **any existing template** or **create a new one** on the message-templates page and select
   it — **nothing template-specific is hardcoded in code.** Seed the new config's default to an
   existing template (recommend the Advance template, **id 2**) so it works out of the box; the
   FK requires the default to reference a real template (so do NOT default to a not-yet-seeded
   id). **No `templateId→ReminderType` switch change is needed:** that switch (`Program.cs:1129`,
   `ShiftRoutes.kt:491`) only classifies the manual ad-hoc *send-now* path; the scheduler reads
   `config.ReminderType` directly, so template choice is fully decoupled from reminder type.
   (If a brand-new template is later sent via the manual path it correctly logs as `Manual` —
   that is a genuine manual send, not a regression.)
5. **Audit / `SchedulerRunLog`** — a windowed Thursday run covers multiple shift-dates under one
   run. Record `TargetDate` = the **firing day `today`**, so UNIQUE(ConfigId, TargetDate,
   ReminderType) still prevents re-running the same day. **Recommended: add NO column** — keep
   zero schema change (no Room migration ⇒ lowest data-loss risk) and surface the pull-back via
   structured server logs (see Monitoring in the rollout section). Add an `AdjustmentNote`-style
   column only if DB-level audit is a hard requirement, and then follow the full Room ritual.
6. **UI** — add an **optional third** `ReminderSection` to `DayGroupConfigCard` (Hebrew label,
   e.g. `תזכורת מוקדמת (ימי חול בלבד)`), rendered **only when** a WeekdayAdvance config exists for
   that day group (so only the SunThu card shows it). Update `SchedulerSettingsPage` grouping so
   the new config is loaded, rendered, validated, and **included in the PUT payload** (do not
   drop it — see 🚨 #3). Reuse the existing `ReminderSection` controls unchanged — the
   **enable/disable on-off toggle (the `IsEnabled` Switch)**, the `[1..7]` days-before Select, the
   time input, **and** the message-template dropdown — so the new reminder has the **exact same
   on/off toggle** as SameDay/Advance. This works with no new mechanism: the scheduler already
   honors `IsEnabled` (.NET `GetEnabledAsync` filters `IsEnabled==1`; the Android worker checks
   `isEnabled`), so toggling it OFF stops it on the very next run and ON resumes it. Confirm the
   toggle's state round-trips through the PUT payload like the others.

## Hard constraints (from CLAUDE.md — non-negotiable)

- **Both platforms in lockstep.** .NET: `MagavConstants.cs`, `SchedulerConfig.cs`,
  `SmsSchedulerService.cs`, `SmsReminderService.cs`, `DbInitializer.cs`, `Program.cs` (DTO +
  PUT endpoint + validation + templateId switch). Android: `Constants.kt`,
  `SchedulerConfigEntity.kt` (+DAO), `MagavDatabase.kt`, `MagavApplication.kt`,
  `DatabaseInitializer.kt`, `SmsSchedulerWorker.kt`, `SmsReminderService.kt`,
  `SchedulerRoutes.kt`, `RequestDtos.kt`, `ShiftRoutes.kt`. Frontend:
  `SchedulerSettingsPage.tsx`, `DayGroupConfigCard.tsx`, `schedulerService.ts`.
- 🚨 **Room schema discipline** (only if a column is added — e.g. AdjustmentNote, or a new field
  on SchedulerConfig): bump `@Database(version = 8 → 9)`, add idempotent `MIGRATION_8_9`
  (`ALTER TABLE … ADD COLUMN`, `CREATE INDEX IF NOT EXISTS`), register it in **BOTH**
  `addMigrations(...)` sites (`MagavApplication.kt:109` and `:135`), and make the migration
  schema-hash-match the entity. **A new ReminderType value alone needs NO schema migration**
  (it's data). ⚠️ **BUT the seed ROW must still reach existing installs** — Android's
  `DatabaseInitializer` seeds only when the table is empty (`DatabaseInitializer.kt:90-91`,
  `if (existing.isNotEmpty()) return`), so on an upgraded device the new row is otherwise NEVER
  inserted. Fix per the 🚨 Production-rollout section (preferred: idempotent insert-or-ignore per
  row on every startup → no version bump; alternative: a data-only `MIGRATION_8_9` that INSERTs
  the row → version bump + both sites). Always **bump `versionCode` (60→61)** in
  `build.gradle.kts` before any APK build.
- **.NET DB migration:** for any new column, follow the existing `DbInitializer` `PRAGMA
  table_info` + `ALTER TABLE ADD COLUMN` pattern (`DbInitializer.cs:369-388`).
- **Constants mirrored byte-for-byte;** seed defaults in both initializers. The
  `templateId→ReminderType` switches (`Program.cs:1129`, `ShiftRoutes.kt:491`) need **no change**
  — they only classify the manual *send-now* path; the scheduler uses `config.ReminderType`.
- **Validation mirrored** across all four layers; make it type-aware for WeekdayAdvance.
- **Security:** parameterized queries only; the PUT endpoint keeps `.RequireAuthorization()` /
  `authenticate("auth-bearer")`; generic Hebrew error messages, no exception leakage.
- **RTL/Hebrew UI:** new control needs Hebrew labels + RTL-correct layout (follow existing
  `dir`/`switch.tsx`/`dialog.tsx` conventions).
- **Timezone:** all window/day math in Israel time (Asia/Jerusalem). Compute `windowStart`,
  `windowEnd`, `IsWorkingDay`, and `nextWorkingDay` from **Israel-local dates**, converting to the
  stored `ShiftDate` string format only at the query boundary. The existing Android `toIsoRange()`
  builds **UTC** day boundaries (`DateExtensions.kt:10-11`) — **do NOT reuse it for the
  WeekdayAdvance window** (it can shift the range by a day across the day boundary / DST). Build
  the range from Israel-local dates to match how `ShiftDate` is stored.
- **No automated tests** exist — include a **manual verification** section.

## 🚨 Production rollout & data propagation (MUST address — verified gaps on a live system)

**🔒 Zero data loss on upgrade (release blocker) — how to guarantee it:**
- **Android:** the recommended design adds **no Room schema column**, so there is **no schema-hash
  change and no migration** — nothing that could trigger a destructive rebuild. **Keep
  `MagavApplication.initializeDatabase()` WITHOUT `fallbackToDestructiveMigration()` and keep its
  narrow catch (SQLCipher key/corruption only) — do NOT broaden it.** If a column ever becomes
  unavoidable, the full Room ritual (version bump + `MIGRATION_8_9` in BOTH `addMigrations` sites +
  schema-hash match) must be exact, or Room wipes the entire user DB.
- **.NET:** additive only — `ALTER TABLE ADD COLUMN` / `INSERT OR IGNORE`; **never** DROP/recreate a
  table or delete `magav.db`. `DbInitializer` creates tables only when `!dbExists`; that guard must
  stay.
- **Seeding never UPDATEs or DELETEs** existing rows (`INSERT OR IGNORE` only) — so admin edits,
  SMS history, and all configs survive the upgrade.
- **Verify** by upgrading over a populated prior-version DB on both platforms (see Manual
  verification) — this is the gate that proves the zero-data-loss criterion is met.

1. **The new config row must reach EXISTING databases, or the feature silently won't appear.**
   Both seeders only populate a **fresh** DB: .NET `SeedSchedulerConfigAsync` runs only inside
   `if (!dbExists)` (`DbInitializer.cs:43`); Android `seedSchedulerConfigs` bails on
   `if (existing.isNotEmpty()) return` (`DatabaseInitializer.kt:90-91`). On a deployed server or
   upgraded device they never re-seed.
   - **Preferred fix (both platforms): idempotent seed that runs on every startup** — insert the
     expected rows with **`INSERT OR IGNORE`** keyed on `(DayGroup, ReminderType)`, **never
     UPDATE** (must not clobber admin edits). This is the **exact pattern the codebase already
     uses for `JewishHolidays`** (.NET `SeedJewishHolidaysAsync` → `INSERT OR IGNORE`, called
     every startup via `MigrateJewishHolidaysAsync`, `DbInitializer.cs:265,573`; Android uses
     `insertOrIgnore`). Mirror it for SchedulerConfig. No Room version bump needed.
   - **Alternative (Android): data-only `MIGRATION_8_9`** that `INSERT … ON CONFLICT DO NOTHING`
     — requires `@Database` 8→9 + registration in both `addMigrations` sites.
   - **Frontend:** confirm `getConfig()` returns ALL rows and `SchedulerSettingsPage` renders +
     re-submits every one. A config that is loaded but not rendered is dropped from the PUT and
     silently lost (worse with dynamic count validation, which may accept the truncated set).
2. **Ship DISABLED by default** — seed `IsEnabled = 0`; admin enables in the UI after review.
   (All existing seeds use `IsEnabled = 1`; an enabled new row would mass-send on the next trigger.)
3. **Per-platform atomic deploy (no cross-platform RPC).** Web (.NET backend + React) and Android
   (on-device Ktor + bundled React + Room) are **independent stacks that never call each other**,
   so the count-check fix + new row + UI only need to ship together **within each platform**. Bump
   Android `versionCode 60→61` / `versionName 1.4.11→1.4.12`.
4. **SMS volume on the widened window.** A pre-weekend (Thursday) run can send up to ~3× a normal
   day (Thu+N, Fri+N, Sat+N) in one batch. .NET sends sequentially with no throttle
   (`SmsReminderService` foreach; InforU = one POST per SMS); Android is Mutex-serialized, 15 s
   timeout each, 500 ms between sends — ~60 volunteers ≈ 15 min, which can approach
   WorkManager/foreground limits. Plan must confirm the batch completes within limits (keep the
   foreground-service notification; consider an overall batch timeout) and note InforU rate
   limits. **Reuse the existing send loop — do not add a parallel sender.**
5. **Holiday-data horizon (dependency).** `JewishHolidays` is hardcoded ~2025–2030 on both
   platforms. Beyond the last seeded year, `IsWorkingDay` would treat holidays as working days and
   could send on them. Note this dependency; recommend extending the seed (e.g. to 2035) as part
   of this work or flagging an ops refresh. (Automated holiday sync is out of scope.)
6. **Rollback:** admin toggles `IsEnabled` OFF in the UI → next run skips it (no code revert, no
   SMS). Leaving the disabled row in place is harmless.
7. **Monitoring:** emit INFO logs per run (firing day, effective group, window range, eligible
   count, pull-back count) and verify post-deploy via `SchedulerRunLog WHERE
   ReminderType='WeekdayAdvance'` (Status Completed/Partial, SmsSent/Failed).

## Deliverables the plan must produce

1. Chosen design for decisions 1–6 with rationale.
2. Exact data/seed changes for **both** DBs (new ReminderType constant, seed row(s), count-check
   fix, any column + the full Room ritual if a column is added).
3. The `EffectiveDayGroup(date)`/`IsWorkingDay`/`nextWorkingDay` helpers and the windowed query,
   with worked date-math examples (mid-week, Fri-send, Sat-send, holiday-eve, multi-day-holiday)
   for **both** platforms.
4. File-by-file change list with the anchors above; explicitly include the three count-assumption
   fixes (and confirm the templateId→ReminderType switches stay untouched, with the reason).
5. UI changes (optional third section, grouping/payload, Hebrew labels).
6. Dedup / `SchedulerRunLog` impact (what `TargetDate` means for a windowed run; audit choice).
7. **Manual verification checklist**, including: install the new APK on a dev device with a
   populated DB from the prior version and confirm **(a) no data loss** and no
   `שגיאה באתחול המערכת`, **(b) the new WeekdayAdvance row actually appears** (proves existing-DB
   propagation), **(c) it is DISABLED by default**; web run (server+client) confirming saving the
   config still works after the count-check fix, the new config is rendered and **persists across
   reload** (not dropped from the PUT), and that an enabled WeekdayAdvance reminder fires on the
   right day and is correctly pulled back from Fri/Sat, a holiday, and a holiday-eve to the
   preceding working day; plus a volume sanity check that a multi-day (Thursday) window sends the
   full batch.
8. Rollout plan covering the **🚨 Production rollout & data propagation** section: idempotent
   existing-DB seeding (both platforms), `IsEnabled=0` default, per-platform atomic deploy,
   `versionCode` bump, SMS-volume check, holiday horizon, rollback via `IsEnabled`, and the
   monitoring log lines + post-deploy `SchedulerRunLog` check.

## Out of scope

- Changing existing SameDay or Advance behavior.
- `LocationUpdate` (manual, on-demand) is **unaffected** — it does NOT gain walk-back logic;
  avoiding Fri/Sat for it remains a manual concern.
- Reworking the holiday calendar source or fixing the pre-existing `toIsoRange` UTC quirk beyond
  not letting the new window regress because of it.
