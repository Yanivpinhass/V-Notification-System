import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { volunteersService, VolunteerDto } from '@/services/volunteersService';
import { Loader2, Plus, Trash2, Search, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { OTHER_OPTION, SHIFT_NAME_PRESETS, TEAM_CAR_MAP } from '@/features/duty-log/types';
import { useDutyLogPreview } from '@/features/duty-log/DutyLogPreviewProvider';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const dutyLogSchema = z
  .object({
    date: z.string().min(1, 'יש לבחור תאריך'),
    startTime: z.string().regex(TIME_RE, 'שעה לא תקינה (HH:MM)'),
    endTime: z.string().regex(TIME_RE, 'שעה לא תקינה (HH:MM)'),
    shiftNameSelect: z.string().min(1, 'יש לבחור שם משמרת'),
    customShiftName: z.string().optional(),
    vehicleNumber: z.string().optional(),
  })
  .refine((d) => d.shiftNameSelect !== OTHER_OPTION || !!d.customShiftName?.trim(), {
    path: ['customShiftName'],
    message: 'יש להזין שם משמרת',
  });

type DutyLogFormData = z.infer<typeof dutyLogSchema>;

const todayLocalIso = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

interface FreeTextPerson {
  name: string;
  phone: string;
}

export const DutyLogPage: React.FC = () => {
  const form = useForm<DutyLogFormData>({
    resolver: zodResolver(dutyLogSchema),
    defaultValues: {
      date: todayLocalIso(),
      startTime: '19:00',
      endTime: '02:00',
      shiftNameSelect: '',
      customShiftName: '',
      vehicleNumber: '',
    },
  });
  const errors = form.formState.errors;
  const shiftNameSelect = form.watch('shiftNameSelect');

  // Volunteers
  const [volunteers, setVolunteers] = useState<VolunteerDto[]>([]);
  const [loadingVolunteers, setLoadingVolunteers] = useState(true);
  const [volunteerError, setVolunteerError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');

  // Free-text people
  const [freeTextPeople, setFreeTextPeople] = useState<FreeTextPerson[]>([]);
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonPhone, setNewPersonPhone] = useState('');

  const [peopleError, setPeopleError] = useState<string | null>(null);
  const { openPreview } = useDutyLogPreview();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await volunteersService.getAll();
        if (active) setVolunteers(data);
      } catch {
        if (active) setVolunteerError('טעינת רשימת המתנדבים נכשלה');
      } finally {
        if (active) setLoadingVolunteers(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const filteredVolunteers = useMemo(() => {
    const q = search.trim();
    if (!q) return volunteers;
    return volunteers.filter((v) => v.mappingName?.includes(q));
  }, [volunteers, search]);

  const toggleVolunteer = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Preset shift name → prefill the vehicle (overridable/clearable). Free-text → no prefill.
  const handleShiftNameChange = (value: string) => {
    form.setValue('shiftNameSelect', value, { shouldValidate: true });
    if (value !== OTHER_OPTION && TEAM_CAR_MAP[value]) {
      form.setValue('vehicleNumber', TEAM_CAR_MAP[value]);
    }
  };

  const addFreeTextPerson = () => {
    const name = newPersonName.trim();
    if (!name) return;
    setFreeTextPeople((prev) => [...prev, { name, phone: newPersonPhone.trim() }]);
    setNewPersonName('');
    setNewPersonPhone('');
  };

  const removeFreeTextPerson = (idx: number) => {
    setFreeTextPeople((prev) => prev.filter((_, i) => i !== idx));
  };

  const onValid = (values: DutyLogFormData) => {
    const shiftName =
      values.shiftNameSelect === OTHER_OPTION
        ? (values.customShiftName ?? '').trim()
        : values.shiftNameSelect;

    const selectedPeople = volunteers
      .filter((v) => selectedIds.has(v.id))
      .map((v) => ({ name: v.mappingName, phone: v.mobilePhone ?? undefined }));
    const typedPeople = freeTextPeople
      .filter((p) => p.name.trim())
      .map((p) => ({ name: p.name.trim(), phone: p.phone.trim() || undefined }));
    const people = [...selectedPeople, ...typedPeople];

    if (people.length < 1) {
      setPeopleError('יש לבחור לפחות אדם אחד');
      return;
    }
    setPeopleError(null);

    // Build the date LOCALLY from YYYY-MM-DD (split — not new Date(str)).
    const [y, m, d] = values.date.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);

    openPreview({
      shiftName,
      date: dateObj,
      startTime: values.startTime,
      endTime: values.endTime,
      vehicleNumber: values.vehicleNumber?.trim() || undefined,
      people,
    });
  };

  const onInvalid = () => {
    // Mirror the people validation so the message appears alongside field errors.
    const hasPeople = selectedIds.size > 0 || freeTextPeople.some((p) => p.name.trim());
    setPeopleError(hasPeople ? null : 'יש לבחור לפחות אדם אחד');
  };

  const selectedCount = selectedIds.size + freeTextPeople.filter((p) => p.name.trim()).length;

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6" /> יומן הפעלה
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          מילוי הפרטים ויצירת תמונת יומן הפעלה להורדה.
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onValid, onInvalid)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">פרטי המשמרת</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">תאריך <span className="text-destructive">*</span></Label>
                <Input id="date" type="date" dir="ltr" className="text-left" {...form.register('date')} />
                {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="startTime">שעת התחלה <span className="text-destructive">*</span></Label>
                <Input id="startTime" type="time" dir="ltr" className="text-left" {...form.register('startTime')} />
                {errors.startTime && <p className="text-sm text-destructive">{errors.startTime.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="endTime">שעת סיום <span className="text-destructive">*</span></Label>
                <Input id="endTime" type="time" dir="ltr" className="text-left" {...form.register('endTime')} />
                {errors.endTime && <p className="text-sm text-destructive">{errors.endTime.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>שם משמרת <span className="text-destructive">*</span></Label>
                <Select value={shiftNameSelect} onValueChange={handleShiftNameChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר שם משמרת" />
                  </SelectTrigger>
                  <SelectContent>
                    {SHIFT_NAME_PRESETS.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                    <SelectItem value={OTHER_OPTION}>אחר (טקסט חופשי)</SelectItem>
                  </SelectContent>
                </Select>
                {shiftNameSelect === OTHER_OPTION && (
                  <Input
                    placeholder="הזן שם משמרת"
                    {...form.register('customShiftName')}
                    autoComplete="off"
                  />
                )}
                {errors.shiftNameSelect && (
                  <p className="text-sm text-destructive">{errors.shiftNameSelect.message}</p>
                )}
                {errors.customShiftName && (
                  <p className="text-sm text-destructive">{errors.customShiftName.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="vehicleNumber">מספר רכב</Label>
                <Input
                  id="vehicleNumber"
                  dir="ltr"
                  className="text-left"
                  placeholder="לדוגמה: 21-174"
                  {...form.register('vehicleNumber')}
                  autoComplete="off"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              כח אדם
              {selectedCount > 0 && (
                <span className="text-sm font-normal text-muted-foreground mr-2">
                  ({selectedCount} נבחרו)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Volunteer multi-select */}
            <div className="space-y-2">
              <Label>מתנדבים</Label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pr-9"
                  placeholder="חיפוש מתנדב..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="border rounded-md max-h-64 overflow-auto divide-y">
                {loadingVolunteers ? (
                  <div className="flex items-center justify-center p-6 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin ml-2" /> טוען...
                  </div>
                ) : volunteerError ? (
                  <div className="p-4 text-sm text-destructive">{volunteerError}</div>
                ) : filteredVolunteers.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">לא נמצאו מתנדבים</div>
                ) : (
                  filteredVolunteers.map((v) => (
                    <label
                      key={v.id}
                      className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/50"
                    >
                      <Checkbox
                        checked={selectedIds.has(v.id)}
                        onCheckedChange={() => toggleVolunteer(v.id)}
                      />
                      <span className="text-sm font-medium flex-1">{v.mappingName}</span>
                      {v.mobilePhone && (
                        <span className="text-xs text-muted-foreground" dir="ltr">
                          {v.mobilePhone}
                        </span>
                      )}
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* Free-text people */}
            <div className="space-y-2">
              <Label>הוספת אדם ידנית</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  placeholder="שם"
                  value={newPersonName}
                  onChange={(e) => setNewPersonName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addFreeTextPerson();
                    }
                  }}
                />
                <Input
                  placeholder="טלפון (אופציונלי)"
                  dir="ltr"
                  className="text-left"
                  value={newPersonPhone}
                  onChange={(e) => setNewPersonPhone(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addFreeTextPerson();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addFreeTextPerson} className="gap-1 shrink-0">
                  <Plus className="h-4 w-4" /> הוסף
                </Button>
              </div>
              {freeTextPeople.length > 0 && (
                <div className="border rounded-md divide-y">
                  {freeTextPeople.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-2 px-3">
                      <span className="text-sm font-medium flex-1">{p.name}</span>
                      {p.phone && (
                        <span className="text-xs text-muted-foreground" dir="ltr">{p.phone}</span>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => removeFreeTextPerson(idx)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {peopleError && <p className="text-sm text-destructive">{peopleError}</p>}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" className="min-h-[44px] gap-2">
            <FileText className="h-4 w-4" /> צור תצוגה מקדימה
          </Button>
        </div>
      </form>
    </div>
  );
};

export default DutyLogPage;
