import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2, Plus, MessageSquare, Trash2, Pencil, Ban, ChevronRight, ChevronLeft, MapPin, Clock, Car, Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import { he } from 'date-fns/locale';
import { shiftsService, AdminShiftDto } from '@/services/shiftsService';
import { volunteersService, VolunteerDto } from '@/services/volunteersService';
import { locationsService, LocationDto } from '@/services/locationsService';

interface AdminGroup {
  key: string;
  date: string;       // yyyy-MM-dd (the shift date)
  shiftTime: string;
  description: string;
  address: string | null;
  vehicleLocation: string | null;
  vehicleLocationId: number | null;
  vehicleLocationName: string | null;
  carId: string;
  locationId: number | null;
  locationName: string | null;
  shifts: AdminShiftDto[];
}

interface AdminForm {
  description: string;
  date: string;
  shiftTime: string;
  address: string;
  locationId: number;         // 0 = none (mission picker; General location id, or a legacy Vehicle id on edit)
  customLocationName: string;
  carId: string;
  vehicleSelection: string;   // 'none' | '<id>' | 'other'  (vehicle picker)
  vehicleLocation: string;    // free text, used when vehicleSelection === 'other'
  volunteerIds: number[];
}

const emptyForm = (date: string): AdminForm => ({
  description: '', date, shiftTime: '', address: '',
  locationId: 0, customLocationName: '', carId: '',
  vehicleSelection: 'none', vehicleLocation: '', volunteerIds: [],
});

// Sunday of the week containing `d` (JS getDay: Sunday = 0).
const weekStartOf = (d: Date): Date => addDays(d, -d.getDay());
const dateOnly = (iso: string): string => (iso || '').slice(0, 10);
const HEB_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export const AdminShiftsPage: React.FC = () => {
  const [weekStart, setWeekStart] = useState<Date>(() => weekStartOf(new Date()));
  const [shifts, setShifts] = useState<AdminShiftDto[]>([]);
  const [volunteers, setVolunteers] = useState<VolunteerDto[]>([]);
  const [generalLocations, setGeneralLocations] = useState<LocationDto[]>([]);   // מיקום picker (מיקומים כללי)
  const [vehicleLocations, setVehicleLocations] = useState<LocationDto[]>([]);   // מיקום רכב picker (מיקומי ניידות)
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editKey, setEditKey] = useState<{ date: string; shiftTime: string; description: string } | null>(null);
  const [form, setForm] = useState<AdminForm>(emptyForm(''));
  const [existingVolunteerIds, setExistingVolunteerIds] = useState<number[]>([]); // locked members when editing
  const [legacyMissionName, setLegacyMissionName] = useState<string | null>(null); // off-list mission location (edit)
  const [volunteerSearch, setVolunteerSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const [confirm, setConfirm] = useState<{ title: string; body: string; run: () => Promise<void> } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const weekStartStr = format(weekStart, 'yyyy-MM-dd');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [shiftData, volData, generalData, vehicleData] = await Promise.all([
        shiftsService.getAdminByWeek(weekStartStr),
        volunteersService.getAll(),
        locationsService.getAll('General'),
        locationsService.getAll('Vehicle'),
      ]);
      setShifts(shiftData);
      setVolunteers(volData);
      setGeneralLocations(generalData);
      setVehicleLocations(vehicleData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'אירעה שגיאה בטעינת הנתונים');
    } finally {
      setIsLoading(false);
    }
  }, [weekStartStr]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const groups = useMemo<AdminGroup[]>(() => {
    const map = new Map<string, AdminGroup>();
    for (const s of shifts) {
      const d = dateOnly(s.shiftDate);
      const time = s.shiftTime ?? '';
      const desc = s.description ?? s.shiftName ?? '';
      const key = `${d}|${time}|${desc}`;
      let g = map.get(key);
      if (!g) {
        g = {
          key, date: d, shiftTime: time, description: desc,
          address: s.address, vehicleLocation: s.vehicleLocation, carId: s.carId,
          vehicleLocationId: s.vehicleLocationId, vehicleLocationName: s.vehicleLocationName,
          locationId: s.locationId, locationName: s.locationName, shifts: [],
        };
        map.set(key, g);
      }
      g.shifts.push(s);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.date === b.date ? a.shiftTime.localeCompare(b.shiftTime) : a.date.localeCompare(b.date));
  }, [shifts]);

  const openCreate = () => {
    setEditKey(null);
    setForm(emptyForm(weekStartStr));
    setExistingVolunteerIds([]);
    setLegacyMissionName(null);
    setVolunteerSearch('');
    setDialogOpen(true);
  };

  const openEdit = (g: AdminGroup) => {
    setEditKey({ date: g.date, shiftTime: g.shiftTime, description: g.description });
    // Mission location: if the id is not in the General list (e.g. a pre-v2 Vehicle-typed reference),
    // remember its name so the picker can show it as an extra "(מיקום ניידת)" option and preserve it.
    const missionOnList = g.locationId != null && generalLocations.some((l) => l.id === g.locationId);
    setLegacyMissionName(g.locationId != null && !missionOnList ? (g.locationName ?? `#${g.locationId}`) : null);

    // Vehicle location: id → picker on id; else free text → 'other'; else 'none'.
    const vehicleSelection = g.vehicleLocationId != null
      ? String(g.vehicleLocationId)
      : (g.vehicleLocation ? 'other' : 'none');

    const memberIds = g.shifts.map((s) => s.volunteerId).filter((x): x is number => x != null);
    setExistingVolunteerIds(memberIds);
    setForm({
      description: g.description,
      date: g.date,
      shiftTime: g.shiftTime,
      address: g.address ?? '',
      locationId: g.locationId ?? 0,
      customLocationName: g.locationId ? '' : (g.locationName ?? ''),
      carId: g.carId ?? '',
      vehicleSelection,
      vehicleLocation: g.vehicleLocationId != null ? '' : (g.vehicleLocation ?? ''),
      volunteerIds: memberIds,
    });
    setVolunteerSearch('');
    setDialogOpen(true);
  };

  const toggleVolunteer = (id: number, checked: boolean) => {
    setForm((f) => ({
      ...f,
      volunteerIds: checked ? [...f.volunteerIds, id] : f.volunteerIds.filter((v) => v !== id),
    }));
  };

  const validateForm = (requireVolunteers: boolean): string | null => {
    if (!form.description.trim()) return 'תיאור המשימה נדרש';
    if (!form.date) return 'תאריך נדרש';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.shiftTime)) return 'שעת המשמרת נדרשת (HH:mm)';
    if (requireVolunteers && form.volunteerIds.length === 0) return 'יש לבחור לפחות מתנדב אחד';
    return null;
  };

  const buildCommon = () => {
    const sel = form.vehicleSelection;
    const vehicleLocationId = sel !== 'none' && sel !== 'other' ? Number(sel) : null;
    const vehicleLocation = sel === 'other' ? (form.vehicleLocation.trim() || null) : null;
    return {
      address: form.address.trim() || null,
      carId: form.carId.trim() || null,
      locationId: form.locationId === 0 ? null : form.locationId,
      customLocationName: form.locationId === 0 ? (form.customLocationName.trim() || null) : null,
      vehicleLocationId,
      vehicleLocation,
    };
  };

  const handleCreate = async (sendSms: boolean) => {
    const err = validateForm(true);
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      const res = await shiftsService.createAdminShift({
        description: form.description.trim(),
        date: form.date,
        shiftTime: form.shiftTime,
        volunteerIds: form.volunteerIds,
        sendSms,
        ...buildCommon(),
      });
      toast.success(sendSms
        ? `נוצרו ${res.created} שיבוצים, נשלחו ${res.smsSent} הודעות${res.smsFailed ? ` (${res.smsFailed} נכשלו)` : ''}`
        : `נוצרו ${res.created} שיבוצים`);
      setDialogOpen(false);
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'אירעה שגיאה ביצירת המשמרת');
    } finally {
      setSaving(false);
    }
  };

  // Edit save (V2-D2): update the group's fields FIRST, then (idempotently) create rows for any
  // newly-added volunteers carrying the FULL field payload; SMS goes only to the added ones.
  const handleSaveEdit = async (sendSms: boolean) => {
    const err = validateForm(false);
    if (err) { toast.error(err); return; }
    if (!editKey) return;
    setSaving(true);
    try {
      const common = buildCommon();
      await shiftsService.updateAdminShiftGroup({
        date: editKey.date,
        oldShiftTime: editKey.shiftTime,
        oldDescription: editKey.description,
        newDescription: form.description.trim(),
        newShiftTime: form.shiftTime,
        ...common,
      });
      // The PUT may have re-bucketed the group — advance editKey to the NEW key so a step-2 retry
      // targets the current group (not the consumed old key).
      const newKey = { date: editKey.date, shiftTime: form.shiftTime, description: form.description.trim() };
      setEditKey(newKey);

      const added = form.volunteerIds.filter((id) => !existingVolunteerIds.includes(id));
      let addMsg = '';
      if (added.length > 0) {
        const res = await shiftsService.createAdminShift({
          description: newKey.description,
          date: newKey.date,
          shiftTime: newKey.shiftTime,
          volunteerIds: added,
          sendSms,
          ...common,
        });
        addMsg = sendSms
          ? ` · נוספו ${res.created} מתנדבים, נשלחו ${res.smsSent} הודעות`
          : ` · נוספו ${res.created} מתנדבים`;
      }
      toast.success('המשמרת המנהלית עודכנה בהצלחה' + addMsg);
      setDialogOpen(false);
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'אירעה שגיאה בעדכון המשמרת');
    } finally {
      setSaving(false);
    }
  };

  const sendSms = async (shift: AdminShiftDto) => {
    setBusyId(shift.id);
    try {
      const note = await shiftsService.sendAdminShiftSms(shift.id);
      // Surface the server note — an unconfirmed (Dispatched) send returns 200 with its own
      // message; showing an error for it is what drove the resend incident. [dup-sms 3.2]
      toast.success(note || 'הודעת SMS נשלחה בהצלחה');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שליחת SMS נכשלה');
    } finally {
      setBusyId(null);
    }
  };

  const cancelGroup = (g: AdminGroup) => {
    setConfirm({
      title: 'ביטול משמרת מנהלית',
      body: `לבטל את המשמרת "${g.description}" בתאריך ${g.date} בשעה ${g.shiftTime}?`,
      run: async () => {
        await shiftsService.cancelAdminShiftGroup({ date: g.date, shiftTime: g.shiftTime, description: g.description });
        toast.success('המשמרת המנהלית בוטלה');
        await loadData();
      },
    });
  };

  const deleteRow = (shift: AdminShiftDto) => {
    setConfirm({
      title: 'מחיקת שיבוץ',
      body: `למחוק את השיבוץ של ${shift.volunteerName ?? 'המתנדב'}?`,
      run: async () => {
        await shiftsService.deleteShift(shift.id);
        toast.success('השיבוץ נמחק');
        await loadData();
      },
    });
  };

  // Mission-picker options: General locations, plus (on edit) an extra option for an off-list id so a
  // pre-v2 Vehicle-typed reference stays visible and is preserved unless the user actively re-picks.
  const missionOptions = useMemo(() => {
    const opts = generalLocations.map((l) => ({ value: String(l.id), label: l.name }));
    if (form.locationId !== 0 && !generalLocations.some((l) => l.id === form.locationId)) {
      opts.push({ value: String(form.locationId), label: `${legacyMissionName ?? `#${form.locationId}`} (מיקום ניידת)` });
    }
    return opts;
  }, [generalLocations, form.locationId, legacyMissionName]);

  const filteredVolunteers = volunteers.filter((v) => v.mappingName.includes(volunteerSearch));

  const weekEnd = addDays(weekStart, 6);
  const isEdit = editKey != null;

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">משמרות מנהליות</h1>
        <Button onClick={openCreate} size="sm">
          <Plus className="ml-1 h-4 w-4" /> משמרת חדשה
        </Button>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between rounded-lg border bg-card px-2 py-1.5">
        <Button variant="ghost" size="icon" onClick={() => setWeekStart((w) => addDays(w, -7))} aria-label="שבוע קודם">
          <ChevronRight className="h-5 w-5" />
        </Button>
        <span className="text-sm font-medium">
          {format(weekStart, 'd MMM', { locale: he })} – {format(weekEnd, 'd MMM yyyy', { locale: he })}
        </span>
        <Button variant="ghost" size="icon" onClick={() => setWeekStart((w) => addDays(w, 7))} aria-label="שבוע הבא">
          <ChevronLeft className="h-5 w-5" />
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 p-4 text-destructive">{error}</div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : groups.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">אין משמרות מנהליות לשבוע זה</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const d = new Date(`${g.date}T00:00:00`);
            const dayName = HEB_DAYS[d.getDay()];
            const vehicleDisplay = g.vehicleLocationName ?? g.vehicleLocation;
            return (
              <Card key={g.key}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                  <div className="space-y-1">
                    <div className="font-semibold">{g.description}</div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{dayName}, {format(d, 'dd/MM/yyyy')}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {g.shiftTime}</span>
                      {g.locationName && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {g.locationName}</span>}
                      {g.carId && <span className="flex items-center gap-1"><Car className="h-3 w-3" /> {g.carId}</span>}
                    </div>
                    {(g.address || vehicleDisplay) && (
                      <div className="text-xs text-muted-foreground">
                        {g.address && <span>כתובת: {g.address}</span>}
                        {g.address && vehicleDisplay && <span> · </span>}
                        {vehicleDisplay && <span>מיקום רכב: {vehicleDisplay}</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(g)} aria-label="עריכה">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => cancelGroup(g)} aria-label="ביטול">
                      <Ban className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 pt-0">
                  {g.shifts.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm">
                      <div className="flex items-center gap-2">
                        <span>{s.volunteerName ?? 'לא ידוע'}</span>
                        {!s.volunteerApproved && <Badge variant="outline" className="text-[10px]">לא מאושר SMS</Badge>}
                        {!s.volunteerPhone && <Badge variant="outline" className="text-[10px]">אין טלפון</Badge>}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          disabled={busyId === s.id || !s.volunteerApproved || !s.volunteerPhone}
                          onClick={() => sendSms(s)} aria-label="שליחת SMS"
                        >
                          {busyId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteRow(s)} aria-label="מחיקה">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'עריכת משמרת מנהלית' : 'משמרת מנהלית חדשה'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>תיאור המשימה *</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>תאריך *</Label>
                <Input type="date" dir="ltr" value={form.date}
                  disabled={isEdit}
                  onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>שעה *</Label>
                <Input type="time" dir="ltr" value={form.shiftTime}
                  onChange={(e) => setForm({ ...form, shiftTime: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>מיקום</Label>
              <Select
                dir="rtl"
                value={String(form.locationId)}
                onValueChange={(v) => {
                  const id = Number(v);
                  // Autofill address when a General location is picked (leave it on none/legacy).
                  const loc = generalLocations.find((l) => l.id === id);
                  setForm((f) => ({ ...f, locationId: id, address: loc ? (loc.address ?? '') : f.address }));
                }}
              >
                <SelectTrigger><SelectValue placeholder="בחר מיקום" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">ללא מיקום מוגדר</SelectItem>
                  {missionOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.locationId === 0 && (
                <Input className="mt-1" placeholder="שם מיקום חופשי (לא חובה)"
                  value={form.customLocationName}
                  onChange={(e) => setForm({ ...form, customLocationName: e.target.value })} />
              )}
            </div>

            <div className="space-y-1">
              <Label>כתובת</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>רכב</Label>
                <Input value={form.carId} onChange={(e) => setForm({ ...form, carId: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>מיקום רכב</Label>
                <Select dir="rtl" value={form.vehicleSelection} onValueChange={(v) => setForm({ ...form, vehicleSelection: v })}>
                  <SelectTrigger><SelectValue placeholder="בחר מיקום רכב" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">ללא</SelectItem>
                    {vehicleLocations.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
                    <SelectItem value="other">אחר (טקסט חופשי)</SelectItem>
                  </SelectContent>
                </Select>
                {form.vehicleSelection === 'other' && (
                  <Input className="mt-1" placeholder="מיקום רכב חופשי"
                    value={form.vehicleLocation}
                    onChange={(e) => setForm({ ...form, vehicleLocation: e.target.value })} />
                )}
              </div>
            </div>

            {/* Volunteers — shown in create AND edit. On edit, existing members are checked + locked;
                only newly-checked volunteers are added (removal is per-row via the card trash icon). */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>מתנדבים{isEdit ? '' : ' *'}</Label>
                {form.volunteerIds.length > 0 && (
                  <Badge variant="secondary" className="text-[10px]">נבחרו {form.volunteerIds.length}</Badge>
                )}
              </div>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="חיפוש מתנדב..."
                  value={volunteerSearch}
                  onChange={(e) => setVolunteerSearch(e.target.value)}
                  className="pr-10"
                />
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                {volunteers.length === 0 && <p className="text-xs text-muted-foreground">אין מתנדבים</p>}
                {filteredVolunteers.map((v) => {
                  const isMember = existingVolunteerIds.includes(v.id);
                  return (
                    <label key={v.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-accent">
                      <Checkbox
                        checked={form.volunteerIds.includes(v.id)}
                        disabled={isMember}
                        onCheckedChange={(c) => toggleVolunteer(v.id, c === true)}
                      />
                      <span className="text-sm">{v.mappingName}</span>
                      {isMember && <Badge variant="secondary" className="text-[10px]">משובץ</Badge>}
                      {!v.approveToReceiveSms && <Badge variant="outline" className="text-[10px]">לא מאושר SMS</Badge>}
                    </label>
                  );
                })}
                {volunteers.length > 0 && filteredVolunteers.length === 0 && (
                  <p className="text-xs text-muted-foreground">לא נמצאו מתנדבים תואמים</p>
                )}
              </div>
              {isEdit && (
                <p className="text-[11px] text-muted-foreground">
                  ניתן להוסיף מתנדבים חדשים. להסרת מתנדב קיים — השתמש באייקון המחיקה בכרטיס.
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => (isEdit ? handleSaveEdit(false) : handleCreate(false))} disabled={saving}>
              {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />} שמירה
            </Button>
            <Button onClick={() => (isEdit ? handleSaveEdit(true) : handleCreate(true))} disabled={saving}>
              {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />} שמירה ושליחת SMS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm (cancel-group / delete-row) */}
      <AlertDialog open={confirm != null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const c = confirm;
                setConfirm(null);
                if (!c) return;
                try {
                  await c.run();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'אירעה שגיאה');
                }
              }}
            >
              אישור
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
