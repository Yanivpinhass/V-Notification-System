<!-- DeepInit Issues (C-ISSUE ledger) | Component: system-wide
Run ID: deepinit-2026-06-18
Input files processed: 5 component docs + horizontal docs + decisions.md + targeted code re-reads
Generated: 2026-06-18 -->

# Issue Ledger — Magav V-Notification-System

**Report-only.** Issues are *flagged as likely*, never asserted as proven bugs; DeepInit checks citation-existence + plausibility, not runtime correctness. None of these enter the lean tier (R9) — `CLAUDE.md` carries only a one-line pointer here. Secret VALUES are never reproduced (R5).

**Run accounting:** 14 considered · **9 raised** · 5 refuted/suppressed (stated below). Every raised semantic issue (IF-1/IF-3a/IF-4/IF-7) passed a forced back-to-code R1.5 validate. Bias = **suppression** (a false alarm is the costly outcome). ISS-009 added and ISS-007 down-graded during review cycle 2 (`reviews/cycle-2-reconciliation.md`).

| ID | Family | Severity | Criticality | Certainty | Verified | One-line |
|----|--------|----------|-------------|-----------|----------|----------|
| ISS-001 | IF-4 | Medium | Supporting | HIGH | ✓ | Documented public SMS-approval React route is unwired (dead UI) |
| ISS-002 | IF-4 | Low | Peripheral | HIGH | ✓ | Orphan page calls a nonexistent `volunteersService` method |
| ISS-003 | IF-3a | High | Core | MEDIUM | ✓ | `Volunteer` entity diverges (additive) across the two backends — .NET-only id-hash/name/role columns → **accepted by design (ADR-016)** |
| ISS-004 | IF-3a/IF-5 | High | Core | MEDIUM | ✓ | One REST + domain contract implemented three times with no shared source of truth |
| ISS-005 | IF-4 | Medium | Supporting | HIGH | ✓ | Auth error responses break the mandated `ApiResponse.Fail`/Hebrew pattern (use `Results.Problem`) |
| ISS-006 | IF-7 | Medium | Supporting | MEDIUM | ✓ | Scheduler dedup swallows ALL exceptions as "already ran" |
| ISS-007 | IF-1(d)/sec | Medium | Core | HIGH | ✓ | Credentials committed in tracked `appsettings.json` (dev-placeholder values) + a hardcoded encryption-key constant |
| ISS-008 | IF-5 | — (ranking) | — | MEDIUM | n/a | Risk-hotspot overlay + change-coupling |
| ISS-009 | IF-1 | Medium | Supporting | HIGH | ✓ | Two divergent password policies — `change-password` bypasses `PasswordValidator` (now dead code) |

---

## ISS-001 — [IF-4] Documented public SMS-approval React route is unwired (dead UI)
- **claim:** The volunteer-facing public SMS-approval page is documented as a live route (`/sms-approval/:accessKey` → `VolunteerSmsApprovalPage`) but the SPA registers no such route — `web/client/src/App.tsx:22-25` declares only `/` (`Index`) and `*` (`NotFound`). `VolunteerSmsApprovalPage.tsx` and `RevokeSmsApprovalPage.tsx` are imported nowhere in `web/client/src`. The *server* endpoint set (`POST /api/public/sms-approval/{accessKey}/*`) and the access-key GUID are live, so a volunteer following a documented approval link reaches the SPA root, not the approval page.
- **provenance:** docs side — root `CLAUDE.md` "Routing & Navigation" / "Public Pages (Access Key Pattern)"; code side — `web/client/src/App.tsx:22-25`; orphan page `web/client/src/pages/VolunteerSmsApprovalPage.tsx:1`.
- **severity:** Medium · **criticality:** Supporting · **certainty:** HIGH · **verified:** ✓ (App.tsx route set confirmed; zero importers confirmed). · **flag-don't-assert:** the flow *may* be intentionally retired or accessed another way, but the documented client route does not exist.
- **R1.5:** CONFIRMED. · **lifecycle:** new · **baseline:** new · **sarif:** deepinit/IF-4

## ISS-002 — [IF-4] Orphan page calls a nonexistent service method
- **claim:** `web/client/src/pages/RevokeSmsApprovalPage.tsx:33` calls `volunteersService.revokeSmsApproval(internalId)`, which does not exist on `web/client/src/services/volunteersService.ts`. It would throw at runtime; the error is masked today only because the page is unreachable (ISS-001).
- **provenance:** `web/client/src/pages/RevokeSmsApprovalPage.tsx:33` + absence in `web/client/src/services/volunteersService.ts`.
- **severity:** Low · **criticality:** Peripheral · **certainty:** HIGH · **verified:** ✓ · **R1.5:** CONFIRMED · **lifecycle:** new · **sarif:** deepinit/IF-4
- **dedup:** cross-referenced with ISS-001 (same dead-code root); kept separate because the missing-method is a distinct latent defect.

## ISS-003 — [IF-3a] `Volunteer` entity diverges (additively) across the two backends
- **claim:** The same logical `Volunteers` table is modeled differently per target. **Both** share `MappingName` as the dedup key (Android's unique index; .NET also carries it), so they are not *incompatible* — but .NET `web/server/Magav.Common/Models/Volunteer.cs:9-18` **adds** `InternalIdHash` (SHA256 — the canonical id used by the hashed-id SMS-approval flow), `FirstName`, `LastName`, and `RoleId`, while Android `android/app/src/main/java/com/magav/app/db/entity/VolunteerEntity.kt:8-31` has **none of those four** (it stores only Id/MappingName/MobilePhone/ApproveToReceiveSms/CreatedAt/UpdatedAt). **Blast radius:** the .NET internal-id-hash SMS-approval path has no Android landing column; first/last name + role are .NET-only; a volunteer row is only round-trippable on the `MappingName` subset, not the full record.
- **provenance:** `web/server/Magav.Common/Models/Volunteer.cs:10-16` + `android/app/src/main/java/com/magav/app/db/entity/VolunteerEntity.kt:8-31`; Android dedups by mapping name at `android/app/src/main/java/com/magav/app/api/routes/VolunteerRoutes.kt:82,130`.
- **severity:** High · **criticality:** Core · **certainty:** MEDIUM (the divergence is HIGH-certain; whether it is a defect vs. an intentional per-target design is the MEDIUM part — flag-don't-assert) · **verified:** ✓
- **R1.5:** CONFIRMED (a real structural divergence; framed as a coupling/consistency risk, not asserted a bug). · **note:** Android's extra `AppSettings` table (SIM selection) is an intentional, documented Android-only addition — NOT flagged. · **sarif:** deepinit/IF-3a
- **Resolution (2026-06-19): ACCEPTED BY DESIGN** — see [decisions.md](decisions.md) ADR-016 and [data-layer.md](data-layer.md) §3.2 (D-1/D-3). The Android `VolunteerEntity` intentionally omits `InternalIdHash`/`FirstName`/`LastName`/`RoleId` and keys on the unique `MappingName`; Android has no SMS-approval flow and never reads those columns. **NOT migrated** — a Room `@Entity` change carries the ADR-004 data-wipe hazard for zero functional gain. Intentional per-target divergence, not a bug.

## ISS-004 — [IF-3a / IF-5 hidden-coupling] One contract, three independent implementations, no shared source of truth
- **claim:** The REST API contract AND the domain model are implemented **three times with no shared code**: the .NET Minimal API (`web/server/Magav.Api/Program.cs`), the Android Ktor routes (`android/app/src/main/java/com/magav/app/api/routes/*`), and the React service layer that consumes them (`web/client/src/services/*`); the entity model is likewise triplicated (.NET `Magav.Common/Models`, Android Room `db/entity`, React TS types). A contract/rule change applied to one is silently uncoupled from the others, and there are **no tests** to catch drift. The git history shows these co-change (`Program.cs` churn 16, Android `ShiftRoutes.kt`/`RequestDtos.kt` 11, client `shiftsService.ts` 9) — temporal coupling with no structural edge between the components.
- **provenance:** `web/server/Magav.Api/Program.cs:1`; `android/app/src/main/java/com/magav/app/api/routes/ShiftRoutes.kt:1`; `web/client/src/services/shiftsService.ts:1`. ISS-003 is a concrete already-realized instance of this drift.
- **severity:** High · **criticality:** Core · **certainty:** MEDIUM · **verified:** ✓ · **R1.5:** CONFIRMED · **sarif:** deepinit/IF-3a
- **cross-reference:** the static shared-resource view (this) and the temporal change-coupling view (IF-5) are the SAME finding — emitted once here with the IF-5 overlay folded in (non-double-emit).
- **already-realized drift instances (cycle 2):** beyond ISS-003 (Volunteer schema), the refresh-token TTL diverges — .NET `RefreshTokenExpirationDays = 7` (`web/server/Magav.Server/Services/AuthService.cs:226`, `web/server/Magav.Api/appsettings.json:14`) vs the Android mirror's 3 days — a concrete symptom of the no-shared-source-of-truth coupling.

## ISS-005 — [IF-4] Auth error responses break the mandated error convention
- **claim:** `web/server/Magav.Api/Program.cs:186,206,228` return `Results.Problem("…English…")` for login/refresh/logout (and `:359` uses `Results.Problem` for import). CLAUDE.md's "Error Handling Pattern" + "Security First" rules mandate `Results.Json(ApiResponse<T>.Fail("<Hebrew>"))` and **explicitly warn that `Results.Problem` can leak details in dev mode**. So these endpoints both violate the documented convention and carry a minor dev-mode info-leak risk, and emit English where the product is Hebrew-only.
- **provenance:** decision side — root `CLAUDE.md` "Error Handling Pattern"; code side — `web/server/Magav.Api/Program.cs:186,206,228,359`.
- **severity:** Medium · **criticality:** Supporting · **certainty:** HIGH · **verified:** ✓ · **R1.5:** CONFIRMED · **sarif:** deepinit/IF-4

## ISS-006 — [IF-7 semantic] Scheduler dedup swallows ALL exceptions as "already ran"
- **claim:** `web/server/Magav.Server/Database/Repositories/SchedulerRunLogRepository.cs:17-27` — `InsertAsync` wraps the insert in `catch (Exception) { return null; }` with a comment that assumes the only failure is a UNIQUE-constraint violation ("already ran"). It catches **every** exception, so a transient DB/connection error is indistinguishable from a genuine dedup hit — a real error can be silently mis-read as "this run already happened," skipping a legitimate SMS dispatch (or masking a fault).
- **provenance:** `web/server/Magav.Server/Database/Repositories/SchedulerRunLogRepository.cs:24-27`.
- **severity:** Medium · **criticality:** Supporting · **certainty:** MEDIUM (runtime impact depends on caller handling of `null`) · **verified:** ✓
- **R1.5:** CONFIRMED (the handler performs error-as-success conflation; not the deterministic bare-empty IF-7(c) slice — a broad-catch semantic variant, flagged tentatively). · **sarif:** deepinit/IF-7

## ISS-007 — [IF-1(d) / business-logic-security] Credentials committed in tracked config + a hardcoded encryption-key constant
- **claim:** `web/server/Magav.Api/appsettings.json` is **git-tracked** (confirmed via `git ls-files` + `git check-ignore`) and commits values for `Jwt:SecretKey`, `Database:Password`, and `PublicPages:SmsApprovalAccessKey` (a GUID). **Correction (review cycle 2):** the committed values are **dev/placeholder-style** (e.g. a `MagavDev…`-prefixed key/password), NOT production secrets — so the immediate exposure is low. The real, standing risks are (a) the **practice** of tracking `appsettings.json` with credentials inline (CLAUDE.md says production secrets live in the server's `appsettings.json` — the same tracked filename — so a prod deploy or a careless commit can leak real ones; the access-key GUID is a live shared secret regardless), and (b) `web/server/Magav.Common/MagavConstants.cs:7` hardcodes `PasswordKey = "Magav2019…"` (value redacted), which `EncryptedConnectionStringsProvider.cs` uses to decrypt the connection string — a **hardcoded symmetric key in source defeats** that at-rest encryption for anyone with the repo. (InforUMobile SMS credentials are correctly NOT committed — those keys are empty.) Tension with CLAUDE.md "Security First."
- **provenance:** `web/server/Magav.Api/appsettings.json` (tracked; keys `Jwt:SecretKey`/`Database:Password`/`PublicPages:SmsApprovalAccessKey`); `web/server/Magav.Common/MagavConstants.cs:7`; usage `web/server/Magav.Common/Encryption/EncryptedConnectionStringsProvider.cs`.
- **severity:** Medium (down-graded from High in cycle 2 — committed values are dev placeholders, not live secrets) · **criticality:** Core · **certainty:** HIGH · **verified:** ✓ (tracked-state verified; values redacted — R5).
- **honesty note:** committed-credential detection is *partly* secret-scanner territory (Test-1′), but no scanner runs in this repo's pipeline, the finding is grounded, and the hardcoded-key half is an architecture concern a scanner won't frame. **Remediation is operational** (keep credentials out of tracked config — env/secret store / untracked override; replace the hardcoded `PasswordKey` with an external key; rotate the access-key); DeepInit does not modify source.

## ISS-008 — [IF-5] Risk-hotspot overlay + change-coupling (ranking, not a standalone bug)
Deterministic ranking from git-intel (6mo, not shallow → reliable) × criticality × test coverage (0 tests anywhere → coverage term maxed) × bus_factor (≈1 system-wide → +50 everywhere). Top zones to touch carefully:
| Rank | Location | Why |
|------|----------|-----|
| 1 | `web/server/Magav.Api/Program.cs` | Core; 2248-LOC god object; churn 16; 0 tests; single author — the highest-blast-radius file |
| 2 | `web/client/src/pages/ShiftsManagementPage.tsx` | 1135 LOC; churn 18 (highest first-party churn); 0 tests |
| 3 | `android/.../scheduler/SmsSchedulerWorker.kt` + `api/routes/ShiftRoutes.kt` (907 LOC) | Core SMS path; churn 11; 0 tests |
| 4 | `web/server/Magav.Server/Services/DbInitializer.cs` | Core (schema + seed); 859 LOC; churn 9 |
- **change-coupling (hidden):** the .NET API ↔ Android routes ↔ React services co-change with no structural edge → folded into ISS-004 (non-double-emit; surfaced once as the shared-contract finding).
- **certainty:** MEDIUM (history reliable; the priority weights are illustrative-but-fixed: `1000·CRIT + churn + (100−coverage) + 50·[bus_factor==1]`).

## ISS-009 — [IF-1] Two divergent password policies; `PasswordValidator` is dead on the only set-path
- **claim:** The codebase has a dedicated `PasswordValidator` helper (`web/server/Magav.Server/Helpers/PasswordValidator.cs`) enforcing a stronger policy (8+ chars + upper/lower/digit/special — surfaced as BR-server:015), but the **only live password-set path**, `POST /api/auth/change-password` (`web/server/Magav.Api/Program.cs:249-252`), inline-validates a **weaker** rule (`≥6 chars + ≥1 letter + ≥1 digit`) and **never calls `PasswordValidator`**. Grep confirms `PasswordValidator` is referenced nowhere outside its own file → it is effectively **dead code**, and the password policy actually enforced is the weaker inline one. Same entity+operation (set a user password), two contradictory rules — the stronger one unenforced.
- **provenance:** strong rule — `web/server/Magav.Server/Helpers/PasswordValidator.cs`; actual enforcement — `web/server/Magav.Api/Program.cs:249-252`; dead-reference confirmed by grep (no call site).
- **severity:** Medium · **criticality:** Supporting · **certainty:** HIGH · **verified:** ✓ (cycle-2 finding CR-001).
- **R1.5:** CONFIRMED (the entity+operation contrast is exact — both are the password-set effect; the stronger validator has no call site). · **sarif:** deepinit/IF-1

---

## Suppressed / not-raised (stated for honesty — never silently dropped)
- **IF-2 (DB-vs-code drift):** **SUPPRESSED by R7** — the DB is SQLCipher-encrypted with no approved live read, so no live-schema drift was computed. The *code-vs-code* schema divergence is captured as ISS-003 instead.
- **IF-6 (divergent named value-set):** **does NOT fire** — .NET `MagavConstants.cs` and Android `util/Constants.kt` are verified **in sync** (all 5 `ReminderTypes` incl. `WeekdayAdvance`, both `SmsStatuses`, all 3 `DayGroups` match exactly). The mandated cross-platform mirroring discipline is being followed — a genuine "does NOT fire" (the polarity-opposite of a clone detector).
- **IF-8 (circular component dependency):** **NONE** — the .NET chain `Common → Server → Api` is acyclic; `web-client`/`android` are independent leaves.
- **IF-3b (interface contract breach):** no cross-component named-import to a missing export (the .NET chain imports resolve; the HTTP/mirror boundary isn't a static import). The intra-client missing-method is ISS-002.
- **IF-10 (statically-dead const-gated branch):** none found (no `const FLAG = false; if (FLAG)` pattern in first-party code).
- **Doc-drift — `WeekdayAdvance` missing from CLAUDE.md's `ReminderTypes` list:** real (code has 5, the old doc listed 4) but **demoted** — it is staleness in the very file this run regenerates; the new lean tier lists all 5. Recorded as `KL-mistake` in `decisions.md`, not a standing issue.
- **Small code bugs in the vendored `DbHelper`** (sync-retry sleeps 30s instead of the 1s constant — `DbHelperCore.cs:430,485`; `IndexedList.RemoveItem` always returns `true` — `IndexedList.cs:78`; `BrevoEmailNotifier.cs:48` logs success at Error level): **code-review/linter territory (Test-1′)**, in carried-in vendor code — listed in `cross-references.md`'s tech-debt register, not ranked as semantic issues.
- **`Properties/launchSettings.json` stale ASP.NET scaffold** (weatherforecast URL, wrong ports): trivial — deep-tier note only.
