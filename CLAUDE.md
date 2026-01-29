# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Megav is a Hebrew RTL admin system with a React frontend client. The UI is in Hebrew with right-to-left layout.

## Security First

**Security is the top priority for this project.** All code changes must prioritize security above all else:
- Always validate and sanitize all inputs (client and server)
- Never trust client-side data
- Use parameterized queries - never concatenate SQL
- Implement proper authentication and authorization checks
- Encrypt sensitive data at rest and in transit
- Follow OWASP security guidelines
- Review all dependencies for known vulnerabilities

## Development Commands

All commands should be run from the `client/` directory:

```bash
cd client
npm install       # Install dependencies
npm run dev       # Start dev server at http://localhost:8080
npm run build     # Production build
npm run lint      # Run ESLint
npm run preview   # Preview production build
```

## Architecture

### Tech Stack
- **Frontend:** React (latest stable) + TypeScript + Vite
- **Backend:** ASP.NET (latest stable) with Minimal APIs
- **API:** REST using ASP.NET Minimal API pattern
- **Database:** SQLCipher (encrypted SQLite)
- **Styling:** Tailwind CSS + Shadcn/UI (Radix primitives)
- **State:** TanStack React Query for server state, React useState for local state
- **Forms:** React Hook Form + Zod validation
- **Routing:** React Router DOM (single-page with state-based navigation)

### Key Directories

```
client/src/
├── components/
│   ├── ui/              # Shadcn/UI components (don't modify directly)
│   ├── layout/          # Header, Sidebar, SubNavigation, menuItems
│   ├── AdminLayout.tsx  # Main layout wrapper with resizable panels
│   └── AuthScreen.tsx   # Username/password login form
├── services/
│   ├── api/BaseApiClient.ts  # HTTP client with auth headers
│   └── authService.ts        # Authentication (login, logout, token refresh)
├── pages/               # Page components rendered by Index.tsx
├── hooks/               # Custom hooks (use-mobile, use-toast)
├── config/auth.ts       # API base URL configuration
└── lib/utils.ts         # Tailwind cn() helper
```

### Entity/Model Location

**All entity and model classes must be placed in `server/Magav.Common/Models/`** (namespace `Magav.Common.Models`). This includes database entities, DTOs, and parsed data models. This keeps models shared and accessible to both `Magav.Common` and `Magav.Server`.

### Navigation Pattern

This app uses **state-based navigation**, not URL routing. The `Index.tsx` page:
1. Shows `AuthScreen` if not authenticated
2. Shows `AdminLayout` with content based on `activeSubItem` state
3. Menu items are defined in `components/layout/menuItems.ts`

To add a new page:
1. Create component in `pages/`
2. Add menu item in `menuItems.ts`
3. Add case in `Index.tsx` `renderContent()` switch

### API Integration

- Client communicates with server via REST API (ASP.NET Minimal APIs)
- Backend expected at `http://localhost:5015` (proxied via `/api`)
- All API responses wrapped in `ApiResponse<T>` with `success`, `data`, `message` fields
- Auth tokens stored in localStorage (`accessToken`, `refreshToken`, `user`)
- `BaseApiClient` automatically adds Bearer token to requests

### API Endpoint Security

**CRITICAL: All new API endpoints MUST include `.RequireAuthorization()` unless they are intentionally public.**

```csharp
// Protected endpoint (default for all business endpoints)
app.MapGet("/api/users", async (MagavDbManager db) =>
{
    // ...
}).RequireAuthorization();

// Role-restricted endpoint
app.MapDelete("/api/users/{id}", async (int id) =>
{
    // ...
}).RequireAuthorization(policy => policy.RequireRole("Admin"));
```

**Intentionally public endpoints (no auth required):**
- `POST /api/auth/login` - Users must be able to login
- `POST /api/auth/refresh` - Token refresh before expiry
- `GET /api/health` - Health checks for monitoring

### Error Handling - No Sensitive Data Exposure

**CRITICAL: Never expose exception details or sensitive data in API error responses.**

Error messages returned to the UI must NOT include:
- Exception messages or stack traces
- Database column names, table structures, or query details
- User IDs, volunteer IDs, or other identifying information
- Internal system paths, configuration, or implementation details

**Required pattern for all API endpoints:**
```csharp
catch (Exception ex)
{
    // Log full details SERVER-SIDE ONLY (for debugging)
    Console.Error.WriteLine($"Error: {ex}");

    // Return GENERIC message to client - no technical details
    return Results.Json(
        ApiResponse<object>.Fail("אירעה שגיאה"),  // Generic Hebrew error
        statusCode: StatusCodes.Status500InternalServerError);
}
```

**Why `Results.Json` instead of `Results.Problem`:**
- `Results.Problem()` can include exception details in development mode
- `Results.Json()` with explicit ApiResponse ensures consistent, safe responses

### RTL/Hebrew Considerations

- All components use `dir="rtl"` and Hebrew font (Noto Sans Hebrew)
- CSS uses RTL-aware flexbox positioning
- Error messages and labels are in Hebrew
- **Dialog close buttons (X):** Must be positioned on the LEFT side (`left-4`) not the right, since RTL reverses the expected close button position. The Shadcn/UI dialog component has been modified to reflect this.

## Shift Schedule Excel File Format (תוכנית מתמי"ד)

The system processes volunteer shift schedule Excel files (`.xlsx`). These files contain weekly patrol/shift assignments for volunteer teams. Input files are placed in the `input/` directory.

### File Structure

- **Sheets:** A file can have 1 or more sheets. Each sheet typically covers a month (e.g., sheet "1.26" = January 2026, "2.26" = February 2026). **All sheets must be parsed.**
- **Relevant columns:** Only columns **A through G** (7 columns = 7 days of the week, Sunday through Saturday).
- **Row 1:** Title header row — contains "תוכנית פעילות מתמי״ד" (can be ignored during parsing).

### Weekly Block Layout

Each sheet contains multiple **weekly blocks** stacked vertically, separated by empty rows. Each weekly block has this structure:

```
Row 1:  [Date Sun] [Date Mon] [Date Tue] [Date Wed] [Date Thu] [Date Fri] [Date Sat]
Row 2:  [Day-of-week indicators — stored as 1900-era dates, represent יום א through יום ש]
Row 3:  [Empty separator]
--- Team Block 1 (e.g., מרחבים 221) ---
Row 4:  [Shift/team name — same value repeated across all 7 columns]
Row 5:  [Car number — same value repeated across all 7 columns]
Row 6:  [Volunteer 1 name or empty] × 7 columns
Row 7:  [Volunteer 2 name or empty] × 7 columns
Row 8:  [Volunteer 3 name or empty] × 7 columns
Row 9:  [Volunteer 4 name or empty] × 7 columns
--- Team Block 2 (e.g., מרחבים 222) — starts immediately, no separator ---
Row 10: [Shift/team name]
Row 11: [Car number]
Row 12-15: [4 volunteer rows]
--- Team Block 3 (e.g., מרחבים 211) ---
Row 16: [Shift/team name]
Row 17: [Car number]
Row 18-21: [4 volunteer rows]
--- Team Block 4 (e.g., מרחבים 212) ---
Row 22: [Shift/team name]
Row 23: [Car number]
Row 24-27: [4 volunteer rows]
[Empty rows before next weekly block]
```

Each team block is exactly **6 rows** (name + car + 4 volunteers), and teams follow **back-to-back with no separators** between them.

### How to Read a Team's Shift for a Specific Date

Each **column** (A-G) represents a specific **day of the week**:
- Column A = Sunday (יום א)
- Column B = Monday (יום ב)
- Column C = Tuesday (יום ג)
- Column D = Wednesday (יום ד)
- Column E = Thursday (יום ה)
- Column F = Friday (יום ו)
- Column G = Saturday (שבת)

To extract shift data for a specific date:
1. Find the **dates row** where that date appears — the column it's in determines the day
2. Within the same weekly block, for each team block read **vertically down that column**:
   - **Team/shift name** (e.g., "מרחבים 221")
   - **Car number** (e.g., "21-850")
   - **Volunteer names** (exactly 4 rows below the car number; some cells may be empty)

### Per-Day Shift Record

For each day, there are **4 teams**. Each team's shift record contains:

| Field | Description | Example |
|-------|-------------|---------|
| **Date** | The calendar date from the dates row | 01/02/2026 |
| **Day of week** | Derived from column position (A=Sun...G=Sat) | יום א |
| **Shift/team name** | Patrol area identifier | מרחבים 221 |
| **Car number** | Vehicle assignment | 21-850 |
| **Volunteers** | Exactly 4 cells (some may be empty) | ארז וייל, ליאור אסחייק, מוטי עטיה, אוריין הראל |

### Day-of-Week Row Encoding

The day-of-week row uses Excel serial dates from 1900:
- `01/01/1900` = יום א (Sunday)
- `02/01/1900` = יום ב (Monday)
- `03/01/1900` = יום ג (Tuesday)
- `04/01/1900` = יום ד (Wednesday)
- `05/01/1900` = יום ה (Thursday)
- `06/01/1900` = יום ו (Friday)
- `07/01/1900` = שבת (Saturday)

### Known Station/Team Names and Car Numbers

| Team Name | Car Number |
|-----------|------------|
| מרחבים 221 | 21-850 |
| מרחבים 222 | 21-176 |
| מרחבים 211 | 21-174 |
| מרחבים 212 | 21-851 |

**Note:** Team names and car numbers may vary between files. Always read them from the Excel data rather than hardcoding.

### Parsing Notes

- Some weekly blocks may have the team structure (name + car number rows) but **empty volunteer slots** — this means no volunteers are assigned yet for those weeks.
- Each team always has exactly **4 volunteer rows**. Not all cells in those rows will have names — empty cells mean no volunteer is assigned for that day in that slot.
- The number of sheets and weeks per sheet can vary between files.
