<!-- DeepInit Issues (C-ISSUE ledger) | Component: system-wide
Run ID: deepinit-2026-06-24 (incremental --update over deepinit-2026-06-18)
Input files processed: changed components (server, api, web-client, android) + horizontal docs + decisions.md + targeted code re-reads
Generated: 2026-06-24 -->

# Issue Ledger — Magav V-Notification-System

**Report-only.** Issues are *flagged as likely*, never asserted as proven bugs; DeepInit checks citation-existence + plausibility, not runtime correctness. None of these enter the lean tier (R9) — `CLAUDE.md` carries only a one-line pointer here. Secret VALUES are never reproduced (R5).

**Lifecycle update (this run, 2026-06-24).** The 2026-06-18 baseline raised 9 issues (8 location-bound + ISS-008 ranking). Commit `2989b01` ("Remediate 9 DeepInit issues", 2026-06-19) addressed all eight. Re-verified against current code (Pass-1 citation existence):
- **Resolved (5):** ISS-001, ISS-002, ISS-005, ISS-006, ISS-009 — the cited construct is gone/fixed and re-verified.
- **Accepted by design (2):** ISS-003 (ADR-016), ISS-004 (the triplication is the dual-target architecture; now guarded by a 0-LLM parity lint).
- **Persisting (1):** ISS-007 — the committed-credentials half is fixed (secrets externalized + a fail-loud JWT guard), but the **hardcoded `MagavConstants.PasswordKey`** (the construct the baseline keys on) is **still present and still used**, so the issue remains OPEN with its scope narrowed.

**Open after this run: 1 (ISS-007, narrowed) + 2 accepted-by-design (ISS-003, ISS-004).**

| ID | Family | Severity | Criticality | Certainty | Verified | Lifecycle | One-line |
|----|--------|----------|-------------|-----------|----------|-----------|----------|
| ISS-001 | IF-4 | Medium | Supporting | HIGH | ✓ | **resolved** | Public SMS-approval React route now wired (`/sms-approval/:accessKey` → `VolunteerSmsApprovalPage`) |
| ISS-002 | IF-4 | Low | Peripheral | HIGH | ✓ | **resolved** | Orphan `RevokeSmsApprovalPage.tsx` (called a nonexistent method) deleted |
| ISS-003 | IF-3a | High | Core | MEDIUM | ✓ | **accepted** | `Volunteer` entity diverges (additive) across the two backends → accepted by design (ADR-016) |
| ISS-004 | IF-3a/IF-5 | High | Core | MEDIUM | ✓ | **accepted** | One REST + domain contract implemented three times → accepted; guarded by `tools/parity-lint.mjs` |
| ISS-005 | IF-4 | Medium | Supporting | HIGH | ✓ | **resolved** | Auth/import error responses converted from `Results.Problem` to `Results.Json(ApiResponse.Fail, 500)` |
| ISS-006 | IF-7 | Medium | Supporting | MEDIUM | ✓ | **resolved** | Scheduler dedup catch narrowed to UNIQUE-only in both impls; never rethrows |
| ISS-007 | IF-1(d)/sec | Medium | Core | HIGH | ✓ | **persisting** | Appsettings creds externalized; **hardcoded `PasswordKey` encryption-key constant remains** |
| ISS-008 | IF-5 | — (ranking) | — | MEDIUM | n/a | refreshed | Risk-hotspot overlay + change-coupling |
| ISS-009 | IF-1 | Medium | Supporting | HIGH | ✓ | **resolved** | Dead `PasswordValidator` deleted; the inline `change-password` policy is now the single canonical rule |

---

## ISS-001 — [IF-4] Documented public SMS-approval React route is unwired (dead UI) — RESOLVED 2026-06-19
- **claim (original):** The volunteer-facing public SMS-approval page was documented as a live route (`/sms-approval/:accessKey` → `VolunteerSmsApprovalPage`) but the SPA registered no such route — `web/client/src/App.tsx` declared only `/` and `*`; `VolunteerSmsApprovalPage.tsx` was imported nowhere.
- **resolution (commit `2989b01`):** `web/client/src/App.tsx:8` now imports `VolunteerSmsApprovalPage` and `:25` registers `<Route path="/sms-approval/:accessKey" element={<VolunteerSmsApprovalPage />} />`. Re-verified: the page file exists and is now referenced. The documented opt-in journey is reachable from the shipped SPA.
- **provenance:** `web/client/src/App.tsx:8,25`; `web/client/src/pages/VolunteerSmsApprovalPage.tsx`.
- **severity:** Medium · **criticality:** Supporting · **certainty:** HIGH · **verified:** ✓ · **lifecycle:** resolved · **sarif:** deepinit/IF-4

## ISS-002 — [IF-4] Orphan page calls a nonexistent service method — RESOLVED 2026-06-19
- **claim (original):** `web/client/src/pages/RevokeSmsApprovalPage.tsx:33` called `volunteersService.revokeSmsApproval(internalId)`, a method that does not exist on `volunteersService.ts`. Masked only because the page was unreachable (ISS-001).
- **resolution (commit `2989b01`):** `RevokeSmsApprovalPage.tsx` was **deleted** (there is no revoke flow). The latent missing-method call no longer exists. Re-verified: file absent; no remaining importer.
- **provenance:** former `web/client/src/pages/RevokeSmsApprovalPage.tsx` (deleted).
- **severity:** Low · **criticality:** Peripheral · **certainty:** HIGH · **verified:** ✓ · **lifecycle:** resolved · **sarif:** deepinit/IF-4

## ISS-003 — [IF-3a] `Volunteer` entity diverges (additively) across the two backends — ACCEPTED BY DESIGN
- **claim:** The same logical `Volunteers` table is modeled differently per target. Both share `MappingName` as the dedup key, but .NET `web/server/Magav.Common/Models/Volunteer.cs:9-18` **adds** `InternalIdHash`, `FirstName`, `LastName`, `RoleId`, while Android `android/app/src/main/java/com/magav/app/db/entity/VolunteerEntity.kt` has **none of those four** (Id/MappingName/MobilePhone/ApproveToReceiveSms/CreatedAt/UpdatedAt).
- **provenance:** `web/server/Magav.Common/Models/Volunteer.cs:10-16` + `android/app/src/main/java/com/magav/app/db/entity/VolunteerEntity.kt`; Android dedups by mapping name at `android/app/src/main/java/com/magav/app/api/routes/VolunteerRoutes.kt:82,130`.
- **severity:** High · **criticality:** Core · **certainty:** MEDIUM · **verified:** ✓ · **lifecycle:** accepted (by design) · **sarif:** deepinit/IF-3a
- **Resolution (2026-06-19): ACCEPTED BY DESIGN** — see [decisions.md](decisions.md) ADR-016 and [data-layer.md](data-layer.md) §3.2 (D-1/D-3). The Android `VolunteerEntity` intentionally omits `InternalIdHash`/`FirstName`/`LastName`/`RoleId` and keys on the unique `MappingName`; Android has no SMS-approval flow and never reads those columns. The intent is now codified at the source — `VolunteerEntity.kt` carries a file-header comment ("INTENTIONAL DIVERGENCE … do NOT 'fix' by adding columns") that also restates the ADR-004 data-wipe hazard. **NOT migrated** — a Room `@Entity` change carries that hazard for zero functional gain. Intentional per-target divergence, not a bug.

## ISS-004 — [IF-3a / IF-5 hidden-coupling] One contract, three independent implementations, no shared source of truth — ACCEPTED BY DESIGN (guarded)
- **claim:** The REST API contract AND the domain model are implemented **three times with no shared code**: .NET Minimal API (`web/server/Magav.Api/Program.cs`), Android Ktor routes (`android/app/src/main/java/com/magav/app/api/routes/*`), and the React service layer (`web/client/src/services/*`); entities triplicated (.NET Models / Room entities / TS types). A contract/rule change applied to one is silently uncoupled from the others, and there are **no tests** to catch drift.
- **provenance:** `web/server/Magav.Api/Program.cs:1`; `android/app/src/main/java/com/magav/app/api/routes/ShiftRoutes.kt:1`; `web/client/src/services/shiftsService.ts:1`. ISS-003 is a concrete already-realized instance.
- **severity:** High · **criticality:** Core · **certainty:** MEDIUM · **verified:** ✓ · **lifecycle:** accepted (by design, mitigated) · **sarif:** deepinit/IF-3a
- **Resolution (2026-06-19): ACCEPTED — inherent to the dual-target architecture (ADR-001/012/015), now GUARDED.** The triplication still structurally exists (it is not eliminated), so IF-3a/IF-5 still detect it — but the project added a **0-LLM constant parity lint** (`tools/parity-lint.mjs` + `tools/parity.md`) that fails on any drift in the value-sets that *must* match (`ReminderTypes`/`SmsStatuses`/`DayGroups`, .NET vs Android exact, React a preview-exempt subset), plus a written register of the **accepted divergences**. The remaining drift instances are now documented and intentional:
  - **Refresh-token TTL** — .NET `RefreshTokenExpirationDays = 7` (`web/server/Magav.Server/Services/AuthService.cs:226`, `web/server/Magav.Api/appsettings.json:13`) vs Android `REFRESH_TOKEN_EXPIRY_DAYS = 3L` (`android/app/src/main/java/com/magav/app/api/auth/JwtConfig.kt:17`) — accepted divergence #1 (`tools/parity.md`).
  - **Password policy** — .NET change-password (≥6 + letter + digit) vs Android (≥4) — accepted divergence #2.
  - **Volunteer schema** — accepted divergence #3 (ISS-003 / ADR-016).
- **note:** This is a *mitigation*, not a unification — a future contract/DTO change is still applied by hand to all three. Run `node tools/parity-lint.mjs` before shipping a constant change.

## ISS-005 — [IF-4] Auth error responses break the mandated error convention — RESOLVED 2026-06-19
- **claim (original):** `web/server/Magav.Api/Program.cs` returned `Results.Problem("…English…")` for login/refresh/logout and the volunteers-import 500 path, violating the mandated `Results.Json(ApiResponse<T>.Fail("<Hebrew>"))` convention (which also warns `Results.Problem` can leak detail in dev).
- **resolution (commit `2989b01`):** All four were converted to `Results.Json(ApiResponse<T>.Fail("<Hebrew>"), statusCode: 500)` (login → "אירעה שגיאה בעת ההתחברות", refresh → "…חידוש ההתחברות", logout → "…ההתנתקות", import → "…ייבוא הקובץ"). Re-verified: **zero `Results.Problem` references remain** in `Program.cs`.
- **provenance:** `web/server/Magav.Api/Program.cs` (login/refresh/logout/import catch blocks).
- **severity:** Medium · **criticality:** Supporting · **certainty:** HIGH · **verified:** ✓ · **lifecycle:** resolved · **sarif:** deepinit/IF-4

## ISS-006 — [IF-7 semantic] Scheduler dedup swallows ALL exceptions as "already ran" — RESOLVED 2026-06-19
- **claim (original):** `SchedulerRunLogRepository.InsertAsync` wrapped the insert in `catch (Exception) { return null; }` assuming the only failure is a UNIQUE-constraint violation, so a transient DB error was indistinguishable from a genuine dedup hit.
- **resolution (commit `2989b01`):** The catch is now narrowed to `SqliteException` filtered on `SqliteErrorCode == 19` / `SqliteExtendedErrorCode == 2067` / message-contains-"UNIQUE" → silent dedup hit; **any other exception is logged distinctly** (ConfigId/TargetDate/ReminderType) and returns `null` **without rethrowing** (a rethrow would re-run the batch → duplicate SMS). The **Android mirror** (`SmsReminderService.kt:188-200`) was changed identically — `SQLiteConstraintException` is the silent dedup catch; any other exception is `Log.e`'d and swallowed (NOT rethrown, since `doWork()` maps any exception to `Result.retry()`). Both carry cross-reference comments. Re-verified in both files.
- **provenance:** `web/server/Magav.Server/Database/Repositories/SchedulerRunLogRepository.cs:25-44`; `android/app/src/main/java/com/magav/app/service/SmsReminderService.kt:188-200`.
- **severity:** Medium · **criticality:** Supporting · **certainty:** MEDIUM · **verified:** ✓ · **lifecycle:** resolved · **sarif:** deepinit/IF-7

## ISS-007 — [IF-1(d) / business-logic-security] Credentials in tracked config + a hardcoded encryption-key constant — PERSISTING (partially remediated)
- **claim (two halves):** (a) `web/server/Magav.Api/appsettings.json` was git-tracked and committed values for `Jwt:SecretKey`, `Database:Password`, and `PublicPages:SmsApprovalAccessKey`; (b) `web/server/Magav.Common/MagavConstants.cs:7` hardcodes `PasswordKey` (value redacted), used by `EncryptedConnectionStringsProvider.cs` to decrypt the connection string — a hardcoded symmetric key in source that defeats the at-rest encryption.
- **resolution status (commit `2989b01` — PARTIAL):**
  - **(a) RESOLVED:** `Jwt:SecretKey`, `Database:Password`, and the `PublicPages:SmsApprovalAccessKey` block were **removed from the tracked `appsettings.json`** (now env vars in prod / user-secrets in dev; `<UserSecretsId>` added to `Magav.Api.csproj`; `appsettings.Development.json` gitignored). A **fail-loud startup guard** was added (`Program.cs:26-34`) that throws if `Jwt:SecretKey`/`Issuer`/`Audience` are missing, so an empty secret fails at boot rather than silently at first token validation. Re-verified: those keys are gone from `appsettings.json`.
  - **(b) STILL OPEN:** `web/server/Magav.Common/MagavConstants.cs:7` **still** declares `public const string PasswordKey = "Magav…"` (value redacted — R5), and `web/server/Magav.Common/Encryption/EncryptedConnectionStringsProvider.cs:46` still uses it. The `common` component was not touched by the remediation. The baseline match-key (`IF-1:…/MagavConstants.cs:PasswordKey#hardcoded`) points at this construct, which is unchanged → the issue **persists**. Crypto also still uses legacy `Rijndael` + default `Rfc2898DeriveBytes` iterations (KL-mistake:005).
- **provenance:** `web/server/Magav.Common/MagavConstants.cs:7`; usage `web/server/Magav.Common/Encryption/EncryptedConnectionStringsProvider.cs:46`.
- **severity:** Medium · **criticality:** Core · **certainty:** HIGH · **verified:** ✓ (the hardcoded constant + usage still present) · **lifecycle:** persisting (scope narrowed to the hardcoded `PasswordKey`)
- **remaining remediation:** replace the hardcoded `PasswordKey` with an externally-supplied key (env/secret store), the same way the appsettings credentials were externalized; consider modernizing the cipher/KDF. DeepInit does not modify source.

## ISS-008 — [IF-5] Risk-hotspot overlay + change-coupling (ranking, not a standalone bug)
Deterministic ranking from git-intel × criticality × test coverage (0 tests anywhere → coverage term maxed) × bus_factor (≈1 system-wide → +50 everywhere). Top zones to touch carefully (unchanged in character by the remediation — the same files remain the hotspots):
| Rank | Location | Why |
|------|----------|-----|
| 1 | `web/server/Magav.Api/Program.cs` | Core; ~2250-LOC god object; high churn; 0 tests; single author — the highest-blast-radius file |
| 2 | `web/client/src/pages/ShiftsManagementPage.tsx` | 1135 LOC; highest first-party churn; 0 tests |
| 3 | `android/.../scheduler/SmsSchedulerWorker.kt` + `api/routes/ShiftRoutes.kt` (907 LOC) | Core SMS path; 0 tests |
| 4 | `web/server/Magav.Server/Services/DbInitializer.cs` | Core (schema + seed); 859 LOC |
- **change-coupling (hidden):** the .NET API ↔ Android routes ↔ React services co-change with no structural edge → folded into ISS-004 (non-double-emit). Now partially guarded by `tools/parity-lint.mjs` for the value-sets.
- **certainty:** MEDIUM (history reliable; the priority weights are illustrative-but-fixed: `1000·CRIT + churn + (100−coverage) + 50·[bus_factor==1]`).

## ISS-009 — [IF-1] Two divergent password policies; `PasswordValidator` was dead on the only set-path — RESOLVED 2026-06-19
- **claim (original):** A dedicated `PasswordValidator` helper (`web/server/Magav.Server/Helpers/PasswordValidator.cs`) enforced a stronger policy (8+ chars + upper/lower/digit/special, BR-server:015), but the only live password-set path, `POST /api/auth/change-password`, inline-validated a **weaker** rule (≥6 + letter + digit) and never called it → the validator was dead code and the contradictory weaker rule was the one actually enforced.
- **resolution (commit `2989b01`):** `web/server/Magav.Server/Helpers/PasswordValidator.cs` was **deleted**. The inline `change-password` rule is now the **single, canonical** password policy — the contradiction (two rules for the same set-operation) is gone. Re-verified: file absent; no remaining first-party reference (the nested CLAUDE.md mentions were stale and are updated this run). NOTE: the *cross-platform* .NET-vs-Android policy difference (≥6 vs ≥4) is a **separate, intentional** divergence recorded in `tools/parity.md` #2 — not this issue.
- **provenance:** former `web/server/Magav.Server/Helpers/PasswordValidator.cs` (deleted); enforcement `web/server/Magav.Api/Program.cs` change-password.
- **severity:** Medium · **criticality:** Supporting · **certainty:** HIGH · **verified:** ✓ · **lifecycle:** resolved · **sarif:** deepinit/IF-1

---

## Suppressed / not-raised (stated for honesty — never silently dropped)
- **IF-2 (DB-vs-code drift):** **SUPPRESSED by R7** — the DB is SQLCipher-encrypted with no approved live read, so no live-schema drift was computed. The *code-vs-code* schema divergence is captured as ISS-003 instead.
- **IF-6 (divergent named value-set):** **does NOT fire** — .NET `MagavConstants.cs` and Android `util/Constants.kt` are verified **in sync** (all 5 `ReminderTypes` incl. `WeekdayAdvance`, both `SmsStatuses`, all 3 `DayGroups` match exactly). The mandated cross-platform mirroring discipline is now also enforced mechanically by `tools/parity-lint.mjs` (ISS-004 mitigation).
- **IF-8 (circular component dependency):** **NONE** — the .NET chain `Common → Server → Api` is acyclic; `web-client`/`android` are independent leaves.
- **IF-3b (interface contract breach):** no cross-component named-import to a missing export (the .NET chain imports resolve; the HTTP/mirror boundary isn't a static import). The former intra-client missing-method (ISS-002) is now resolved (page deleted).
- **IF-10 (statically-dead const-gated branch):** none found (no `const FLAG = false; if (FLAG)` pattern in first-party code).
- **No new issues introduced by the remediation** — the narrowed catches, the JWT startup guard, the wired route, and the new `VolunteerEntity.kt` were reviewed; none raise a new IF-* finding (the .NET catch's `Message.Contains("UNIQUE")` fallback is locale-tolerant by design, not a defect).
- **Small code bugs in the vendored `DbHelper`** (sync-retry sleeps 30s instead of the 1s constant — `DbHelperCore.cs:430,485`; `IndexedList.RemoveItem` always returns `true` — `IndexedList.cs:78`; `BrevoEmailNotifier.cs:48` logs success at Error level): code-review/linter territory, in carried-in vendor code — listed in `cross-references.md`'s tech-debt register, not ranked as semantic issues.
- **`Properties/launchSettings.json` stale ASP.NET scaffold** (weatherforecast URL, wrong ports): trivial — deep-tier note only.
