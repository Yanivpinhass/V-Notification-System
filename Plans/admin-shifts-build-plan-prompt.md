# EXECUTION PROMPT — Build the Administrative-Shifts Implementation Plan (Magav)

You are a software-architect agent operating in **plan mode**. Produce a COMPLETE, dependency-ordered **implementation PLAN** for the "administrative shifts" (משמרות מנהליות) feature described below. **Do NOT write or modify any code — output the plan only.**

This prompt already encodes the resolved architecture and the **mandatory correctness requirements** that were established through prior adversarial validation (a generate→validate→revise loop that converged at zero P0/P1 defects). Treat Sections 2–3 as settled: follow them, do not re-derive or re-open them. Open a cited source file whenever you need an exact signature, column, or line — every path/anchor below was verified against the current tree, but confirm specifics before finalizing. Where a citation has drifted, trust the code and note the correction.

> Environment note: the `graphify` CLI is not runnable here — read source files directly. New Android files under a `db/` package segment are silently git-ignored by the root `.gitignore` `db/` rule → the plan must instruct `git add -f` for them.

---

## 1. Goal

Magav is a Hebrew RTL volunteer-shift SMS system deployed to **two targets that must stay in lockstep**: a .NET 8 web backend + React SPA, and an Android Kotlin app (embedded Ktor + Room/SQLCipher, native SMS). Introduce a **shift-type distinction**: **מבצעית (Operational)** = everything today (Excel-imported + manual shifts, all current schedulers); **מנהלית (Administrative)** = a NEW, always-manually-created type with its own page, fields, templates, and its own automated advance reminder. Operational behavior must remain byte-for-byte unchanged; the two types must never bleed into each other's queries/SMS.

Feature requirements (all DECIDED): rename the current page to **"משמרות מבצעיות"**; add a **"משמרות מנהליות"** page shown **per week (Sunday→Saturday, with prev/next-week nav)** displaying the shift **description**; admin shift fields = **description (req), date (req), time (req), address (opt), location name (opt), vehicle (opt), vehicle-location (opt)** + **multiple volunteers**; **save** or **save+send SMS** (assignment template) on create; a **per-volunteer send-SMS icon** (mirrors the existing operational `MessageSquare` per-row icon) that on the shift's own day sends a **"your shift is today"** message; a new **"הגדרות תזמון למשמרות מנהליות"** settings page; **one automated ADVANCE reminder** (1 working-day before, user-set hour, **holiday/Shabbat-aware roll-back** — Sunday shift → Friday), **no** automated same-day reminder.

---

## 2. Locked architecture decisions (recommended defaults — proceed with these; flag each "⟵ confirm with user" but do NOT block on them)

- **D1 — Shift-type discriminator = a single `ShiftType TEXT NOT NULL DEFAULT 'Operational'` column on `Shifts`/`ShiftEntity`** (NOT a separate table). Reuses the one-row-per-volunteer model, `SmsLog (ShiftId, ReminderType)` dedup, all repos/DAOs, and the scheduler send loop unchanged. Existing rows backfill to `'Operational'` via the column default.
- **D2 — Admin fields = 4 new nullable columns** on `Shifts`: `Description TEXT`, `ShiftTime TEXT` (HH:mm), `Address TEXT NULL`, `VehicleLocation TEXT NULL`. **Reuse existing columns** for the rest: `CarId` = vehicle (already optional), `CustomLocationName`/`LocationId` = location name. `ShiftName` is `TEXT NOT NULL` on both platforms → admin rows must still supply it (use it as an admin group discriminator carrier if needed).
- **D3 — Group key = `(Date, ShiftTime, Description)`**, with `ShiftTime` normalized to zero-padded `HH:mm` server-side. Caveats to honor: the group update endpoint must rewrite all rows of a group atomically (edit re-buckets); identical triples merge. Admin week-view grouping lives in its OWN endpoints — it does NOT reuse the operational `(ShiftName, CarId)` group queries, so the two schemes never collide.
- **D4 — Admin scheduler config = a REAL `SchedulerConfig` row** (`ReminderType='AdminAdvance'`, `DayGroup='SunThu'`, `DaysBeforeShift=1`), NOT a separate table. **This is mandatory, not merely preferred** — see Section 3.
- **D5 — Standalone template-role storage = a new `.NET AppSettings` key-value table mirroring the existing Android `AppSettings`**; keys `admin_assignment_template_id`, `admin_today_template_id`. The advance template id lives in the admin `SchedulerConfig.MessageTemplateId`.
- **D6 — New ReminderType `AdminAdvance`** (distinct from `WeekdayAdvance`); manual admin sends use `Manual`.
- **D7 — New placeholders** `{תיאור}`, `{שעה}`, `{מיקום}`, `{כתובת}`, `{מיקום רכב}` (`{רכב}` already exists), added identically to both platforms with graceful empty-field degradation.
- **D8 — Per-week data contract = a NEW endpoint** `GET /api/shifts/administrative/by-week?weekStart=YYYY-MM-DD` (Sun start), not overloading the operational by-date endpoint.
- **D9 — Save+send = two footer buttons** ("שמירה" / "שמירה ושליחת SMS"); backend = create-then-send via a dedicated admin send endpoint (modeled on `SendLocationUpdateAsync`), not a `sendSms` flag on create.
- **D10 — Admin send endpoints are dedicated** (`POST /api/shifts/administrative/{id}/send-sms`, `.../send-assignment`) — they must NOT route through the operational `{id}/send-sms`, which derives ReminderType + location-append from the numeric templateId (1/2). Admin sends pass ReminderType **explicitly**.

Genuinely open (leave as flagged questions, default as noted, do not implement until confirmed):
- **Per-volunteer icon when the shift is NOT today** → default recommendation: send the assignment template.
- **D11 — Monthly cleanup retention** for admin shifts (type-agnostic aging-out vs Operational-only) → must be applied identically on both platforms once chosen.
- **Volunteer-delete cascade scope** (`GetByVolunteerId`) → recommend leaving unfiltered so it covers admin shifts.
- **Template validation for admin** → recommend keeping `{שם}`+`{תאריך}` mandatory for admin too (simplest, no discriminator); otherwise relax at all 5 sites (Section 3).
- Group-key caveats accepted vs adding an immutable `ShiftGroupId` column.

---

## 3. Mandatory correctness requirements (non-negotiable — the plan is wrong without these)

1. **Room migration (silent-data-loss discipline).** DB is at **`@Database(version = 9)`** (`MagavDatabase.kt`) — the admin migration is **`MIGRATION_9_10`, version → 10** (mirror the additive `CallbackConfig` `MIGRATION_8_9` precedent). Register it in **BOTH** `.addMigrations(...)` sites in `MagavApplication.kt` (~lines 109 and 135). Additive `ALTER TABLE ADD COLUMN` / `CREATE TABLE IF NOT EXISTS` only; column NOT NULL/DEFAULT must byte-match the entity; **prefer NOT adding a `ShiftType` index** (an index needs the exact Room-generated name or startup crashes — ADR-004); never introduce `fallbackToDestructiveMigration`.
2. **Admin config MUST live in `SchedulerConfig` (D4) because `SchedulerRunLog.ConfigId` is a FOREIGN KEY → `SchedulerConfig(Id)`** (`DbInitializer.cs` ~202; Android Room `@ForeignKey` in `SchedulerRunLogEntity.kt`). A separate admin-config table makes the admin run-log INSERT violate the FK → on Android it throws → dedup never persists → **duplicate admin SMS every scheduler tick**. Consequently, the `AdminAdvance` row must be **filtered OUT of every operational scheduler-config path**: `GET /api/scheduler/config` (returns all), the bulk-`PUT` exact-match validation (`Program.cs` ~1934-1937, else operational saves break), and `SchedulerSettingsPage.tsx` grouping (~114-122).
3. **Scheduler mechanics = reuse the existing `WeekdayAdvance` branch** (`SmsSchedulerService.cs` ~95-124; Android `SmsSchedulerWorker.kt` `computeWindow` ~277) via an `|| ReminderType==AdminAdvance` condition with `DaysBeforeShift=1`: half-open window `[today+1, NextWorkingDay(today)+1)`, `runLogTargetDate=today`, per-shift `{תאריך}`/`{יום}`. The `DayGroup='SunThu'` firing gate (`config.DayGroup != effectiveDayGroup ⇒ skip`; Friday/Sat/holiday resolve to `Fri`/`Sat`, never `SunThu` — `GetEffectiveDayGroupAsync` ~151-165) guarantees firing only on working days with no double/missed sends. Do not append location for admin (explicit placeholders only).
4. **EXHAUSTIVE shift-type filter sweep (P0 — a single miss = cross-type bleed or data loss).** The plan MUST list, per file/platform, every path that lists/sends/counts/**DELETES** shifts and its predicate:
   - **.NET:** `ShiftsRepository` `GetByDateAsync`, `GetDatesWithShiftsAsync`, `GetDatesWithUnresolvedAsync`, `GetCanceledByMonthAsync` (add `AND ShiftType='Operational'` — the verified canceled-page leak), `HasSameDaySmsBeenSentAsync`; `SmsReminderService.cs` eligibility SELECT (~46-67, and **project the 4 new columns** for placeholders), `SendLocationUpdateAsync` SELECT; **`ShiftsImportService.cs` hard-delete-by-range (~109) — P0 permanent admin data loss**; **`ShiftCleanupService.cs` `DELETE ... WHERE ShiftDate < @0` (~88-90) — no type filter (D11)**; the operational **cancel-group is a raw inline `UPDATE Shifts SET IsCanceled=1 ... WHERE ShiftName=@4 AND CarId=@5 ...` at `Program.cs` ~1031-1036 (routes through NO repo — patch it directly)**; all shift endpoints in `Program.cs` (~617-1370).
   - **Android:** `ShiftDao` `getByDateRange` (all **9 callers**: scheduler `SmsReminderService.kt:50`, **auto-callback `callback/CallbackLogic.kt:90`**, and 7 operational routes in `ShiftRoutes.kt` — 69/189/321/551/632/802/844), `deleteByDateRange`/`deleteByDateFrom`/`deleteOlderThan` (import + `ShiftCleanupWorker.kt:37`), canceled/available-dates queries, the 4 group ops; Ktor `ShiftRoutes.kt` endpoints. **Rule: by-group operations get the type predicate; by-id operations stay type-agnostic** (a shift id belongs to exactly one type).
   - State the dedup proof: operational uses `Advance/SameDay/WeekdayAdvance/Manual/LocationUpdate`; admin automated = `AdminAdvance`; admin manual = `Manual`; each `ShiftId` is exactly one `ShiftType`, so `SmsLog (ShiftId, ReminderType)` and `SchedulerRunLog (ConfigId, TargetDate, ReminderType)` stay unambiguous.
5. **Placeholders on both platforms.** Add the D7 placeholders to `.NET BuildMessage()` (~204-220) AND Android `buildMessage()` — the Android signature currently takes flat primitives, so **extend the signature** to carry Description/ShiftTime/Address/VehicleLocation (a `.replace`-only change is insufficient). Add an empty-line-collapse post-step. Avoid depending on `{שם מלא}` (already diverges .NET vs Android).
6. **Template-role settings + seeding.** Seed 3 new admin templates by role; because seeding runs only on fresh DBs, ALSO add idempotent `MigrateMessageTemplatesAsync()` / Android `migrateMessageTemplates()` that INSERT-if-name-absent, and **resolve admin template ids by NAME at runtime** (autoincrement ids can't be hardcoded), threading resolved ids into the admin `SchedulerConfig.MessageTemplateId` + the two `AppSettings` keys (seed templates BEFORE configs/settings for referential integrity).
7. **Template-validation relaxation is a 5-site / 4-file change** if pursued: `.NET Program.cs` POST (~2073) + PUT (~2111), React `MessageTemplatesPage.tsx` (~84-86), **and Android Ktor `MessageTemplateRoutes.kt` POST (~61-65) + PUT (~118-122)**. There is no template `type` column — either keep `{שם}`+`{תאריך}` mandatory for admin (simplest) or add a discriminator and apply identically to all 5 sites.
8. **Constants + parity.** Add `AdminAdvance` to `MagavConstants.cs` + `Constants.kt` identically and to `REACT_REMINDER_EXEMPT` in `tools/parity-lint.mjs` (+ document in `tools/parity.md`); add a `ShiftTypes` value-set to both constants files — and **extend `parity-lint.mjs`** to cover `ShiftTypes` (it hardcodes only 3 sets today; new extraction maps + a .NET-vs-Android compare). `node tools/parity-lint.mjs` must pass.
9. **Existing-DB backfill.** New tables/columns/templates/config/settings must reach EXISTING production DBs (web + Android) via idempotent create-if-missing + INSERT-OR-IGNORE/getByKey-guard, not only fresh installs.
10. **Security + UI conventions.** Parameterized queries only; new .NET endpoints `.RequireAuthorization(...)` (reads = the message-manage policy, config/settings writes = Admin-only) and Ktor routes `authenticate("auth-bearer")`; `Results.Json(ApiResponse<T>...)` with generic Hebrew errors, never `Results.Problem`. React: mirror the `isReadOnly = !isUserAdmin()` gate on the new settings page (sibling pages do); RTL rules (X on left, top-aligned scrollable dialog, `Switch dir="ltr"`). The per-week grouped view reuses the **`ShiftsManagementPage` grouping + Chevron prev/next primitives**, NOT the flat `CanceledShiftsPage` table; the admin create dialog (multi-select + save/save+SMS) is **net-new UI**, not a reuse of the single-shot operational Add-Volunteer flow. **Bump `versionCode`** in `android/app/build.gradle.kts` before building the APK.

---

## 4. Architecture reference (verified anchors — cite, don't rediscover)

- **Models/schema:** `web/server/Magav.Common/Models/Shift.cs` (NPoco auto-mapped — add a property + CREATE TABLE column + migration; no hand-written column lists), `SchedulerConfig.cs`, `SchedulerRunLog.cs` (ConfigId FK), `SmsLog.cs`, `MagavConstants.cs`; `web/server/Magav.Server/Services/DbInitializer.cs` (CREATE TABLEs + `Migrate…Async` PRAGMA-introspection helpers + `SeedMessageTemplatesAsync`/`SeedSchedulerConfigAsync`).
- **Android DB:** `db/entity/ShiftEntity.kt`, `db/entity/AppSettingEntity.kt` + `db/dao/AppSettingDao.kt` (existing key-value store), `db/entity/SchedulerRunLogEntity.kt` (FK), `db/MagavDatabase.kt` (version 9), `MagavApplication.kt` (two addMigrations sites), `db/DatabaseInitializer.kt`, `util/Constants.kt`.
- **Services/scheduler:** `.NET Services/Sms/SmsReminderService.cs` + `SmsSchedulerService.cs`; Android `service/SmsReminderService.kt`, `scheduler/SmsSchedulerWorker.kt`, `scheduler/AlarmScheduler.kt`, `scheduler/SmsAlarmReceiver.kt`, `scheduler/BootReceiver.kt`.
- **Endpoints:** `web/server/Magav.Api/Program.cs` (shift + scheduler-config); Android `api/routes/ShiftRoutes.kt`, `api/routes/MessageTemplateRoutes.kt`, and the `CallbackConfigRoutes.kt` precedent for new admin route files.
- **React:** `pages/ShiftsManagementPage.tsx` (grouping + per-row send icon + Chevron nav), `pages/CanceledShiftsPage.tsx`, `pages/SchedulerSettingsPage.tsx` (+ `pages/scheduler/*`), `pages/MessageTemplatesPage.tsx`, `components/layout/menuItems.ts`, `pages/Index.tsx` (`renderContent()` switch), `services/shiftsService.ts` / `schedulerService.ts` / `messageTemplateService.ts`.
- **Tooling:** `tools/parity-lint.mjs`, `tools/parity.md`; `android/app/build.gradle.kts` (versionCode).

---

## 5. Deliverables — the plan MUST contain, dependency-ordered

1. Constants + parity-lint changes (do first).
2. .NET model + schema + idempotent migrations + existing-DB backfill (Shifts columns, `AppSettings` table, admin `SchedulerConfig` row, templates by name).
3. Android entity + `MIGRATION_9_10` (both addMigrations sites, index-exact) + `DatabaseInitializer` seeds/migrates; `git add -f` for new `db/` files.
4. The exhaustive per-file/per-platform shift-type filter sweep (Section 3.4) — as an explicit table.
5. Services/scheduler changes on both targets (placeholders + signature extension; the `AdminAdvance` branch reusing WeekdayAdvance; the two one-shot admin sends; Android alarm scheduling + dispatch for the admin config).
6. Endpoints on both targets (admin CRUD, by-week, save+send, per-volunteer send, admin scheduler config get/put, admin template-settings get/put; the canceled + config isolation).
7. React UI (rename — all 3 strings, stable id/path; new admin page + dialog; new settings page with `isReadOnly` + the 3 template-role selects; menu/routing/services; template-validation branch decision).
8. Seeding + backfill checklist (all sites, both platforms, FK integrity, by-name resolution).
9. Manual verification plan (operational unchanged incl. scheduler-settings still SAVES; admin create with blank vehicle/location; save vs save+SMS; icon "today" template; AdminAdvance fires 1 working-day before with Sunday→Friday + post-holiday roll-back; week nav; no cross-type bleed; import does NOT delete admin shifts; migration test against a POPULATED prior-version DB on web + a real Android device; parity-lint green; versionCode bump + APK path).
10. Risks section (silent Room data loss; cross-type SMS bleed; operational scheduler-config regression; import/cleanup hard-delete data loss) with the mitigation each.
11. A "decisions to confirm" list (Section 2 open items) presented for user sign-off.

---

## 6. Output instructions

Produce the plan as clean Markdown, dependency-ordered so each step builds on confirmed prior steps and the two platforms stay aligned. State each Section-2 decision as a recommendation marked "⟵ confirm with user" but PROCEED with the recommended default. Treat Section 3 as mandatory and reflect every item. **Do NOT write or modify code.** Call out the top risks explicitly. The result should be directly implementable once the user confirms the flagged decisions.
