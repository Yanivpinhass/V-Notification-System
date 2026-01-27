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

### RTL/Hebrew Considerations

- All components use `dir="rtl"` and Hebrew font (Noto Sans Hebrew)
- CSS uses RTL-aware flexbox positioning
- Error messages and labels are in Hebrew
