<!-- DEEPINIT:START (managed — regenerated on each `deep-init` run; edit OUTSIDE these markers) -->
# api (Magav.Api) — scoped context

.NET 8 Minimal-API entry point (depends on `server` + `common`). **`Program.cs` is a 2248-LOC god object** holding ALL endpoints, DI registration, middleware, auth/authorization policies, AND the request/response DTO records. Full detail → `.ai/docs/components/api.md`.

## Critical to know
- **Every endpoint needs `.RequireAuthorization()` unless intentionally public.** The ONLY public endpoints: `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/health`, `POST /api/public/sms-approval/{accessKey}/*` (access-key validated + rate-limited 3/5min). The authorization audit is currently **clean**.
- **Authorization policies:** `AdminOnly` (Admin), `CanManageMessages` (Admin+SystemManager), `CanImportVolunteers` (Admin+SystemManager). Roles are a string array on the user.
- **Error pattern:** `Results.Json(ApiResponse<T>.Fail("<Hebrew>"))`, full detail server-side only — followed by login/refresh/logout/import (the prior `Results.Problem` deviations were converted in `2989b01`). [ISS-005 resolved]
- **File-upload validation (defense-in-depth):** CSRF `X-Requested-With` header + `.xlsx/.xls` ext + magic bytes (`0x50 0x4B` / `0xD0 0xCF`) + in-memory `MemoryStream` (never disk) + max 10MB.
- **`change-password` enforces only `≥6 chars + 1 letter + 1 digit` inline** — this inline rule is now the single canonical password policy (the unused stronger `PasswordValidator` was deleted in `2989b01`). [ISS-009 resolved]
- **JWT secrets are externalized** — `appsettings.json` no longer carries `Jwt:SecretKey`/`Database:Password`/`PublicPages:SmsApprovalAccessKey` (env vars in prod, user-secrets in dev; `<UserSecretsId>` in the csproj). A **fail-loud startup guard** (`Program.cs:26-34`) throws if `Jwt:SecretKey`/`Issuer`/`Audience` is missing. [ISS-007 — appsettings half resolved; the hardcoded `MagavConstants.PasswordKey` in `common` still persists]
- This `Program.cs` is one of three independent implementations of the same REST contract (Android Ktor + React client) with no shared source of truth. [ISS-004]
- `Properties/launchSettings.json` is stale ASP.NET scaffold (weatherforecast / wrong ports) — the real port is 5015.
<!-- DEEPINIT:END -->
