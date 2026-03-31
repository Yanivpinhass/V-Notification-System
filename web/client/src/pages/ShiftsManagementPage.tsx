import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { shiftsService, ShiftWithVolunteerDto, UpdateShiftGroupRequest } from '@/services/shiftsService';
import { volunteersService, VolunteerDto } from '@/services/volunteersService';
import { Loader2, Trash2, Plus, Search, Calendar as CalendarIcon, MessageSquare, Phone, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

interface ShiftGroup {
  shiftName: string;
  carId: string;
  shifts: ShiftWithVolunteerDto[];
  isLocal?: boolean; // locally created, not yet saved
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

  // SMS sending
  const [sendingSmsId, setSendingSmsId] = useState<number | null>(null);
  const [smsConfirmTarget, setSmsConfirmTarget] = useState<ShiftWithVolunteerDto | null>(null);
  const [callConfirmTarget, setCallConfirmTarget] = useState<ShiftWithVolunteerDto | null>(null);

  // Add volunteer dialog
  const [addTarget, setAddTarget] = useState<{ shiftName: string; carId: string } | null>(null);
  const [volunteers, setVolunteers] = useState<VolunteerDto[]>([]);
  const [volunteersLoaded, setVolunteersLoaded] = useState(false);
  const [volunteerSearch, setVolunteerSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addedVolunteerIds, setAddedVolunteerIds] = useState<Set<number>>(new Set());

  // New shift group dialog
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newShiftName, setNewShiftName] = useState('');
  const [newCarId, setNewCarId] = useState('');

  // Edit shift group dialog
  const [editTarget, setEditTarget] = useState<ShiftGroup | null>(null);
  const [editShiftName, setEditShiftName] = useState('');
  const [editCarId, setEditCarId] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Calendar dot indicators: date → hasUnresolved
  const [datesWithShifts, setDatesWithShifts] = useState<Map<string, boolean>>(new Map());
  const [displayedMonth, setDisplayedMonth] = useState<Date>(new Date());

  const dateStr = format(selectedDate, 'yyyy-MM-dd');

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
  const openAddDialog = (shiftName: string, carId: string) => {
    setAddTarget({ shiftName, carId });
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
    const group: ShiftGroup = {
      shiftName,
      carId,
      shifts: [],
      isLocal: true,
    };
    setLocalGroups(prev => [...prev, group]);
    setNewGroupOpen(false);
    setNewShiftName('');
    setNewCarId('');
    toast.success('קבוצת משמרת חדשה נוספה');
    openAddDialog(shiftName, carId);
  };

  // ── Edit shift group ──
  const handleEditGroup = async () => {
    if (!editTarget || !editShiftName.trim()) return;
    setIsEditing(true);
    try {
      await shiftsService.updateShiftGroup({
        date: dateStr,
        oldShiftName: editTarget.shiftName,
        oldCarId: editTarget.carId,
        newShiftName: editShiftName.trim(),
        newCarId: editCarId.trim(),
      });
      toast.success('פרטי המשמרת עודכנו בהצלחה');
      setEditTarget(null);
      refreshData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בעדכון המשמרת');
    } finally {
      setIsEditing(false);
    }
  };

  // Get volunteer status explanation
  const getVolunteerIssue = (s: ShiftWithVolunteerDto): string | null => {
    const noPhone = !s.volunteerPhone;
    const notApproved = !s.volunteerApproved;
    if (noPhone && notApproved) return 'למתנדב זה לא הוגדר מספר טלפון ולא אישר קבלת הודעות SMS';
    if (noPhone) return 'למתנדב זה לא הוגדר מספר טלפון';
    if (notApproved) return 'המתנדב לא אישר קבלת הודעות SMS';
    return null;
  };

  const getVolunteerDtoIssue = (v: VolunteerDto): string | null => {
    const noPhone = !v.mobilePhone;
    const notApproved = !v.approveToReceiveSms;
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">ניהול משמרות</h1>
        <div className="flex items-center gap-2">
          <Button onClick={() => setNewGroupOpen(true)} className="min-h-[44px]" disabled={isSelectedDatePast}>
            <Plus className="h-4 w-4 ml-2" />
            משמרת חדשה
          </Button>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="min-h-[44px] min-w-[140px]">
                <CalendarIcon className="h-4 w-4 ml-2" />
                {format(selectedDate, 'dd/MM/yyyy')}
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
        </div>
      </div>

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
        <Card key={`${group.shiftName}-${group.carId}-${idx}`} className="max-w-full">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <span>{group.shiftName}</span>
              {group.carId && (
                <span className="text-sm font-normal text-muted-foreground">
                  / רכב {group.carId}
                </span>
              )}
              {!group.isLocal && !isSelectedDatePast && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setEditTarget(group);
                    setEditShiftName(group.shiftName);
                    setEditCarId(group.carId);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {group.shifts.length === 0 && (
              <p className="text-sm text-muted-foreground">אין מתנדבים</p>
            )}
            {group.shifts.map((shift) => {
              const issue = shift.isUnresolved ? null : getVolunteerIssue(shift);
              const canSms = !!shift.volunteerPhone && shift.volunteerApproved;
              return (
                <div
                  key={shift.id}
                  className="rounded-md border p-3 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    {shift.isUnresolved ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="text-warning font-medium text-sm text-right cursor-pointer hover:underline">
                            {shift.volunteerName}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 text-sm" dir="rtl">
                          מתנדב לא מזוהה - יש לעדכן פרטים
                        </PopoverContent>
                      </Popover>
                    ) : issue ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="text-destructive font-medium text-sm text-right cursor-pointer hover:underline">
                            {shift.volunteerName}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 text-sm" dir="rtl">
                          {issue}
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
                  <div className="flex items-center gap-1">
                    {!shift.isUnresolved && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="min-h-[44px] min-w-[44px] text-primary hover:text-primary hover:bg-primary/10"
                          disabled={!canSms || isSelectedDatePast || sendingSmsId === shift.id}
                          onClick={() => setSmsConfirmTarget(shift)}
                        >
                          {sendingSmsId === shift.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MessageSquare className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="min-h-[44px] min-w-[44px] text-success hover:text-success hover:bg-success/10"
                          disabled={!shift.volunteerPhone}
                          onClick={() => setCallConfirmTarget(shift)}
                        >
                          <Phone className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="min-h-[44px] min-w-[44px] text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={isSelectedDatePast}
                      onClick={() => setDeleteTarget(shift)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              className="mt-2 min-h-[44px]"
              disabled={isSelectedDatePast}
              onClick={() => openAddDialog(group.shiftName, group.carId)}
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
              <div className="flex flex-wrap gap-1.5 mt-1">
                {assignedVolunteerNames.map((name, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium"
                  >
                    {name}
                  </span>
                ))}
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
            <div className="max-h-[50vh] overflow-y-auto space-y-1 border rounded-md p-2">
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
                const issue = getVolunteerDtoIssue(vol);
                return (
                  <button
                    key={vol.id}
                    disabled={isAssigned || isAdding}
                    onClick={() => handleAddVolunteer(vol)}
                    className={`w-full text-right rounded-md px-3 py-3 text-sm transition-colors min-h-[44px] ${
                      isAssigned
                        ? 'opacity-40 cursor-not-allowed bg-muted'
                        : 'hover:bg-accent cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={issue ? 'text-destructive' : ''}>
                        {vol.mappingName}
                      </span>
                      <span className="text-xs text-muted-foreground mr-2">
                        {isAssigned ? 'כבר משובץ' : vol.mobilePhone || ''}
                      </span>
                    </div>
                    {issue && (
                      <p className="text-xs text-destructive mt-0.5">{issue}</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={closeAddDialog} className="min-h-[44px] w-full">
              סיום
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New shift group dialog */}
      <Dialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>משמרת חדשה</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">שם משמרת *</label>
              <Input
                value={newShiftName}
                onChange={(e) => setNewShiftName(e.target.value)}
                placeholder="לדוגמה: צוות א"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">מספר רכב</label>
              <Input
                value={newCarId}
                onChange={(e) => setNewCarId(e.target.value)}
                placeholder="לדוגמה: 101"
              />
            </div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2 mt-4">
            <Button
              onClick={handleCreateGroup}
              disabled={!newShiftName.trim()}
            >
              צור משמרת
            </Button>
            <Button variant="outline" onClick={() => setNewGroupOpen(false)}>
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit shift group dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && !isEditing && setEditTarget(null)}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>עריכת משמרת</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">שם משמרת *</label>
              <Input
                value={editShiftName}
                onChange={(e) => setEditShiftName(e.target.value)}
                placeholder="לדוגמה: צוות א"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">מספר רכב</label>
              <Input
                value={editCarId}
                onChange={(e) => setEditCarId(e.target.value)}
                placeholder="לדוגמה: 101"
              />
            </div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2 mt-4">
            <Button
              onClick={handleEditGroup}
              disabled={!editShiftName.trim() || isEditing}
            >
              {isEditing ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
              שמור
            </Button>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={isEditing}>
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
