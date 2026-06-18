<!-- DeepInit Detect | Component: system-wide | git intelligence
Run ID: deepinit-2026-06-18
Generated: 2026-06-18 -->

# Git Intelligence

- **Repo:** not shallow (full history) → IF-5 signals reliable. 58 commits, 2026-01-27 → 2026-06-16 (~4.7 months).
- **Bus factor: 1.** All 58 commits authored by `Yanivpinhass`. Every component carries the single-author risk (+50 in the IF-5 score). A second maintainer / documentation is the highest-leverage resilience investment.

## Churn (6-month commit counts touching each component)
| Component | Churn (commits) | Notes |
|-----------|-----------------|-------|
| web-client | 33 | highest; `ShiftsManagementPage.tsx` alone churns 18 |
| android | 29 | `build.gradle.kts` 28 (versionCode bump per APK build — expected), `SmsSchedulerWorker.kt`/`ShiftRoutes.kt`/`RequestDtos.kt`/`MagavApplication.kt` 11 each |
| api | 16 | `Program.cs` 16 (single god-object file) |
| server | 14 | `DbInitializer.cs` 9, `SmsReminderService.cs` 8 |
| common | 8 | most stable layer |

## Hotspot files (churn × size, Core)
1. `web/server/Magav.Api/Program.cs` — 2248 LOC, churn 16, Core, 0 tests — highest blast radius.
2. `web/client/src/pages/ShiftsManagementPage.tsx` — 1135 LOC, churn 18, 0 tests.
3. `android/.../scheduler/SmsSchedulerWorker.kt` + `api/routes/ShiftRoutes.kt` (907 LOC) — Core SMS path, churn 11.
4. `web/server/Magav.Server/Services/DbInitializer.cs` — 859 LOC, churn 9, Core (schema + seed).

## Tech-debt commit signal
Low. Recent commit messages are feature/fix-oriented and descriptive (e.g. `Redesign SMS scheduler settings…`, `Add WeekdayAdvance…`, `Add canceled-shifts soft-cancel…`, `Fix Waze link…`). One commit (`e7fd42c`) documents a data-loss incident — the origin of the defensive Room-init discipline (ADR-004). A historical relocation of `server/Magav.Api/` → `web/server/Magav.Api/` shows in the churn of the old path.

## Change-coupling (temporal, feeds IF-5)
The .NET API (`Program.cs`), Android routes (`ShiftRoutes.kt`/`RequestDtos.kt`), and React services (`shiftsService.ts`) co-evolve — a feature touching the shift/SMS contract lands across all three with no shared definition and no test guard. Surfaced as ISS-004 (folded static + temporal view; non-double-emit).
