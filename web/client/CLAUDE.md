<!-- DEEPINIT:START (managed — regenerated on each `deep-init` run; edit OUTSIDE these markers) -->
# web-client — scoped context

React 18 + TypeScript + Vite SPA (source in `src/`), Tailwind + Shadcn/UI, RHF + Zod, Sonner, PWA. The SAME build is served by the .NET API and loaded in the Android WebView. Hebrew/RTL throughout. Full detail → `.ai/docs/components/web-client.md`.

## Critical to know
- **`user.roles` is a string ARRAY** (`["Admin"]`), NOT `user.role` — always `roles.includes("Admin")`. localStorage keys: `accessToken`, `refreshToken`, `user`. `services/api/BaseApiClient.ts` auto-attaches the bearer + refreshes on 401; domain services extend it.
- **Two-tier routing:** `App.tsx` (React Router) handles only public/top-level routes; internal navigation is **state-based** in `pages/Index.tsx` (`activeSubItem` → `renderContent()` switch), gated by `components/layout/menuItems.ts` `requiredRoles` — NOT URL-based.
- **Public SMS-approval page is wired** — `App.tsx:25` registers `/sms-approval/:accessKey` → `VolunteerSmsApprovalPage` (the only React-Router route besides `/` and `*`). Fixed in `2989b01`, which also deleted the orphan `RevokeSmsApprovalPage.tsx` (it had called a nonexistent `volunteersService.revokeSmsApproval`). [ISS-001/002 resolved]
- **RTL gotchas:** dialog X on the LEFT (`left-4`); `Switch` needs `dir="ltr"` to fix transform-mirroring (`components/ui/switch.tsx`); **Android WebView does NOT move `position:fixed` for the soft keyboard** → dialogs are TOP-aligned + scrollable with big bottom padding + `scrollIntoView`; do NOT use `dvh`/`svh`, `visualViewport`, or bottom-sheets (`components/ui/dialog.tsx`).
- `components/ui/*` is **vendored Shadcn/UI** (only `switch.tsx`/`dialog.tsx` are RTL-modified) — not first-party logic.
- **Two shift-management pages, two group keys.** `ShiftsManagementPage` (משמרות מבצעיות) groups by `(date, shiftName, carId)`; `AdminShiftsPage` (משמרות מנהליות) groups by `(date, shiftTime, description)` and sends the OLD triple on edit (editing re-buckets). Adding volunteers while editing is deliberately two calls — `update-group`, then a create-`POST` for the whole group — which is safe only because the server skips volunteers already in the group.
- **`LocationsManagementPage` is ONE component mounted twice** (`Index.tsx`: `locations-management` → `Vehicle`, `general-locations` → `General`). It passes the page's type for CREATE but the **row's own** `locationType` for EDIT, so a row is never re-bucketed by being edited from the "wrong" page.
- **SMS status is three-valued.** `Dispatched` ("שוגר (ללא אישור מסירה)") renders with the `warning` Badge variant — **never** `destructive`; manual/admin sends surface the server's returned Hebrew note rather than a fixed success string. Showing a delivered-but-unconfirmed SMS as failed is what drove the 2026-08 manual-resend incident.
- Relaxed TS (`strictNullChecks:false`, `noImplicitAny:false`). TanStack Query is wired up but **not actively used** (data fetching is `useState`+`useEffect` + direct service calls). Largest pages: `pages/ShiftsManagementPage.tsx` (1162 LOC), `pages/AdminShiftsPage.tsx` (587).
- This client is one of three independent implementations of the same REST contract (.NET api + Android Ktor). [ISS-004]
<!-- DEEPINIT:END -->
