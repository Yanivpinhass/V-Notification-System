<!-- DeepInit Extract | Component: web-client
DeepInit C8 update | Run ID: deepinit-2026-06-30 | Generated: 2026-06-30 (FEATURE Auto-Callback-to-Gate, Android-only: new pages/CallbackSettingsPage.tsx + services/callbackConfigService.ts; menuItems 'callback-settings' + Index.tsx case; window.NativeMedia presence gate — web build renders a Hebrew "Android-app-only" notice; one more consumer of the Android-only Ktor surface GET/PUT /api/callback-config with NO .NET counterpart — ISS-004 new accepted divergence) · prior: deepinit-2026-06-25b (commit 778a2dd: Duty Log EDITABLE-HOURS preview — a שנה שעות toggle in the preview overlay overrides the report hours live; effectiveData={...data,startTime,endTime} feeds BOTH the on-screen report AND the PNG export; default seeds from data; export gated on valid times; + report column trim d09b23a) · prior: deepinit-2026-06-25 (commit 970cdcc: Duty Log (יומן הפעלה) client-only PNG report added — new features/duty-log/ shared module + DutyLogPage; html2canvas dep; window.NativeMedia consumer; cmdk installed but unused) · prior: deepinit-2026-06-24 (commit 2989b01: SMS-approval route wired, RevokeSmsApprovalPage.tsx deleted — ISS-001/002 resolved)
Input files processed (2026-06-30 update adds: pages/CallbackSettingsPage.tsx, services/callbackConfigService.ts, re-read pages/Index.tsx + components/layout/menuItems.ts + services/api/BaseApiClient.ts + lib/auth.ts): App.tsx, main.tsx, config/auth.ts, lib/utils.ts, lib/auth.ts, lib/hebrewDates.ts (glob only), pages/Index.tsx, components/layout/menuItems.ts, components/layout/types.ts, components/layout/Sidebar.tsx, components/layout/Header.tsx, components/AdminLayout.tsx, components/AuthScreen.tsx, components/ChangePasswordDialog.tsx, components/users/UserDialog.tsx, components/ui/switch.tsx, components/ui/dialog.tsx, services/api/BaseApiClient.ts, services/authService.ts, services/usersService.ts, services/volunteersService.ts, services/shiftsService.ts, services/smsLogService.ts, services/settingsService.ts, services/messageTemplateService.ts, services/locationsService.ts, services/jewishHolidaysService.ts, services/schedulerService.ts, services/volunteerSmsService.ts, pages/VolunteerSmsApprovalPage.tsx, pages/RevokeSmsApprovalPage.tsx, pages/SchedulerSettingsPage.tsx, pages/SmsSettingsPage.tsx, pages/AboutVersionPage.tsx, pages/VolunteersImportPage.tsx, pages/ShiftsManagementPage.tsx (partial), pages/scheduler/schedulerPreview.ts, pages/scheduler/ReminderRow.tsx, hooks/use-mobile.tsx
Generated: 2026-06-18 -->

# Component: web-client (`web/client/src/`)

## 1. Component Overview

**Purpose:** The single React SPA that is the entire Hebrew RTL admin UI for the Magav volunteer-shift / SMS-reminder system. The SAME built bundle is served two ways: by the .NET web backend (Nginx static files + `/api` proxy) and loaded inside a WebView by the Kotlin Android app from `http://localhost:5015`. UI is entirely Hebrew, right-to-left. `[HIGH]`

**Tech stack** (from imports observed): React 18 + TypeScript, Vite, Tailwind + Shadcn/UI (Radix primitives), React Hook Form + Zod (`@hookform/resolvers/zod`), Sonner toasts (`toast` from `sonner`), `@tanstack/react-query` (provider mounted but effectively unused — see §10), `react-router-dom` v6, `lucide-react` icons, `date-fns` + `date-fns/locale` `he`, `@fontsource/noto-sans-hebrew`. `[HIGH]` (`web/client/src/App.tsx:1-7`, `web/client/src/main.tsx:1-6`, `web/client/src/pages/ShiftsManagementPage.tsx:22-24`)

**Entry points:**
- `web/client/src/main.tsx:8` — `createRoot(...).render(<App />)` mounts to `#root`. `[HIGH]`
- `web/client/src/App.tsx:10-32` — providers (`QueryClientProvider`, `TooltipProvider`, two `Toaster`s) + `BrowserRouter` with exactly two routes. `[HIGH]`
- `web/client/src/pages/Index.tsx:27-124` — the authenticated admin shell; state-based internal navigation. `[HIGH]`

**Complexity:** Large for a frontend (~111 files / ~13.1k lines per task brief). Concentrated complexity in `pages/ShiftsManagementPage.tsx` (1135 lines, deep local-state machine) and vendored `components/ui/*`. `[MEDIUM]`

**Certainty:** Overall `[HIGH]` — read directly.

## 2. Features & Capabilities

| Feature (Hebrew label) | Entry point | Key source files | Certainty |
|---|---|---|---|
| Auth / login | `components/AuthScreen.tsx` | `AuthScreen.tsx`, `services/authService.ts` | `[HIGH]` |
| Forced password change | `components/ChangePasswordDialog.tsx` (rendered from `Index.tsx:116`) | `ChangePasswordDialog.tsx`, `authService.changePassword` | `[HIGH]` |
| Dashboard (placeholder) | `pages/PlaceholderPage.tsx` via `Index.tsx:63` (`dashboard` case) | `PlaceholderPage.tsx` | `[MEDIUM]` (not read; routed as `dashboard`/default) |
| Shifts management (משמרות) | `pages/ShiftsManagementPage.tsx` (`shifts-management`, the DEFAULT page — `Index.tsx:34`) | `ShiftsManagementPage.tsx`, `shiftsService.ts`, `volunteersService.ts`, `locationsService.ts`, `jewishHolidaysService.ts` | `[HIGH]` |
| Canceled shifts (משמרות מבוטלות) | `pages/CanceledShiftsPage.tsx` (`canceled-shifts`) | `CanceledShiftsPage.tsx`, `shiftsService.getCanceledShifts` | `[MEDIUM]` (routed `Index.tsx:87`; service confirmed) |
| Shifts import (קליטת קובץ משמרות) | `pages/ShiftsImportPage.tsx` (`shifts-import`) | `ShiftsImportPage.tsx`, `shiftsService.uploadShiftsFile` | `[MEDIUM]` (service confirmed `shiftsService.ts:63`) |
| Volunteers management (ניהול מתנדבים) | `pages/VolunteersManagementPage.tsx` (`volunteers-management`) | `VolunteersManagementPage.tsx`, `volunteersService.ts`, `components/volunteers/VolunteerDialog.tsx`, `DeleteVolunteerDialog.tsx` | `[MEDIUM]` |
| Volunteers import (קליטת קובץ מתנדבים) | `pages/VolunteersImportPage.tsx` (`volunteers-import`) | `VolunteersImportPage.tsx`, `volunteersService.uploadVolunteersFile`, `components/ui/file-dropzone.tsx` | `[HIGH]` |
| Locations / car parking (מיקומי ניידות) | `pages/LocationsManagementPage.tsx` (`locations-management`) | `LocationsManagementPage.tsx`, `locationsService.ts`, `components/locations/LocationDialog.tsx`, `DeleteLocationDialog.tsx` | `[MEDIUM]` |
| Scheduler settings (הגדרות תזמון) | `pages/SchedulerSettingsPage.tsx` (`scheduler-settings`) | `SchedulerSettingsPage.tsx`, `pages/scheduler/ReminderRow.tsx`, `ReminderEditModal.tsx`, `schedulerPreview.ts`, `schedulerService.ts`, `messageTemplateService.ts`, `lib/auth.ts` | `[HIGH]` |
| Scheduler run log (היסטוריית הרצות) | `pages/SchedulerRunLogPage.tsx` (`scheduler-run-log`) | `SchedulerRunLogPage.tsx`, `schedulerService.getRunLog` | `[MEDIUM]` |
| SMS settings (הגדרות SMS) — SIM info + test SMS | `pages/SmsSettingsPage.tsx` (`sms-settings`) | `SmsSettingsPage.tsx`, `settingsService.ts` | `[HIGH]` |
| Message templates (הגדרות הודעות) | `pages/MessageTemplatesPage.tsx` (`message-templates`) | `MessageTemplatesPage.tsx`, `messageTemplateService.ts` | `[MEDIUM]` |
| Holidays (חגים) | `pages/JewishHolidaysPage.tsx` (`jewish-holidays`) | `JewishHolidaysPage.tsx`, `jewishHolidaysService.ts`, `components/jewish-holidays/*` | `[MEDIUM]` |
| SMS logs (יומן שליחת הודעות) | `pages/SmsLogsPage.tsx` (`sms-logs`) | `SmsLogsPage.tsx`, `smsLogService.getLogs` | `[MEDIUM]` |
| SMS summary by team (סיכום שליחה לפי צוות) | `pages/SmsLogSummaryPage.tsx` (`sms-summary`) | `SmsLogSummaryPage.tsx`, `smsLogService.getSummary` | `[MEDIUM]` |
| Users management (משתמשי מערכת) | `pages/SystemUsersPage.tsx` (`system-users`, Admin-only) | `SystemUsersPage.tsx`, `usersService.ts`, `components/users/UserDialog.tsx`, `DeleteUserDialog.tsx` | `[HIGH]` |
| About / version (גרסה) | `pages/AboutVersionPage.tsx` (`about-version`) | `AboutVersionPage.tsx` (hits `/api/health`) | `[HIGH]` |
| Public SMS approval (אישור קבלת הודעות SMS) | `pages/VolunteerSmsApprovalPage.tsx` | `VolunteerSmsApprovalPage.tsx`, `services/volunteerSmsService.ts` | `[HIGH]` **wired** at `App.tsx:25` → `/sms-approval/:accessKey` (`2989b01`; ISS-001 resolved) |
| **Duty Log (יומן הפעלה) — client-only PNG report** | `pages/DutyLogPage.tsx` (`duty-log`, role `['Admin','SystemManager']`) **AND** a per-team button on `ShiftsManagementPage` | `features/duty-log/*` (shared module), `pages/DutyLogPage.tsx`, `components/layout/menuItems.ts` (`reports`→`duty-log`), `Index.tsx` (case + provider) | `[HIGH]` new in `970cdcc` — replicates `docs/duty log exmaple.docx` as a landscape A4 PNG; **no DB writes, no new endpoints** (only existing `GET /volunteers`) |
| **Callback-to-gate settings (חיוג חוזר לשער) — ANDROID-ONLY** | `pages/CallbackSettingsPage.tsx` (`callback-settings`, role `['Admin','SystemManager']`; editable only by Admin) via `Index.tsx:88-89` | `pages/CallbackSettingsPage.tsx`, `services/callbackConfigService.ts`, `components/layout/menuItems.ts:64` | `[HIGH]` new (Auto-Callback-to-Gate feature). **Gated on `window.NativeMedia` presence** — in the web build (bridge absent) the page renders a Hebrew "available only in the Android app" notice and makes NO API call (`CallbackSettingsPage.tsx:18-19,90-105`). The actual auto-callback runs in Android-native receivers; this page only edits the config row. |
| ~~Public revoke SMS approval~~ | — | — | **REMOVED in `2989b01`** — `RevokeSmsApprovalPage.tsx` deleted (it called a nonexistent `volunteersService.revokeSmsApproval`); opt-out is admin-mediated. (ISS-002 resolved) |

## 3. Workflows & Behaviors

**WF-web-client:001 — Login & token bootstrap** (user-facing)
- Trigger: user submits `AuthScreen` form. `web/client/src/components/AuthScreen.tsx:35`
- Steps: validate via Zod `loginSchema` (`AuthScreen.tsx:16-19`) → `authService.login(username,password)` → `POST {apiBaseUrl}/api/auth/login` `web/client/src/services/authService.ts:42-53` → on success store `accessToken`, `refreshToken`, `user` JSON in `localStorage` `authService.ts:69-71` → notify native bridge `window.NativeAuth.onLoginSuccess(...)` if present `authService.ts:74-79` → `onAuthenticated({name}, mustChangePassword)` bubbles to `Index.handleAuthentication` `pages/Index.tsx:36-40`.
- State transitions: `Index.isAuthenticated` false→true; if `mustChangePassword` true, `ChangePasswordDialog` opens (`Index.tsx:116-119`). `[HIGH]`
- Error handling: 401 → Hebrew "שם משתמש או סיסמה שגויים" `authService.ts:56-57`; network → generic Hebrew; else generic. `AuthScreen.tsx:46-54`.

**WF-web-client:002 — Auto token-attach + refresh-on-401** (background)
- Trigger: any authed request via `BaseApiClient.fetchWithAuth`. `web/client/src/services/api/BaseApiClient.ts:44`
- Steps: read `accessToken` from localStorage → attach `Authorization: Bearer` `BaseApiClient.ts:36-42` → `fetch` → if 401, lazy-`import('@/services/authService')` and call `authService.refreshToken()` **once, deduplicated via static `BaseApiClient.refreshPromise`** `BaseApiClient.ts:50-57` → on success retry original request with new token `BaseApiClient.ts:60-62`.
- Refresh: `POST /api/auth/refresh` with `{refreshToken}` + current access token header → rotate all three localStorage values `authService.ts:88-118` → notify `window.NativeAuth.onTokenRefresh(...)` `authService.ts:120-122`.
- Error handling: refresh failure → `authService.logout()` clears localStorage `authService.ts:127`; in `BaseApiClient` the catch path calls `window.location.reload()` to bounce to login `BaseApiClient.ts:63-68`. `[HIGH]`

**WF-web-client:003 — Two-tier routing / internal navigation** (user-facing)
- Tier 1 (React Router, `App.tsx:22-25`): ONLY `/` → `<Index>` and `*` → `<NotFound>`. No public `/sms-approval/:accessKey` route is registered (contradicts CLAUDE.md — see §10). `[HIGH]`
- Tier 2 (state-based, `Index.tsx`): `activeSubItem` state (`Index.tsx:34`, default `'shifts-management'`) drives a `switch` in `renderContent()` `Index.tsx:61-98`; `AdminLayout`/`SubNavigation` call `onSubItemChange` to mutate it. No URL changes for internal pages — no browser back/forward. `[HIGH]`
- State: `Index` holds `user`, `isAuthenticated`, `mustChangePassword`, `activeSubItem`; initial auth derived synchronously from localStorage `Index.tsx:28-32`. `[HIGH]`

**WF-web-client:004 — Logout** (user-facing)
- Trigger: Header dropdown "התנתק" `web/client/src/components/layout/Header.tsx:58`.
- Steps: `authService.logout()` → best-effort `POST /api/auth/logout` `authService.ts:132-142` → `finally` removes `accessToken`/`refreshToken`/`user` + `window.NativeAuth.onLogout()` `authService.ts:147-154` → `Index.handleLogout` sets `user=null`, `isAuthenticated=false` `Index.tsx:54-58`. `[HIGH]`

**WF-web-client:005 — Public SMS-approval (wired at `/sms-approval/:accessKey`)** (user-facing)
- Trigger: route `App.tsx:25` mounts `VolunteerSmsApprovalPage`, which reads `accessKey` from `useParams` `VolunteerSmsApprovalPage.tsx:42` (route wired in `2989b01`; ISS-001 resolved).
- Steps (state machine `PageState` `VolunteerSmsApprovalPage.tsx:15-23`): enter personal id → `volunteerSmsService.verifyVolunteer(accessKey,internalId)` `POST /public/sms-approval/{accessKey}/verify` `volunteerSmsService.ts:31-39` → `already_approved` shows notice, else show form → submit → `submitApproval` `POST /public/sms-approval/{accessKey}/submit` `volunteerSmsService.ts:65-73` → success.
- Error handling: HTTP 429 → `rate_limited` state ("יותר מדי בקשות") `volunteerSmsService.ts:42-43`, `VolunteerSmsApprovalPage.tsx:82-86`; else `not_found`. `[HIGH]`
- NOTE: this entire flow is currently unreachable in the built app — the component is not imported anywhere (§10). `[HIGH]`

**WF-web-client:006 — Excel file import (volunteers/shifts)** (user-facing)
- Trigger: `VolunteersImportPage`/`ShiftsImportPage` upload. `VolunteersImportPage.tsx:22`
- Steps: `FileDropzone` restricts to `.xlsx/.xls`, max 10MB (`VolunteersImportPage.tsx:54-60`) → `volunteersService.uploadVolunteersFile` → `BaseApiClient.postFormData('/volunteers/import', formData)` via raw `XMLHttpRequest` with `Authorization` + `X-Requested-With: XMLHttpRequest` CSRF header, 60s timeout `BaseApiClient.ts:178-228`.
- Result: `ImportResult` rendered (inserted/updated/errors/unresolved). `volunteersService.ts:24-32`. `[HIGH]`

**WF-web-client:007 — Scheduler config per-row edit/toggle** (user-facing)
- Trigger: `SchedulerSettingsPage` row toggle / edit modal. `SchedulerSettingsPage.tsx:75,93`
- Steps: load `getConfig()` + templates in parallel `SchedulerSettingsPage.tsx:40-43` → group configs by `dayGroup` requiring at least SameDay+Advance (WeekdayAdvance optional, SunThu only) `SchedulerSettingsPage.tsx:116-122` → toggle/save calls `schedulerService.updateOne` `PUT /scheduler/config/{id}` `schedulerService.ts:44-46` → optimistic-ish `mergeConfig` patches the single row `SchedulerSettingsPage.tsx:57-60` → toast.
- State: `savingIds: Set<number>` tracks in-flight per row `SchedulerSettingsPage.tsx:30,62-73`. Read-only when not Admin (`isReadOnly = !isUserAdmin()` `SchedulerSettingsPage.tsx:34`). `[HIGH]`

**WF-web-client:008 — Duty Log (יומן הפעלה) PNG generation & export** (user-facing)
- Two entry points funnel through ONE shared `DutyLogData` model → ONE `DutyLogReport` → ONE `exportDutyLogPng`: (a) `DutyLogPage` form (RHF+zod; preset-or-`__other__` Select for shift name; volunteer multi-select `Set<number>` ∪ free-text people; ≥1-person validation lives ONLY here) `pages/DutyLogPage.tsx:111-167`; (b) a per-team `צור יומן הפעלה` button on `ShiftsManagementPage` mapped via `shiftGroupToDutyLogData(group, selectedDate)` — **default** hours 19:00–02:00 (overridable in the preview, see BR-018), `carId` verbatim, unresolved rows filtered, hidden when 0 resolved people `ShiftsManagementPage.tsx:707-719`. `[HIGH]`
- Both call `openPreview(data)` from `features/duty-log/DutyLogPreviewProvider.tsx` (rendered in `Index.tsx` ABOVE `AdminLayout`) → the shared fit-to-screen / pinch-zoom preview overlay → `exportDutyLogPng(effectiveData)` `features/duty-log/exportDutyLogPng.tsx:36`. `[HIGH]`
- **Editable hours in the preview (`778a2dd`):** a `שנה שעות` toggle in the overlay footer reveals two `<input type="time">` controls (start/end). The dialog holds local `startTime`/`endTime` seeded from `data` (re-seeded per-open via a `useLayoutEffect` keyed on `[data]`, pre-paint → no flash) and renders `reportData = timesValid ? effectiveData : data` so the live report (and the derived end date) updates as the hours change; the SAME `effectiveData={...data,startTime,endTime}` is passed to `exportDutyLogPng`, so the PNG can't diverge from the preview. Export is disabled while a time is invalid; toggling the editor resets zoom/pan for a clean re-fit. `features/duty-log/DutyLogPreviewDialog.tsx`. `[HIGH]`
- Export: lazy `(await import('html2canvas')).default`, mount `<DutyLogReport>` off-screen in its OWN `createRoot`+`flushSync`, await fonts (400/500/700 + `document.fonts.ready`) + `emblemImg.decode()` + double rAF, `html2canvas(node,{backgroundColor:'#fff',scale:Math.min(2,dpr)})` clamped to ~2400px edge, guard `toBlob` null → desktop `<a download>` OR Android `window.NativeMedia.{saveImageToGallery,shareImage}` (base64), `try/finally` unmount+remove, `isExporting` re-entrancy lock. `exportDutyLogPng.tsx:43-130`. `[HIGH]`
- End date via shared `deriveEndDate(date,startTime,endTime)` (local-field `new Date(y,m,d+1)` when `endTime ≤ startTime`) `features/duty-log/deriveEndDate.ts:12`. `[HIGH]`

**WF-web-client:009 — Callback-to-gate settings (Android-only) load & save** (user-facing)
- ANDROID GATE FIRST: `isAndroidApp()` = `!!window.NativeMedia` `pages/CallbackSettingsPage.tsx:18-19`. On mount, the page calls `loadConfig()` ONLY when running inside the Android WebView; in the web build it skips the fetch (`setIsLoading(false)`) and renders a Hebrew "זמינה רק באפליקציית האנדרואיד" notice instead of the form `CallbackSettingsPage.tsx:56-59,90-105`. `[HIGH]`
- Load: `callbackConfigService.getConfig()` → `GET /callback-config` (Android Ktor only; no .NET route) `services/callbackConfigService.ts:19-21` → `applyConfig()` hydrates local state (`isActive/allCallers/allDay/fromHour/toHour/gatePhone`), defaulting blank hours to `08:00`/`20:00` `CallbackSettingsPage.tsx:35-42`. `[HIGH]`
- Save: client validation MIRRORS the server (when `isActive`, gate phone `len≥9` & `/^[0-9+\-]+$/`; when `!allDay`, both times match `/^([01]\d|2[0-3]):[0-5]\d$/`) `CallbackSettingsPage.tsx:12-13,62-70` → `updateConfig(body)` → `PUT /callback-config` `callbackConfigService.ts:23-25` → re-hydrate from the server echo + toast `CallbackSettingsPage.tsx:73-87`. Read-only (no Save button) when `!isUserAdmin()` `CallbackSettingsPage.tsx:22,221`. `[HIGH]`
- A second static-guidance Card (Hebrew) instructs granting call permissions + setting battery to Unrestricted — no logic `CallbackSettingsPage.tsx:233-247`. `[HIGH]`

## 4. Business Rules

| ID | Rule | Criticality | Source |
|---|---|---|---|
| BR-web-client:001 | The user role field in localStorage is `user.roles` — a STRING ARRAY — NOT `user.role`. Role checks use `roles.includes('Admin')`. | HIGH | `web/client/src/lib/auth.ts:6-7`, `services/authService.ts:19`, `components/AdminLayout.tsx:40-43` |
| BR-web-client:002 | localStorage keys are exactly `accessToken`, `refreshToken`, `user` (user stored as JSON string). All three are set on login & refresh and removed on logout. | HIGH | `services/authService.ts:69-71,115-117,147-149` |
| BR-web-client:003 | Menu gating: a main item shows if it has no `requiredRoles` OR some required role is in `userRoles`; sub-items filtered the same way; main items with zero surviving sub-items are dropped. | HIGH | `components/AdminLayout.tsx:42-48` |
| BR-web-client:004 | Roles are case-sensitive literals `'Admin'`, `'SystemManager'`, `'User'` (also enforced by Zod enum in UserDialog). | HIGH | `components/layout/menuItems.ts:9,62`, `components/users/UserDialog.tsx:45,64` |
| BR-web-client:005 | Client validates (Zod schemas) but server re-validates — UserDialog/AuthScreen/ChangePasswordDialog/VolunteerSmsApprovalPage validate client-side; server is authoritative (project security rule). Min password length client-side is 4 digits. | HIGH | `components/users/UserDialog.tsx:36-69`, `ChangePasswordDialog.tsx:28-35`, `components/AuthScreen.tsx:16-19` |
| BR-web-client:006 | All domain services extend `BaseApiClient` and call its protected `get/post/put/delete/postFormData`; auth/public services (`authService`, `volunteerSmsService`) do NOT extend it and call `fetch` directly with their own `/api` base handling. | MEDIUM | `services/shiftsService.ts:62`, `usersService.ts:33`, vs `authService.ts:30-33`, `volunteerSmsService.ts:28-29` |
| BR-web-client:007 | `BaseApiClient.handleResponse` unwraps the `ApiResponse<T>` envelope: if body has `success`, throws on `!success` (using Hebrew `message`/`errors`), returns `result.data`; 204/empty → undefined; otherwise returns raw body. | HIGH | `services/api/BaseApiClient.ts:74-118` |
| BR-web-client:008 | File uploads MUST send `X-Requested-With: XMLHttpRequest` (CSRF) and use multipart via XHR (not `fetch`), 60s timeout. | HIGH | `services/api/BaseApiClient.ts:221-227` |
| BR-web-client:009 | `apiBaseUrl` defaults to `http://localhost:5015` (the Android Ktor port and .NET dev port); overridable via `VITE_API_BASE_URL`. Relative bases are resolved against `window.location.origin`. | MEDIUM | `config/auth.ts:2`, `BaseApiClient.ts:20-23` |
| BR-web-client:010 | Scheduler "DayGroup" = the day the SMS is SENT (run day), not the shift's day; `daysBeforeShift` is the look-ahead (0 = same day). The Friday job reminds Sunday shifts. | HIGH | `pages/scheduler/schedulerPreview.ts:2-5,24-35,65-75` |
| BR-web-client:011 | Same-day reminders append a location; Advance/WeekdayAdvance do NOT (`hasLocation`). | HIGH | `pages/scheduler/schedulerPreview.ts:39-43` |
| BR-web-client:012 | Token-refresh on 401 is single-flight: a static `BaseApiClient.refreshPromise` deduplicates concurrent refreshes across all service instances. | MEDIUM | `services/api/BaseApiClient.ts:13,50-57` |
| BR-web-client:013 | Mobile breakpoint is 768px (`useIsMobile`); AdminLayout renders a distinct mobile (Sheet sidebar) vs desktop (resizable panels) tree. **Load-bearing for the Duty Log preview**: rotating a phone to landscape (>768px) flips `isMobile`, so AdminLayout swaps trees and React UNMOUNTS/REMOUNTS the page — destroying any page-local state. (BR-web-client:014.) | MEDIUM | `hooks/use-mobile.tsx:3`, `components/AdminLayout.tsx:83,132` |
| BR-web-client:014 | **Duty Log preview state lives in `DutyLogPreviewProvider` rendered ABOVE `AdminLayout` (in `Index.tsx`), not in the page** — so it survives the BR-013 mobile↔desktop remount on rotation. Both entry points open it via `useDutyLogPreview().openPreview(data)`. | HIGH | `features/duty-log/DutyLogPreviewProvider.tsx:21-37`, `pages/Index.tsx` (provider wraps AdminLayout) |
| BR-web-client:015 | **RTL report scaling:** the 1123px landscape `DutyLogReport` is scaled to fit; the scaled inner MUST be `position:absolute; top:0; right:0` + `transform-origin:'top right'`. With `top left` the RTL report right-aligns and its top-left lands off-screen (≈ x −661) → blank preview. | HIGH | `features/duty-log/DutyLogPreviewDialog.tsx` (scaled wrapper) |
| BR-web-client:016 | **Emblem centering:** Tailwind preflight forces `img{display:block}`, so in an RTL container `text-align:center` does NOT center the emblem (a block element sits at the start = right edge). Centered via `display:block; margin:0 auto`. | MEDIUM | `features/duty-log/DutyLogReport.tsx` (emblem `<img>`) |
| BR-web-client:017 | **Duty Log bidi correctness:** every numeric/LTR run in the report (times `HH:mm-HH:mm`, phones, vehicle no., the `dd/MM/yyyy  HH:mm` lines) MUST be wrapped `<span dir="ltr">` or `19:00-02:00` rasterizes reversed. Shift-name presets + team→car map (`211→21-174`…) are hardcoded sample data, not repo constants. | HIGH | `features/duty-log/DutyLogReport.tsx`, `features/duty-log/types.ts:24-33` |
| BR-web-client:018 | **Duty Log editable hours — ONE source of truth.** The preview's edited `startTime`/`endTime` must feed BOTH the on-screen `<DutyLogReport>` AND `exportDutyLogPng` via one `effectiveData={...data,startTime,endTime}`, or the PNG silently exports the original hours (the bug fixed in `778a2dd`: export had used the immutable `data`). Edited times are dialog-local, re-seeded from `data` on every open (so a prior edit never leaks); the `data` prop identity is left stable (the fit/zoom effects key on `[open,data]`) so editing doesn't reset pinch-zoom. The end date is DERIVED from the times (`deriveEndDate`) — either field can flip the עד-תאריך line by a day. Export is gated on `timesValid` (regex `^([01]\d\|2[0-3]):[0-5]\d$`); an empty time coerces to 0 (not NaN), so it never crashes — the guard is for output correctness. | HIGH | `features/duty-log/DutyLogPreviewDialog.tsx`, `features/duty-log/exportDutyLogPng.tsx:36`, `features/duty-log/deriveEndDate.ts:12` |
| BR-web-client:019 | **Callback settings is ANDROID-ONLY — gated on `window.NativeMedia` presence.** `isAndroidApp()` reuses the duty-log NativeMedia presence convention (NO new bridge); when absent (web build) the page renders a Hebrew "Android-app-only" notice and makes ZERO API calls. The page must never assume the `/callback-config` endpoint exists in the web/.NET deployment. | HIGH | `pages/CallbackSettingsPage.tsx:18-19,56-59,90-105` |
| BR-web-client:020 | **Callback-config client validation MUST mirror the Android server rules** (the same triplicated-contract discipline, ISS-004): when `isActive`, gate phone `len≥9` & `/^[0-9+\-]+$/`; when `!allDay`, both `fromHour`/`toHour` match `/^([01]\d\|2[0-3]):[0-5]\d$/`. Server (Android Ktor) re-validates and is authoritative. | HIGH | `pages/CallbackSettingsPage.tsx:12-13,62-70` |
| BR-web-client:021 | `callbackConfigService` writes endpoints WITHOUT a `/api` prefix (`/callback-config`) because `BaseApiClient.baseUrl` already ends in `/api`; it extends `BaseApiClient` (gets bearer auto-attach + 401 refresh) like every domain service. Booleans `isActive/allDay/allCallers` are sent/received as JS booleans (the Android DTO maps them ↔ Int 0/1 server-side). | MEDIUM | `services/callbackConfigService.ts:18-25,3-12` |

## 5. Data Models (as the client types them)

- `UserInfo` `{ id, name, roles: string[], permissions: Record<string,any> }` — `services/authService.ts:16-21` `[HIGH]`
- `LoginResponse` `{ accessToken, refreshToken, expiresAt, user: UserInfo, mustChangePassword }` — `services/authService.ts:8-14` `[HIGH]`
- `UserDto` `{ id, fullName, userName, isActive, role: string, mustChangePassword, lastConnected, createdAt, updatedAt }` (note: list DTO uses singular `role` string, unlike the auth `roles[]`) — `services/usersService.ts:3-13` `[HIGH]`
- `VolunteerDto` `{ id, mappingName, mobilePhone, approveToReceiveSms, createdAt, updatedAt }` — `services/volunteersService.ts:3-10` `[HIGH]`
- `ShiftWithVolunteerDto` `{ id, shiftDate, shiftName, carId, volunteerId, volunteerName, volunteerPhone, volunteerApproved, isUnresolved, locationId, locationName, locationNavigation, locationCity }` — `services/shiftsService.ts:4-18` `[HIGH]`
- `CanceledShiftDto` (adds `canceledAt`, nullable volunteer fields) — `services/shiftsService.ts:25-39` `[HIGH]`
- `CreateShiftRequest` / `UpdateShiftGroupRequest` (carry `locationId`/`customLocationName`/`customLocationNavigation` — the location "אחר"/Other case) — `services/shiftsService.ts:41-60` `[HIGH]`
- `SchedulerConfigEntry` `{ id, dayGroup, reminderType, time, daysBeforeShift, isEnabled:number, messageTemplateId, updatedAt, updatedBy }` and `SchedulerConfigUpdate` (id,time,daysBeforeShift,isEnabled,messageTemplateId) — `services/schedulerService.ts:3-21` `[HIGH]`
- `SchedulerRunLogEntry` `{ id, configId, reminderType, ranAt, targetDate, totalEligible, smsSent, smsFailed, status, error }` — `services/schedulerService.ts:23-34` `[HIGH]`
- `SmsLogEntry` / `SmsLogSummaryEntry` — `services/smsLogService.ts:3-20` `[HIGH]`
- `MessageTemplateEntry` `{ id, name, content, createdAt, updatedAt }` — `services/messageTemplateService.ts:3-9` `[HIGH]`
- `LocationDto` `{ id, name, address, city, navigation, createdAt, updatedAt }` — `services/locationsService.ts:3-11` `[HIGH]`
- `JewishHolidayDto` `{ id, date, name }` — `services/jewishHolidaysService.ts:3-7` `[HIGH]`
- `SmsSimSettings` `{ subscriptionId, availableSims: SimInfo[] }`, `SimInfo` `{ subscriptionId, displayName, slotIndex }`, `TestSmsResult` `{ success, error }` — `services/settingsService.ts:3-17` `[HIGH]`
- `CallbackConfig` `{ isActive: boolean; gatePhone: string; fromHour: string; toHour: string; allDay: boolean; allCallers: boolean; updatedAt: string|null; updatedBy: string|null }` and the PUT body `CallbackConfigUpdate = Omit<CallbackConfig,'updatedAt'|'updatedBy'>` (server stamps those) — `services/callbackConfigService.ts:3-15` `[HIGH]`. **Android-Ktor-only endpoint** — no .NET-served implementation (the page is gated to the Android WebView).
- `ImportResult` `{ totalRows, inserted, updated, errors, errorMessages[], unresolvedVolunteers, unresolvedVolunteerNames[] }` — `services/volunteersService.ts:24-32` `[HIGH]`
- Reminder-type constants `SAME_DAY='SameDay'`, `ADVANCE='Advance'`, `WEEKDAY_ADVANCE='WeekdayAdvance'`; `DAY_GROUP_ORDER=['SunThu','Fri','Sat']` (mirror `MagavConstants`) — `pages/scheduler/schedulerPreview.ts:18-22` `[HIGH]`
- `DutyLogData` `{ shiftName: string; date: Date; startTime: string; endTime: string; vehicleNumber?: string; people: { name: string; phone? }[] }` — the single normalized model both Duty Log entry points produce; `SHIFT_NAME_PRESETS` (4 strings), `TEAM_CAR_MAP` (`211→21-174`,`212→21-851`,`221→21-850`,`222→21-176`), `OTHER_OPTION='__other__'` sentinel — `features/duty-log/types.ts:8-33` `[HIGH]`

## 6. Integration Points

| ID | Name | Type | Direction | Target | Source |
|---|---|---|---|---|---|
| IP-web-client:001 | login | API POST | out | `/api/auth/login` | `services/authService.ts:44` |
| IP-web-client:002 | refresh | API POST | out | `/api/auth/refresh` | `services/authService.ts:95` |
| IP-web-client:003 | logout | API POST | out | `/api/auth/logout` | `services/authService.ts:136` |
| IP-web-client:004 | change-password | API POST | out | `/api/auth/change-password` | `services/authService.ts:181` |
| IP-web-client:005 | users CRUD | API GET/POST/PUT/DELETE | out | `/users`, `/users/{id}` | `services/usersService.ts:34-52` |
| IP-web-client:006 | volunteers CRUD | API GET/POST/PUT/DELETE | out | `/volunteers`, `/volunteers/{id}` | `services/volunteersService.ts:35-53` |
| IP-web-client:007 | volunteers import | API POST multipart (CSRF) | out | `/volunteers/import` | `services/volunteersService.ts:55-59` |
| IP-web-client:008 | shifts by-date / create / delete | API GET/POST/DELETE | out | `/shifts/by-date`, `/shifts`, `/shifts/{id}` | `services/shiftsService.ts:69-79` |
| IP-web-client:009 | shifts import | API POST multipart (CSRF) | out | `/shifts/import` | `services/shiftsService.ts:63-67` |
| IP-web-client:010 | send shift SMS | API POST | out | `/shifts/{id}/send-sms` | `services/shiftsService.ts:81-83` |
| IP-web-client:011 | dates-with-shifts | API GET | out | `/shifts/dates-with-shifts` | `services/shiftsService.ts:85-87` |
| IP-web-client:012 | update/delete/cancel shift group | API PUT/POST | out | `/shifts/update-group`, `/shifts/delete-group`, `/shifts/cancel-group` | `services/shiftsService.ts:89-111` |
| IP-web-client:013 | group location update + location-update SMS | API PUT/POST | out | `/shifts/update-group-location`, `/shifts/send-location-update` | `services/shiftsService.ts:97-103` |
| IP-web-client:014 | cancel single shift + canceled list | API POST/GET | out | `/shifts/{id}/cancel`, `/shifts/canceled?month=` | `services/shiftsService.ts:105-115` |
| IP-web-client:015 | sms-log + summary | API GET | out | `/sms-log`, `/sms-log/summary` | `services/smsLogService.ts:23-29` |
| IP-web-client:016 | scheduler config get + per-row PUT + run-log | API GET/PUT | out | `/scheduler/config`, `/scheduler/config/{id}`, `/scheduler/run-log` | `services/schedulerService.ts:37-50` |
| IP-web-client:017 | message templates CRUD | API GET/POST/PUT/DELETE | out | `/message-templates`, `/message-templates/{id}` | `services/messageTemplateService.ts:12-26` |
| IP-web-client:018 | locations CRUD | API GET/POST/PUT/DELETE | out | `/locations`, `/locations/{id}` | `services/locationsService.ts:21-39` |
| IP-web-client:019 | jewish-holidays CRUD | API GET/POST/PUT/DELETE | out | `/jewish-holidays`, `/jewish-holidays/{id}` | `services/jewishHolidaysService.ts:15-29` |
| IP-web-client:020 | SMS SIM settings + test SMS | API GET/PUT/POST | out | `/settings/sms-sim`, `/settings/test-sms` | `services/settingsService.ts:20-32` |
| IP-web-client:021 | public SMS-approval verify/submit | API POST (no auth, rate-limited) | out | `/public/sms-approval/{accessKey}/verify`, `/submit` | `services/volunteerSmsService.ts:31-73` |
| IP-web-client:022 | health/version | API GET (no auth) | out | `/api/health` | `pages/AboutVersionPage.tsx:9` |
| IP-web-client:023 | native Android session bridge | JS interop | out | `window.NativeAuth.{onLoginSuccess,onTokenRefresh,onLogout}` | `services/authService.ts:74-79,120-122,152-154` |
| IP-web-client:024 | native Android media bridge (Duty Log save/share) | JS interop | out | `window.NativeMedia.{saveImageToGallery,shareImage}` (base64 PNG); absent on desktop → `<a download>` fallback | `features/duty-log/exportDutyLogPng.tsx:13-19,99-113` |
| IP-web-client:025 | callback-config get + put (**Android Ktor ONLY** — no .NET counterpart; called only when `window.NativeMedia` is present) | API GET/PUT | out | `/callback-config` | `services/callbackConfigService.ts:19-25` |
| IP-web-client:026 | Android-app presence probe (callback page) | JS interop | in (read) | reads `window.NativeMedia` truthiness as the "running in Android app" flag (reuses IP-024's bridge object, no new bridge) | `pages/CallbackSettingsPage.tsx:18-19` |

Note: most service `baseUrl` values come from `authConfig.apiBaseUrl` directly (e.g. `/volunteers`), while `authService` appends `/api` if missing (`authService.ts:31-33`). The `X-Requested-With` CSRF header is set ONLY on `postFormData` uploads (`BaseApiClient.ts:226`). `[HIGH]`

## 7. User Roles & Access

- Roles (case-sensitive): `Admin`, `SystemManager`, `User`. `[HIGH]` (`components/layout/menuItems.ts`, `components/users/UserDialog.tsx:45`)
- UI gating: `AdminLayout` reads `authService.getCurrentUser().roles` and filters `mainMenuItems` by `requiredRoles` (`AdminLayout.tsx:39-48`). Menu definitions: most sections require `['Admin','SystemManager']`; "ניהול משתמשים" (`user-management`) requires `['Admin']` only; "אודות" has no `requiredRoles` (visible to all). `[HIGH]` (`menuItems.ts:9,38,62,70`)
- Page-level: `SchedulerSettingsPage` becomes read-only when `!isUserAdmin()` (`lib/auth.ts` checks `roles.includes('Admin')`). `[HIGH]` (`SchedulerSettingsPage.tsx:34`, `lib/auth.ts:6-7`)
- Gating is purely client-side cosmetic; server enforces real authorization (project security rule). The `Index` `User` type only carries `{name}` — full roles live in localStorage `user`. `[HIGH]` (`Index.tsx:23-25`)
- Auth mechanism: JWT bearer in localStorage, auto-attached + refreshed by `BaseApiClient` (WF-002). `[HIGH]`

## 8. Interfaces Exposed

- The component's only output is the built static SPA (Vite `dist/`), consumed two ways:
  1. Served by the .NET/Nginx web deployment (static files + `/api` proxy). `[MEDIUM]` (deployment per CLAUDE.md; client targets `apiBaseUrl`)
  2. Copied into Android assets (`android/app/src/main/assets/web/`) and loaded by the WebView from `http://localhost:5015`. `[MEDIUM]` (CLAUDE.md; client default `apiBaseUrl` = `http://localhost:5015` at `config/auth.ts:2`)
- A JS-interop surface it *consumes if present*: `window.NativeAuth` (Android injects it) — see IP-023. The client exposes nothing else programmatically. `[HIGH]`

## 9. Interfaces Consumed

| External component | What imported | Import location |
|---|---|---|
| react / react-dom | `createRoot`, hooks | `main.tsx:1`, throughout |
| react-router-dom | `BrowserRouter`, `Routes`, `Route`, `useParams` | `App.tsx:5`, `pages/VolunteerSmsApprovalPage.tsx:2` |
| @tanstack/react-query | `QueryClient`, `QueryClientProvider` (provider only) | `App.tsx:4` |
| react-hook-form + @hookform/resolvers/zod + zod | form state & validation | `components/AuthScreen.tsx:2-4`, `UserDialog.tsx:2-4`, `ChangePasswordDialog.tsx:2-4`, `VolunteerSmsApprovalPage.tsx:3-5` |
| sonner | `toast` | `pages/SchedulerSettingsPage.tsx:3`, `SmsSettingsPage.tsx:8`, `ShiftsManagementPage.tsx:22` |
| @radix-ui/react-* | Shadcn primitives (dialog, switch, select, tooltip, popover, …) | `components/ui/*` |
| lucide-react | icons | widespread |
| date-fns + date-fns/locale `he` | date formatting (Hebrew) | `pages/ShiftsManagementPage.tsx:23-24` |
| @fontsource/noto-sans-hebrew | Hebrew webfont | `main.tsx:4-6` |
| html2canvas (`^1.4.1`, new in `970cdcc`) | rasterize the Duty Log DOM → PNG; **lazy dynamic-import**, default export only (kept out of the main bundle — its own ~201 KB chunk) | `features/duty-log/exportDutyLogPng.tsx:42` |
| cmdk (`^1.1.1`, added `f432dce`) | command-palette primitive backing `components/ui/command.tsx` — **installed but UNUSED by app code** (Duty Log chose Radix `Select`, not the combobox) | `components/ui/command.tsx` (no app import) |
| clsx + tailwind-merge | `cn()` | `lib/utils.ts:1-5` |
| HTTP `/api/*` surface | .NET / Android Ktor backend (mirrored endpoints) | all of `services/*` (see §6) |
| HTTP `/api/callback-config` (**Android Ktor ONLY**) | Android embedded Ktor server — NO .NET `Magav.Api` counterpart and NO web-served implementation; the page is gated to the Android WebView (BR-019). Same accepted "Android-only native setting" pattern as the SIM-selection endpoint `/settings/sms-sim`. [ISS-004 new accepted divergence] | `services/callbackConfigService.ts` |

## 10. Legacy Warnings

- **✅ RESOLVED 2026-06-19 (`2989b01`) — public SMS-approval page wired:** `App.tsx:8,25` now imports `VolunteerSmsApprovalPage` and registers `/sms-approval/:accessKey`, so the documented public route is reachable from this client build (`volunteerSmsService.ts` verify/submit drive it; backend endpoints live). The orphan `RevokeSmsApprovalPage.tsx` — which called a nonexistent `volunteersService.revokeSmsApproval` — was **deleted** (no revoke flow; opt-out is admin-mediated). The earlier orphaned-page + missing-method warnings (ISS-001/002) are resolved. (`App.tsx:8,25`, `pages/VolunteerSmsApprovalPage.tsx`)
- **God objects** `[HIGH]`: `pages/ShiftsManagementPage.tsx` (1135 lines, ~25 `useState` hooks for nested dialogs/group editing — `ShiftsManagementPage.tsx:37-104`). Vendored Shadcn primitives `components/ui/sidebar.tsx` (~761 lines) and `components/ui/chart.tsx` (~363 lines) are large but vendored (see below). `[HIGH]` count; `[MEDIUM]` line counts (from task brief / not re-counted).
- **Vendored UI** `[HIGH]`: `components/ui/*` are vendored Shadcn/UI (Radix) primitives — treat as third-party. Two are intentionally RTL-modified and must NOT be reverted: `components/ui/switch.tsx` (adds `dir="ltr"`) and `components/ui/dialog.tsx` (left-positioned X + top-aligned scroll for Android WebView). `components/ui/chart.tsx`/`sidebar.tsx`/`carousel.tsx` etc. appear unused by app code.
- **TanStack Query set up but unused** `[HIGH]`: `QueryClient`/`QueryClientProvider` mounted at `App.tsx:8,12` but grep for `useQuery|useMutation` finds only the `App.tsx` import — no actual query hooks. Data fetching is `useState`+`useEffect`+direct service calls everywhere (e.g. `SchedulerSettingsPage.tsx:36-55`).
- **Relaxed TypeScript** `[MEDIUM]`: project documented to run with `strictNullChecks: false` and `noImplicitAny: false` (CLAUDE.md; tsconfig lives at `web/client/tsconfig.json`, outside this component's `src/` scope so not read here). Evidence of looseness in code: heavy `as any` casts (e.g. `UserDialog.tsx:269-272`, `(window as any).NativeAuth` `authService.ts:74`).
- **TODO/FIXME** `[HIGH]`: grep for `TODO|FIXME|XXX|HACK` across `src/` → 2 hits total, both incidental string matches (`pages/SmsSettingsPage.tsx:1`, `pages/VolunteerSmsApprovalPage.tsx:1` — likely the `XXXXXXX` phone placeholders / `05X`), i.e. effectively **no real TODO/FIXME markers**.
- **No automated tests** `[HIGH]`: no test files under `web/client/src/` (project-wide: "There are no automated tests").
- **`cmdk` + `components/ui/command.tsx` installed but unused** `[HIGH]`: added in `f432dce` to enable a combobox option for the Duty Log shift-name picker, but the implementation chose Radix `Select` + an `__other__` free-text sentinel, so no app code imports `Command`. Dead dependency unless a future combobox adopts it.
- **`features/duty-log/` is the FIRST feature-folder** `[HIGH]`: the repo is otherwise organized by `pages/` + `services/` + `components/`. Duty Log introduced `src/features/<feature>/` as the home for self-contained feature modules (model + report + export + preview + mapper). New cohesive features should follow this, not scatter into `pages/`.
- **`callbackConfigService` targets an endpoint that exists in ONE backend only** `[HIGH]` (ISS-004 new accepted divergence): `GET/PUT /api/callback-config` is implemented in the Android Ktor surface ONLY — there is NO .NET `Magav.Api` route and NO web-served implementation. This is **NOT a defect** — it is the same accepted "Android-only native setting" pattern as the SIM-selection endpoint (`/settings/sms-sim`): the auto-callback runs in Android-native receivers, so the setting is meaningless in the web deployment. The React page (`CallbackSettingsPage`) is therefore gated on `window.NativeMedia` (BR-019) so the web build never hits the missing endpoint — it shows an "Android-app-only" notice instead. A reviewer scanning for the usual three-way contract mirror will (correctly) NOT find a .NET/parity entry for this endpoint. `services/callbackConfigService.ts`, `pages/CallbackSettingsPage.tsx:18-19,90-105`.

## 11. Design Rationale

| Pattern | Location | Rationale | Evidence | Certainty |
|---|---|---|---|---|
| Global `dir="rtl"` + Hebrew font | `components/AdminLayout.tsx:85,133`, `main.tsx:4-6`, page roots e.g. `VolunteerSmsApprovalPage.tsx:370` | Entire UI is Hebrew RTL | `dir="rtl"`, `font-hebrew`, noto-sans-hebrew imports | `[HIGH]` |
| Dialog close X on the LEFT | `components/ui/dialog.tsx:85` (`absolute left-4 top-4`) | In RTL the expected close position flips to the left | code comment + class | `[HIGH]` |
| `dir="ltr"` forced on Switch root | `components/ui/switch.tsx:11` | Radix Switch thumb uses `translate-x`; RTL mirrors the whole component so the transform moves the wrong way — pinning LTR fixes thumb travel | the explicit `dir="ltr"` on `SwitchPrimitives.Root` + `translate-x-5` thumb | `[HIGH]` |
| Android-WebView keyboard workaround: top-aligned, scrollable dialog + `pb-[40vh]` + `scrollIntoView({block:'start'})` on focusin | `components/ui/dialog.tsx:36-55,70-84` | In Android WebView `position:fixed` doesn't move for the soft keyboard and `dvh`/`visualViewport` are unreliable; place dialog at top, pad bottom, scroll focused input upward | explicit code comment `dialog.tsx:41-43` + `focusin` handler + mobile `top-2 bottom-2 overflow-y-auto`, desktop `sm:top-[50%]` | `[HIGH]` |
| State-based internal nav instead of URL routes | `pages/Index.tsx:34,61-98`, `App.tsx:22-25` | Keeps the WebView shell simple; only the public/login boundary needs real URLs | single `<Route path="/">` + `activeSubItem` switch | `[HIGH]` |
| `useState`/`useEffect` + direct service calls (TanStack Query unused) | e.g. `SchedulerSettingsPage.tsx:36-55`, `pages/ShiftsManagementPage.tsx:37-104` | Simpler mental model; query lib left mounted but not adopted | no `useQuery`/`useMutation` in app code | `[HIGH]` |
| Single-flight token refresh via static promise | `services/api/BaseApiClient.ts:13,50-57` | Prevent a burst of parallel 401s from triggering multiple refreshes/rotations | `private static refreshPromise` dedup | `[HIGH]` |
| Native session bridge (`window.NativeAuth`) | `services/authService.ts:74-79,120-122,152-154` | Lets the embedding Android app persist/clear the JWT session in sync with the web layer | guarded `if ((window as any).NativeAuth)` calls | `[HIGH]` |
| Scheduler preview framed by SEND day | `pages/scheduler/schedulerPreview.ts:2-5,90-112` | DayGroup semantics are easy to invert; the preview engine explicitly documents run-day → notified-shift-day mapping incl. WeekdayAdvance pull-back window | extensive module comment + `notifiedShiftLabel` | `[HIGH]` |
| Client-only PNG report (html2canvas, lazy) — one shared module, two entry points | `features/duty-log/*`, `pages/DutyLogPage.tsx`, `ShiftsManagementPage.tsx` | Replicate a printable A4 artifact without a server endpoint or DB write; the SAME build runs on web + Android WebView, so the report rasterizes the same DOM both places (Android adds a native save/share bridge — ADR-019) | shared `DutyLogData`/`DutyLogReport`/`exportDutyLogPng`; lazy `import('html2canvas')` | `[HIGH]` |
| Duty Log preview overlay is a PLAIN portal, NOT a Radix Dialog | `features/duty-log/DutyLogPreviewDialog.tsx` | Radix dismisses on focus/interaction-outside, which the Android WebView fires on rotation → closes the preview; a plain overlay closes only via buttons/backdrop and survives rotation (paired with the provider-above-AdminLayout fix, BR-014) | `createPortal` + manual close, no Radix Dialog | `[HIGH]` |
| Android-only page gated on `window.NativeMedia` presence (notice in web build) | `pages/CallbackSettingsPage.tsx:18-19,90-105` | The auto-callback feature is Android-native (receivers + Ktor-only config endpoint) and cannot run in the web deployment; reusing the existing duty-log `NativeMedia` presence convention avoids a new JS bridge and keeps the web build from calling an endpoint that doesn't exist there | `isAndroidApp() = !!window.NativeMedia` early-return that renders a Hebrew "Android-app-only" Card | `[HIGH]` |
