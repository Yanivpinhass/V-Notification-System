import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { shiftsService, ShiftWithVolunteerDto, UpdateShiftGroupRequest } from '@/services/shiftsService';
import { volunteersService, VolunteerDto } from '@/services/volunteersService';
import { locationsService, LocationDto } from '@/services/locationsService';
import { jewishHolidaysService, JewishHolidayDto } from '@/services/jewishHolidaysService';
import { Loader2, Trash2, Plus, Search, Calendar as CalendarIcon, MessageSquare, Phone, Pencil, MapPin, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import { he } from 'date-fns/locale';

interface ShiftGroup {
  shiftName: string;
  carId: string;
  shifts: ShiftWithVolunteerDto[];
  isLocal?: boolean;
  locationId?: number | null;
  customLocationName?: string | null;
  customLocationNavigation?: string | null;
}

export const ShiftsManagementPage: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [shifts, setShifts] = useState<ShiftWithVolunteerDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Local (unsaved) shift groups
  const [localGroups, setLocalGroups] = useState<ShiftGroup[]>([]);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<ShiftWithVolunteerDto | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingWithNotify, setDeletingWithNotify] = useState(false);

  // Delete group dialog
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<ShiftGroup | null>(null);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const [deletingGroupWithNotify, setDeletingGroupWithNotify] = useState(false);

  // SMS sending
  const [sendingSmsId, setSendingSmsId] = useState<number | null>(null);
  const [smsConfirmTarget, setSmsConfirmTarget] = useState<ShiftWithVolunteerDto | null>(null);
  const [callConfirmTarget, setCallConfirmTarget] = useState<ShiftWithVolunteerDto | null>(null);

  // Add volunteer dialog
  const [addTarget, setAddTarget] = useState<{
    shiftName: string; carId: string;
    locationId?: number | null;
    customLocationName?: string | null;
    customLocationNavigation?: string | null;
  } | null>(null);
  const [volunteers, setVolunteers] = useState<VolunteerDto[]>([]);
  const [volunteersLoaded, setVolunteersLoaded] = useState(false);
  const [volunteerSearch, setVolunteerSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addedVolunteerIds, setAddedVolunteerIds] = useState<Set<number>>(new Set());

  // Locations for dropdown
  const [locations, setLocations] = useState<LocationDto[]>([]);

  // Jewish holidays for date indicator
  const [holidays, setHolidays] = useState<JewishHolidayDto[]>([]);

  // New shift group dialog
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newShiftName, setNewShiftName] = useState('');
  const [newCarId, setNewCarId] = useState('');
  const [newLocationSelection, setNewLocationSelection] = useState('');
  const [newCustomLocationName, setNewCustomLocationName] = useState('');
  const [newCustomLocationNavigation, setNewCustomLocationNavigation] = useState('');

  // Edit shift group dialog
  const [editTarget, setEditTarget] = useState<ShiftGroup | null>(null);
  const [editShiftName, setEditShiftName] = useState('');
  const [editCarId, setEditCarId] = useState('');
  const [editLocationSelection, setEditLocationSelection] = useState('');
  const [editCustomLocationName, setEditCustomLocationName] = useState('');
  const [editCustomLocationNavigation, setEditCustomLocationNavigation] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Location update SMS prompt
  const [locationUpdatePrompt, setLocationUpdatePrompt] = useState<{ date: string; shiftName: string; carId: string } | null>(null);

  // Calendar dot indicators: date → hasUnresolved
  const [datesWithShifts, setDatesWithShifts] = useState<Map<string, boolean>>(new Map());
  const [displayedMonth, setDisplayedMonth] = useState<Date>(new Date());

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const holidayName = holidays.find(h => h.date === dateStr)?.name;
  const tomorrowStr = format(addDays(selectedDate, 1), 'yyyy-MM-dd');
  const tomorrowHolidayName = holidays.find(h => h.date === tomorrowStr)?.name;
  const holidayLabel = holidayName || (tomorrowHolidayName ? `ערב ${tomorrowHolidayName}` : undefined);

  const cutoffDate = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 1);
    return d;
  }, []);

  const isSelectedDatePast = useMemo(() => {
    const sel = new Date(selectedDate);
    sel.setHours(0, 0, 0, 0);
    return sel < cutoffDate;
  }, [selectedDate, cutoffDate]);

  const loadShifts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await shiftsService.getByDate(dateStr);
      console.log('[ShiftsManagement] loaded shifts:', data.length, 'shifts for', dateStr, data);
      setShifts(data);
      setLocalGroups([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'אירעה שגיאה בטעינת השיבוצים');
    } finally {
      setIsLoading(false);
    }
  }, [dateStr]);

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  const loadMonthIndicators = useCallback(async (month: Date) => {
    try {
      const year = month.getFullYear();
      const monthIndex = month.getMonth();
      const from = format(new Date(year, monthIndex, 1), 'yyyy-MM-dd');
      const to = format(new Date(year, monthIndex + 1, 0), 'yyyy-MM-dd');
      const dateInfos = await shiftsService.getDatesWithShifts(from, to);
      const map = new Map<string, boolean>();
      dateInfos.forEach(d => map.set(d.date, d.hasUnresolved));
      setDatesWithShifts(map);
    } catch {
      // Non-critical — skip dots on error
    }
  }, []);

  useEffect(() => {
    loadMonthIndicators(displayedMonth);
  }, [displayedMonth, loadMonthIndicators]);

  const refreshData = useCallback(() => {
    loadShifts();
    loadMonthIndicators(displayedMonth);
  }, [loadShifts, loadMonthIndicators, displayedMonth]);

  const { greenDates, redDates, grayDates, yellowDates } = useMemo(() => {
    const green: Date[] = [];
    const red: Date[] = [];
    const gray: Date[] = [];
    const yellow: Date[] = [];
    const year = displayedMonth.getFullYear();
    const month = displayedMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      date.setHours(0, 0, 0, 0);
      const dateStr = format(date, 'yyyy-MM-dd');
      const hasShifts = datesWithShifts.has(dateStr);

      if (date < cutoffDate) {
        if (hasShifts) gray.push(date);
      } else {
        if (hasShifts) {
          if (datesWithShifts.get(dateStr)) yellow.push(date);
          else green.push(date);
        } else {
          red.push(date);
        }
      }
    }
    return { greenDates: green, redDates: red, grayDates: gray, yellowDates: yellow };
  }, [displayedMonth, datesWithShifts, cutoffDate]);

  // Load volunteers once when add dialog opens
  const loadVolunteers = useCallback(async () => {
    if (volunteersLoaded) return;
    try {
      const data = await volunteersService.getAll();
      setVolunteers(data);
      setVolunteersLoaded(true);
    } catch {
      toast.error('שגיאה בטעינת רשימת המתנדבים');
    }
  }, [volunteersLoaded]);

  // Load locations for dropdown
  useEffect(() => {
    locationsService.getAll().then(setLocations).catch(() => {});
  }, []);

  // Load Jewish holidays for date indicator
  useEffect(() => {
    jewishHolidaysService.getAll().then(setHolidays).catch(() => {});
  }, []);

  const sortedLocations = useMemo(() =>
    [...locations].sort((a, b) => a.name.localeCompare(b.name, 'he')),
    [locations]
  );

  const renderLocationPicker = (
    selection: string, setSelection: (v: string) => void,
    customName: string, setCustomName: (v: string) => void,
    customNav: string, setCustomNav: (v: string) => void,
    datalistId: string
  ) => (
    <>
      <div>
        <label className="text-sm font-medium mb-1 block">מיקום ניידת</label>
        <Select value={selection} onValueChange={setSelection}>
          <SelectTrigger className="min-h-[44px]"><SelectValue placeholder="לא נבחר" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">לא נבחר</SelectItem>
            {sortedLocations.map(l => (
              <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
            ))}
            <SelectItem value="other">אחר</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {selection === 'other' && (
        <>
          <div>
            <label className="text-sm font-medium mb-1 block">שם מיקום</label>
            <Input className="min-h-[44px]" value={customName} onChange={(e) => setCustomName(e.target.value)}
              placeholder="שם בעל הבית / מיקום" list={datalistId} />
            <datalist id={datalistId}>
              {volunteers.map(v => <option key={v.id} value={v.mappingName} />)}
            </datalist>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">ניווט</label>
            <Input value={customNav} onChange={(e) => setCustomNav(e.target.value)}
              placeholder="קישור Waze" dir="ltr" className="text-left min-h-[44px]" />
          </div>
        </>
      )}
    </>
  );

  const renderShiftGroupForm = (config: {
    title: string;
    shiftName: string; setShiftName: (v: string) => void;
    carId: string; setCarId: (v: string) => void;
    locationSelection: string; setLocationSelection: (v: string) => void;
    customLocationName: string; setCustomLocationName: (v: string) => void;
    customLocationNavigation: string; setCustomLocationNavigation: (v: string) => void;
    datalistId: string;
    submitLabel: string; onSubmit: () => void; submitDisabled: boolean;
    isSubmitting?: boolean;
    onCancel: () => void; cancelDisabled?: boolean;
  }) => (
    <>
      <DialogHeader><DialogTitle>{config.title}</DialogTitle></DialogHeader>
      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div>
          <label className="text-sm font-medium mb-1 block">שם משמרת *</label>
          <Input className="min-h-[44px]" value={config.shiftName}
            onChange={(e) => config.setShiftName(e.target.value)} placeholder="לדוגמה: צוות א" />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">מספר רכב</label>
          <Input className="min-h-[44px]" value={config.carId}
            onChange={(e) => config.setCarId(e.target.value)} placeholder="לדוגמה: 101" />
        </div>
        {renderLocationPicker(config.locationSelection, config.setLocationSelection,
          config.customLocationName, config.setCustomLocationName,
          config.customLocationNavigation, config.setCustomLocationNavigation, config.datalistId)}
      </div>
      <DialogFooter className="flex flex-col gap-2 mt-4 sm:flex-col">
        <Button onClick={config.onSubmit} disabled={config.submitDisabled} className="w-full min-h-[44px]">
          {config.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
          {config.submitLabel}
        </Button>
        <Button variant="ghost" onClick={config.onCancel} disabled={config.cancelDisabled} className="w-full min-h-[44px]">
          ביטול
        </Button>
      </DialogFooter>
    </>
  );

  // Group shifts by (shiftName, carId)
  const groupedShifts: ShiftGroup[] = React.useMemo(() => {
    const map = new Map<string, ShiftWithVolunteerDto[]>();
    for (const s of shifts) {
      const key = `${s.shiftName}||${s.carId}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    const groups: ShiftGroup[] = [];
    for (const [key, items] of map) {
      const [shiftName, carId] = key.split('||');
      groups.push({ shiftName, carId, shifts: items });
    }
    // Append local (empty) groups that don't overlap with server groups
    for (const lg of localGroups) {
      const exists = groups.some(g => g.shiftName === lg.shiftName && g.carId === lg.carId);
      if (!exists) groups.push(lg);
    }
    // Sort by trailing number in shiftName (e.g., "מרחבים 211" → 211)
    groups.sort((a, b) => {
      const numA = parseInt(a.shiftName.match(/\d+$/)?.[0] ?? '0');
      const numB = parseInt(b.shiftName.match(/\d+$/)?.[0] ?? '0');
      return numA - numB;
    });
    return groups;
  }, [shifts, localGroups]);

  // ── Delete ──
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await shiftsService.deleteShift(deleteTarget.id);
      toast.success('השיבוץ נמחק בהצלחה');
      setDeleteTarget(null);
      refreshData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה במחיקת השיבוץ');
    } finally {
      setIsDeleting(false);
    }
  };

  // ── Delete with SMS notification ──
  const handleDeleteWithNotify = async () => {
    if (!deleteTarget) return;
    setDeletingWithNotify(true);
    try {
      try {
        await shiftsService.sendShiftSms(deleteTarget.id, 3);
      } catch {
        // SMS failed — still proceed with delete
      }
      await shiftsService.deleteShift(deleteTarget.id);
      toast.success('השיבוץ נמחק והמתנדב עודכן');
      setDeleteTarget(null);
      refreshData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה במחיקת השיבוץ');
    } finally {
      setDeletingWithNotify(false);
    }
  };

  const handleDeleteGroup = async (sendNotifications: boolean) => {
    if (!deleteGroupTarget) return;
    const setLoading = sendNotifications ? setDeletingGroupWithNotify : setIsDeletingGroup;
    setLoading(true);
    try {
      const result = await shiftsService.deleteShiftGroup({
        date: dateStr,
        shiftName: deleteGroupTarget.shiftName,
        carId: deleteGroupTarget.carId,
        sendNotifications,
      });
      toast.success(
        sendNotifications
          ? `הצוות נמחק, ${result.smsSentCount} הודעות נשלחו`
          : `הצוות נמחק בהצלחה (${result.deletedCount} שיבוצים)`
      );
      setDeleteGroupTarget(null);
      refreshData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה במחיקת הצוות');
    } finally {
      setLoading(false);
    }
  };

  // ── Send SMS ──
  const handleSendSms = async (shift: ShiftWithVolunteerDto) => {
    setSendingSmsId(shift.id);
    try {
      await shiftsService.sendShiftSms(shift.id);
      toast.success('הודעת SMS נשלחה בהצלחה');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בשליחת SMS');
    } finally {
      setSendingSmsId(null);
    }
  };

  // ── Add volunteer to shift ──
  const openAddDialog = (shiftName: string, carId: string, locationId?: number | null, customLocationName?: string | null, customLocationNavigation?: string | null) => {
    setAddTarget({ shiftName, carId, locationId, customLocationName, customLocationNavigation });
    setVolunteerSearch('');
    setAddedVolunteerIds(new Set());
    loadVolunteers();
  };

  const closeAddDialog = () => {
    setAddTarget(null);
    setAddedVolunteerIds(new Set());
    refreshData();
  };

  const handleAddVolunteer = async (vol: VolunteerDto) => {
    if (!addTarget) return;
    setIsAdding(true);
    try {
      await shiftsService.createShift({
        shiftDate: dateStr,
        shiftName: addTarget.shiftName,
        carId: addTarget.carId,
        volunteerId: vol.id,
        locationId: addTarget.locationId,
        customLocationName: addTarget.customLocationName,
        customLocationNavigation: addTarget.customLocationNavigation,
      });
      toast.success(`${vol.mappingName} שובץ בהצלחה`);
      setAddedVolunteerIds(prev => new Set([...prev, vol.id]));
      setVolunteerSearch('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בשיבוץ המתנדב');
    } finally {
      setIsAdding(false);
    }
  };

  // ── New shift group ──
  const handleCreateGroup = () => {
    if (!newShiftName.trim()) return;
    const shiftName = newShiftName.trim();
    const carId = newCarId.trim();
    const sel = newLocationSelection;
    const locId = sel && sel !== 'none' && sel !== 'other' ? Number(sel) : null;
    const customName = sel === 'other' ? newCustomLocationName.trim() || null : null;
    const customNav = sel === 'other' ? newCustomLocationNavigation.trim() || null : null;
    const group: ShiftGroup = {
      shiftName,
      carId,
      shifts: [],
      isLocal: true,
      locationId: locId,
      customLocationName: customName,
      customLocationNavigation: customNav,
    };
    setLocalGroups(prev => [...prev, group]);
    setNewGroupOpen(false);
    setNewShiftName('');
    setNewCarId('');
    setNewLocationSelection('');
    setNewCustomLocationName('');
    setNewCustomLocationNavigation('');
    toast.success('קבוצת משמרת חדשה נוספה');
    openAddDialog(shiftName, carId, locId, customName, customNav);
  };

  // ── Edit shift group ──
  const handleEditGroup = async () => {
    if (!editTarget || !editShiftName.trim()) return;
    setIsEditing(true);
    try {
      const editSel = editLocationSelection;
      const locId = editSel && editSel !== 'none' && editSel !== 'other' ? Number(editSel) : null;
      const customName = editSel === 'other' ? editCustomLocationName.trim() || null : null;
      const customNav = editSel === 'other' ? editCustomLocationNavigation.trim() || null : null;

      const result = await shiftsService.updateShiftGroup({
        date: dateStr,
        oldShiftName: editTarget.shiftName,
        oldCarId: editTarget.carId,
        newShiftName: editShiftName.trim(),
        newCarId: editCarId.trim(),
        locationId: locId,
        customLocationName: customName,
        customLocationNavigation: customNav,
      });
      toast.success('פרטי המשמרת עודכנו בהצלחה');
      setEditTarget(null);
      refreshData();
      if (result?.alreadySentSms === true) {
        setLocationUpdatePrompt({ date: dateStr, shiftName: editShiftName.trim(), carId: editCarId.trim() });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בעדכון המשמרת');
    } finally {
      setIsEditing(false);
    }
  };

  // ── Send location update SMS ──
  const handleSendLocationUpdate = async () => {
    if (!locationUpdatePrompt) return;
    try {
      const result = await shiftsService.sendLocationUpdate(locationUpdatePrompt);
      toast.success(`עדכון מיקום נשלח ל-${result.smsSent} מתנדבים`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בשליחת עדכון מיקום');
    } finally {
      setLocationUpdatePrompt(null);
    }
  };

  const getStatusIssue = (phone: string | null, approved: boolean): string | null => {
    const noPhone = !phone;
    const notApproved = !approved;
    if (noPhone && notApproved) return 'למתנדב זה לא הוגדר מספר טלפון ולא אישר קבלת הודעות SMS';
    if (noPhone) return 'למתנדב זה לא הוגדר מספר טלפון';
    if (notApproved) return 'המתנדב לא אישר קבלת הודעות SMS';
    return null;
  };

  // Filter volunteers for the add dialog
  const filteredVolunteers = volunteers.filter(v =>
    v.mappingName.includes(volunteerSearch)
  );

  // Assigned volunteer IDs for current group (to disable in picker)
  const currentGroup = addTarget
    ? groupedShifts.find(g => g.shiftName === addTarget.shiftName && g.carId === addTarget.carId)
    : null;
  const serverVolunteerIds = new Set(currentGroup?.shifts.map(s => s.volunteerId) ?? []);
  const assignedVolunteerIds = addTarget
    ? new Set([...serverVolunteerIds, ...addedVolunteerIds])
    : new Set<number>();

  // Names of volunteers already assigned to this group (server + locally added)
  const assignedVolunteerNames: string[] = addTarget
    ? [
        ...(currentGroup?.shifts.map(s => s.volunteerName) ?? []),
        ...volunteers
          .filter(v => addedVolunteerIds.has(v.id) && !serverVolunteerIds.has(v.id))
          .map(v => v.mappingName),
      ]
    : [];

  return (
    <div className="space-y-4 p-4" dir="rtl">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">ניהול משמרות</h1>
          <Button onClick={() => setNewGroupOpen(true)} className="min-h-[44px]" disabled={isSelectedDatePast}>
            <Plus className="h-4 w-4 ml-2" />
            משמרת חדשה
          </Button>
        </div>
        <div className="flex items-center justify-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 md:h-9 md:w-9"
            aria-label="יום קודם"
            onClick={() => setSelectedDate(addDays(selectedDate, -1))}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="min-h-[44px] min-w-[160px]">
                <CalendarIcon className="h-4 w-4 ml-2" />
                {format(selectedDate, 'EEEE dd/MM', { locale: he })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="end">
              <Calendar
                dir="rtl"
                locale={he}
                mode="single"
                selected={selectedDate}
                month={displayedMonth}
                onMonthChange={setDisplayedMonth}
                onSelect={(date) => {
                  if (date) {
                    setSelectedDate(date);
                    setCalendarOpen(false);
                  }
                }}
                modifiers={{
                  past: { before: cutoffDate },
                  hasShifts: greenDates,
                  noShifts: redDates,
                  pastShifts: grayDates,
                  hasUnresolved: yellowDates,
                }}
                modifiersClassNames={{
                  past: 'opacity-50',
                  hasShifts: 'calendar-dot-green',
                  noShifts: 'calendar-dot-red',
                  pastShifts: 'calendar-dot-gray',
                  hasUnresolved: 'calendar-dot-yellow',
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 md:h-9 md:w-9"
            aria-label="יום הבא"
            onClick={() => setSelectedDate(addDays(selectedDate, 1))}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Holiday / erev holiday banner */}
      {holidayLabel && (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
          <CalendarIcon className="h-4 w-4 shrink-0" />
          <span>{holidayLabel}</span>
        </div>
      )}

      {/* Read-only banner for past dates */}
      {isSelectedDatePast && !isLoading && (
        <div className="flex items-center gap-2 rounded-md border border-muted bg-muted/50 px-4 py-2 text-sm text-muted-foreground">
          <CalendarIcon className="h-4 w-4 shrink-0" />
          <span>תאריך שעבר — צפייה בלבד</span>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <Card>
          <CardContent className="py-8 text-center text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!isLoading && !error && groupedShifts.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            לא נמצאו שיבוצים לתאריך זה
          </CardContent>
        </Card>
      )}

      {/* Shift groups */}
      {!isLoading && !error && groupedShifts.map((group, idx) => (
        <Card key={`${group.shiftName}-${group.carId}-${idx}`} className="max-w-full overflow-hidden transition-shadow hover:shadow-md">
          <CardHeader className="pb-3 bg-primary/5 border-b border-primary/10">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="default" className="text-sm px-3 py-1">
                  {group.shiftName}
                </Badge>
                {group.carId && (
                  <Badge variant="outline" className="text-sm px-3 py-1 font-normal">
                    רכב {group.carId}
                  </Badge>
                )}
                {group.shifts[0]?.locationName && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {group.shifts[0].locationName}
                  </span>
                )}
              </div>
              {!group.isLocal && !isSelectedDatePast && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setEditTarget(group);
                      setEditShiftName(group.shiftName);
                      setEditCarId(group.carId);
                      const fs = group.shifts[0];
                      if (fs?.locationId) {
                        setEditLocationSelection(String(fs.locationId));
                        setEditCustomLocationName('');
                        setEditCustomLocationNavigation('');
                      } else if (fs?.locationName) {
                        setEditLocationSelection('other');
                        setEditCustomLocationName(fs.locationName ?? '');
                        setEditCustomLocationNavigation(fs.locationNavigation ?? '');
                      } else {
                        setEditLocationSelection('');
                        setEditCustomLocationName('');
                        setEditCustomLocationNavigation('');
                      }
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleteGroupTarget(group)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {group.shifts.length === 0 && (
              <p className="text-sm text-muted-foreground">אין מתנדבים</p>
            )}
            {group.shifts.map((shift) => {
              const issue = shift.isUnresolved ? null : getStatusIssue(shift.volunteerPhone, shift.volunteerApproved);
              const canSms = !!shift.volunteerPhone && shift.volunteerApproved;
              const dotColor = shift.isUnresolved ? 'bg-warning' : issue ? 'bg-destructive' : 'bg-success';
              const statusMessage = shift.isUnresolved ? 'מתנדב לא מזוהה - יש לעדכן פרטים' : issue;
              return (
                <div
                  key={shift.id}
                  className="rounded-md border p-3 bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`h-3 w-3 rounded-full shrink-0 ${dotColor}`} />
                      {statusMessage ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="font-medium text-sm text-right cursor-pointer hover:underline">
                              {shift.volunteerName}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64 text-sm" dir="rtl">
                            {statusMessage}
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <span className="text-sm font-medium">{shift.volunteerName}</span>
                      )}
                      {!shift.isUnresolved && shift.volunteerPhone && (
                        <span className="text-sm text-muted-foreground">
                          {shift.volunteerPhone}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!shift.isUnresolved && (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11 md:h-8 md:w-8 text-primary hover:text-primary hover:bg-primary/10"
                                disabled={!canSms || isSelectedDatePast || sendingSmsId === shift.id}
                                onClick={() => setSmsConfirmTarget(shift)}
                              >
                                {sendingSmsId === shift.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <MessageSquare className="h-4 w-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom"><p>שליחת SMS</p></TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11 md:h-8 md:w-8 text-success hover:text-success hover:bg-success/10"
                                disabled={!shift.volunteerPhone}
                                onClick={() => setCallConfirmTarget(shift)}
                              >
                                <Phone className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom"><p>התקשר</p></TooltipContent>
                          </Tooltip>
                        </>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 md:h-8 md:w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            disabled={isSelectedDatePast}
                            onClick={() => setDeleteTarget(shift)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom"><p>מחיקת שיבוץ</p></TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              className="mt-2 min-h-[44px]"
              disabled={isSelectedDatePast}
              onClick={() => openAddDialog(
                group.shiftName, group.carId,
                group.shifts[0]?.locationId,
                group.shifts[0]?.locationId ? null : (group.shifts[0]?.locationName ?? null),
                group.shifts[0]?.locationId ? null : (group.shifts[0]?.locationNavigation ?? null)
              )}
            >
              <Plus className="h-4 w-4 ml-1" />
              הוסף מתנדב
            </Button>
          </CardContent>
        </Card>
      ))}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && !isDeleting && !deletingWithNotify && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת שיבוץ</AlertDialogTitle>
            <AlertDialogDescription>
              האם למחוק את השיבוץ של {deleteTarget?.volunteerName}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-row flex-wrap gap-2 pt-2">
            <AlertDialogCancel disabled={isDeleting || deletingWithNotify} className="mt-0">ביטול</AlertDialogCancel>
            <Button
              onClick={handleDeleteWithNotify}
              disabled={
                isDeleting || deletingWithNotify ||
                !deleteTarget?.volunteerPhone || !deleteTarget?.volunteerApproved
              }
              className="bg-warning hover:bg-warning/90 text-white"
            >
              {deletingWithNotify ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
              מחק ועדכן את המתנדב
            </Button>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting || deletingWithNotify}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'מחק'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete group confirmation */}
      <AlertDialog open={!!deleteGroupTarget} onOpenChange={(open) => !open && !isDeletingGroup && !deletingGroupWithNotify && setDeleteGroupTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת צוות</AlertDialogTitle>
            <AlertDialogDescription>
              האם למחוק את כל הצוות {deleteGroupTarget?.shiftName}
              {deleteGroupTarget?.carId ? ` / רכב ${deleteGroupTarget.carId}` : ''}
              {' '}({deleteGroupTarget?.shifts.length} מתנדבים)?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-row flex-wrap gap-2 pt-2">
            <AlertDialogCancel disabled={isDeletingGroup || deletingGroupWithNotify} className="mt-0">ביטול</AlertDialogCancel>
            <Button
              onClick={() => handleDeleteGroup(true)}
              disabled={
                isDeletingGroup || deletingGroupWithNotify ||
                !deleteGroupTarget?.shifts.some(s => !s.isUnresolved && s.volunteerPhone && s.volunteerApproved)
              }
              className="bg-warning hover:bg-warning/90 text-white"
            >
              {deletingGroupWithNotify ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
              מחק ועדכן את המתנדבים
            </Button>
            <AlertDialogAction
              onClick={() => handleDeleteGroup(false)}
              disabled={isDeletingGroup || deletingGroupWithNotify}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeletingGroup ? <Loader2 className="h-4 w-4 animate-spin" /> : 'מחק'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* SMS confirmation */}
      <AlertDialog open={!!smsConfirmTarget} onOpenChange={(open) => !open && setSmsConfirmTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>שליחת SMS</AlertDialogTitle>
            <AlertDialogDescription>
              לשלוח הודעת SMS ל{smsConfirmTarget?.volunteerName}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-row gap-2 pt-2">
            <AlertDialogCancel className="mt-0">ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (smsConfirmTarget) handleSendSms(smsConfirmTarget);
                setSmsConfirmTarget(null);
              }}
            >
              שלח
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Call confirmation */}
      <AlertDialog open={!!callConfirmTarget} onOpenChange={(open) => !open && setCallConfirmTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>התקשרות</AlertDialogTitle>
            <AlertDialogDescription>
              להתקשר ל{callConfirmTarget?.volunteerName} ({callConfirmTarget?.volunteerPhone})?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-row gap-2 pt-2">
            <AlertDialogCancel className="mt-0">ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (callConfirmTarget?.volunteerPhone) {
                  window.location.href = `tel:${callConfirmTarget.volunteerPhone}`;
                }
                setCallConfirmTarget(null);
              }}
            >
              התקשר
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add volunteer dialog */}
      <Dialog open={!!addTarget} onOpenChange={(open) => !open && closeAddDialog()}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              הוסף מתנדב ל{addTarget?.shiftName}
              {addTarget?.carId ? ` / רכב ${addTarget.carId}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {assignedVolunteerNames.length > 0 && (
              <div className="space-y-1.5 mt-1">
                <span className="text-xs text-muted-foreground">משובצים</span>
                <div className="flex flex-wrap gap-1.5">
                  {assignedVolunteerNames.map((name, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חיפוש מתנדב..."
                value={volunteerSearch}
                onChange={(e) => setVolunteerSearch(e.target.value)}
                className="pr-10"
              />
            </div>
            <div className="space-y-2 rounded-lg border bg-muted/30 p-2">
              {!volunteersLoaded && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {volunteersLoaded && filteredVolunteers.length === 0 && (
                <p className="text-sm text-center text-muted-foreground py-4">לא נמצאו מתנדבים</p>
              )}
              {filteredVolunteers.map((vol) => {
                const isAssigned = assignedVolunteerIds.has(vol.id);
                const volIssue = getStatusIssue(vol.mobilePhone, vol.approveToReceiveSms);
                const volDotColor = volIssue ? 'bg-destructive' : 'bg-success';
                return (
                  <button
                    key={vol.id}
                    disabled={isAssigned || isAdding}
                    onClick={() => handleAddVolunteer(vol)}
                    className={`w-full text-right rounded-md border px-3 py-3 text-sm transition-colors min-h-[44px] ${
                      isAssigned
                        ? 'opacity-40 cursor-not-allowed bg-muted border-transparent'
                        : 'bg-card hover:bg-accent/50 active:bg-primary/10 cursor-pointer'
                    }`}
                  >
                    <span className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        {!isAssigned && (
                          <span className={`h-3 w-3 rounded-full shrink-0 ${volDotColor}`} />
                        )}
                        <span className="font-medium">{vol.mappingName}</span>
                      </span>
                      <span className="text-xs text-muted-foreground mr-2">
                        {isAssigned ? (
                          <span className="inline-flex items-center rounded-full border px-2.5 text-xs font-semibold">כבר משובץ</span>
                        ) : vol.mobilePhone || ''}
                      </span>
                    </span>
                    {volIssue && !isAssigned && (
                      <span className="block text-xs text-destructive mt-1 mr-5">{volIssue}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="default" onClick={closeAddDialog} className="min-h-[44px] w-full">
              סיום
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New shift group dialog */}
      <Dialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          {renderShiftGroupForm({
            title: 'משמרת חדשה',
            shiftName: newShiftName, setShiftName: setNewShiftName,
            carId: newCarId, setCarId: setNewCarId,
            locationSelection: newLocationSelection, setLocationSelection: setNewLocationSelection,
            customLocationName: newCustomLocationName, setCustomLocationName: setNewCustomLocationName,
            customLocationNavigation: newCustomLocationNavigation, setCustomLocationNavigation: setNewCustomLocationNavigation,
            datalistId: 'volunteer-names-create',
            submitLabel: 'צור משמרת', onSubmit: handleCreateGroup,
            submitDisabled: !newShiftName.trim(),
            onCancel: () => setNewGroupOpen(false),
          })}
        </DialogContent>
      </Dialog>

      {/* Edit shift group dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && !isEditing && setEditTarget(null)}>
        <DialogContent dir="rtl" className="max-w-sm">
          {renderShiftGroupForm({
            title: 'עריכת משמרת',
            shiftName: editShiftName, setShiftName: setEditShiftName,
            carId: editCarId, setCarId: setEditCarId,
            locationSelection: editLocationSelection, setLocationSelection: setEditLocationSelection,
            customLocationName: editCustomLocationName, setCustomLocationName: setEditCustomLocationName,
            customLocationNavigation: editCustomLocationNavigation, setCustomLocationNavigation: setEditCustomLocationNavigation,
            datalistId: 'volunteer-names-edit',
            submitLabel: 'שמור', onSubmit: handleEditGroup,
            submitDisabled: !editShiftName.trim() || isEditing,
            isSubmitting: isEditing,
            onCancel: () => setEditTarget(null), cancelDisabled: isEditing,
          })}
        </DialogContent>
      </Dialog>

      {/* Location update SMS confirmation dialog */}
      <AlertDialog open={!!locationUpdatePrompt} onOpenChange={(open) => !open && setLocationUpdatePrompt(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">שליחת עדכון מיקום</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              כבר נשלחו הודעות למשמרת הזאת היום. האם לשלוח הודעת עדכון מיקום?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel>לא לשלוח</AlertDialogCancel>
            <AlertDialogAction onClick={handleSendLocationUpdate}>שלח עדכון</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
