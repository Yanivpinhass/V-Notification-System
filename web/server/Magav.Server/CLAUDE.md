<!-- DEEPINIT:START (managed — regenerated on each `deep-init` run; edit OUTSIDE these markers) -->
# server (Magav.Server) — scoped context

.NET business logic (depends on `common`): the SMS scheduler subsystem, JWT auth, repositories, `DbInitializer`. Full detail → `.ai/docs/components/server.md`.

## Critical to know
- **DayGroup = the day the SMS is SENT (run day), not the shift's day** (holiday-aware ladder Sat→Fri→SunThu); `DaysBeforeShift` is the look-ahead (`Services/Sms/SmsSchedulerService.cs`). `WeekdayAdvance` (`SmsSchedulerService.cs:114`) uses a half-open `[today+N, NextWorkingDay(today)+N)` window and derives `{תאריך}`/`{יום}` per-shift.
- **Same-day reminders APPEND the location; Advance/WeekdayAdvance/Manual do NOT.**
- **Two-tier SMS dedup:** `SmsLog` (ShiftId, ReminderType) NOT-EXISTS check + `SchedulerRunLog` UNIQUE(ConfigId, TargetDate, ReminderType). **Caveat:** `Database/Repositories/SchedulerRunLogRepository.cs:24` catches ALL exceptions as "already ran" — a transient DB error reads as a dedup hit. [ISS-006]
- **`SmsSchedulerService` (singleton `BackgroundService`, polls 60s) resolves scoped services via `IServiceScopeFactory.CreateScope()`.**
- **Auth:** access token 15min, refresh token 7 days stored as SHA256 (rotated on refresh), lockout after 5 fails/15min (`Services/AuthService.cs`). The refresh-token TTL (7d) diverges from the Android mirror (3d). [ISS-004]
- **`Helpers/PasswordValidator.cs` (8+ chars + complexity) is dead code** — the live `change-password` path enforces a weaker inline rule and never calls it. [ISS-009]
- **Seeding (scheduler configs + templates) runs ONLY on a fresh DB** — new seed rows don't reach existing installs (`Services/DbInitializer.cs`); update all hardcoded seed sites.
- Active-shift queries MUST filter `IsCanceled = 0` (soft-cancel).
<!-- DEEPINIT:END -->
