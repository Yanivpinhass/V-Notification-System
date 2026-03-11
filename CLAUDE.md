# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Magav is a Hebrew RTL volunteer shift management and SMS reminder system. It manages volunteer patrol shifts, sends SMS reminders, and provides admin tools for user/volunteer/shift management. The UI is entirely in Hebrew with right-to-left layout.

The system has two deployment targets:
1. **Web** — .NET 8 backend + React frontend, deployed to Ubuntu server
2. **Android** — Kotlin app with embedded Ktor server + WebView, sends SMS natively via Android SmsManager

Both targets share the same React frontend.

## Repository Structure

```
├── web/
│   ├── client/          # React 18 + TypeScript + Vite frontend
│   └── server/          # .NET 8 Minimal API backend (3 projects)
├── android/             # Kotlin Android app (Ktor server + Room DB + native SMS)
├── build-apk.bat        # Builds React → copies to android assets → builds APK
├── input/               # Shift schedule Excel files for import
└── db/                  # Local SQLCipher database (web dev)
```

## Security First

**Security is the top priority.** Key rules:
- Use parameterized queries only (`@0`, `@1`, ... for .NET; Room `@Query` params for Android) — never concatenate SQL
- All new API endpoints MUST include `.RequireAuthorization()` (.NET) or `authenticate("auth-bearer")` (Ktor) unless intentionally public
- Never expose exception details in API responses — use generic Hebrew error messages
- Use `Results.Json()` with `ApiResponse<T>` instead of `Results.Problem()` (which can leak details in dev mode)
- File uploads require CSRF header check, extension validation, and magic byte verification
- Validate all inputs server-side even if validated client-side

## Development Commands

### Web Client (from `web/client/`)
```bash
cd web/client
npm install       # Install dependencies
npm run dev       # Start dev server at http://localhost:8080
npm run build     # Production build
npm run lint      # Run ESLint
```

### Web Server (from `web/server/Magav.Api/`)
```bash
cd web/server/Magav.Api
dotnet build      # Build server
dotnet run        # Run server at http://localhost:5015
```

Both must run simultaneously for web development. Vite proxies `/api/*` requests to `localhost:5015`.

### Android App
```bash
# Full build: React → Android assets → APK
build-apk.bat

# Install to connected device
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

The build script: (1) builds React in `web/client/`, (2) copies `dist/` to `android/app/src/main/assets/web/`, (3) runs `gradlew assembleDebug`.

There are no automated tests in this project.

**Default dev credentials:** username `admin`, password `Admin123!` (.NET) or `12345` (Android seeded by DatabaseInitializer).

## Web Architecture

### .NET Solution Structure

Three .NET 8 projects under `web/server/`:

```
web/server/
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
web/client/src/
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

### Database Layer (.NET)

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

### SMS Scheduler Subsystem (.NET)

Background service that sends shift reminders to volunteers. Lives in `Magav.Server/Services/Sms/`:

- **ISmsProvider** — Interface for SMS sending
- **InforUMobileSmsProvider** — InforUMobile XML API implementation (registered via `AddHttpClient<ISmsProvider, InforUMobileSmsProvider>`)
- **SmsSchedulerService** — `BackgroundService` polling every 60s, uses `IServiceScopeFactory` to resolve scoped services
- **SmsReminderService** — Scoped service that queries eligible shifts, builds messages from templates, sends SMS, logs results

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

## Android Architecture

### Hybrid Mobile-Server Design

The Android app embeds a **Ktor HTTP server** (port 5015, localhost only) inside a foreground service. A WebView loads the same React UI from `http://localhost:5015`. The Ktor server serves both the static web files and REST API endpoints, mirroring the .NET API surface.

### Key Components

```
android/app/src/main/java/com/magav/app/
├── MagavApplication.kt          # App init: notification channel, SQLCipher DB, Koin DI
├── MainActivity.kt              # WebView host, permissions, waits for server startup
├── MagavServerService.kt        # Foreground service: starts Ktor, inits DB, schedules alarms
├── api/
│   ├── KtorServer.kt            # Ktor app: ContentNegotiation, CORS, JWT auth, routes, static files
│   ├── auth/JwtConfig.kt        # JWT token generation/validation (HMAC256)
│   ├── models/                   # ApiResponse<T>, request/response DTOs
│   └── routes/                   # Route files mirroring .NET endpoints
├── db/
│   ├── MagavDatabase.kt          # Room database (SQLCipher encrypted)
│   ├── DatabaseInitializer.kt    # Seeds admin user + scheduler configs
│   ├── entity/                   # Room entities (User, Volunteer, Shift, SmsLog, etc.)
│   └── dao/                      # Room DAOs
├── scheduler/
│   ├── AlarmScheduler.kt         # Schedules exact alarms per config + day group
│   ├── SmsSchedulerWorker.kt     # WorkManager worker: executes SMS sending
│   ├── SmsAlarmReceiver.kt       # Broadcast receiver: alarm → enqueue worker
│   └── BootReceiver.kt           # Re-schedules alarms on device boot
├── service/
│   ├── AuthService.kt            # Login, token refresh, password management
│   ├── SmsReminderService.kt     # Core SMS logic: query shifts, build messages, send, log
│   ├── ShiftsImportService.kt    # Excel import + volunteer name matching
│   └── ShiftScheduleParser.kt    # Apache POI Excel parsing
└── sms/
    ├── SmsProvider.kt            # Interface
    └── AndroidSmsProvider.kt     # Native SmsManager: Mutex-serialized, 15s timeout, broadcast receiver
```

### Android Tech Stack

- **Language:** Kotlin 1.9.22, Java 17
- **HTTP Server:** Ktor 2.3.12 (CIO engine)
- **Database:** Room 2.6.1 + SQLCipher 4.5.4 (encrypted with key in EncryptedSharedPreferences)
- **DI:** Koin 3.5.6
- **Excel parsing:** Apache POI 5.2.5
- **Background work:** AlarmManager (exact alarms) + WorkManager
- **SMS:** Android SmsManager (native, supports dual SIM via subscription ID)
- **Min SDK:** 29, Target SDK: 35

### Android SMS Flow

1. **SchedulerConfig** in DB defines: day group (SunThu/Fri/Sat), reminder type (SameDay/Advance), trigger time, days before shift, message template
2. **AlarmScheduler** schedules exact alarms (Israel timezone) for each enabled config
3. **SmsAlarmReceiver** → enqueues **SmsSchedulerWorker** via WorkManager
4. Worker queries eligible shifts, checks volunteer approval + phone + dedup via SmsLog, builds message from template (placeholders: `{שם}`, `{תאריך}`, `{יום}`, `{משמרת}`, `{רכב}`), calls **AndroidSmsProvider**
5. AndroidSmsProvider sends via SmsManager with Mutex serialization, logs result

### Android Settings (AppSetting table)

- `sms_sim_subscription_id`: Which SIM card to use (-1 = system default)
- Secrets (DB passphrase, JWT key) stored in EncryptedSharedPreferences (AES256-GCM)

### Android Permissions

`SEND_SMS`, `READ_PHONE_STATE`, `RECEIVE_BOOT_COMPLETED`, `FOREGROUND_SERVICE`, `SCHEDULE_EXACT_ALARM`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`

## Shared Design Decisions

- **Timezone:** Israel Standard Time (Windows) / Asia/Jerusalem (Linux/Android)
- **Duplicate SMS prevention:** SmsLog table indexed on (ShiftId, ReminderType); SchedulerRunLog UNIQUE on (ConfigId, TargetDate, ReminderType)
- **Template placeholders:** `{שם}`, `{שם מלא}`, `{תאריך}`, `{יום}`, `{משמרת}`, `{רכב}`

### RTL/Hebrew Considerations

- All components use `dir="rtl"` and Hebrew font (Noto Sans Hebrew)
- CSS uses RTL-aware flexbox positioning
- Error messages and labels are in Hebrew
- **Dialog close buttons (X):** Must be positioned on the LEFT side (`left-4`) not the right, since RTL reverses the expected close button position. The Shadcn/UI `dialog.tsx` has been modified to reflect this.
- **Directional UI primitives:** Components that use CSS `translate-x` for positioning (e.g., Switch thumb) break in RTL because the browser mirrors the entire component, causing the transform to move in the wrong direction. Fix: add `dir="ltr"` to the component root so it renders in a fixed LTR context. The Shadcn/UI `switch.tsx` has been modified with this fix. Apply the same pattern to any new components using directional transforms.

## Shift Schedule Excel File Format

The system processes volunteer shift schedule Excel files (`.xlsx`). Input files are placed in the `input/` directory.

### File Structure

- **Sheets:** 1 or more per file. Each sheet typically covers a month (e.g., "1.26" = January 2026). **All sheets must be parsed.**
- **Relevant columns:** Only columns **A through G** (7 days, Sunday through Saturday).
- **Row 1:** Title header row — ignore during parsing.

### Weekly Block Layout

```
Row 1:  [Date Sun] [Date Mon] [Date Tue] [Date Wed] [Date Thu] [Date Fri] [Date Sat]
Row 2:  [Day-of-week indicators — 1900-era Excel serial dates]
Row 3:  [Empty separator]
--- Team Block (6 rows each, back-to-back) ---
Row 4:  [Shift/team name — same value across all 7 columns]
Row 5:  [Car number — same value across all 7 columns]
Row 6-9: [4 volunteer name rows, some cells may be empty]
--- Next Team Block ---
```

Each team block is exactly **6 rows** (name + car + 4 volunteers). Typically **4 teams per weekly block**. Day-of-week row uses Excel serial dates from 1900 (`01/01/1900` = Sunday through `07/01/1900` = Saturday).

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
cd web/server/Magav.Api
dotnet publish -c Release -r linux-x64 --self-contained false -o ../../../publish/server
```

**Client:**
```bash
cd web/client
npm run build
# Copy web/client/dist/* to publish/client/
```

**Copy to server:**
```bash
scp -r publish/* user@server-ip:/tmp/magav-deploy/
# Then on server: sudo cp -r /tmp/magav-deploy/* /opt/magav/
```

### Runtime

- **Runtime:** .NET 8 ASP.NET Core Runtime (`aspnetcore-runtime-8.0`)
- **Process manager:** systemd (`/etc/systemd/system/magav.service`)
- **Reverse proxy:** Nginx serves client static files and proxies `/api/` to `http://localhost:5015`
- **Service user:** `www-data`

### Common Server Commands

```bash
sudo systemctl restart magav       # Restart after deploy
sudo systemctl status magav        # Check status
sudo journalctl -u magav -f        # Tail logs
sudo chown -R www-data:www-data /opt/magav  # Fix permissions after deploy
```

### Database Reset

Delete DB file and restart — `DbInitializer` recreates all tables and seeds default data:
```bash
sudo rm /opt/magav/db/magav.db
sudo systemctl restart magav
```