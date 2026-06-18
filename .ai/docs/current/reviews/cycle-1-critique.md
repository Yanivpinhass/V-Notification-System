<!-- DeepInit Adversarial Review | Cycle 1 critique
Run ID: deepinit-2026-06-18
Reviewer: adversarial-review subagent (fresh context)
Generated: 2026-06-18 -->

# Cycle 1 Adversarial Critique — Magav V-Notification-System

Objective: find what is WRONG, MISSING, INCONSISTENT, or HALLUCINATED in the generated docs.
Method: read all docs under `.ai/docs/current/` (5 component + 6 horizontal/decisions/issues/discovery), then spot-checked ~13 `file:line` claims against source. Verdict at the bottom.

**Headline:** the docs are unusually solid. Every high-stakes issue-ledger claim (ISS-001/002/003/005/006/007) and every high-frequency citation I sampled is grounded and verified. No hallucinations found. Findings are mostly framing/precision nits and a couple of genuine consistency gaps the extractors missed. Zero CRITICAL doc defects; **1 HIGH** (a real internal contradiction the docs failed to surface), the rest MEDIUM/LOW.

---

## Severity-sorted findings

| ID | Type | Severity | Location | Issue | Recommended fix |
|----|------|----------|----------|-------|-----------------|
| CR-001 | Missing connection / inconsistency | **HIGH** | server.md BR-server:015 + api.md WF-api (`:30`) + cross-references 4.3 | Two divergent password policies coexist in the .NET backend and **no doc flags the conflict or the dead code**. `PasswordValidator.Validate` requires 8+ chars + upper + lower + digit + **special char** (`PasswordValidator.cs:11-24`), but the only live password-set path — `POST /api/auth/change-password` (`Program.cs:249-252`) — inline-validates **≥6 chars + 1 letter + 1 digit** and never calls `PasswordValidator`. cross-references 4.3 lists `PasswordValidator.cs:7,29` as "password policy" enforcement for auth, implying it's used — it isn't. So `PasswordValidator` is effectively dead for the change-password flow, and the *real* enforced policy is the weaker inline one. | Add an issue/KL entry: "`PasswordValidator` (8+special) is not used by the change-password endpoint, which enforces only ≥6+letter+digit — divergent/likely-dead policy." Correct cross-references 4.3 to cite `Program.cs:249-252` as the actual enforcement and mark `PasswordValidator` usage as unconfirmed/dead. |
| CR-002 | Over-claim (framing) | MEDIUM | issues.md ISS-007 ("Real secrets"); api.md §10/§Summary; cross-references §3 row 1; decisions KL-mistake:010 | The committed `appsettings.json` values are obvious **development placeholders** (`Jwt:SecretKey` = `"MagavDev2024SecretKeyForDevelopment32Chars"`, `Database:Password` = `"MagavDevPassword2024!"`), not "Real secrets" / harvested production credentials. The security *concern* is legitimate (a committed JWT signing key + a real access-key GUID are a forgery/abuse risk **if prod doesn't override**), but the wording "Real secrets … committed" and "non-placeholder values" overstates severity. The GUID access-key is the only value that looks non-obviously-dev. | Reword to "dev-default secrets committed (placeholder-shaped); risk is reuse-in-prod-if-not-overridden + a committed access-key GUID." Keep HIGH severity for the JWT-key-reuse and access-key concerns, but drop "Real secrets" → "dev-default / committed signing material." |
| CR-003 | Inconsistency (uncited divergence) | MEDIUM | server.md WF-server:003/BR-server:012 (7 days) vs android.md WF-android:004/BR-android:013 (3 days); data-layer.md (silent) | Refresh-token lifetime **differs across platforms**: .NET `RefreshTokenExpirationDays = 7` (`AuthService.cs:226`, also `appsettings.json:14`), Android `REFRESH_TOKEN_EXPIRY_DAYS = 3L` (`JwtConfig.kt:17`). Both component docs report their own value correctly, but **no doc flags the cross-platform divergence** even though both targets share one frontend and one logical contract. cross-references 1.2 BR-server:012/BR-android:013 are mapped as a single equivalent rule ("HMAC-SHA256 access + rotated refresh"), masking the 7-vs-3-day difference. | Add a one-line note in cross-references 1.2 (or data-layer §3) that refresh-token TTL diverges (.NET 7d / Android 3d) — likely intentional but undocumented. |
| CR-004 | Incompleteness (citation gap) | MEDIUM | api.md §10, WF-api:007, BR-api:007; decisions ADR-005, KL-mistake:006 | `Results.Problem` appears at **four** sites: `:186` login, `:206` refresh, **`:228` logout**, `:359` import (grep-verified). The api.md error-handling sections and decisions KL-mistake:006 enumerate only login/refresh/import and **omit the logout `:228` site**. (issues.md ISS-005 *does* mention `:228` — so this is an inconsistency *between* the docs, with the issue ledger more complete than the component doc.) | Add `:228` (logout) to api.md WF-api:007/§10 and decisions KL-mistake:006 so all four sites are listed, matching ISS-005. |
| CR-005 | Over-claim (framing nuance) | MEDIUM | data-layer.md §3 D-3; issues.md ISS-003 | D-3 calls the Volunteers divergence a "**fundamentally different volunteer-identity scheme**." Source shows the .NET `Volunteers` table has **both** `InternalIdHash` (NOT NULL UNIQUE, `DbInitializer.cs:74`) **and** `MappingName` (NOT NULL, `:75`); Android has only `MappingName` (unique). So `MappingName` is a **shared** identity axis (and is the field shift-import name-matches on, on *both* platforms); .NET merely *adds* a hash-keyed upsert/approval path on top. The divergence (hash column .NET-only) is real and worth flagging, but "fundamentally different scheme" overstates it — they share `MappingName`. ISS-003's MEDIUM certainty + flag-don't-assert hedging is already fair; the data-layer D-3 prose is the part that overreaches. | Soften D-3 to: ".NET adds a hash-keyed identity (`InternalIdHash`) for import-upsert/approval on top of the shared `MappingName`; Android keeps only `MappingName`. The hash path has no Android landing column." Note both share `MappingName`. |
| CR-006 | Line-range drift (minor) | LOW | data-layer.md §1.1 + server.md §10 cite `SchedulerRunLogRepository.cs:22-28`; decisions ADR-008 cites `:24-27`; issues.md ISS-006 cites `:17-27`/`:24-27` | The actual swallowing `catch (Exception){ return null; }` is **lines 24-28** (method spans 17-29). The three docs cite slightly different ranges (`22-28`, `24-27`, `17-27`). All overlap the real code and the claim is fully supported; only the exact bounds wander. | Normalize all citations to `SchedulerRunLogRepository.cs:24-28` (or method `:17-29`). |
| CR-007 | Endpoint-count hedge | LOW | api.md §1/§10 ("~50 endpoints"); issues.md ISS-008 | `grep -cE "\.Map(Get|Post|Put|Delete)\("` on `Program.cs` = **47** (verified). "~50" is a fair approximation and the §8 interface table enumerates all groups, so coverage is fine — but the round-up is slightly high. | Optional: change "~50" → "47" for precision; not blocking. |
| CR-008 | Internal-id regex inconsistency | LOW | api.md §2 (volunteers/revoke `^[0-9]{1,8}$`) vs api.md WF-api:008 (public verify `^[0-9]{1,8}$`) vs §11 design ("internal-ids") | Not a defect, but worth a consistency note: the public submit path also validates name/phone regexes (WF-api:008) that are cited but not re-verified here; sampling was clean elsewhere so confidence is high. No action required. | None (informational). |

---

## 10-claim truthfulness spot-check (each opened against source)

| # | Claim (doc → cited location) | Result | Actual source evidence |
|---|------------------------------|--------|--------------------------|
| 1 | **ISS-001 / ADR-014 / web-client §10:** `App.tsx` registers only `/` and `*`; no `/sms-approval/:accessKey` (`App.tsx:22-25`). | **VERIFIED** | `App.tsx:22-25` = `<Routes><Route path="/" element={<Index/>}/><Route path="*" element={<NotFound/>}/></Routes>`. Exactly two routes. |
| 2 | **ISS-002 / web-client §10:** `RevokeSmsApprovalPage.tsx:33` calls `volunteersService.revokeSmsApproval(internalId)`; method absent from `volunteersService.ts`. | **VERIFIED** | `RevokeSmsApprovalPage.tsx:33` = `await volunteersService.revokeSmsApproval(internalId);`. Grep of `volunteersService.ts` for `revokeSmsApproval` → no method (only `export` lines). |
| 3 | **ISS-003 / data-layer D-1:** .NET `Volunteer.cs` has `InternalIdHash/FirstName/LastName/RoleId`; Android `VolunteerEntity.kt` has none of these, only `MappingName`+phone+approve+timestamps. | **VERIFIED (with nuance, see CR-005)** | `Volunteer.cs:9-18` has all four .NET fields **plus `MappingName` (line 11)**. `VolunteerEntity.kt:12-31` = Id/MappingName/MobilePhone/ApproveToReceiveSms/CreatedAt/UpdatedAt only. The omission of shared `MappingName` from the framing is the nuance. |
| 4 | **ISS-005 / api.md WF-api:007:** auth login/refresh + import use `Results.Problem` at `:186,206,(228),359`. | **VERIFIED** | grep: `:186` login, `:206` refresh, `:228` logout, `:359` import — all `Results.Problem(...)`. (api.md omits `:228`; see CR-004.) |
| 5 | **ISS-006 / ADR-008 / data-layer §1.1:** `SchedulerRunLogRepository.InsertAsync` `catch (Exception){ return null; }` treats all errors as "already ran." | **VERIFIED** | `SchedulerRunLogRepository.cs:19-28`: `try { InsertAsync; return log; } catch (Exception) { /* UNIQUE… */ return null; }`. Catch is unconditional. (Line-range nit: CR-006.) |
| 6 | **ISS-007 / ADR-006 / KL-mistake:005:** `MagavConstants.cs:7` hardcodes `PasswordKey = "Magav2019097748"`. | **VERIFIED** | `MagavConstants.cs:7` = `public const string PasswordKey = "Magav2019097748";`. Exact line. |
| 7 | **ISS-007 / api.md §10:** `appsettings.json` is git-tracked (not ignored) and carries non-empty Jwt:SecretKey / Database:Password / access-key GUID; InforUMobile creds empty. | **VERIFIED (framing nit CR-002)** | `git ls-files` returns the file; `git check-ignore` returns nothing. Values present at `:10,18,29`; InforUMobile User/Pass/Sender empty at `:33-35`. Values are dev-placeholder-shaped. |
| 8 | **Suppressed IF-6 / ADR-007:** Android `util/Constants.kt` mirrors .NET `MagavConstants` exactly (5 ReminderTypes incl. WeekdayAdvance, 2 SmsStatuses, 3 DayGroups). | **VERIFIED** | `Constants.kt:3-20` = SAME_DAY/ADVANCE/LOCATION_UPDATE/MANUAL/WEEKDAY_ADVANCE, SUCCESS/FAIL, SUN_THU/FRI/SAT. Matches `MagavConstants.cs:9-29`. The "does NOT fire" claim is correct. |
| 9 | **ADR-004 / BR-android:001-002 / KL-mistake:002:** `MagavApplication.kt:112-137` recovers only on SQLCipher key strings, re-throws else; migrations registered at BOTH `addMigrations` call sites. | **VERIFIED (line-perfect)** | `:112-125` message-string check (`"file is not a database"`/`"file is encrypted"`/`"not a database"`) + `throw e`; two `addMigrations(MIGRATION_3_4…7_8)` at `:109` and `:135`. |
| 10 | **android.md §5 / data-layer:** Android `@Database(version = 8)`. | **VERIFIED** | `MagavDatabase.kt:41` = `version = 8`. Consistent across android.md, data-layer, decisions ADR-004. |
| 11 (bonus) | **android.md BR-009 / WF-android:002:** `effectiveDayGroupForDate` at `SmsSchedulerWorker.kt:230` with Sat>today-holiday>Fri>tomorrow-holiday>SunThu ladder. | **VERIFIED** | `:230-236` exactly that priority order. |
| 12 (bonus) | **data-layer D-1/D-5:** .NET Volunteers DDL has the hash col + `IX_Volunteers_InternalIdHash`/`IX_Volunteers_RoleId`. | **VERIFIED** | `DbInitializer.cs:72-86`: `InternalIdHash TEXT NOT NULL UNIQUE` (74), indexes at `:84-85`. |
| 13 (bonus) | **web-client §7:** menu `user-management` requires `['Admin']`; `about` has no requiredRoles. | **VERIFIED** | `menuItems.ts:59-62` (`user-management`, `['Admin']`), `:67-74` (`about`, no requiredRoles). |

**Spot-check tally: 13 VERIFIED, 0 WRONG-LINE, 0 NOT-SUPPORTED.** Two carry framing nuances (CR-002, CR-005) that don't make the claim false. One line-range wobble (CR-006). This is an exceptionally clean truthfulness result.

---

## Quality-score block

**Gate metrics**
- **Route coverage:** ~98%. api.md §8 enumerates all endpoint groups (verified 47 `.Map*` in `Program.cs`); web-client §6 covers all 11 service files (IP-001–023); android §8 lists the full Ktor route surface. No endpoint group missing. (Target ≥80% — PASS.)
- **Model coverage:** ~98%. data-layer §2 maps all 10 logical tables across .NET model / DDL / Room entity; android §5 + web-client §5 + server §5 enumerate every entity and DTO. No table/entity omitted. (Target ≥90% — PASS.)
- **Cross-ref consistency:** ~93%. Strong overall, but dinged by: CR-004 (Results.Problem `:228` listed in ISS-005 but not api.md/decisions), CR-001 (PasswordValidator cited as auth enforcement while the change-password path uses different inline rules), CR-003 (refresh-TTL divergence unmapped). These are genuine cross-doc inconsistencies. (Target ≥95% — **just below**, driven almost entirely by CR-001.)
- **Average certainty:** HIGH. The vast majority of claims are [HIGH] with direct `file:line`; MEDIUM labels (ISS-003/004/006, ADR-015, some web-client [MEDIUM] line counts) are appropriately hedged.
- **Critical issues remaining (doc defects):** **0 CRITICAL, 1 HIGH (CR-001).**

**Three-facet score (1–5)**
- **Completeness: 5** — surface coverage is essentially total; the few gaps (CR-001 dead-policy, CR-003 TTL divergence, CR-004 fourth Problem site) are small relative to the volume documented.
- **Helpfulness: 5** — issue ledger, ADRs, MEMORY-coupling callouts, and the soft-cancel / DayGroup / WeekdayAdvance gotchas are exactly what a maintainer of this single-author, test-free system needs. Flag-don't-assert discipline is consistently applied.
- **Truthfulness: 5** — 13/13 spot-checks verified, zero hallucinations, zero wrong-line. The two over-claims (CR-002 "real secrets", CR-005 "fundamentally different scheme") are wording, not fabrication.

---

## Possible false positives in issues.md (for completeness)

None of the raised issues is a false positive. The closest candidates, on close reading:
- **ISS-007** — NOT a false positive (committed signing key + access-key GUID is a real risk), but the "Real secrets" framing is overstated → CR-002 (downgrade wording, keep the issue).
- **ISS-003** — NOT a false positive; the schema divergence is real and verified. Only the data-layer D-3 *prose* over-reaches → CR-005. The ISS-003 entry itself is fairly framed (MEDIUM, flag-don't-assert).
- **ISS-004** ("one contract, three implementations, no shared source of truth") — fairly framed as MEDIUM/architectural, explicitly folds in the IF-5 overlay without double-emitting; defensible.
- **ISS-006** — fairly framed as MEDIUM with the "runtime impact depends on caller handling of null" hedge; the swallowing catch is verified.

The MEDIUM-certainty issues (ISS-003/004/006) are all appropriately framed as flags, not assertions — they pass the fairness bar.

---

## Recommendation

**Run cycle 2.**

Rationale: cross-ref consistency (~93%) is just under the 95% gate, and there is **1 HIGH doc defect (CR-001)** — a real internal contradiction (two password policies; `PasswordValidator` cited as the auth-enforcement path when the live change-password endpoint uses a weaker inline rule) that the docs neither surfaced nor reconciled. Cycle 2 should: (a) add the CR-001 password-policy divergence as an issue/KL entry and fix the cross-references 4.3 citation; (b) apply the CR-002/CR-005 wording softening; (c) add the CR-003 (refresh-TTL 7d/3d) and CR-004 (`:228` logout) one-line completeness fixes; (d) normalize the CR-006 line range. Route and model coverage already clear their gates, so cycle 2 can be narrow.
