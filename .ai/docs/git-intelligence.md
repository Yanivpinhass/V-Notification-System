<!-- DeepInit Detect | Component: system-wide | git intelligence
Run ID: deepinit-2026-08-17 · Updated: deepinit-2026-08-17 (re-measured over the full 78-commit history through 339a89c; churn/hotspot table recomputed, change-coupling re-confirmed and widened) · prior: deepinit-2026-06-25b (through 778a2dd) · prior: deepinit-2026-06-24
Generated: 2026-06-18 -->

# Git Intelligence

- **Repo:** not shallow (full history) → IF-5 signals reliable. **78 commits, 2026-01-27 → 2026-08-17** (~6.7 months). [HIGH — counted via `git rev-list --count`]
- **Bus factor: 1.** All 78 commits authored by `Yanivpinhass` (`git shortlog -sn` shows a single author). Every component carries the single-author risk (+50 in the IF-5 score). A second maintainer / documentation remains the highest-leverage resilience investment. [HIGH — counted]
- **Note on recent authorship:** the two feature commits since the last run carry `Co-Authored-By: Claude Fable 5` trailers, and their bodies document multi-agent plan validation + adversarial review as the substitute for the absent test suite. The *human* bus factor is unchanged.

## Churn (commits touching each component, full history)

| Component | Churn (commits) | Notes |
|-----------|-----------------|-------|
| web-client | 41 | highest; `ShiftsManagementPage.tsx` alone churns 22 |
| android | 35 | `build.gradle.kts` 37 (versionCode bump per APK build — expected); `SmsSchedulerWorker.kt` / `ShiftRoutes.kt` / `MagavApplication.kt` 13 each |
| api | 20 | `Program.cs` 18 (single god-object file) |
| server | 18 | `DbInitializer.cs`, `SmsReminderService.cs` lead |
| common | 11 | still the most stable layer |

## Hotspot files (churn × size, Core)

1. `web/server/Magav.Api/Program.cs` — **2718 LOC**, churn 18, Core, 0 tests — highest blast radius (grew 21% this period).
2. `web/client/src/pages/ShiftsManagementPage.tsx` — **1162 LOC**, churn 22, 0 tests — highest first-party churn.
3. `android/.../scheduler/SmsSchedulerWorker.kt` (churn 13) + `android/.../service/SmsReminderService.kt` (churn 12) — **the core SMS path, and the site of the duplicate-SMS incident fix**; both rewritten in `339a89c`.
4. `android/.../api/routes/ShiftRoutes.kt` — **923 LOC**, churn 13, Core.
5. `web/server/Magav.Server/Services/DbInitializer.cs` — **1148 LOC**, Core (schema + seed); grew 34% this period.
6. *(new)* `web/client/src/components/layout/menuItems.ts` — churn 13 despite being tiny: it is the single registry every new page must be added to, so it co-changes with `Index.tsx` (churn 13) on every feature.

## Tech-debt commit signal

Low-to-moderate, and the signal quality is high: commit messages are long, structured, and record root-cause analysis. Three commits now document incidents or hazards rather than features:
- `e7fd42c` — the Room data-loss incident (origin of ADR-004).
- `5124870` — the fail-closed device allowlist and its keystore-coupling footgun.
- **`339a89c` (2026-08-17) — the duplicate-SMS production incident (15–16/08/2026)**, with a five-link root-cause chain (late/absent SENT broadcast → `Fail`-logged delivered sends → `Success`-only dedup blind to them → no run-level gate since `9afc0f1` → whole-batch worker replay) and an explicit doctrine change ("at-most-once AUTOMATIC dispatch"). This is the second time a removed guard (`9afc0f1` removing the `SchedulerRunLog` pre-check that `2164e6e` had added) contributed to a repeat of the same bug class — a reinforcing signal that guard-removal commits in this repo deserve extra scrutiny.

## Change-coupling (temporal, feeds IF-5)

The .NET API (`Program.cs`), Android routes (`ShiftRoutes.kt`/`AdminShiftRoutes.kt`/`RequestDtos.kt`), and React services (`shiftsService.ts`) co-evolve — a feature touching the shift/SMS contract lands across all three with no shared definition and no test guard. Surfaced as ISS-004 (folded static + temporal view; non-double-emit).

**2026-08-17 re-measurement:** commit `cfb8e36` is the clearest instance yet — a single commit touching **all five components** plus `tools/parity-lint.mjs`, adding 9 endpoints in triplicate. The parity lint (ADR-018) was extended in the same commit from 3 to 5 value-sets, which is the intended workflow, but it still guards only constants — the 9 endpoint shapes were mirrored by hand. Coupling now also extends to the **client menu registry**: `menuItems.ts` + `Index.tsx` co-change with every new page (churn 13 each).
