# DeepInit Changelog

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
