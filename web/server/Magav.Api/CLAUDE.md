<!-- DEEPINIT:START (managed — regenerated on each `deep-init` run; edit OUTSIDE these markers) -->
# api (Magav.Api) — scoped context

.NET 8 Minimal-API entry point (depends on `server` + `common`). **`Program.cs` is a 2248-LOC god object** holding ALL endpoints, DI registration, middleware, auth/authorization policies, AND the request/response DTO records. Full detail → `.ai/docs/components/api.md`.

## Critical to know
- **Every endpoint needs `.RequireAuthorization()` unless intentionally public.** The ONLY public endpoints: `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/health`, `POST /api/public/sms-approval/{accessKey}/*` (access-key validated + rate-limited 3/5min). The authorization audit is currently **clean**.
- **Authorization policies:** `AdminOnly` (Admin), `CanManageMessages` (Admin+SystemManager), `CanImportVolunteers` (Admin+SystemManager). Roles are a string array on the user.
- **Error pattern:** `Results.Json(ApiResponse<T>.Fail("<Hebrew>"))`, full detail server-side only. **Deviation:** login/refresh/logout (`Program.cs:186,206,228`) use `Results.Problem` with ENGLISH text — violates the convention + risks dev-mode detail leak. [ISS-005]
- **File-upload validation (defense-in-depth):** CSRF `X-Requested-With` header + `.xlsx/.xls` ext + magic bytes (`0x50 0x4B` / `0xD0 0xCF`) + in-memory `MemoryStream` (never disk) + max 10MB.
- **`change-password` (`Program.cs:249-252`) enforces only `≥6 chars + 1 letter + 1 digit` inline** and never calls the stronger `PasswordValidator`. [ISS-009]
- **`appsettings.json` is git-tracked with credentials inline** (dev-placeholder values today: `Jwt:SecretKey`, `Database:Password`, `PublicPages:SmsApprovalAccessKey`). Keep real secrets out of tracked config. [ISS-007]
- This `Program.cs` is one of three independent implementations of the same REST contract (Android Ktor + React client) with no shared source of truth. [ISS-004]
- `Properties/launchSettings.json` is stale ASP.NET scaffold (weatherforecast / wrong ports) — the real port is 5015.
<!-- DEEPINIT:END -->
