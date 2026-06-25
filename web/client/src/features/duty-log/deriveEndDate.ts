// Single source of truth for the duty-log end date.
// endTime <= startTime  ⇒  the shift crosses midnight  ⇒  end date = start date + 1 day.
// Uses LOCAL-field arithmetic (new Date(y, m, d+1)) — never +ms / UTC — so it is
// correct across Israel DST transitions. Non-mutating.

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function deriveEndDate(date: Date, startTime: string, endTime: string): Date {
  const crossesMidnight = timeToMinutes(endTime) <= timeToMinutes(startTime);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + (crossesMidnight ? 1 : 0),
  );
}
