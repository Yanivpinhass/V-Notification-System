<!-- DEEPINIT:START (managed — regenerated on each `deep-init` run; edit OUTSIDE these markers) -->
# server (Magav.Server) — scoped context

.NET business logic (depends on `common`): the SMS scheduler subsystem, JWT auth, repositories, `DbInitializer`. Full detail → `.ai/docs/components/server.md`.

## Critical to know
- **DayGroup = the day the SMS is SENT (run day), not the shift's day** (holiday-aware ladder Sat→Fri→SunThu); `DaysBeforeShift` is the look-ahead (`Services/Sms/SmsSchedulerService.cs`). `WeekdayAdvance` (`SmsSchedulerService.cs:114`) uses a half-open `[today+N, NextWorkingDay(today)+N)` window and derives `{תאריך}`/`{יום}` per-shift.
- **Same-day reminders APPEND the location; Advance/WeekdayAdvance/Manual do NOT.**
- **Two-tier SMS dedup:** `SmsLog` (ShiftId, ReminderType) NOT-EXISTS check + `SchedulerRunLog` UNIQUE(ConfigId, TargetDate, ReminderType). `Database/Repositories/SchedulerRunLogRepository.cs` now swallows **only** the UNIQUE violation as a dedup hit; any other DB error is logged distinctly and returns null **without rethrowing** (a rethrow would re-run the batch → duplicate SMS) — kept structurally identical to the Android mirror. [ISS-006 resolved]
- **`SmsSchedulerService` (singleton `BackgroundService`, polls 60s) resolves scoped services via `IServiceScopeFactory.CreateScope()`.**
- **Auth:** access token 15min, refresh token 7 days stored as SHA256 (rotated on refresh), lockout after 5 fails/15min (`Services/AuthService.cs`). The refresh-token TTL (7d) intentionally diverges from the Android mirror (3d) — an accepted divergence (`tools/parity.md` #1). [ISS-004]
- **Password policy lives inline in `change-password`** (≥6 + letter + digit) — the old unused `Helpers/PasswordValidator.cs` was deleted in `2989b01`; do not reintroduce a second validator. [ISS-009 resolved]
- **Seeding (scheduler configs + templates) runs ONLY on a fresh DB** — new seed rows don't reach existing installs (`Services/DbInitializer.cs`); update all hardcoded seed sites.
- Active-shift queries MUST filter `IsCanceled = 0` (soft-cancel).
<!-- DEEPINIT:END -->
