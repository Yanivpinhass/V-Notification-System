# IMPLEMENTATION PLAN v2 — General Locations + Admin-Shift Location/Volunteer/SMS Upgrades

> **What this is.** A dependency-ordered, source-verified plan for the 5 user requirements dated 2026-07-14, extending the shipped administrative-shifts feature (see `admin-shifts-implementation-plan.md`, implemented at app v1.4.29 / versionCode 79 / Room v10):
> 1. New page **מיקומים כללי** (General locations) — same `Locations` table + a type discriminator column.
> 2. Admin-shift dialog: the **מיקום** picker lists General locations only; picking one **auto-fills כתובת** from the DB.
> 3. **מיקום רכב** becomes a picker over מיקומי ניידות (Vehicle locations), like operational shifts.
> 4. Edit admin shift: **add more volunteers** to the existing group.
> 5. Admin SMS carries **all data**: mission location + address + Waze link AND vehicle location + Waze link.
>
> All contracts triplicated (.NET / Android Ktor+Room / React) with no shared code — every change below is a 3-platform deliverable. No code is written here.

---

## 0. Verification note

Every anchor below was re-read against the CURRENT tree (2026-07-14, post-v1.4.29) by three parallel source-recon agents, and the drafted plan was then **adversarially validated by three independent verifier agents** (migration safety / requirements+contracts / sweep completeness). Their 6 confirmed findings are folded into §2a, §3, §4d, §6b, §8-§10 below; every other claim and anchor survived verification. (`graphify` CLI absent in this environment — direct Read/Grep; note greps must run with ignores disabled for the Android `db/` package, see the ISS-010 item below.) Key verified facts that shape the plan:

- **`Locations.Name` is UNIQUE table-wide on both platforms** — .NET `DbInitializer.cs:106` (+ the duplicated CREATE inside `MigrateLocationsAsync` at `:392`) and Android unique index `index_Locations_Name` (`LocationEntity.kt:8-11`, created in `MIGRATION_4_5` at `MagavDatabase.kt:101`). The POST/PUT duplicate-name checks are name-only (`Program.cs:431,470`; `LocationRoutes.kt:86-89,134-139`).
- **`GET /api/locations` returns ALL rows, no filter** (`Program.cs:388-402`; `LocationRoutes.kt:46-50`) — once General rows exist they would surface in every existing picker unless filtered.
- **All other Locations consumers are id-keyed joins/lookups** (verified exhaustively): 4 .NET `LEFT JOIN Locations` sites (`SmsReminderService.cs:63,:373`; `ShiftsRepository.cs:58,:84`) and every Android `locationDao()` caller outside `LocationRoutes.kt` — a type column affects none of them functionally.
- **DELETE guards check only `Shifts.LocationId`**: .NET `IsReferencedByFutureShiftsAsync` (`LocationsRepository.cs:16-26`); Android `countFutureShiftsByLocationId` (`LocationDao.kt:29-30`). Neither filters `IsCanceled`/`ShiftType` (pre-existing; unchanged). Both must ALSO count the new `VehicleLocationId`.
- **Android `ShiftEntity.LocationId` is a plain `Int?` with NO Room `@ForeignKey`** (`ShiftEntity.kt:16-23,48-49`) — the new `VehicleLocationId` MUST follow the same no-FK convention (declaring an FK on an existing Room entity changes the CREATE-TABLE shape → table rebuild → ADR-004 hazard).
- **No admin SMS path appends a location block today**: `.NET SendAdminSmsAsync` (`SmsReminderService.cs:308-357`) builds placeholders only; the scheduler loop gates the append to `SameDay` (`:122-123`); Android mirror `sendAdminSms` (`AdminShiftRoutes.kt:376-413`) + `execute()` gate (`service/SmsReminderService.kt:127-131`). **AdminAdvance scheduled sends bypass `SendAdminSmsAsync` entirely** — req 5 must touch BOTH the one-shot helper and the scheduler loop, on both platforms.
- **`BuildLocationText`/`buildLocationText`** (`SmsReminderService.cs:274-287`; `service/SmsReminderService.kt:280-285`) hardcode the wording "הניידת נמצאת ב…" + Waze `navigate=yes` — perfect for the VEHICLE block verbatim; NOT reusable for the mission block (wrong wording).
- **`update-group` has no volunteer capability** on either platform (`Program.cs:1494-1527`; `AdminShiftRoutes.kt:227-270`) — it updates group fields only.
- **Admin create has NO duplicate-volunteer guard** (`Program.cs:1403-1491` loop at `:1428`; `AdminShiftRoutes.kt:145-224`) — relevant because req 4 reuses create to add volunteers (§6d).
- **React**: `LocationsManagementPage.tsx` has exactly ONE ניידות-specific string (title, `:82`) — parameterization is LOW-cost; `LocationDialog.tsx` submits `LocationRequest` with no type (`:89,:97`). The operational picker pattern to mirror is `renderLocationPicker` (`ShiftsManagementPage.tsx:230-268`: Select `'none' | '<id>' | 'other'` + custom name/nav inputs). `AdminShiftsPage.tsx` currently: numeric `0` sentinel for מיקום (`:37-47`), free-text מיקום רכב (`:404-407`), volunteer picker create-only (`:410-447`), edit-mode hint replaced by req 4 (`:448-452`), `buildCommon` (`:161-167`). Duty-log reads NO location data (verified zero matches) — unaffected.

**User decisions confirmed 2026-07-14** (via direct Q&A):
- **V2-D1 — SMS scope: ALL admin sends** (assignment, today, AND the automated AdminAdvance) append the full mission-location + vehicle-location blocks.
- **V2-D2 — Edit adds volunteers, with optional SMS**: edit dialog gets the volunteer picker (existing members locked); footer buttons שמירה / שמירה ושליחת SMS — the SMS goes to **newly added volunteers only** (assignment template).
- **V2-D3 — Both pickers keep a free-text fallback** (mission location AND vehicle location). Free-text entries have no Waze link and no address autofill — accepted.

**Recommended defaults adopted (not re-asked; call out if you object):**
- **LocationType values `Vehicle` / `General`** (English string constants, mirroring the `ShiftTypes` doctrine); existing rows backfill to `Vehicle` via column DEFAULT (every existing row IS a מיקום ניידת today).
- **Name uniqueness stays GLOBAL across both types** — the Android unique index can't gain a type dimension without a table rebuild (ADR-004); a Vehicle and a General location can't share a name. Low cost, high safety.
- **`GET /api/locations` DEFAULTS to `type=Vehicle` when the param is absent** — every existing caller (operational picker, old cached clients) keeps seeing exactly today's set with zero changes; only new/updated callers pass `type=General` / `type=All`.
- **Vehicle free-text stays in the existing `VehicleLocation` TEXT column**; picked vehicle locations go in the NEW `VehicleLocationId` column. If both are somehow present, **id wins** (server-side rule).
- **Address semantics**: picking a General location copies its `Address` into the editable כתובת field (client-side autofill); the per-shift `Address` column stores the (possibly edited) snapshot; the SMS uses the **snapshot address** + the **live location row's name/Waze** at send time.
- **Volunteer removal stays per-row** (trash icon on the card) — the edit dialog only ADDS.

---

## 1. Constants + parity-lint (FIRST — everything keys off these strings)

- **`.NET web/server/Magav.Common/MagavConstants.cs`**: add nested `public static class LocationTypes { public const string Vehicle = "Vehicle"; public const string General = "General"; }` (beside `ShiftTypes`).
- **Android `util/Constants.kt`**: add `object LocationTypes { const val VEHICLE = "Vehicle"; const val GENERAL = "General" }`.
- **`tools/parity-lint.mjs`**: add `LocationTypes` to the extraction maps (`class LocationTypes` / `object LocationTypes`) and to the .NET-vs-Android compare loop (5th value-set, exactly like the `ShiftTypes` extension). Update `tools/parity.md` ("in sync today" + canonical-owner sections). **`node tools/parity-lint.mjs` must exit 0.**

## 2. DB schema + migrations (Room 10 → 11; existing-DB backfill mandatory)

### 2a. Android (the data-safety-critical half)

> **🔒 NON-NEGOTIABLE DATA-SAFETY INVARIANT (user requirement): the Android DB / user data must NEVER be deleted by this feature.** Verified against `MagavApplication.kt:112-137`: `initializeDatabase()` opens the DB and, on ANY failure that is **not** a SQLCipher key/corruption error (`"file is not a database"` / `"file is encrypted"` / `"not a database"`), **re-throws with the DB untouched** (log: *"Database open failed — preserving DB, rethrowing"*) — a forgotten migration or entity/migration mismatch therefore CRASHES VISIBLY, it does NOT wipe. `fallbackToDestructiveMigration` is absent and MUST stay absent. `MIGRATION_10_11` is purely additive (`ALTER TABLE … ADD COLUMN`) — no `DROP`, no table rebuild, no data touched. **The only code path that deletes the DB is the SQLCipher key-corruption recovery (`:126-136`), which is unrelated to migrations and is NOT touched by this feature.** Concretely: (1) the migration never deletes data; (2) a *botched* migration never deletes data (it crashes — which is why §9 mandates testing on a populated v10 device BEFORE shipping, so it never crashes in the field); (3) never instruct a user to "clear data" / uninstall to recover — that is the one manual action that WOULD wipe (see the corrected rollback note in §11).

- **`db/entity/LocationEntity.kt`**: add `@ColumnInfo(name = "LocationType", defaultValue = "Vehicle") val locationType: String = "Vehicle"`. NO new index; the unique `index_Locations_Name` untouched.
- **`db/entity/ShiftEntity.kt`**: add `@ColumnInfo(name = "VehicleLocationId") val vehicleLocationId: Int? = null` — plain nullable Int, **NO `@ForeignKey`, NO index** (matches the `LocationId` convention at `:48-49`).
- **`db/MagavDatabase.kt`**: bump `version = 11` (`:44`); add `MIGRATION_10_11` mirroring the `MIGRATION_9_10` additive pattern (`:177-185`):
  ```
  ALTER TABLE Locations ADD COLUMN LocationType TEXT NOT NULL DEFAULT 'Vehicle'
  ALTER TABLE Shifts ADD COLUMN VehicleLocationId INTEGER
  ```
  Column names / NOT-NULL / DEFAULT must **byte-match the entities** (Room schema-hash check, ADR-004). `NOT NULL DEFAULT` legal because a default is supplied; existing locations backfill to `Vehicle`.
- **`MagavApplication.kt`**: append `MIGRATION_10_11` to **BOTH** `addMigrations` sites — `:109` (main) AND `:135` (SQLCipher recovery). Never add `fallbackToDestructiveMigration`.
- **Bump `versionCode`** in `android/app/build.gradle.kts` (79 → 80) before the APK build.
- **⚠ ISS-010 IS WIDER THAN DOCUMENTED — VERIFIED (validator finding #1): 12 Android `db/`-package source files exist on disk but are UNTRACKED and git-ignored** by the root `.gitignore:41` `db/` rule — including **`db/entity/ShiftEntity.kt`** (which already carries the v1 admin columns and gets this plan's `VehicleLocationId` edit) and `db/dao/MessageTemplateDao.kt`, `AppSettingDao.kt`, `UserDao.kt`, `VolunteerDao.kt`, `AiQueryDtos.kt`, `SmsLogDetailDto.kt`, and entities `SchedulerConfigEntity.kt`, `SchedulerRunLogEntity.kt`, `UserEntity.kt`, `AppSettingEntity.kt`, `MessageTemplateEntity.kt`. Concrete hazard: `MIGRATION_10_11` lands in the TRACKED `MagavDatabase.kt` while the entity it must byte-match is UNTRACKED — a commit then produces a repo whose clean checkout builds an APK with a mismatched Room schema-hash → crash at DB open on every migrated device. **Mandatory step (§8.0): `git add -f` all 12 files, and fix `.gitignore` with a NEGATION (not a root-anchor).**
> **⚠ DO NOT change `db/` to `/db/` — that is UNSAFE and was corrected during final review.** Verified blast radius: the bare `db/` rule currently also ignores the repo-root `db/` (holds the live `magav.db` + `db/Pass.txt` — a plaintext password file) AND `web/db/` (another live DB). Root-anchoring to `/db/` would stop ignoring `web/db/`, risking a committed database + secrets. The build artifacts under `android/app/build/.../db/` are already ignored by the separate `android/app/build/` rule (`.gitignore:22`) — independent of this rule. **Correct fix (scratch-tested): keep every existing DB rule and APPEND a re-include for the source package only:**
> ```gitignore
> # Re-include the Android Room SOURCE package (NOT a database — ISS-010 fix)
> !android/app/src/main/java/com/magav/app/db/
> !android/app/src/main/java/com/magav/app/db/**
> ```
> Verified: source `.kt` becomes tracked while `db/magav.db`, `db/Pass.txt`, and `web/db/magav.db` all STAY ignored. Put the negations LAST in the file. Also note: Grep/ripgrep silently skip these files unless ignores are disabled — audit greps accordingly.

### 2b. .NET
- **`Magav.Common/Models/Location.cs`**: add `public string LocationType { get; set; } = MagavConstants.LocationTypes.Vehicle;` (NPoco auto-maps).
- **`Magav.Common/Models/Shift.cs`**: add `public int? VehicleLocationId { get; set; }`.
- **`DbInitializer.cs`** — THREE DDL sites + one new migration:
  1. Fresh `CREATE TABLE Locations` (`:103-113`): add `LocationType TEXT NOT NULL DEFAULT 'Vehicle'`.
  2. The DUPLICATED Locations CREATE inside `MigrateLocationsAsync` (`:389-399`): same column (this copy runs when an old DB predates the Locations table).
  3. Fresh `CREATE TABLE Shifts`: add `VehicleLocationId INTEGER NULL` (plain — no FK, keeping the migrated/fresh schemas identical and matching the Android no-FK convention).
  4. **New idempotent `MigrateLocationTypeColumnsAsync`** following the `MigrateShiftTypeColumnsAsync` PRAGMA pattern (`:486-530`): `PRAGMA table_info(Locations)` → `ALTER TABLE Locations ADD COLUMN LocationType TEXT NOT NULL DEFAULT 'Vehicle'` if absent (+ belt-and-suspenders `UPDATE Locations SET LocationType='Vehicle' WHERE LocationType IS NULL`); `PRAGMA table_info(Shifts)` → `ALTER TABLE Shifts ADD COLUMN VehicleLocationId INTEGER NULL` if absent. **Call it in the existing-DB block** right after `MigrateShiftTypeColumnsAsync` (`:297`).
- **No seeding** — verified: nothing seeds Locations on either platform; all rows are user-created and backfill via the DEFAULT.

## 3. Locations API — type awareness (both platforms)

### 3a. .NET (`Program.cs`, locations block `:383-514`; all stay `CanManageMessages`)
- **`GET /api/locations`** (`:388-402`): accept optional `?type=` — `Vehicle` (DEFAULT when absent) | `General` | `All`; any other value → 400 `Results.Json(ApiResponse.Fail(...))`. Filter via repo (`GetByTypeAsync(string type)` on `LocationsRepository`, expression-based) or `.Where` — parameterized either way.
- **`POST` (`:424-456`) / `PUT` (`:459-490`)**: `LocationRequest` (record `:2620`) gains `string? Type = null`; validate ∈ {Vehicle, General} when present. **Defaults differ by verb (validator finding #4): POST resolves `Type ?? Vehicle` (back-compat for old clients creating patrol locations); PUT resolves `Type ?? existing.LocationType`** — defaulting PUT to Vehicle would silently flip a General row to Vehicle whenever any caller omits the field (both current PUT handlers overwrite every entity field: `Program.cs:474-478`, `LocationRoutes.kt:141-150`). An EXPLICIT `Type` on PUT is honored (legitimate type change). Duplicate-name checks stay GLOBAL (unchanged).
- **`DELETE` guard**: `IsReferencedByFutureShiftsAsync` (`LocationsRepository.cs:22-24`) becomes `WHERE (LocationId = @0 OR VehicleLocationId = @0) AND ShiftDate >= @1`.
- Response DTOs: the GET endpoints return the `Location` entity — `LocationType` rides along automatically (NPoco + System.Text.Json camelCase → `locationType`).

### 3b. Android Ktor (`LocationRoutes.kt`; roles unchanged `"Admin","SystemManager"`)
- **`LocationDto`** (`:20-29`) + `toDto` (`:31-39`): add `locationType: String`.
- **`LocationRequest`** (`api/models/RequestDtos.kt:248-254`): add `val type: String? = null`.
- **GET** (`:46-50`): read `call.request.queryParameters["type"]`, default `Vehicle`, validate, filter the `getAll()` result in the handler (table is tiny; keeps `LocationDao.getAll()` untouched for the id-keyed consumers).
- **POST** (`:77-104`): resolve `type ?? VEHICLE`, validate, write `locationType`. **PUT** (`:107-152`): resolve `type ?? existing.locationType` (same preserve-on-omit rule as .NET — the handler's `existing.copy(...)` at `:141-150` would otherwise flip the type).
- **DELETE** (`:155-190`): `LocationDao.countFutureShiftsByLocationId` (`:29-30`) becomes `WHERE (LocationId = :locationId OR VehicleLocationId = :locationId) AND ShiftDate >= :today`.

## 4. Admin-shift contract changes (both platforms)

### 4a. Request/response DTOs
- **`CreateAdminShiftRequest`** (.NET `:2631-2636`; Kotlin `AdminShiftRoutes.kt:53-66`; TS `shiftsService.ts:82-94`): add `VehicleLocationId int?` / `vehicleLocationId: Int? = null` / `vehicleLocationId?: number | null`.
- **`UpdateAdminShiftGroupRequest`** (.NET `:2638-2643`; Kotlin `:68-81`; TS `:96-108`): add the same field.
- **`AdminShiftRow`** (.NET `Magav.Common/Models/AdminShiftRow.cs`) + **`AdminShiftDto`** (Kotlin `:33-51`; TS `:63-80`): add `VehicleLocationId int?`, `VehicleLocationName string?`, `VehicleLocationNavigation string?`, `VehicleLocationCity string?` (needed for the week-card display, `openEdit` state mapping, and UI Waze links).

### 4b. Persistence
- **.NET create** (`Program.cs:1434-1450`): set `VehicleLocationId = request.VehicleLocationId`. **Server rule: if both `VehicleLocationId` and free-text `VehicleLocation` arrive, the id wins** (null out the text) — one canonical source per shift.
- **.NET `UpdateAdminGroupAsync`** (`ShiftsRepository.cs`, the UPDATE keyed on old (Date, ShiftTime, Description)): add `VehicleLocationId = @N` to the SET list (+ the id-wins rule applied by the endpoint before calling).
- **.NET by-week `GetAdministrativeByWeekAsync`** (`ShiftsRepository.cs:74-90`, join at `:84`): add a SECOND `LEFT JOIN Locations vl ON s.VehicleLocationId = vl.Id` + projections `s.VehicleLocationId, COALESCE(vl.Name, s.VehicleLocation) AS VehicleLocationName, vl.Navigation AS VehicleLocationNavigation, vl.City AS VehicleLocationCity`.
- **Android mirrors**: create (`AdminShiftRoutes.kt:178-202`) sets `vehicleLocationId`; `ShiftDao.updateAdminGroup` `@Query` gains `VehicleLocationId = :vehicleLocationId`; by-week (`:100-142`) resolves `vehicleLocationId` through the already-loaded `locationMap` (`:116`) with `?: shift.vehicleLocation` fallback for the name.

### 4c. Duplicate-volunteer guard on create (prerequisite for req 4)
Admin create currently inserts blindly. Add on BOTH platforms: before inserting, load the ACTIVE volunteer-ids already in the target `(Date, ShiftTime, Description)` group (`ShiftType='Administrative' AND IsCanceled=0`) and **skip** volunteers already present (don't error — the edit flow legitimately re-posts the group with adds). `Created` in the response reflects actual inserts; SMS (when `sendSms`) goes only to actually-inserted volunteers. (.NET: small repo query or reuse `CountAdminGroupAsync`'s WHERE shape with a `SELECT VolunteerId`; Android: new small `@Query` on ShiftDao.)

### 4d. Add-volunteers-in-edit (V2-D2) — NO new endpoint
The client implements "add volunteers" as: **(1)** `PUT update-group` with the (possibly changed) field values, then **(2)** if any volunteers were newly checked, `POST create` carrying the **NEW** group key (`newDescription`/`date`/`newShiftTime`), the added `volunteerIds`, `sendSms` per the button pressed, **AND the FULL field payload — the same `buildCommon()` fields as the PUT (address, locationId/customLocationName, carId, vehicleLocationId, vehicleLocation)** (validator finding #2: the create endpoints write ALL group fields into the new rows — `Program.cs:1434-1450`, `AdminShiftRoutes.kt:184-199` — so a key-only payload would create rows with NULL location/address/vehicle data, intra-group field divergence, and an assignment SMS violating req 5). Identical-triple rows merge into the group by design (v1 plan D3); the §4c guard makes this idempotent. Two ordering/failure rules (validator finding #6):
- **Order**: update FIRST (it may re-bucket the key), then create against the NEW key.
- **Partial-failure recovery**: after a successful PUT, the client immediately **updates its `editKey` to the NEW key** before running step 2. If step 2 then fails and the user retries, the re-run PUTs against the CURRENT key (a no-change update that matches) instead of the consumed OLD key (which would 404 "לא נמצאו שיבוצים לעדכון" and permanently strand the adds); the retried create is idempotent per §4c.

## 5. SMS content (req 5, V2-D1: ALL admin sends) — both platforms

### 5a. New mission-location block builder (shared wording, both platforms)
`BuildAdminLocationText(name, address, navigation)` / mirror: returns `""` if all empty; else
```
\nמיקום המשימה: {name}          (line present only if name non-empty)
\nכתובת: {address}               (line present only if address non-empty)
\n{AppendWazeNavigate(navigation)} (line present only if navigation non-empty)
```
Inputs: `name` = live location row's Name (or `CustomLocationName` for free-text — then no Waze), `address` = the shift's **snapshot** `Address` column, `navigation` = live row's Navigation. Reuses the existing `AppendWazeNavigate`/`appendWazeNavigate` (`SmsReminderService.cs:289-302`; `service/SmsReminderService.kt:287-296`).

### 5b. Vehicle block — reuse `BuildLocationText`/`buildLocationText` VERBATIM
The existing builder's wording ("הניידת נמצאת ב{city} ({name})" + Waze) is exactly right for a vehicle location. Inputs resolved from `VehicleLocationId` → live row (name/city/navigation). **Free-text fallback** (`VehicleLocation` set, id null): append `\nמיקום הרכב: {text}` instead (no Waze).

### 5c. Wiring — the four send paths
| Path | File / anchor | Change |
|---|---|---|
| .NET one-shot (assignment / today / save+send) | `SendAdminSmsAsync` (`SmsReminderService.cs:308-357`) | After `BuildMessage` (`:337`): resolve vehicle row via `db.Locations.GetByIdAsync(shift.VehicleLocationId)` when set; append mission block (§5a) + vehicle block (§5b). |
| .NET scheduled AdminAdvance | scheduler loop (`SmsReminderService.cs:112-123`) | Add `else if (reminderType == AdminAdvance) message += missionBlock + vehicleBlock`. The `SameDay` branch (`:122-123`) stays byte-identical. Eligibility SELECT (`:53-76`) gains a second `LEFT JOIN Locations vl ON s.VehicleLocationId = vl.Id` + projections; `ShiftVolunteerDto` gains `VehicleLocationName/VehicleLocationCity/VehicleLocationNavigation` (it already carries `Address`/`VehicleLocation`). |
| Android one-shot | `sendAdminSms` (`AdminShiftRoutes.kt:376-413`) | Same append after `buildMessage` (`:387-394`); vehicle row via `locationDao().getById(shift.vehicleLocationId)`. |
| Android scheduled | `execute()` (`service/SmsReminderService.kt:112-131`) | Add an `ADMIN_ADVANCE` append branch beside the `SAME_DAY` gate (`:127-131`); the `locationMap` is already bulk-loaded for `ADMIN_ADVANCE` (`:68-72`) — look up `shift.vehicleLocationId` in it. |
- **Operational sends untouched** — the `SameDay` append and `LocationUpdate` flow keep their exact current behavior; the new blocks are gated to admin paths only.
- `{מיקום רכב}` placeholder now resolves to the picked vehicle location's NAME when `VehicleLocationId` is set, else the free text (thread through `buildMessage`'s existing `vehicleLocation` param / DTO field). Mild duplication possible if a template contains the placeholder AND the appended block — acceptable; the seeded templates don't.

## 6. React UI

### 6a. Locations page — parameterize, don't duplicate
- `LocationsManagementPage.tsx`: accept props `{ locationType: 'Vehicle' | 'General'; title: string }` (defaults `Vehicle` / `'מיקומי ניידות'`); title at `:82` → `{title}`; `loadLocations` (`:33`) → `locationsService.getAll(locationType)`; pass `locationType` down to `LocationDialog`.
- `components/locations/LocationDialog.tsx`: accept `locationType` prop; include `type: locationType` in the create/update request (`:89,:97`). `DeleteLocationDialog` unchanged.
- `services/locationsService.ts`: `LocationDto` + `LocationRequest` gain `locationType`/`type`; `getAll(type?: 'Vehicle' | 'General' | 'All')` sends `?type=`.
- **Menu + routing**: `menuItems.ts` locations parent (`:27-35`) gains `{ id: 'general-locations', title: 'מיקומים כללי', path: '/locations/general' }`; `Index.tsx` case `'general-locations'` → `<LocationsManagementPage locationType="General" title="מיקומים כללי" />`; the existing `'locations-management'` case passes `locationType="Vehicle"` explicitly.
- **Operational picker caller**: `ShiftsManagementPage.tsx:217` → `getAll('Vehicle')` (explicit; behavior unchanged either way thanks to the server default).

### 6b. Admin dialog (`AdminShiftsPage.tsx`)
- `loadData` (`:78-95`): load **two** lists — `getAll('General')` (mission picker) + `getAll('Vehicle')` (vehicle picker) — in the existing `Promise.all`.
- **מיקום picker** (`:378-391`): options = General locations; keep `"0"` = "ללא מיקום מוגדר" + the free-text custom-name input. **Autofill (req 2)**: in the Select's `onValueChange`, when a location id is picked set `form.address = loc.address ?? ''` (field stays editable; switching back to none/custom leaves the address as-is).
- **⚠ Legacy-data rule for the mission picker (validator finding #3)**: every admin shift created before v2 references a location that the backfill types **Vehicle** (the v1 picker listed the unfiltered list — `:85`,`:384`), so after the General-only switch its id would match NO option — the Select silently renders the placeholder while `buildCommon()` keeps re-emitting the invisible id, and the user can neither see nor deliberately keep the current location. **Mitigation**: when `openEdit` finds a `locationId` that is not in the General options, append ONE extra `SelectItem` for it labeled `{locationName} (מיקום ניידת)` — the current reference stays visible and is preserved unless the user actively re-picks. (New selections remain General-only.)
- **מיקום רכב** (`:404-407`): replace the free-text Input with the operational-style picker — Select over Vehicle locations with `'none' | '<id>' | 'other'`; `'other'` reveals the free-text input bound to `form.vehicleLocation`. **Form state must be the STRING selection convention (validator finding #5)**: `vehicleLocationSelection: 'none' | '<id>' | 'other'` (mirroring `ShiftsManagementPage.tsx:230-268`) — a single numeric 0-sentinel cannot distinguish 'none' from 'other' (picking 'other' with empty text would collapse back to 'none' and hide the input). At submit, `buildCommon()` derives: selection is an id → `vehicleLocationId: Number(sel)`, `vehicleLocation: null`; `'other'` → `vehicleLocationId: null`, `vehicleLocation: text || null`; `'none'` → both null.
- **`openEdit`** (`:130-144`): map the group into the selection state — `vehicleLocationId` set → `'<id>'`; else `vehicleLocation` text set → `'other'` + text; else `'none'`. Mission picker per the legacy rule above.
- **Group card** (`:302-311`): show the vehicle location NAME (`vehicleLocationName ?? vehicleLocation`).
- **Edit-mode volunteer picker (V2-D2)**: show the picker in edit too (replacing the hint at `:448-452`); existing group members rendered checked + **disabled** ("existing" badge); newly checked ids tracked as `addedVolunteerIds`. Footer in edit mode becomes TWO buttons: שמירה (update, + create-adds with `sendSms:false`) / שמירה ושליחת SMS (update, + create-adds with `sendSms:true`). Flow per §4d — the create-adds POST carries the FULL `buildCommon()` payload, and `editKey` is refreshed to the new key immediately after a successful PUT (partial-failure recovery). The search box works in both modes.

## 7. Filter/regression sweep for the new type surface

The by-id doctrine holds: **every Locations consumer except the list GET is id-keyed and stays type-agnostic** (verified inventory in §0). The complete sweep is therefore small:
| Site | Change |
|---|---|
| `GET /api/locations` (.NET `:388-402` / Ktor `:46-50`) | `?type=`, default Vehicle (§3) — the ONLY type filter in the system |
| DELETE guards (.NET `LocationsRepository.cs:22-24` / Android `LocationDao.kt:29-30`) | add `OR VehicleLocationId = …` (§3) |
| Everything else (4 .NET join sites, all Android id-keyed callers, operational by-date location map `Program.cs:711` / `ShiftRoutes.kt:73`, duty-log) | **NO CHANGE** — id-keyed / no location data |

## 8. Execution order

0. **Git hygiene FIRST (validator finding #1, corrected in final review)**: append the source-package re-include negation to `.gitignore` (§0 block — NOT the unsafe `/db/` anchor), then `git add -f` the 12 untracked `db/`-package files (§0 list); verify with `git check-ignore` + `git status` that `ShiftEntity.kt` (and the other 11) now appear tracked/staged AND that `db/magav.db`, `db/Pass.txt`, and `web/db/` are STILL ignored. *(Requires user's go-ahead per the no-proactive-git-writes rule — but it MUST land in the same commit as this feature.)*
1. Constants + parity-lint (§1) → lint green.
2. Schema/migrations both platforms (§2) — Android entity edits + `MIGRATION_10_11` + BOTH `addMigrations` sites + version 11 + versionCode 80; .NET model + 3 DDL sites + `MigrateLocationTypeColumnsAsync`.
3. Locations API typed (§3, .NET then Android) + DELETE-guard extension.
4. Admin contract: DTOs + persistence + by-week joins + dup-volunteer guard (§4a-c).
5. SMS blocks: builders + 4 send paths (§5).
6. React: services → locations pages/menu → admin dialog (§6).
7. Builds: `node tools/parity-lint.mjs` (0) · web `npm run build` + `npx tsc --noEmit` · `dotnet build` (0 errors) · `build-apk.bat` flow → report APK path.
8. Verification (§9).

## 9. Manual verification checklist

**Migration safety (foremost):**
- Populated web `magav.db` (v1 schema) → run API → `LocationType` added, all rows `Vehicle`, `VehicleLocationId` added, zero data loss.
- **Populated Android device at Room v10** → install → `MIGRATION_10_11` runs, no "שגיאה באתחול המערכת", locations/shifts intact; SQLCipher recovery NOT triggered.

**Type isolation:**
- Create a General location → it appears ONLY on מיקומים כללי; the מיקומי ניידות page, the operational shift picker, and old cached clients (default `type=Vehicle`) never see it — and vice versa.
- Name collision across types is rejected (global uniqueness, unchanged Hebrew error).
- Deleting a location referenced by a future shift's `VehicleLocationId` is blocked; unreferenced General locations delete fine.

**Admin dialog:**
- מיקום picker lists General only; picking one fills כתובת (then editable); free-text fallback still works (no autofill).
- **Edit a PRE-v2 admin group whose mission location is a Vehicle-typed row** (created under v1): the current location renders as the extra "(מיקום ניידת)" option, is preserved on an innocent save, and is replaced only when actively re-picked.
- מיקום רכב picker lists Vehicle locations; 'other' free text works (including 'other' with the text still empty — the input must stay visible); edit round-trips all three selection states correctly.
- Edit adds volunteers: existing members locked-checked; save adds rows into the SAME group (no re-bucket surprise when key fields also changed); the new rows carry the group's full field data (no NULL location/address/vehicle on the added rows); שמירה ושליחת SMS sends the assignment template to newly added only; re-adding an existing member is a silent no-op (§4c).
- **Partial-failure retry**: change the group's שעה AND add a volunteer, force step-2 to fail (e.g., airplane mode after the PUT) → retry from the still-open dialog succeeds (no 404, adds land in the re-bucketed group).
- **PUT-omits-type regression**: update a General location via the API with no `type` field → its type is preserved (does not flip to Vehicle / vanish from מיקומים כללי).

**SMS (all three admin send types + scheduler):**
- Manual assignment, manual today, save+send, AND a fired AdminAdvance each end with: mission block (מיקום המשימה + כתובת + Waze `navigate=yes`) then vehicle block (הניידת נמצאת ב… + Waze). Free-text variants degrade (name-only lines, no Waze, no dangling labels/blank lines).
- Operational SameDay/Advance/LocationUpdate SMS remain **byte-identical** (no admin blocks, append gate untouched).

**Parity/builds:** parity-lint exit 0 (incl. `LocationTypes`); all three builds green; versionCode 80 APK path reported.

## 10. Top risks & mitigations

- **R1 — Room migration 10→11** (highest severity): additive-only, no index change, no FK, both `addMigrations` sites, entity byte-match; verified on a populated v10 device before shipping.
- **R2 — General locations leaking into operational pickers**: closed by the ONE list-endpoint filter + `Vehicle` default (old clients safe); everything else id-keyed (verified inventory §0/§7).
- **R3 — AdminAdvance path forgotten** (it bypasses `SendAdminSmsAsync`): §5c explicitly wires the scheduler loop on both platforms; §9 tests a fired AdminAdvance.
- **R4 — Edit-add flow double-inserting volunteers**: §4c server-side dup guard makes the create-merge idempotent on both platforms.
- **R5 — Update-then-add ordering AND partial failure**: client updates the group key FIRST, then creates adds against the NEW key, refreshing `editKey` after the PUT so a step-2 failure is retryable (§4d); getting either wrong strands the adds.
- **R6 — Cross-platform drift**: every change above is a 3-platform deliverable; parity-lint extended (`LocationTypes`); the SMS block wording must be byte-identical .NET↔Android (same two builders, same order: template → mission → vehicle).
- **R7 — The ISS-010 git landmine (verified)**: 12 untracked-but-ignored Android `db/` files, incl. the entity this plan edits. Without §8.0, a future commit ships a migration whose entity never reaches the repo → clean-checkout builds crash every migrated device at DB open. Fix is §8.0 (`git add -f` + root-anchored `.gitignore`), gated on user approval.
- **R8 — Legacy Vehicle-typed mission references**: pre-v2 admin shifts keep working via the §6b extra-option rule; without it, editing such a group silently hides (and can silently drop) its location.

## 11. Production / deployment notes (verified in final review — informational, no code change)

- **Upgrade chaining is safe.** Android devices at Room **v9** (app v76) upgrade **9→10→11** because `MIGRATION_9_10` stays registered alongside the new `MIGRATION_10_11` at both `addMigrations` sites; fresh v11 installs and migrated installs converge to the same schema (all additive). Web: `MigrateLocationsAsync` (`:294`) creates the Locations table before `MigrateLocationTypeColumnsAsync` (`:297`) alters it — order verified safe.
- **Stale-client windows are safe** (additive DTO fields + GET default=Vehicle): an old cached WebView UI or old deployed SPA hitting the new server sees today's behavior; an old client POSTing a location without `type` → `Vehicle` (correct), and creating an admin shift without `vehicleLocationId` → `null` (fine).
- **⚠ Rollback is one-way, but NEVER destructive (corrected).** Once v80 migrates a device's DB to Room **11**, sideloading the OLD **v79** APK (expects v10) hits Room's no-downgrade-path exception → `initializeDatabase()` re-throws it (not a cipher error) → the app shows the error notification and won't open, **but the DB and all data are PRESERVED** (`MagavApplication.kt:122-124` re-throws without deleting). **Recovery = reinstall the v80+ APK** (it opens Room 11 fine, data intact) — do NOT "clear data"/uninstall (the one manual action that wipes). Same one-way property as the shipped v1 (v9→v10) rollout — not introduced here. Rollout rule: **"ship a forward fix (v81), not a downgrade."** The .NET side tolerates extra columns, so a web API rollback is safe.
- **SMS segment cost rises (functionally safe).** Appending the mission block + address + Waze URL + vehicle block + Waze URL to a Hebrew (UCS-2, 70-char) message will typically span **4–6 segments**. Sending is correct — Android uses `divideMessage` + `sendMultipartTextMessage` (`AndroidSmsProvider.kt:99,118`); the .NET InforUMobile gateway splits server-side — so no truncation, but **per-SMS cost increases** for admin sends. (Operational SameDay already appends one location block + Waze today, so the pattern/cost exists; this adds the second, vehicle, block.) Flag for the user's SMS-budget awareness; the seeded admin templates are short, so most of the length is the two optional location blocks (present only when data exists).
- **⚠ GATE v2 ROLLOUT ON THE OPEN INCIDENT.** There is an UNRESOLVED production incident: the embedded Ktor server is not running on the user's device ("Failed to fetch", logcat pending). v2 ships `MIGRATION_10_11`, which runs against **that same device's DB** on the next install. Do **not** roll v2 to that device until the "Failed to fetch" root cause is diagnosed and the device is confirmed healthy at v10 — installing v2 first would entangle a fresh migration with an unexplained startup failure and make both harder to diagnose. Recommended sequence: (1) diagnose/fix the incident on the current APK, (2) confirm the device boots + server runs at v10, (3) then install v2 and verify `MIGRATION_10_11`.
