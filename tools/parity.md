# Cross-platform parity (the triplicated contract) — ISS-004

The same REST contract + domain model is implemented **three times with no shared source of truth**:

| Layer | Path | Role |
|-------|------|------|
| .NET Minimal API | `web/server/Magav.Api/Program.cs` (+ `Magav.Common/Models`) | web backend |
| Android Ktor | `android/app/src/main/java/com/magav/app/api/routes/*` (+ Room `db/entity/*`) | device backend |
| React services | `web/client/src/services/*` (+ TS types) | shared client (web + Android WebView) |

A contract/rule/constant change applied to one is silently uncoupled from the others, and there are
**no automated tests** to catch drift. The triplication is a deliberate trade-off (ADR-001/012/015); a full
shared-source-of-truth / codegen is out of scope. This file records the **canonical owners** and the
**accepted divergences**, and is backed by a 0-LLM lint so the value-sets that *must* match can't drift unnoticed.

## Canonical owners
- **String value-sets** (`ReminderTypes`, `SmsStatuses`, `DayGroups`): **`web/server/Magav.Common/MagavConstants.cs`** is canonical. Android `util/Constants.kt` and React `pages/scheduler/schedulerPreview.ts` mirror it. Enforced by `tools/parity-lint.mjs`.
- **Auth token TTLs**: **.NET config** (`appsettings.json` `Jwt:*` → `AuthService.JwtSettings`) is the reference. Android mirrors separately (see accepted divergence #1).
- **Volunteer identity / schema**: **.NET `Magav.Common/Models/Volunteer.cs`** is the fuller model; Android keys on `MappingName` (see accepted divergence #3 + ADR-016).

## The 0-LLM lint
```
node tools/parity-lint.mjs      # exit 0 = in sync, exit 1 = drift
```
Pure regex over the three constant files — no LLM, no dependencies. Fails on any drift in
`ReminderTypes` / `SmsStatuses` / `DayGroups` (.NET vs Android exact; React must be a subset whose only
omissions are the preview-exempt types). Run it before shipping a constant change, and wire it into CI /
a pre-commit hook if one is ever added. To intentionally accept a *new* divergence, record it both here
and in the exempt list at the top of `tools/parity-lint.mjs`.

## Accepted divergences (intentional — NOT drift, do not "fix")
1. **Refresh-token TTL — .NET 7 days vs Android 3 days.** Device sessions are shorter by choice; deliberately not aligned. (issues.md ISS-004; `AuthService.cs` `RefreshTokenExpirationDays`.)
2. **Password policy — .NET change-password (≥6 + letter + digit) vs Android (≥4).** The Android password is device-local, so a hard password adds little; .NET is the canonical policy for the web admin. (issues.md ISS-009; `web/server/Magav.Api/Program.cs` change-password.)
3. **Volunteer schema — Android omits `InternalIdHash` / `FirstName` / `LastName` / `RoleId`, keys on the unique `MappingName`.** Android has no SMS-approval flow and never reads those columns; no Room migration (the ADR-004 data-wipe hazard for zero functional gain). (ADR-016; issues.md ISS-003; data-layer.md §3.2 D-1/D-3.)
4. **React scheduler-preview `ReminderTypes` subset — declares only `SameDay` / `Advance` / `WeekdayAdvance`.** `schedulerPreview.ts` is a settings-page preview engine for the user-configurable scheduler rows only; `LocationUpdate` (event-triggered re-notify) and `Manual` (ad-hoc admin send) are not configurable rows, so they are intentionally absent (and `TYPE_META[...]` access is null-safe). The lint marks them **preview-exempt**.

## In sync today (verified)
`ReminderTypes` (SameDay, Advance, LocationUpdate, Manual, WeekdayAdvance), `SmsStatuses` (Success, Fail),
and `DayGroups` (SunThu, Fri, Sat) match exactly between .NET and Android (issues.md IF-6 "does NOT fire";
ADR-007). The load-bearing dedup constraints (`SmsLog (ShiftId, ReminderType)`,
`SchedulerRunLog UNIQUE(ConfigId, TargetDate, ReminderType)`) and the soft-cancel columns also match
(data-layer.md §3.2).
