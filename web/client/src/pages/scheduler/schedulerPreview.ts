// Pure preview engine + corrected (send-day framed) copy for the scheduler settings page.
// IMPORTANT MODEL: a scheduler config RUNS on the days of its DayGroup (the SEND day, not the
// shift's day), at its Time, and notifies shifts that are DaysBeforeShift days AHEAD (today + N;
// N=0 = same-day). So the Friday job reminds Sunday shifts; the Saturday job reminds Monday shifts.
// Preview is intentionally simplified (no holiday data) — see HOLIDAY_DISCLAIMER.

import { CalendarClock, CalendarDays, Clock, type LucideIcon } from 'lucide-react';
import { addDays, fmtDate, fmtDateShort, heDayFull, nextWorkingDay } from '@/lib/hebrewDates';

export interface PreviewConfig {
  dayGroup: string;
  reminderType: string;
  time: string;
  daysBeforeShift: number;
}

// Reminder type constants (mirror Magav.Common.MagavConstants / android ReminderTypes).
export const SAME_DAY = 'SameDay';
export const ADVANCE = 'Advance';
export const WEEKDAY_ADVANCE = 'WeekdayAdvance';

export const DAY_GROUP_ORDER = ['SunThu', 'Fri', 'Sat'];

// The weekdays each group RUNS on (JS getDay: Sun=0 … Sat=6).
const GROUP_RUN_WEEKDAYS: Record<string, number[]> = {
  SunThu: [0, 1, 2, 3, 4],
  Fri: [5],
  Sat: [6],
};

export const GROUP_META: Record<string, { sendLabel: string; runPhrase: string }> = {
  SunThu: { sendLabel: 'שליחה בימי חול (א׳–ה׳)', runPhrase: 'בימי חול' },
  Fri: { sendLabel: 'שליחה ביום שישי', runPhrase: 'ביום שישי' },
  Sat: { sendLabel: 'שליחה בשבת / חג', runPhrase: 'בשבת' },
};

// Single source of truth per reminder type: title, whether it appends a location, its icon, and
// the timeline dot color. Components read icon/dotColor from here instead of re-declaring maps.
export const TYPE_META: Record<string, { title: string; hasLocation: boolean; icon: LucideIcon; dotColor: string }> = {
  [SAME_DAY]: { title: 'ליום המשמרת', hasLocation: true, icon: CalendarDays, dotColor: 'bg-green-500' },
  [ADVANCE]: { title: 'מוקדמת — תאריך מדויק', hasLocation: false, icon: Clock, dotColor: 'bg-blue-500' },
  [WEEKDAY_ADVANCE]: { title: 'מוקדמת — דוחה לימי חול', hasLocation: false, icon: CalendarClock, dotColor: 'bg-purple-500' },
};

const daysHebrew: Record<number, string> = {
  1: 'יום אחד',
  2: 'יומיים',
  3: 'שלושה ימים',
  4: 'ארבעה ימים',
  5: 'חמישה ימים',
  6: 'שישה ימים',
  7: 'שבוע',
};

export const dayWord = (n: number): string => daysHebrew[n] ?? `${n} ימים`;

export const EXPLAINER_TITLE = 'איך עובד התזמון? — לפי יום השליחה';
export const EXPLAINER_BODY =
  'כל תזמון רץ בימים ובשעה שנקבעו לו, ושולח תזכורת על משמרות שיתקיימו בעוד מספר הימים שנבחר ' +
  '(0 = משמרת של אותו יום). שימו לב: קבוצת הימים קובעת מתי התזכורת נשלחת — לא מתי המשמרת מתקיימת.';
export const HOLIDAY_DISCLAIMER =
  'תצוגה מקדימה משוערת — חגים וערבי חג עשויים להזיז את מועד השליחה בפועל.';

/** The plain-language row summary (send-day framed). */
export const buildSummary = (config: PreviewConfig): string => {
  const runPhrase = GROUP_META[config.dayGroup]?.runPhrase ?? 'בימים שנקבעו';
  if (config.reminderType === SAME_DAY) {
    return `רץ ${runPhrase} בשעה ${config.time} · מזכיר על משמרת של אותו יום`;
  }
  if (config.reminderType === WEEKDAY_ADVANCE) {
    return `רץ בימי חול בשעה ${config.time} · מזכיר על משמרת בעוד ${config.daysBeforeShift} ימים, ` +
      'וביום ה׳ מכסה גם משמרות שישי/שבת כדי לא לשלוח בסופ״ש';
  }
  return `רץ ${runPhrase} בשעה ${config.time} · מזכיר על משמרת שתתקיים בעוד ${dayWord(config.daysBeforeShift)}`;
};

/** Next `count` run-days for a group, starting from (and including) `fromDate`. */
export const nextRunDays = (group: string, count: number, fromDate: Date = new Date()): Date[] => {
  const weekdays = GROUP_RUN_WEEKDAYS[group] ?? [];
  const out: Date[] = [];
  let d = new Date(fromDate);
  d.setHours(0, 0, 0, 0);
  for (let i = 0; out.length < count && i < 90; i++) {
    if (weekdays.includes(d.getDay())) out.push(new Date(d));
    d = addDays(d, 1);
  }
  return out;
};

/** Given a run day, the human label of the shift date(s) that run notifies, + whether it's a pull-back window. */
const notifiedShiftLabel = (config: PreviewConfig, runDay: Date): { shiftLabel: string; pulledBack: boolean } => {
  const n = config.daysBeforeShift;
  if (config.reminderType === SAME_DAY) {
    return { shiftLabel: `${heDayFull(runDay)} ${fmtDate(runDay)}`, pulledBack: false };
  }
  if (config.reminderType === WEEKDAY_ADVANCE) {
    // Window [runDay+N … nextWorkingDay(runDay)+N), i.e. this run also covers shifts whose natural
    // send-day would fall on Fri/Sat (the next run is only on the following working day).
    const windowStart = addDays(runDay, n);
    const lastDay = addDays(nextWorkingDay(runDay), n - 1);
    if (windowStart.getTime() === lastDay.getTime()) {
      return { shiftLabel: `${heDayFull(windowStart)} ${fmtDate(windowStart)}`, pulledBack: false };
    }
    return {
      shiftLabel: `${heDayFull(windowStart)} ${fmtDate(windowStart)} עד ${heDayFull(lastDay)} ${fmtDate(lastDay)}`,
      pulledBack: true,
    };
  }
  // Advance: exact N days ahead (even if it lands on Fri/Sat).
  const shiftDate = addDays(runDay, n);
  return { shiftLabel: `${heDayFull(shiftDate)} ${fmtDate(shiftDate)}`, pulledBack: false };
};

export interface TimelineItem {
  runLabel: string;       // e.g. "יום ג׳"
  runDateShort: string;   // dd.MM
  time: string;
  shiftLabel: string;     // e.g. "יום ה׳ 18.06.2026"
  pulledBack: boolean;
  hasLocation: boolean;
  reminderType: string;
}

export const buildTimelineItems = (config: PreviewConfig, count = 3, fromDate?: Date): TimelineItem[] => {
  const hasLocation = TYPE_META[config.reminderType]?.hasLocation ?? false;
  return nextRunDays(config.dayGroup, count, fromDate).map((runDay) => {
    const { shiftLabel, pulledBack } = notifiedShiftLabel(config, runDay);
    return {
      runLabel: heDayFull(runDay),
      runDateShort: fmtDateShort(runDay),
      time: config.time,
      shiftLabel,
      pulledBack,
      hasLocation,
      reminderType: config.reminderType,
    };
  });
};

/** The single example used as the collapsed-row hint (the next upcoming run). */
export const buildRowHint = (config: PreviewConfig, fromDate?: Date): TimelineItem | null =>
  buildTimelineItems(config, 1, fromDate)[0] ?? null;

const PLACEHOLDER_RE = /\{[^}]+\}/g;

/** Split template content into text/placeholder segments for highlighted rendering (no HTML injection). */
export const splitPlaceholders = (content: string): { text: string; isPlaceholder: boolean }[] => {
  const parts: { text: string; isPlaceholder: boolean }[] = [];
  let last = 0;
  for (const m of content.matchAll(PLACEHOLDER_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push({ text: content.slice(last, idx), isPlaceholder: false });
    parts.push({ text: m[0], isPlaceholder: true });
    last = idx + m[0].length;
  }
  if (last < content.length) parts.push({ text: content.slice(last), isPlaceholder: false });
  return parts;
};

/** Substitute placeholders with example values to show a rendered sample SMS. */
export const renderSample = (content: string, config: PreviewConfig): string => {
  const runDay = nextRunDays(config.dayGroup, 1)[0] ?? new Date();
  const shiftDate = config.reminderType === SAME_DAY ? runDay : addDays(runDay, config.daysBeforeShift);
  return content
    .replace(/\{שם מלא\}/g, 'דוד כהן')
    .replace(/\{שם\}/g, 'דוד')
    .replace(/\{תאריך\}/g, fmtDate(shiftDate))
    .replace(/\{יום\}/g, heDayFull(shiftDate))
    .replace(/\{משמרת\}/g, 'לילה')
    .replace(/\{רכב\}/g, '5');
};
