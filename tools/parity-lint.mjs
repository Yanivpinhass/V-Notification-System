#!/usr/bin/env node
// 0-LLM cross-platform constant parity lint. No LLM, no deps — pure regex over source. [ISS-004]
// Verifies the three string value-sets that MUST mirror across the triplicated implementations:
//   .NET MagavConstants.cs  ==  Android Constants.kt   (exact)
//   React schedulerPreview.ts  ⊆  canonical            (preview-exempt subset allowed)
// Run:  node tools/parity-lint.mjs      (exit 0 = in sync, exit 1 = drift)
//
// ACCEPTED, intentional divergences are encoded below so they are NOT re-flagged.
// Keep this list in sync with tools/parity.md.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const FILES = {
  dotnet: 'web/server/Magav.Common/MagavConstants.cs',
  android: 'android/app/src/main/java/com/magav/app/util/Constants.kt',
  react: 'web/client/src/pages/scheduler/schedulerPreview.ts',
};

// React schedulerPreview is a settings-page preview engine for the user-configurable scheduler rows
// only. LocationUpdate (event-triggered re-notify) and Manual (ad-hoc admin send) are not configurable
// rows, so they are intentionally absent from the React constants. NOT drift — see tools/parity.md.
const REACT_REMINDER_EXEMPT = ['LocationUpdate', 'Manual'];

// Extract the double-quoted string VALUES (RHS) inside a named block. We compare values, not the
// language-specific identifier names (.NET PascalCase vs Kotlin CONSTANT_CASE legitimately differ).
function valuesInBlock(src, blockRe) {
  const m = src.match(blockRe);
  if (!m) return null;
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort();
}

const dotnet = read(FILES.dotnet);
const android = read(FILES.android);
const react = read(FILES.react);

const dn = {
  ReminderTypes: valuesInBlock(dotnet, /class ReminderTypes\s*\{([\s\S]*?)\}/),
  SmsStatuses: valuesInBlock(dotnet, /class SmsStatuses\s*\{([\s\S]*?)\}/),
  DayGroups: valuesInBlock(dotnet, /class DayGroups\s*\{([\s\S]*?)\}/),
};
const an = {
  ReminderTypes: valuesInBlock(android, /object ReminderTypes\s*\{([\s\S]*?)\}/),
  SmsStatuses: valuesInBlock(android, /object SmsStatuses\s*\{([\s\S]*?)\}/),
  DayGroups: valuesInBlock(android, /object DayGroups\s*\{([\s\S]*?)\}/),
};

const errors = [];
const eq = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);

// 1) .NET vs Android — MUST be identical for all three value-sets.
for (const set of ['ReminderTypes', 'SmsStatuses', 'DayGroups']) {
  if (!dn[set]) { errors.push(`Could not parse ${set} from ${FILES.dotnet}`); continue; }
  if (!an[set]) { errors.push(`Could not parse ${set} from ${FILES.android}`); continue; }
  if (!eq(dn[set], an[set])) {
    errors.push(`${set} DRIFT: .NET [${dn[set]}] != Android [${an[set]}]`);
  }
}

// 2) React schedulerPreview reminder-type constants — must be a SUBSET of the canonical set,
//    and anything missing must be on the accepted-exempt list (LocationUpdate / Manual).
const reactReminderValues = [...react.matchAll(/export const (?:SAME_DAY|ADVANCE|WEEKDAY_ADVANCE)\s*=\s*'([^']+)'/g)]
  .map((x) => x[1]).sort();
const canonical = dn.ReminderTypes ?? [];
const unknownInReact = reactReminderValues.filter((v) => !canonical.includes(v));
if (unknownInReact.length) {
  errors.push(`React declares unknown ReminderType value(s): [${unknownInReact}] not in canonical [${canonical}]`);
}
const unexpectedMissing = canonical
  .filter((v) => !reactReminderValues.includes(v))
  .filter((v) => !REACT_REMINDER_EXEMPT.includes(v));
if (unexpectedMissing.length) {
  errors.push(`React is missing non-exempt ReminderType(s): [${unexpectedMissing}] (only [${REACT_REMINDER_EXEMPT}] are preview-exempt)`);
}

// 3) React DAY_GROUP_ORDER — must equal the canonical DayGroups set.
const reactDayGroups = (react.match(/DAY_GROUP_ORDER\s*=\s*\[([^\]]*)\]/)?.[1].match(/'([^']+)'/g) ?? [])
  .map((s) => s.replace(/'/g, '')).sort();
if (dn.DayGroups && !eq(reactDayGroups, dn.DayGroups)) {
  errors.push(`React DAY_GROUP_ORDER [${reactDayGroups}] != canonical DayGroups [${dn.DayGroups}]`);
}

if (errors.length) {
  console.error('✗ parity-lint: cross-platform constant DRIFT detected\n');
  for (const e of errors) console.error('  - ' + e);
  console.error('\nFix the constants in all impls, or (if intentional) record the divergence in');
  console.error('tools/parity.md and add it to the exempt list at the top of tools/parity-lint.mjs.');
  process.exit(1);
}

console.log('✓ parity-lint: cross-platform constants in sync');
console.log(`  ReminderTypes: ${dn.ReminderTypes.join(', ')}`);
console.log(`  SmsStatuses:   ${dn.SmsStatuses.join(', ')}`);
console.log(`  DayGroups:     ${dn.DayGroups.join(', ')}`);
console.log(`  React preview-exempt ReminderTypes (accepted): ${REACT_REMINDER_EXEMPT.join(', ')}`);
