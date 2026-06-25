// Shared, normalized model for the "יומן הפעלה" (Duty Log) report.
// Both entry points (the DutyLogPage form and the Shifts per-team button)
// funnel through this single shape — see features/duty-log/README intent in
// docs/duty-log-feature-spec.md (§7).

export interface DutyLogPerson {
  name: string;
  phone?: string;
}

export interface DutyLogData {
  shiftName: string;
  /** Start date of the duty period (local). End date is derived via deriveEndDate. */
  date: Date;
  /** "HH:mm" */
  startTime: string;
  /** "HH:mm" */
  endTime: string;
  vehicleNumber?: string;
  people: DutyLogPerson[];
}

// Shift-name presets — these are seed sample data (not repo constants), hardcoded per spec.
export const SHIFT_NAME_PRESETS = ['מרחבים 211', 'מרחבים 212', 'מרחבים 221', 'מרחבים 222'] as const;

// Team → car prefill map (verified against DbInitializer.cs:803-806). Prefilled
// presets render WITH the dash; typed free-text values render exactly as typed.
export const TEAM_CAR_MAP: Record<string, string> = {
  'מרחבים 211': '21-174',
  'מרחבים 212': '21-851',
  'מרחבים 221': '21-850',
  'מרחבים 222': '21-176',
};

// Sentinel for the "אחר (טקסט חופשי)" Select option. Never use value="" in a SelectItem.
export const OTHER_OPTION = '__other__';
