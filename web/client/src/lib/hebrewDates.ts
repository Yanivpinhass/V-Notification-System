// Hebrew day names + small date helpers for the scheduler UI. Pure; no holiday knowledge
// (the scheduler preview is intentionally approximate — see HOLIDAY_DISCLAIMER in schedulerPreview).

export const HE_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת'];

/** Short Hebrew weekday, e.g. "ג׳" / "שבת". */
export const heDayShort = (d: Date): string => HE_DAYS[d.getDay()];

/** Full Hebrew weekday, e.g. "יום ג׳" / "שבת". */
export const heDayFull = (d: Date): string =>
  d.getDay() === 6 ? 'שבת' : `יום ${HE_DAYS[d.getDay()]}`;

const pad = (n: number): string => n.toString().padStart(2, '0');

/** dd.MM.yyyy */
export const fmtDate = (d: Date): string =>
  `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;

/** dd.MM */
export const fmtDateShort = (d: Date): string =>
  `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;

export const addDays = (d: Date, n: number): Date => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

// Simplified working-day model: treat ONLY Friday (5) and Saturday (6) as non-working
// (no holiday data — preview is illustrative).
export const isNonWorkingDay = (d: Date): boolean => {
  const dow = d.getDay();
  return dow === 5 || dow === 6;
};

/** Smallest working day strictly after `d` (skips Fri/Sat). */
export const nextWorkingDay = (d: Date): Date => {
  let r = addDays(d, 1);
  while (isNonWorkingDay(r)) r = addDays(r, 1);
  return r;
};
