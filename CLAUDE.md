# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Megav is a Hebrew RTL volunteer shift management and SMS reminder system. The UI is entirely in Hebrew with right-to-left layout. It manages volunteer patrol shifts, sends SMS reminders via a background scheduler, and provides admin tools for user/volunteer/shift management.

## Security First

**Security is the top priority.** Key rules:
- Use parameterized queries only (`@0`, `@1`, ...) — never concatenate SQL
- All new API endpoints MUST include `.RequireAuthorization()` unless intentionally public
- Never expose exception details in API responses — use generic Hebrew error messages
- Use `Results.Json()` with `ApiResponse<T>` instead of `Results.Problem()` (which can leak details in dev mode)
- File uploads require CSRF header check, extension validation, and magic byte verification
- Validate all inputs server-side even if validated client-side

## Development Commands

**Client** (from `client/` directory):
```bash
cd client
npm install       # Install dependencies
npm run dev       # Start dev server at http://localhost:8080
npm run build     # Production build
npm run lint      # Run ESLint
npm run preview   # Preview production build
```

**Server** (from `server/Magav.Api/` directory):
```bash
cd server/Magav.Api
dotnet build      # Build server
dotnet run        # Run server at http://localhost:5015
```

Both must run simultaneously for development. Vite proxies `/api/*` requests to `localhost:5015`.

There are no automated tests in this project.

**Default dev credentials:** username `admin`, password `Admin123!` (seeded by DbInitializer on first run).

## Architecture

### Solution Structure

Three .NET 8 projects:

```
server/
├── Magav.Common/     # Shared: Models, DbHelper ORM wrapper, extensions, Excel utilities
├── Magav.Server/     # Business logic: Services, Repositories, SMS subsystem
└── Magav.Api/        # Entry point: Program.cs (Minimal API endpoints, DI, middleware)
```

- `Magav.Api` references both `Magav.Server` and `Magav.Common`
- `Magav.Server` references `Magav.Common`
- All entity/model classes go in `Magav.Common/Models/` (namespace `Magav.Common.Models`)
- Request/response DTOs are defined as records at the bottom of `Program.cs`

### Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Backend:** ASP.NET 8 with Minimal APIs
- **Database:** SQLCipher (encrypted SQLite) with WAL mode + 30s busy timeout
- **ORM:** NPoco via custom `DbHelper` wrapper
- **Styling:** Tailwind CSS + Shadcn/UI (Radix primitives)
- **Forms:** React Hook Form + Zod validation (used in AuthScreen, UserDialog, ChangePasswordDialog, VolunteerSmsApprovalPage)
- **Data fetching:** `useState` + `useEffect` with direct service calls (TanStack Query provider is set up but not actively used)
- **Toast notifications:** Sonner (`toast` from `sonner`)
- **PWA:** vite-plugin-pwa with service worker

### Client Key Directories

```
client/src/
├── components/
│   ├── ui/              # Shadcn/UI components (modified: switch.tsx, dialog.tsx for RTL)
│   ├── layout/          # Header, Sidebar, SubNavigation, menuItems
│   ├── AdminLayout.tsx  # Main layout wrapper with resizable panels
│   └── AuthScreen.tsx   # Username/password login form (uses RHF + Zod)
├── services/
│   ├── api/BaseApiClient.ts  # HTTP client with auth headers + token management
│   └── *.ts                  # Domain service classes extending BaseApiClient
├── pages/               # Page components rendered by Index.tsx
│   └── components/      # Shared page sub-components (e.g. DayGroupConfigCard)
├── hooks/               # Custom hooks (use-mobile, use-toast)
├── config/auth.ts       # API base URL configuration
└── lib/utils.ts         # Tailwind cn() helper
```

### TypeScript Configuration

The project uses relaxed TypeScript settings:
- `strictNullChecks: false`
- `noImplicitAny: false`

These are set in `tsconfig.json` and affect how null/undefined and untyped values are handled.

### Database Layer

**DbHelper** wraps NPoco and provides async CRUD operations. Key method names (these differ from NPoco defaults):
- `FetchAsync<T>(expression)` — query with lambda predicate
- `FetchAsync<T>(sql, args)` — raw SQL with parameterized args (`@0`, `@1`, ...)
- `FetchAllAsync<T>()` — all rows (no-argument; use this, NOT `FetchAsync<T>()` with 0 args)
- `InsertAsync<T>`, `UpdateAsync<T>`, `DeleteAsync<T>` — standard CRUD
- `ExecuteQueryAsync(sql, args)` — raw SQL execution (NOT `ExecuteAsync`)
- `ExecuteScalarAsync<T>(sql, args)` — scalar queries
- `SingleOrDefaultByIdAsync<T>(id)` — by primary key

**Repository pattern**: `Repository<T>` base class provides virtual CRUD methods. Specialized repositories in `Magav.Server/Database/Repositories/` add domain-specific queries.

**MagavDbManager**: Scoped (per-request) facade with lazy-initialized repository properties:
```csharp
db.Users             // UsersRepository
db.Volunteers        // VolunteersRepository
db.Shifts            // ShiftsRepository
db.SmsLog            // SmsLogRepository
db.SchedulerConfig   // SchedulerConfigRepository
db.SchedulerRunLog   // SchedulerRunLogRepository
db.Db                // Direct DbHelper for raw SQL
```

### Routing & Navigation

**Two-tier routing:**

1. **React Router** (`App.tsx`) handles top-level routes:
   - `/` → `Index` (the admin SPA)
   - `/sms-approval/:accessKey` → `VolunteerSmsApprovalPage` (public page, no auth)
   - `*` → `NotFound`

2. **State-based navigation** inside the admin app (`Index.tsx`):
   - `activeSubItem` state determines which page component renders
   - Menu items defined in `components/layout/menuItems.ts` with `requiredRoles` filtering
   - Not URL-based — no browser back/forward for internal pages

**To add a new admin page:**
1. Create component in `pages/`
2. Add menu item in `menuItems.ts` (with `requiredRoles` if needed)
3. Add `case` in `Index.tsx` `renderContent()` switch

### Authentication & Authorization

**JWT flow:**
- Login returns `accessToken` (15min), `refreshToken` (7 days), and `user` object
- Refresh tokens stored as SHA256 hashes server-side, rotated on each refresh
- `BaseApiClient` auto-attaches `Authorization: Bearer {token}` header
- Account lockout after 5 failed attempts (15 min)

**Roles** (case-sensitive strings): `"Admin"`, `"SystemManager"`, `"User"`

**Authorization policies** (defined in Program.cs):
- `"AdminOnly"` — Admin role only
- `"CanManageMessages"` — Admin + SystemManager
- `"CanImportVolunteers"` — Admin + SystemManager

**User object in localStorage** (key: `"user"`):
```typescript
{
  id: string;
  name: string;
  roles: string[];    // Array, e.g. ["Admin"] — NOT a single string
  permissions: Record<string, any>;
}
```

**Important:** The role field is `user.roles` (string array), not `user.role`. Always check with `roles.includes("Admin")`.

### API Integration

- All API responses wrapped in `ApiResponse<T>` with `success`, `data`, `message` fields
- Auth tokens stored in localStorage: `accessToken`, `refreshToken`, `user`
- File uploads use `postFormData()` with `X-Requested-With: XMLHttpRequest` CSRF header

**Intentionally public endpoints (no auth required):**
- `POST /api/auth/login`, `POST /api/auth/refresh`
- `GET /api/health`
- `POST /api/public/sms-approval/{accessKey}/*` (rate-limited, 3 req/5 min)

### Error Handling Pattern

```csharp
catch (Exception ex)
{
    Console.Error.WriteLine($"Error context: {ex}");  // Full details server-side only
    return Results.Json(
        ApiResponse<object>.Fail("אירעה שגיאה"),       // Generic Hebrew message to client
        statusCode: StatusCodes.Status500InternalServerError);
}
```

Never include exception messages, stack traces, DB column names, internal paths, or user IDs in API error responses.

### File Upload Validation Pattern

All file upload endpoints must follow this pattern (see volunteers/shifts import):
1. **CSRF header**: Require `X-Requested-With: XMLHttpRequest`
2. **File existence + size**: Max 10MB
3. **Extension**: `.xlsx` or `.xls` only
4. **Magic bytes**: ZIP signature (`0x50 0x4B`) or OLE signature (`0xD0 0xCF`)
5. Process in memory via `MemoryStream` — never save to disk

### SMS Scheduler Subsystem

Background service that sends shift reminders to volunteers. Lives in `Magav.Server/Services/Sms/`:

- **ISmsProvider** — Interface for SMS sending
- **InforUMobileSmsProvider** — InforUMobile XML API implementation (registered via `AddHttpClient<ISmsProvider, InforUMobileSmsProvider>`)
- **SmsSchedulerService** — `BackgroundService` polling every 60s, uses `IServiceScopeFactory` to resolve scoped services
- **SmsReminderService** — Scoped service that queries eligible shifts, builds messages from templates, sends SMS, logs results

**Key design decisions:**
- Cross-platform timezone: `OperatingSystem.IsWindows() ? "Israel Standard Time" : "Asia/Jerusalem"`
- Duplicate prevention: `SmsLog` table with `ReminderType` column — allows both Advance and SameDay reminders per shift
- Race condition prevention: `UNIQUE(ConfigId, TargetDate, ReminderType)` on `SchedulerRunLog`
- Template placeholders: `{שם}`, `{שם מלא}`, `{תאריך}`, `{יום}`, `{משמרת}`, `{רכב}`

### DI Registration Patterns

In `Program.cs`:
```csharp
builder.Services.AddSingleton<DbInitializer>();                              // DB init, singleton
builder.Services.AddScoped<MagavDbManager>(...);                             // Per-request DB access
builder.Services.AddScoped<AuthService>(...);                                // Per-request auth
builder.Services.AddScoped<SmsReminderService>();                            // Per-scope SMS logic
builder.Services.AddHttpClient<ISmsProvider, InforUMobileSmsProvider>(...);   // Transient via factory
builder.Services.AddHostedService<SmsSchedulerService>();                    // Singleton background service
```

The `SmsSchedulerService` (singleton) resolves scoped services via `IServiceScopeFactory.CreateScope()`.

### Public Pages (Access Key Pattern)

The SMS approval page (`/sms-approval/:accessKey`) is a public route that does not require authentication. Instead, it uses a secret access key configured in `appsettings.json` under `PublicPages:SmsApprovalAccessKey`. The server validates this key on every request. Rate limiting (3 requests/5 min per IP) is applied via `RequireRateLimiting("sms-approval")`.

### RTL/Hebrew Considerations

- All components use `dir="rtl"` and Hebrew font (Noto Sans Hebrew)
- CSS uses RTL-aware flexbox positioning
- Error messages and labels are in Hebrew
- **Dialog close buttons (X):** Must be positioned on the LEFT side (`left-4`) not the right, since RTL reverses the expected close button position. The Shadcn/UI `dialog.tsx` has been modified to reflect this.
- **Directional UI primitives:** Components that use CSS `translate-x` for positioning (e.g., Switch thumb) break in RTL because the browser mirrors the entire component, causing the transform to move in the wrong direction. Fix: add `dir="ltr"` to the component root so it renders in a fixed LTR context. The Shadcn/UI `switch.tsx` has been modified with this fix. Apply the same pattern to any new components using directional transforms.

## Shift Schedule Excel File Format

The system processes volunteer shift schedule Excel files (`.xlsx`). These files contain weekly patrol/shift assignments for volunteer teams. Input files are placed in the `input/` directory.

### File Structure

- **Sheets:** 1 or more sheets per file. Each sheet typically covers a month (e.g., "1.26" = January 2026). **All sheets must be parsed.**
- **Relevant columns:** Only columns **A through G** (7 days of the week, Sunday through Saturday).
- **Row 1:** Title header row ("תוכנית פעילות מתמי״ד") — ignore during parsing.

### Weekly Block Layout

Each sheet contains multiple **weekly blocks** stacked vertically, separated by empty rows:

```
Row 1:  [Date Sun] [Date Mon] [Date Tue] [Date Wed] [Date Thu] [Date Fri] [Date Sat]
Row 2:  [Day-of-week indicators — 1900-era Excel serial dates]
Row 3:  [Empty separator]
--- Team Block (6 rows each, back-to-back, no separator between teams) ---
Row 4:  [Shift/team name — same value across all 7 columns]
Row 5:  [Car number — same value across all 7 columns]
Row 6-9: [4 volunteer name rows, some cells may be empty]
--- Next Team Block ---
...
[Empty rows before next weekly block]
```

Each team block is exactly **6 rows** (name + car + 4 volunteers). There are typically **4 teams per weekly block**.

### Reading Shift Data

Each column (A-G) = a day (A=Sunday ... G=Saturday). To extract a shift for a date:
1. Find the dates row containing that date
2. Read down that column within each team block: team name, car number, volunteer names (4 slots)

### Day-of-Week Row Encoding

Uses Excel serial dates from 1900: `01/01/1900` = Sunday through `07/01/1900` = Saturday.

### Parsing Notes

- Team names and car numbers may vary between files — always read from data, never hardcode
- Some blocks have team structure but empty volunteer slots (unassigned weeks)
- Each team always has exactly 4 volunteer rows (some cells may be empty)

## Production Deployment (Ubuntu Server)

### Server Layout

```
/opt/magav/
├── server/          # .NET published output (Magav.Api.dll + dependencies)
│   └── appsettings.json  # Production config (secrets, real credentials)
├── client/          # Vite production build (static files)
└── db/              # SQLCipher database (magav.db, auto-created on first run)
```

### Publishing

**Server** (from Windows, targets Linux):
```bash
cd server/Magav.Api
dotnet publish -c Release -r linux-x64 --self-contained false -o ../../publish/server
```

**Client:**
```bash
cd client
npm run build
# Copy client/dist/* to publish/client/
```

**Copy to server:**
```bash
scp -r publish/* user@server-ip:/tmp/magav-deploy/
# Then on server: sudo cp -r /tmp/magav-deploy/server/* /opt/magav/server/
# And: sudo cp -r /tmp/magav-deploy/client/* /opt/magav/client/
```

### Runtime

- **Runtime:** .NET 8 ASP.NET Core Runtime (`aspnetcore-runtime-8.0`)
- **Process manager:** systemd (`/etc/systemd/system/magav.service`)
- **Reverse proxy:** Nginx serves client static files and proxies `/api/` to `http://localhost:5015`
- **Service user:** `www-data`

### systemd Service

```ini
[Unit]
Description=Magav API Server
After=network.target

[Service]
WorkingDirectory=/opt/magav/server
ExecStart=/usr/bin/dotnet /opt/magav/server/Magav.Api.dll
Restart=always
RestartSec=10
Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=DOTNET_PRINT_TELEMETRY_MESSAGE=false
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

### Nginx Config

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    root /opt/magav/client;
    index index.html;

    location /api/ {
        proxy_pass http://localhost:5015;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection keep-alive;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Common Server Commands

```bash
sudo systemctl restart magav       # Restart after deploy
sudo systemctl status magav        # Check status
sudo journalctl -u magav -f        # Tail logs
sudo chown -R www-data:www-data /opt/magav  # Fix permissions after deploy
```

### Database Reset

To recreate the database with fresh schema (e.g., after schema changes), delete the DB file and restart:
```bash
sudo rm /opt/magav/db/magav.db
sudo systemctl restart magav
```
The `DbInitializer` will recreate all tables and seed default data on startup.
