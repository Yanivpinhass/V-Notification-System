# Implementation Prompt — "יומן הפעלה" (Duty Log) PNG report

## ⚠️ How to run this prompt (read first)
**Do NOT write or change any code yet.** First produce a detailed implementation **plan** and then **STOP and wait for my explicit approval.** Only implement after I approve.
The plan must include: every file to add/change; the shared-module decomposition (§7); the chosen image library and how it's loaded; and an explicit resolution **with your recommendation** for **each** of the open decisions in the "Open decisions" section (#1–#6) — none may be silently skipped.
This is a production system with **no automated tests**. After approval, implement in small reviewable steps and **verify the exported image on a real Android device after a cold app launch**, not just desktop Chrome.

## Goal
Add a client-only **Duty Log** report generator to the Hebrew RTL web client (which is also embedded in the Android WebView). It collects a few inputs and **exports a PNG image** that visually replicates `docs/duty log exmaple.docx`, with the user's values substituted in. **No DB writes, no new API endpoints.** Israel timezone. Two entry points (a new page **and** a per-team button on the Shifts page) share ONE implementation — no duplicated render/export logic.

---

## 1. Navigation & page wiring (web client) — *verified accurate*
- Add a main-menu entry in `web/client/src/components/layout/menuItems.ts`. Match the existing shape exactly (cf. the `message-tracking` entry):
  `{ id: 'reports', title: 'דו"חות', icon: FileText, requiredRoles: ['Admin','SystemManager'], subItems: [ { id: 'duty-log', title: 'יומן הפעלה', path: '/reports/duty-log' } ] }`
  - Use a **single-quoted** TS string for `'דו"חות'` so the `"` needs no escaping.
  - **`FileText` is not yet imported** — add it to the `lucide-react` import on line 1 (currently imports only `Users, Settings, Search, Calendar, Info, MapPin`).
- Routing is **state-based**, not React-Router paths. Add a case to the `switch (activeSubItem)` in `web/client/src/pages/Index.tsx` (~line 62). **The case literal must equal the sub-item `id`, not the path** → `case 'duty-log': return <DutyLogPage/>;` (existing cases are `'sms-logs'`, `'shifts-management'` — id-keyed, confirmed).
- New page: `web/client/src/pages/DutyLogPage.tsx` (convention `[Feature]Page.tsx`).
- Role gate is enforced in `AdminLayout.tsx` (`requiredRoles.some(r => userRoles.includes(r))`, empty parents dropped). **DECIDE** the gate — default `['Admin','SystemManager']` (only `about` is ungated).

## 2. Form inputs (DutyLogPage)
Stack: react-hook-form + zod + Shadcn/ui (all present). RTL: containers `dir="rtl"`; phone/numeric/time fields `dir="ltr"` + `text-left`.

| Field | Control | Default | Validation |
|---|---|---|---|
| **תאריך** | native `<input type="date">` | today/empty | required |
| **שעת התחלה** | native `<input type="time">` | `19:00` | `^([01]\d\|2[0-3]):[0-5]\d$` |
| **שעת סיום** | native `<input type="time">` | `02:00` | same |
| **שם משמרת** | preset-OR-free-text picker (see below) | — | required, non-empty |
| **מספר רכב** | preset-OR-free-text picker | prefill from shift name (below) | optional |

- **Combobox component.** `cmdk` is now installed (`^1.1.1`) and `web/client/src/components/ui/command.tsx` is functional, so **either** picker approach is available. **DECIDE** (default = **A** for a 4-item list):
  - **(A, recommended)** Build on the already-present Radix **`Select`** (`@radix-ui/react-select`, `components/ui/select.tsx`): list the 4 presets + an `"אחר (טקסט חופשי)"` option that reveals a plain `Input` for free text. Simplest; no Command/Popover wiring.
  - **(B)** Use the now-working `Command`-in-`Popover` combobox (`components/ui/command.tsx` — no new dependency). Choose this only if a true type-ahead combobox is wanted.
- **Shift-name presets** (hardcode these 4 strings — they are seed sample data, not repo constants): `מרחבים 211`, `מרחבים 212`, `מרחבים 221`, `מרחבים 222`. The picker must accept a free-text value not in the list.
- **Vehicle presets + prefill** — team→car map (verified `DbInitializer.cs:803-806`): `211→21-174`, `212→21-851`, `221→21-850`, `222→21-176`. When a **preset** shift name is chosen, prefill the vehicle (overridable/clearable); a **free-text** shift name → no prefill. Accept any free-text vehicle **verbatim** (don't force the dash format). Empty → blank vehicle cell. Note: prefilled presets render **with** the dash (e.g. `21-174`); typed values render exactly as typed — an intentional choice.

## 3. Volunteer selection (DutyLogPage) — *verified accurate*
- Source: `volunteersService.getAll()` → `VolunteerDto[]` (`web/client/src/services/volunteersService.ts`). `VolunteerDto = { id:number; mappingName:string; mobilePhone:string|null; approveToReceiveSms:boolean; … }`. **Name = `mappingName`, phone = `mobilePhone` (nullable).**
- Multi-select from the list — **no prebuilt multi-select**; hand-roll with `Checkbox` + a `Set<number>` of ids (mirror `addedVolunteerIds: Set<number>` in `ShiftsManagementPage.tsx:74`).
- Also allow **free-text people**: name (required) + phone (optional).
- Final list = chosen `VolunteerDto`s ∪ free-text → normalize each to `{ name: string; phone?: string }`. One table row per person (support N; sample has 2).

## 4. The exported image — replicate the reference doc
Render an **offscreen A4-portrait RTL HTML template** that visually matches `docs/duty log exmaple.docx`, then rasterize to PNG. (Token map verified against the actual `word/document.xml`.)

**Token → source map (everything dynamic in the doc):**

| Doc text (reference) | Replace with |
|---|---|
| Title `יומן הפעלה לצוות מרחבים 211` | `יומן הפעלה לצוות {shiftName}` |
| `צוותים` cell `מרחבים 211` | `{shiftName}` |
| `מתאריך: 13/05/2026  19:00` | `מתאריך: {date dd/MM/yyyy}  {startTime}` |
| `עד תאריך: 14/05/2026  02:00` | `עד תאריך: {endDate dd/MM/yyyy}  {endTime}` — see end-date helper below |
| `19:00-02:00` (**exactly 5 cells**: each manpower row, vehicles, both task rows) | `{startTime}-{endTime}` |
| כח אדם rows (`גרשון אליהו`/`0503334455`, `זכריה מזרחי`/`0524466889`) | one row per person: **שם**=name, **טלפון**=phone (blank if none), **סוג כ"א**=`מתנדב`, **שעות מתוכננות**=`{startTime}-{endTime}`; leave **מ.א./ת.ז./קשר/הערות** blank |
| `רכבים` → `מס' רכב` `21851` | `{vehicleNumber}` (blank if cleared) |
| משימות `צוות` cells `מרחבים 211` (**×2**) | `{shiftName}` |

- **⚠️ The example docx is internally inconsistent:** its title is `מרחבים 211` (seed car `21-174`) but its vehicle cell reads `21851` (= the **212** car, `21-851`). Follow the **seed-based prefill (211→21-174)**; do **not** treat the doc's `21851` as the expected `211` output. (The 5th occurrence of `מרחבים` in the doc is inside the **static** `יחידה` line `בסיס הפעלה מרחבים` — do not substitute it.)
- **End-date helper (single source of truth):** one shared function `deriveEndDate(date, startTime, endTime)` → `endTime ≤ startTime` ⇒ `date + 1 day`, else same date. Default `19:00→02:00` ⇒ +1 (matches 13→14). **Both** entry points call this helper (the Shifts path passes `19:00`/`02:00` through it — it must NOT hardcode +1 separately).
- **Date format:** `format(date,'dd/MM/yyyy',{locale: he})` (slashes, as in `CanceledShiftsPage.tsx:33`). Do **not** use `lib/hebrewDates.ts` `fmtDate` (it uses dots).
- **Bidi / RTL correctness (load-bearing for the rasterized image):** every neutral/LTR run inside an RTL cell — `{startTime}-{endTime}`, phone, vehicle number, the `dd/MM/yyyy  HH:mm` date lines — **must** be wrapped in `<span dir="ltr">` (or `unicode-bidi: isolate`). Without this, `19:00-02:00` can rasterize reversed as `02:00-19:00`. html2canvas faithfully captures whatever bidi produced, so fix it in the DOM.
- **Background:** set the report root explicitly to `background:#ffffff` **and** pass html2canvas `backgroundColor:'#ffffff'` (default canvas bg can rasterize transparent-black in some WebViews).
- **Emblem:** the משטרת ישראל emblem (with the "משטרת ישראל" wordmark already baked in — no separate text token needed) is NOT in the repo. Extract the docx's single image `word/media/image1.png` (430×128, opaque RGB, ~25KB) and add as `web/client/public/police-emblem.png`; reference `<img src="/police-emblem.png">`. It is **same-origin** in both web and the WebView (the WebView loads `http://localhost:5015`, which serves the Vite build) → no canvas taint. Do **not** set `crossOrigin='anonymous'` on the `<img>` (a same-origin asset without CORS headers can paradoxically fail); use html2canvas `useCORS:false` (default).
- **Static (NOT inputs):** emblem/wordmark, `יחידה: בסיס הפעלה מרחבים, מתנדבי סיור (מתמ"ד)`, `משמרת: ג'`, the two `משימות לביצוע` descriptions, all column headers.

### Image library & rasterization (none installed — add one)
- `package.json` has **no** html2canvas / html-to-image / dom-to-image / jsPDF (verified). **Use `html2canvas`** — `html-to-image` rasterizes via SVG `<foreignObject>`, which often renders blank in the Android WebView.
- **Lazy-load** via dynamic import, using the **default export**: `const html2canvas = (await import('html2canvas')).default;` (a bare `(await import('html2canvas'))(node)` fails — the namespace object isn't callable). Keeps the heavy lib out of the main bundle.
- **Off-screen render technique** (html2canvas can't capture `display:none`): mount the report **laid out but off-screen** — `position:absolute; left:-10000px; top:0` — with an **explicit pixel width** (A4 ≈ `794px` @96dpi) so the absolutely-positioned block doesn't shrink to content and break the table layout. Do **not** use `display:none` or `visibility:hidden`. Ensure no `overflow:hidden`/`contain:paint` ancestor clips it.
- **Canvas size cap:** a 2× A4 portrait is ~3308×4678px (~62MB RGBA) and can return a **blank/null** canvas on older WebViews. Use `scale = Math.min(2, window.devicePixelRatio)` and/or clamp the longest edge to ~2400px; **guard `canvas.toBlob()` for null**.
- Output PNG, filename e.g. `יומן-הפעלה-{shiftName}-{date}.png`.

## 5. ⚠️ Saving/sharing the PNG — biggest risk — **DECIDE**
**On desktop** `<a download>` (blob/dataURL) works — keep it as the web path (it's plain Chrome admin).
**Inside the Android WebView the PNG cannot be saved with the current app** (all verified): no `setDownloadListener`, no `WebView.HitTestResult`/long-press "save image" handler, no storage/media permissions, and `DownloadManager` can't handle `data:`/`blob:` URIs. The only JS↔native bridge is `window.NativeAuth` (auth-only methods in `NativeAuthBridge.kt`, wired at `MainActivity.kt:114`). So **"inline preview + long-press to save" will almost certainly do nothing on Android** — do not ship it as the answer without proving it on a device first (evidence says it won't work).

Choose the Android behavior (and update the acceptance criteria to match):
- **(A, simplest) Web-admin only for v1.** On Android, **hide/disable** the export button (feature-detect: no native save method present **and** WebView UA), showing a short "זמין בגרסת הדפדפן" message. No Android changes.
- **(B) Native save/share bridge.** Add a `@JavascriptInterface saveImageBase64(base64, filename)` and/or `shareImage(...)` to `NativeAuthBridge.kt` (already exposed as `window.NativeAuth`): decode base64 → write via **`MediaStore.Images`** (scoped storage — **no permission needed**, `minSdk = 29`) and/or fire an `ACTION_SEND` share intent. React feature-detects `window.NativeAuth.saveImageBase64` and falls back to `<a download>` on desktop. This touches the **Android Kotlin target** → respect the three-target discipline and **bump `versionCode`** in `android/app/build.gradle.kts` (currently **63**) before building the APK (the WebView caches the PWA).

> Note: the Duty Log is fundamentally a printable A4 web-admin artifact. Option **A** is a legitimate v1; pick **B** only if mobile save/share is actually required.

## 6. Second entry point — per-team button on the Shifts page — *verified accurate*
- In `web/client/src/pages/ShiftsManagementPage.tsx`, each team is a `ShiftGroup { shiftName, carId, shifts: ShiftWithVolunteerDto[] }` (grouped by `` `${shiftName}||${carId}` `` for the selected date — `groupedShifts`). `ShiftGroup` has **no `id`** field.
- Add a button **`צור יומן הפעלה`** on each team card (next to existing edit/delete-group actions). It generates the **same** PNG directly from that group — **no form**. Mapping (`shiftGroupToDutyLogData`):

  | Duty-log field | From team |
  |---|---|
  | `shiftName` | `group.shiftName` |
  | `date` | the page's selected date (endDate via the shared helper) |
  | `startTime`/`endTime` | **fixed `'19:00'`/`'02:00'`** (this path ignores user time input) |
  | `vehicleNumber` | `group.carId` |
  | `people[]` | `group.shifts` → `{ name: volunteerName, phone: volunteerPhone }`, **filtering out** `isUnresolved` / blank `volunteerName` rows |

- No extra fetch — names+phones are already on the shift rows (do **not** call `volunteersService.getAll()` here).
- **DECIDE**: export immediately vs. open the shared preview dialog first (recommend preview; reuses the same component, no extra cost).

## 7. Shared architecture — one implementation, two callers (no duplication)
Both entry points funnel through the SAME code. Suggested module set under `web/client/src/features/duty-log/`:
1. **`DutyLogData`** — single normalized model: `{ shiftName; date: Date; startTime; endTime; vehicleNumber?; people: {name; phone?}[] }`.
2. **`DutyLogReport`** — one presentational RTL A4 component taking `DutyLogData`. **Static text, the team→car map, and the `deriveEndDate` helper are defined ONCE** (never duplicated).
3. **`exportDutyLogPng(data)`** — one export util/hook. Required readiness sequence before rasterizing (the cold-WebView font bug is the worst case):
   1. mount `<DutyLogReport>` off-screen with **real Hebrew text in the DOM** (not display:none);
   2. `await Promise.all([...])` of `document.fonts.load("400 16px 'Noto Sans Hebrew'", <Hebrew sample>)`, same for `500` and `700` — this **forces** the unicode-range subset request (the `@fontsource/noto-sans-hebrew` faces are `font-display:swap`, split by unicode-range, so `document.fonts.ready` alone can resolve prematurely and html2canvas would capture the fallback font);
   3. `await document.fonts.ready`;
   4. `await emblemImg.decode()`;
   5. double `requestAnimationFrame`;
   6. `html2canvas(node, { backgroundColor:'#ffffff', scale: Math.min(2, devicePixelRatio), useCORS:false })`; then PNG → download (desktop) / native bridge (Android per §5). Shared filename builder.
4. **`shiftGroupToDutyLogData(group, date)`** — the only Shifts-specific glue.

Flow: `form state ─┐` and `ShiftGroup ─(mapper)─┐` → same `DutyLogData` → same `DutyLogReport` → same `exportDutyLogPng`. The button is ~10 lines.

**Validation lives in `DutyLogPage` only** (required date / valid `HH:mm` / non-empty shift name / **≥1 person**). `DutyLogReport` and `exportDutyLogPng` accept any valid `DutyLogData`, **including 0 people** — the Shifts mapper does not enforce ≥1 person.

### Efficiency & quality
- Export module + html2canvas **lazy-loaded** (heavy lib; load only on export).
- No redundant fetches (Shifts path reuses in-memory rows).
- Mount the off-screen node **per export and unmount/clean up** afterward.
- Single source of truth for static text, presets, the team→car map, and `deriveEndDate`.

## Constraints & non-goals
- **No DB persistence, no new endpoints.** Only API call: existing `GET /volunteers` (form path only). No .NET/Ktor contract change — avoids the triplicated-contract trap (exception: §5 option B touches Android only).
- RTL: dialog close `left-4`; any `Switch` needs `dir="ltr"`; phone/time inputs `dir="ltr"`+`text-left`.

## Open decisions to resolve in the plan (each with your recommendation)
1. **Role gate** for Reports — default `['Admin','SystemManager']`.
2. **Combobox approach** — default **A** (Radix `Select` + free-text), vs **B** (`cmdk` `Command`-in-`Popover` — now installed, no new dep).
3. **Android save** — §5 **(A)** web-only/hide-on-Android vs **(B)** native bridge.
4. **Shifts button** — immediate export vs preview-first (recommend preview).
5. **Empty team** (0 resolved volunteers) — recommend allow (empty manpower table).
6. **Image format** — PNG (default) vs JPEG.
- `משמרת: ג'` is **STATIC** (no requirement mentions a shift letter); the 2 task descriptions are **STATIC** with only their `צוות` cell = `{shiftName}`; `יחידה` is **STATIC**. (Not open — listed for confirmation.)

## Acceptance criteria
- New `דו"חות → יומן הפעלה` menu item (role-gated) renders the form page; the `Index.tsx` case is keyed on `'duty-log'`.
- Filling the form + export produces a PNG matching the doc layout with all dynamic tokens substituted; times propagate to all **5** hour-cells; end-date rolls to +1 when crossing midnight via the shared helper.
- The rasterized PNG shows `19:00-02:00` (not reversed), correct Hebrew font (test after a **cold** Android launch), and a white background.
- Each Shifts team card has a working `צור יומן הפעלה` button producing the same PNG from team data (hours 19:00–02:00, unresolved rows excluded).
- Render + export logic exists **once** (shared module); the Shifts button only maps + calls; `deriveEndDate` and validation are not duplicated.
- Desktop download works; **Android behaves exactly per the chosen §5 option** (A: button hidden/disabled with a message; B: native save/share + `versionCode` bumped).
- No DB/endpoint changes; export lib lazy-loaded (main bundle not bloated); `command.tsx`/`cmdk` is imported only if option 2B was chosen.
