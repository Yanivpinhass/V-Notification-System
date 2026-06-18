<!-- DEEPINIT:START (managed — regenerated on each `deep-init` run; edit OUTSIDE these markers) -->
# common (Magav.Common) — scoped context

Shared .NET 8 library (leaf of the chain `common → server → api`): Models, the custom `DbHelper`/NPoco ORM wrapper, `MagavConstants`, Excel utilities, encryption. Full detail → `.ai/docs/components/common.md`.

## Critical to know
- **`DbHelper` method names differ from NPoco defaults** — use `FetchAllAsync()` for all rows (no-arg), `FetchAsync<T>(expr | sql,args)`, `ExecuteQueryAsync` (NOT `ExecuteAsync`), `ExecuteScalarAsync<T>`, `SingleOrDefaultByIdAsync` (`Database/DbHelper.cs`). Parameterized args only (`@0,@1…`) — never concatenate SQL.
- **`MagavConstants` is the canonical source of the cross-platform string constants** (`MagavConstants.cs`): `ReminderTypes` = SameDay/Advance/WeekdayAdvance/LocationUpdate/Manual (5); `SmsStatuses` = Success/Fail; `DayGroups` = SunThu/Fri/Sat. **Android `util/Constants.kt` must mirror these exactly.** Use the constants, never inline the strings.
- **`MagavConstants.cs:7` hardcodes `PasswordKey`** (an encryption key constant) used by `Encryption/EncryptedConnectionStringsProvider.cs` to decrypt the connection string — a hardcoded key in source. [ISS-007]
- **Entities are mutated in place, not copied** (no value-semantics) — `IndexedList<T>` is the core in-memory structure.
- `DbHelper` appears **vendored from another codebase** ("Avidov.Common") — treat as a library; small latent bugs noted in the deep doc (`DbHelperCore.cs` 30s-vs-1s sleep, `IndexedList.RemoveItem` always returns true). AutoMapper + RepoDb are referenced but unused.
- Boundary: this is the **leaf layer** — it must not depend on `server`/`api`.
<!-- DEEPINIT:END -->
