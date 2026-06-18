# DeepInit Changelog

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
