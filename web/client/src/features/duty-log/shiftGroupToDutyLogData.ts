import { ShiftWithVolunteerDto } from '@/services/shiftsService';
import { DutyLogData } from './types';

// The only Shifts-specific glue: map a grouped team's in-memory shift rows to a
// DutyLogData. The param is STRUCTURAL on purpose (ShiftGroup is a local,
// non-exported interface in ShiftsManagementPage — don't import it).
//
// - Hours are FIXED 19:00/02:00 for this path (it ignores any user time input);
//   the end date is derived later via the shared deriveEndDate helper.
// - carId is passed UNCHANGED (the team→car map is form-path only).
// - Unresolved / blank-name rows are filtered out. 0 resolved people is allowed
//   here (the form path enforces ≥1; this mapper does not).
export function shiftGroupToDutyLogData(
  group: { shiftName: string; carId: string; shifts: ShiftWithVolunteerDto[] },
  date: Date,
): DutyLogData {
  const people = group.shifts
    .filter((s) => !s.isUnresolved && s.volunteerName?.trim())
    .map((s) => ({ name: s.volunteerName, phone: s.volunteerPhone ?? undefined }));

  return {
    shiftName: group.shiftName,
    date,
    startTime: '19:00',
    endTime: '02:00',
    vehicleNumber: group.carId || undefined,
    people,
  };
}
