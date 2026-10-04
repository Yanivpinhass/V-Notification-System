# DeepInit Changelog

## 2026-10-04 — Run deepinit-2026-10-04 (incremental `--update`, source through `719e71a`, clean tree)

The smallest refresh so far: **no component dirty**. Step-0 symmetric set-diff over `.file_hashes.json`:
`keys(stored) == keys(current)` (nothing added or removed). Exactly one source file changed since the last run —
`android/app/build.gradle.kts` in `719e71a` — and it sits **outside** every component path (`android` =
`android/app/src/main`), i.e. in the virtual `shared` pseudo-component, which has no importers. So no component was
re-analyzed and DP-1 had nothing to propagate; the facts that file carries were refreshed in place. Step 0b rebuilt the
structural graph (`graphify update .` → 3093 nodes / 5074 edges / 201 communities over 331 files, 0 LLM tokens).
Horizontal docs re-checked for the affected facts. DB still not connected (R7 — SQLCipher-encrypted).

### MODIFIED — `719e71a` license expiry + version bump (Android build config only)
- `LICENSE_EXPIRY_DATE` default `2026-10-06` → **`2027-06-01`**; `versionCode` 83 → **84**; `versionName` 1.5.0 → **1.5.1**. No code, schema, endpoint or value-set change (Room stays 11; parity lint exits 0).
- `components/android.md`: tech-stack line, the versionCode gotcha, and **BR-android:019** (license gate) — new expiry, the exact compare (`today.isAfter(expiry)`, Israel tz, unparseable date fails closed), the generic block page, certainty MEDIUM → HIGH after a direct read of `LicenseValidator.kt` + `MainActivity.kt:218`.
- `decisions.md`: **+KL-mistake:016** (the compiled-in license expiry is a time-bomb; extended two days before it fired; next deadline 2027-06-01). Knowledge Log 38 → 39. KL-mistake:001's stale "current versionCode=75" corrected to 84.
- `functional-workflows.md` WA-003: stale "versionCode=75 / 1.4.25" (left over from an earlier run) corrected to 84 / 1.5.1.
- `discovery.md`, `git-intelligence.md`: 78 → 80 commits, history through 2026-10-04, `build.gradle.kts` churn 37 → 38.
- Lean tier: root `CLAUDE.md` (version 84 / 1.5.1, **new license-expiry bullet**, issues summary re-dated) and `android/CLAUDE.md` (same two facts).

### MODIFIED — change-detection method (state only)
- **`content_hash` now excludes files named `CLAUDE.md`.** The previous method hashed DeepInit's own nested `CLAUDE.md` outputs, which were re-emitted in `8c3f17f` *after* the hashes were stored — so `common`, `server` and `api` looked changed at HEAD although no source file in them moved. Verified both ways: the old method reproduces all five stored `2026-08-17` values at `339a89c`; the corrected method gives identical values at `339a89c` and HEAD for all five. `.file_hashes.json` → version 3 (three hash values re-based, two unchanged).
- **`shared` pseudo-component is now hashed** (`android/app/build.gradle.kts`, `tools/parity-lint.mjs`, `tools/parity.md`) so an out-of-component change like this one is detected by the set-diff itself rather than only by the git accelerator.

### BREAKING
- (none)

### ISSUES (lifecycle diff vs baseline deepinit-2026-08-17)
- NEW: (none) · RESOLVED: (none) · REGRESSED: (none)
- PERSISTING: ISS-007 (hardcoded `MagavConstants.PasswordKey`, re-verified present), ISS-011 (template-delete guard misses the two `AppSettings`-referenced admin template roles — moves from *new* to *persisting*).
- ACCEPTED (by design): ISS-003, ISS-004.
- **Open after this run: 2 (ISS-007, ISS-011) + 2 accepted-by-design; 6 resolved.** The license expiry is an intentional gate and is logged as a Knowledge Log hazard, not an issue.

### REVIEW
- No adversarial cycles (mode = `--update`, empty component dirty set). Deterministic checks: parity lint exit 0; endpoint audit 56 vs 51 (= the 5 public endpoints); citation verifier re-run over the docs.

## 2026-08-17 — Run deepinit-2026-08-17 (incremental `--update`, source through `339a89c`, clean tree)

The largest refresh since the baseline: **all five components dirty**, nothing skipped. Change detection
(Step-0 symmetric set-diff over `.file_hashes.json`): `keys(stored) == keys(current)` — no component added or
removed — and **every** `content_hash` changed, so DP-1 interface-hash propagation was moot (there was nothing
left to skip). The hash method was first re-verified to reproduce all five stored `2026-06-30` values exactly at
commit `46951bf` before being recomputed at HEAD, so the dirty verdict is measured rather than assumed. Step 0b
rebuilt the structural graph deterministically — **Graphify is available now** (`graphify update .` → 3021 nodes /
4996 edges / 184 communities over 326 files, 0 LLM tokens), where earlier runs used the grep fallback. Horizontal
docs re-run in full. DB still not connected (R7 — SQLCipher-encrypted).

Two feature commits since the prior baseline (`46951bf`):

### ADDED — `cfb8e36` administrative shifts + general locations (all 3 platforms)
- **Administrative shifts (משמרות מנהליות)** via a **`ShiftType` discriminator** on the existing `Shifts` table (`Operational` | `Administrative`) + 5 nullable admin columns; admin groups key on `(ShiftDate, ShiftTime, Description)` with `ShiftName == Description`. **9 new endpoints implemented on BOTH backends** (5 × `/api/shifts/administrative/*`, `GET/PUT /api/admin-scheduler/config`, `GET/PUT /api/admin-settings/templates`) + React `AdminShiftsPage` / `AdminSchedulerSettingsPage` / `adminSchedulerService` / `adminSettingsService`. New reminder type **`AdminAdvance`** reusing the `WeekdayAdvance` half-open window (config `SunThu` / N=1 / seeded disabled). **ADR-022**, **UC-011**, **DR-022/DR-023**, **WA-012**.
- **Typed locations** — `LocationType` (`Vehicle` | `General`) on the existing `Locations` table, `Vehicle` by default everywhere except PUT (which preserves the row's type); one parameterized React page mounted twice. **ADR-023**, **UC-012**, **DR-025**.
- **Schema, mirrored on both targets for the first time since the Volunteers divergence:** Room **9→11** via additive `ALTER TABLE ADD COLUMN`-only `MIGRATION_9_10` + `MIGRATION_10_11` (registered in BOTH `addMigrations` sites), mirrored by .NET `MigrateShiftTypeColumnsAsync` / `MigrateLocationTypeColumnsAsync`. `AppSettings` finally exists on .NET too → **drift row D-2 CLOSED**.
- **Parity lint widened 3 → 5 value-sets** (`+ShiftTypes`, `+LocationTypes`) in the same commit; exits 0.
- **ISS-010 FIXED** — source-only `.gitignore` re-include (both the directory and `/**`, appended last) + 12 `db/` files tracked.

### ADDED — `339a89c` at-most-once SMS dispatch (Android, v1.5.0) — incident response
- Response to a **production duplicate-SMS incident (15–16/08/2026)**: write-ahead `SmsLog` INSERT with the new status **`Dispatched`** *before* the radio handoff (fail-closed); dedup on **ANY** row for `(ShiftId, ReminderType)`; tri-state `SmsProvider.Outcome` with `logStatus`/`countsAsSent` as the single status contract; process-global batch mutex; 60s timeout with **all** multipart parts tracked; worker retry cap + per-worker foreground id; run-bounded duplicate detector; `connectionIdleTimeoutSeconds=180`; amber "שוגר (ללא אישור מסירה)" client badge. **No migration** — `Dispatched` is a new value in the existing TEXT column. **ADR-024**, **WF-005**, **DR-024**, **WA-011**, **KL-mistake:015**. versionCode 76→83 / 1.5.0.

### MODIFIED
- **All five component docs** re-analyzed: `common.md` (+4 BRs, 2 new models, the 5 value-sets), `server.md` (+8 BRs, +2 workflows, `AppSettingsRepository`, the admin migration chain), `api.md` (+8 BRs, the 9 endpoints, DTOs + `AdminSendHelpers`, re-run authorization audit), `android.md` (+10 BRs, WF-android:009, the rewritten WF-android:002, Room v11, ISS-010 resolution), `web-client.md` (+8 BRs, the two new pages, typed locations, the `Dispatched` badge).
- **All horizontal docs** re-run: `data-layer.md` (§2.2 the additive column set + D-2 closed + NEW D-8 behavioral drift), `domain-model.md` (8 glossary terms, DR-022–025), `functional-workflows.md` (UC-011/012, WF-005, WA-011/012), `technical-dependencies.md` (§4.2 the mirror at scale, §4.3 Room 9→11, §4.4 the deliberate send-path divergence), `cross-references.md` (§1.5/§1.6 maps, §4.6/§4.7 traces, tech-debt rows re-measured + 4 new), `decisions.md` (ADR-022/023/024 + 6 KL entries), `git-intelligence.md` + `discovery.md` (re-measured: 78 commits, ~31.7k lines, Graphify available).
- State: `manifest.json` (schema 4, +`source_size`, +`verification` block), `.file_hashes.json` (all five hashes, prior values retained), `.issue_baseline.json`.

### BREAKING
- **No runtime-contract break.** Both Room migrations are additive `ALTER`-only and were done per the full ADR-004 ritual; the `Dispatched` status needed no migration; `GET /api/locations` defaults to `type=Vehicle` so pre-feature callers see an unchanged result set; operational SMS output is byte-for-byte unchanged (the admin placeholder strip/collapse pass is gated on `hasAdmin`).
- **Behavior change worth knowing (Android only):** a `Fail`-logged SMS is **no longer retried automatically** — at-most-once dispatch means only a manual re-send will retry it.

### ISSUES (lifecycle diff vs baseline deepinit-2026-06-30)
- **NEW: 1 (ISS-011)** · **RESOLVED: 1 (ISS-010)** · REGRESSED: 0 · PERSISTING: 1 (ISS-007) · ACCEPTED: 2
- **ISS-011** (IF-1, Medium, HIGH, **not auto-accepted**): the message-template delete guard counts only `SchedulerConfig.MessageTemplateId` references and misses the two administrative template **roles** referenced via `AppSettings` values; because the seed is `INSERT OR IGNORE` / once-only, a dangling key never self-heals. Fail-safe but silent on both backends.
- **ISS-010 → resolved**, re-verified deterministically (`git check-ignore -v` clean; both files in `git ls-files`).
- **ISS-007 → persisting**, re-verified even though `common` was modified this run (`MagavConstants.cs:7` + `EncryptedConnectionStringsProvider.cs:46` unchanged).
- **ISS-004 accepted-list extended** with a sixth, *behavioral* divergence: at-most-once SMS dedup on Android vs `Success`-only on .NET. The 9 administrative endpoints are **not** a divergence — both backends implement them.
- **Open after this run: 2 (ISS-007 + ISS-011) + 2 accepted-by-design.**

### REVIEW
- Incremental update. Doc claims were grounded by reading the two feature commits' full diffs plus the current files, and the load-bearing assertions were checked deterministically rather than asserted: `node tools/parity-lint.mjs` (exit 0, 5 value-sets), `git check-ignore -v` (ISS-010), `grep` for the ISS-007 constant + its use, an endpoint-vs-`RequireAuthorization` count in `Program.cs` (56 vs 51 → exactly the 5 public endpoints), file/line counts via `git ls-files` + `wc -l`, and churn via `git log`. No full adversarial re-run (mode = `--update`).
- **Not verified by DeepInit (manual gates that remain open):** the on-device `MIGRATION_10_11` test on a populated v9/v10 device, and the on-device duplicate-SMS protocol in `Plans/duplicate-sms-fix-implementation-plan.md`.

## 2026-06-30 — Run deepinit-2026-06-30 (incremental `--update`, source through `778a2dd` + uncommitted working tree)

Refreshes the context layer for the Android-only **Auto-Callback-to-Gate** feature (an eligible unanswered
incoming call is rejected and a configured Gate number auto-dialed after 20s), applied to the UNCOMMITTED
working tree on top of HEAD `778a2dd`. Change detection (Step-0 symmetric set-diff; git advisory + `find`
authoritative): **Dirty:** `web-client`, `android`. **Unchanged:** `common`, `server`, `api` (zero .NET source
change — git-verified). DP-1: nothing imports `android`/`web-client` (the three REST implementations are
independent — ISS-004) → no dependent propagation. Horizontal docs re-run. Note: the 2 new `db/`-package
source files are git-ignored (ISS-010) — caught by the `find` arm of the source ladder, which a git-only diff
would miss.

### ADDED
- **Auto-Callback-to-Gate (Android-only)** — new `callback/` package: `CallbackLogic` (eligibility = independent WHO∧WHEN gates, cheap-first, fail-safe; one-shot `setExactAndAllowWhileIdle(+20s)` arm/cancel; `endCall()`→`placeCall()` reject+dial), `CallbackPhoneStateReceiver` (manifest `PHONE_STATE`), `CallbackAlarmReceiver` (`exported=false` fire target, fire-time `callState==RINGING` re-check). New `CallbackConfig` Room entity/DAO (singleton, schema **8→9**, additive `MIGRATION_8_9`), Android-only Ktor `GET/PUT /api/callback-config` (`CallbackConfigRoutes.kt` + `KtorServer.kt:87`), 3 new perms (`CALL_PHONE`/`ANSWER_PHONE_CALLS`/`READ_CALL_LOG`) + 2 manifest receivers, React `CallbackSettingsPage` + `callbackConfigService` (gated to the Android WebView via `window.NativeMedia`) + menu/Index wiring. Decoupled from SMS (no `MagavServerService`/SMS-file change). **ADR-021**, **WF-004**, **DR-020/DR-021**, component ids BR/IP/WF-android + -web-client.
- **Lean tier**: callback bullet added to root `CLAUDE.md` + `android/CLAUDE.md`; Room version `8→9`, `versionCode` `75→76` / `1.4.26`; issues "as of" note refreshed; ADR count `18→21`.

### MODIFIED
- Component deep docs: `android.md` (callback subsystem, 11 entities, MIGRATION_8_9, perms, Android-only endpoint), `web-client.md` (callback page/service, NativeMedia gate).
- Horizontal docs (all re-run): `data-layer.md` (CallbackConfig schema §2.1 + version 9 + MIGRATION_8_9 + drift row D-7), `functional-workflows.md` (WF-004 + US-008 + WA-010), `technical-dependencies.md` (§4.7 telecom/telephony/alarm deps + Android-only-endpoint asymmetry), `domain-model.md` (DR-020/DR-021 + glossary + ownership), `decisions.md` (ADR-021 + KL-integration:007), `cross-references.md` (feature traceability + ISS-010 tech-debt row).
- State: `manifest.json`, `.file_hashes.json` (android `af64…`→`3fa4…` / 69→75 files; web-client `a297…`→`e0bc…` / 119→121 files — same documented git-blob hash method, extended to include the new not-yet-committed source files), `.issue_baseline.json` (ISS-010 added to `open`).

### BREAKING
- (none for runtime contracts — the Room `@Entity`/`@Database` change is additive-only and handled per the full ADR-004 ritual, schema-hash verified via `exportSchema`; no existing table/endpoint/timezone/`IsCanceled` invariant changed.) The new `GET/PUT /api/callback-config` is Android-only by design (accepted ISS-004 divergence, like `/api/settings/sms-sim`).

### ISSUES (lifecycle diff vs baseline deepinit-2026-06-25b)
- **NEW: 1 (ISS-010)** · RESOLVED: 0 · REGRESSED: 0
- ISS-010 (IF-9 repo-hygiene, Medium, HIGH, **not auto-accepted**): root `.gitignore:41` bare `db/` rule git-ignores the new Android db-package source files (`CallbackConfigEntity.kt`, `CallbackConfigDao.kt`) — verified `git check-ignore -v` → `.gitignore:41:db/`. Workaround `git add -f`; fix = anchor to `/db/` or scope to the SQLite data dir.
- PERSISTING: ISS-007 (hardcoded `MagavConstants.PasswordKey` — `common` untouched).
- ACCEPTED (by design): ISS-003 (ADR-016), ISS-004 (now incl. the Android-only `/api/callback-config`).
- **Open after this run: 2 (ISS-007 + ISS-010) + 2 accepted-by-design.**

### REVIEW
- Incremental update: the dirty-set changes were verified by Pass-1 citation-existence against the working-tree code (each doc agent confirmed `MagavDatabase.kt:44`/`:146-168`, `MagavApplication.kt:109,135`, `CallbackLogic.kt`, the two receivers, `CallbackConfigRoutes.kt`, `KtorServer.kt:87`, `MainActivity.kt:145-159`, manifest + ISS-010 via `git check-ignore`). The Android source-tree change (DB version 9 + migration) was independently build-verified this session (`assembleDebug` succeeds; schema-hash exact-match via `exportSchema`). No full adversarial re-run (mode = `--update`).

## 2026-06-25 — Run deepinit-2026-06-25b (consolidating incremental `--update`, source through commit `778a2dd`)

Reconciles a multi-refresh **partial** prior state: `6ef6183` ("Refresh for Duty Log") advanced the component
docs + `.issue_baseline.json` (run `deepinit-2026-06-25`) but left `manifest.json`/`.file_hashes.json` at
`deepinit-2026-06-24` / commit `2989b01`, and the horizontal docs/lean tier never picked up the device-allowlist
gate. This run brings ALL state, component docs, lean tier, and horizontal docs consistent through HEAD.
Change detection (Step-0 symmetric set-diff vs the stored 2026-06-24 hashes; git advisory): **Dirty:** `web-client`,
`android`. **Unchanged:** `common` (byte-identical), `server` + `api` (content_hash advanced via their nested
`CLAUDE.md` only — zero source change since `2989b01`, git-verified → no re-analysis). Horizontal docs re-run.

### ADDED
- **Android device-allowlist gate (fail-CLOSED)** — `license/DeviceAllowlist.kt` (hardcoded set of `Settings.Secure.ANDROID_ID`s; EMPTY set blocks ALL) + `license/DeviceClipboardBridge.kt` (`NativeClip.copyDeviceId()`) + a Hebrew block page (`MainActivity.buildDeviceBlockHtml`), gated at WebView launch after the license check (`MainActivity.kt:191-194`). Commit `5124870`. Documented in `android.md` (BR-android:021, IP-android:018, WF-android:001 step 6, Legacy Warnings, Design Rationale) and promoted to the lean root `CLAUDE.md`.
- **Duty Log editable-hours preview** — a `שנה שעות` toggle in the preview overlay overrides the report hours live; `effectiveData = {...data,startTime,endTime}` feeds BOTH the on-screen report AND the PNG export. Commit `778a2dd`. Documented in `web-client.md` (BR-web-client:018, WF-web-client:008).

### MODIFIED
- Component deep docs: `web-client.md` (editable-hours preview; report column trim `d09b23a`), `android.md` (device-allowlist gate + `NativeClip` bridge; THREE JS bridges now; `versionCode` 69→75 / `1.4.19`→`1.4.25`).
- Horizontal docs: `functional-workflows.md` (device-allowlist launch gate in the startup workflow; Duty Log editable-hours note) re-run; `technical-dependencies.md`, `data-layer.md`, `domain-model.md`, `cross-references.md` re-verified (no material cross-component change — client-only report + Android-only launch gate; data-layer unchanged).
- Lean tier: root `CLAUDE.md` — added the Android device-allowlist gotcha; corrected the stale `versionCode` (**63/1.4.13 → 75/1.4.25**); refreshed the issues "as of" note.
- State: `manifest.json`, `.file_hashes.json` (advanced to `778a2dd`; documented hash method re-validated against `common`), `.issue_baseline.json` (run id + coverage note; lifecycle unchanged).

### BREAKING
- (none — no public REST contract, DB schema, Room `@Entity`/`@Database`, timezone, or `IsCanceled` invariant changed; both features are additive — a client-only PNG report and an Android-only launch gate.)

### ISSUES (lifecycle diff vs baseline deepinit-2026-06-25)
- NEW: (none) · RESOLVED: (none) · REGRESSED: (none)
- PERSISTING: ISS-007 (hardcoded `MagavConstants.PasswordKey` — `common` untouched this run)
- ACCEPTED (by design): ISS-003 (ADR-016), ISS-004 (dual-target contract; `tools/parity-lint.mjs`)
- NOTE (KL/tech-debt, not a formal ISS- per AF-1): the device-allowlist is fail-CLOSED and ANDROID_ID is keystore-scoped → an empty set or a regenerated/release keystore locks out every device. Intentional + self-documented (`DeviceAllowlist.kt` header); surfaced as a lean-tier gotcha and a Legacy Warning, not raised as an issue.
- **Open after this run: 1 (ISS-007) + 2 accepted-by-design.**

### REVIEW
- Incremental update: dirty-set changes (editable-hours preview, device-allowlist gate) verified by Pass-1 citation-existence against current code (`MainActivity.kt:119,191-194,299`, `DeviceAllowlist.kt`, `DutyLogPreviewDialog.tsx`). No full adversarial re-run (mode = `--update`).

## 2026-06-24 — Run deepinit-2026-06-24 (incremental `--update`, source through commit `2989b01`)

Change detection (Step 0 symmetric set-diff; git advisory): the only source-changing commit since the
2026-06-18 baseline is `2989b01` ("Remediate 9 DeepInit issues", 2026-06-19). **Dirty:** `server`, `api`,
`web-client`, `android`. **Unchanged (skipped, DP-1):** `common`. Horizontal docs re-run (the cheap safety net).

### ADDED
- `tools/parity.md` + `tools/parity-lint.mjs` — a 0-LLM cross-platform constant parity lint (ISS-004 mitigation) and the register of accepted divergences. Reflected in technical-dependencies / cross-references / decisions.
- ADR-016 (Android `Volunteer` entity intentional divergence — already added by `2989b01`); ADR-017 (externalize secrets out of tracked config) and ADR-018 (constant parity lint) recorded this run.
- `android/.../db/entity/VolunteerEntity.kt` (new Room entity, with an INTENTIONAL-DIVERGENCE header comment).

### MODIFIED
- Component deep docs: `server.md`, `api.md`, `web-client.md`, `android.md` re-verified against current code; resolved-issue references corrected.
- Horizontal docs: `cross-references.md`, `functional-workflows.md`, `technical-dependencies.md`, `data-layer.md`, `domain-model.md` refreshed (tech-debt register, the SMS-approval flow now wired, the parity guardrail).
- `decisions.md`: `versionCode` 62→63; KL-mistake 006/008/009/010 annotated RESOLVED; ADR-005/008/014 consequence notes updated; KL-mistake:005 (hardcoded `PasswordKey`) kept (persists).
- Lean tier: root `CLAUDE.md` + nested `web/server/Magav.Api/CLAUDE.md`, `web/server/Magav.Server/CLAUDE.md`, `web/client/CLAUDE.md`, `android/CLAUDE.md` — stale issue references corrected. `web/server/Magav.Common/CLAUDE.md` kept (ISS-007 `PasswordKey` persists).
- State: `manifest.json`, `.file_hashes.json` (new documented hash method), `.issue_baseline.json` (lifecycle).

### BREAKING
- (none — no public REST contract, DB schema, Room `@Entity`/`@Database`, timezone, or `IsCanceled` invariant changed; `2989b01` confirms this.)

### ISSUES (lifecycle diff vs baseline deepinit-2026-06-18)
- RESOLVED: ISS-001 (public SMS-approval route wired — `App.tsx:25`)
- RESOLVED: ISS-002 (orphan `RevokeSmsApprovalPage.tsx` deleted)
- RESOLVED: ISS-005 (4× `Results.Problem` → `Results.Json(ApiResponse.Fail, 500)`; zero remain)
- RESOLVED: ISS-006 (run-log dedup catch narrowed to UNIQUE-only in .NET + Android; never rethrows)
- RESOLVED: ISS-009 (dead `PasswordValidator.cs` deleted; single canonical inline policy)
- ACCEPTED (by design): ISS-003 (ADR-016), ISS-004 (dual-target architecture; guarded by `tools/parity-lint.mjs`)
- PERSISTING: ISS-007 — appsettings-credentials half resolved (secrets externalized + fail-loud JWT guard); the hardcoded `MagavConstants.PasswordKey` half (the baseline match-key construct) is **still present** + used by `EncryptedConnectionStringsProvider.cs:46`. Open, scope narrowed.
- REGRESSED: (none) · NEW: (none — the remediation introduced no new IF-* findings)
- **Open after this run: 1 (ISS-007) + 2 accepted-by-design.**

### REVIEW
- Incremental update: lifecycle re-verified by Pass-1 citation-existence against current code (route wiring, deleted files, narrowed catches, the persisting hardcoded key). No re-run of the full adversarial cycles (mode = `--update`).

## 2026-06-18 — Run deepinit-2026-06-18 (initial full run)

### ADDED
- Two-tier context layer generated for the first time (5 components: common, server, api, web-client, android).
- Deep tier `.ai/docs/`: 5 component docs (11 sections each), 5 whole-system docs (technical-dependencies, data-layer, domain-model, functional-workflows, cross-references), decisions.md (15 ADRs + 28 KL entries), discovery.md, git-intelligence.md, the issue ledger.
- Lean tier: `CLAUDE.md` (owned-region; prior human-authored file preserved in a dated `.bak`).
- Machine outputs: `manifest.json` (schema 4 + IF-5 metrics), `deepinit.sarif`, `.file_hashes.json`, `.issue_baseline.json`, `report.html`.

### MODIFIED
- (none — first run)

### BREAKING
- (none — first run)

### ISSUES (lifecycle — parallel section, never mixed into BREAKING/MODIFIED)
- NEW: ISS-001 IF-4 — documented public SMS-approval React route unwired `web/client/src/App.tsx:22`
- NEW: ISS-002 IF-4 — orphan page calls nonexistent service method `web/client/src/pages/RevokeSmsApprovalPage.tsx:33`
- NEW: ISS-003 IF-3a — Volunteer entity diverges across backends `android/.../db/entity/VolunteerEntity.kt:8`
- NEW: ISS-004 IF-3a/IF-5 — one contract implemented three times, no shared source of truth `web/server/Magav.Api/Program.cs:1`
- NEW: ISS-005 IF-4 — auth error responses break the ApiResponse.Fail/Hebrew convention `web/server/Magav.Api/Program.cs:186`
- NEW: ISS-006 IF-7 — scheduler dedup swallows all exceptions as "already ran" `web/server/Magav.Server/Database/Repositories/SchedulerRunLogRepository.cs:24`
- NEW: ISS-007 IF-1 — credentials committed in tracked config + hardcoded encryption-key constant `web/server/Magav.Common/MagavConstants.cs:7`
- NEW: ISS-009 IF-1 — two divergent password policies; PasswordValidator dead `web/server/Magav.Api/Program.cs:249`
- (ISS-008 IF-5 is a ranking overlay, not a location-bound issue.)

### REVIEW
- 2 adversarial cycles (thorough default). Cycle 1: 13/13 spot-checked citations verified, 0 hallucinations. Cycle 2: added ISS-009, down-graded ISS-007 (committed values are dev placeholders), softened ISS-003, mapped refresh-token TTL divergence. Quality gate PASSED after cycle 2 → no adaptive 3rd cycle. 0 false positives.
