import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Bell, MapPin } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { SchedulerConfigEntry, SchedulerConfigUpdate } from '@/services/schedulerService';
import { MessageTemplateEntry } from '@/services/messageTemplateService';
import {
  TYPE_META,
  GROUP_META,
  SAME_DAY,
  buildTimelineItems,
  splitPlaceholders,
  renderSample,
  HOLIDAY_DISCLAIMER,
} from './schedulerPreview';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

interface ReminderEditModalProps {
  config: SchedulerConfigEntry | null;
  templates: MessageTemplateEntry[];
  isReadOnly: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (update: SchedulerConfigUpdate) => void;
}

export const ReminderEditModal: React.FC<ReminderEditModalProps> = ({
  config,
  templates,
  isReadOnly,
  isSaving,
  onClose,
  onSave,
}) => {
  const open = !!config;
  const [time, setTime] = useState('');
  const [days, setDays] = useState(1);
  const [enabled, setEnabled] = useState(false);
  const [templateId, setTemplateId] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (config) {
      setTime(config.time);
      setDays(config.daysBeforeShift || 1);
      setEnabled(config.isEnabled === 1);
      setTemplateId(config.messageTemplateId);
      setError(null);
    } else {
      // Reset on close so reopening a different row never briefly flashes the previous row's values
      // (this component stays mounted; only the dialog content unmounts).
      setTime('');
      setDays(1);
      setEnabled(false);
      setTemplateId(0);
      setError(null);
    }
  }, [config]);

  const isSameDay = config?.reminderType === SAME_DAY;
  const meta = config ? TYPE_META[config.reminderType] : undefined;
  const Icon = meta?.icon;

  const effectiveDays = isSameDay ? 0 : days;

  const timeline = useMemo(() => {
    if (!config) return [];
    return buildTimelineItems(
      { dayGroup: config.dayGroup, reminderType: config.reminderType, time, daysBeforeShift: effectiveDays },
      3,
    );
  }, [config, time, effectiveDays]);

  const selectedTemplate = templates.find((t) => t.id === templateId);

  const validate = (): string | null => {
    if (!TIME_RE.test(time)) return 'פורמט שעה לא תקין (HH:mm)';
    if (!templateId || templateId <= 0) return 'יש לבחור תבנית הודעה';
    if (!isSameDay && days < 1) return 'חייב להיות לפחות יום אחד לפני';
    return null;
  };

  const handleConfirm = () => {
    if (!config) return;
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    onSave({
      id: config.id,
      time,
      daysBeforeShift: effectiveDays,
      isEnabled: enabled ? 1 : 0,
      messageTemplateId: templateId,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !isSaving) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {Icon && <Icon className="h-5 w-5 text-primary" />}
            {meta?.title ?? 'תזכורת'}
          </DialogTitle>
          <DialogDescription>{config ? GROUP_META[config.dayGroup]?.sendLabel : ''}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4" dir="rtl">
          {/* Enable */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
            <Label htmlFor="rem-enabled" className="text-sm">מצב תזכורת</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{enabled ? 'פעיל' : 'מושבת'}</span>
              <Switch id="rem-enabled" checked={enabled} disabled={isReadOnly} onCheckedChange={setEnabled} />
            </div>
          </div>

          {/* Time + days */}
          <div className="flex gap-3">
            <div className="w-36 space-y-1">
              <Label htmlFor="rem-time" className="text-xs">שעת שליחה *</Label>
              <Input
                id="rem-time"
                type="time"
                value={time}
                disabled={isReadOnly}
                onChange={(e) => setTime(e.target.value)}
                className="text-center"
              />
              <p className="text-[11px] text-muted-foreground">פורמט 24 שעות (HH:mm)</p>
            </div>

            {!isSameDay && (
              <div className="flex-1 space-y-1">
                <Label htmlFor="rem-days" className="text-xs">שלח לפני המשמרת *</Label>
                <Select value={String(days)} disabled={isReadOnly} onValueChange={(v) => setDays(parseInt(v, 10))}>
                  <SelectTrigger id="rem-days"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                      <SelectItem key={d} value={String(d)}>{d === 1 ? 'יום אחד לפני' : `${d} ימים לפני`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Template */}
          <div className="space-y-1">
            <Label htmlFor="rem-template" className="text-xs">תבנית הודעה *</Label>
            <Select value={templateId ? String(templateId) : ''} disabled={isReadOnly} onValueChange={(v) => setTemplateId(parseInt(v, 10))}>
              <SelectTrigger id="rem-template"><SelectValue placeholder="בחר תבנית הודעה" /></SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTemplate && config && (
              <div className="mt-2 space-y-2 rounded-lg border bg-muted/30 p-3">
                <p className="text-[11px] font-medium text-muted-foreground">תוכן התבנית</p>
                <p className="text-xs leading-relaxed" dir="rtl">
                  {splitPlaceholders(selectedTemplate.content).map((part, i) =>
                    part.isPlaceholder ? (
                      <span key={i} className="rounded bg-primary/10 px-1 font-semibold text-primary">{part.text}</span>
                    ) : (
                      <span key={i}>{part.text}</span>
                    ),
                  )}
                </p>
                <p className="text-[11px] font-medium text-muted-foreground pt-1">דוגמה (דוד כהן, משמרת לילה, רכב 5)</p>
                <p className="whitespace-pre-line rounded bg-background p-2 text-xs leading-relaxed" dir="rtl">
                  {renderSample(selectedTemplate.content, {
                    dayGroup: config.dayGroup,
                    reminderType: config.reminderType,
                    time,
                    daysBeforeShift: effectiveDays,
                  })}
                </p>
              </div>
            )}
          </div>

          {/* Location note (SameDay only) */}
          {meta?.hasLocation && (
            <p className="flex items-start gap-2 rounded-lg bg-green-50 p-2 text-[11px] text-green-800">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              מיקום הניידת מצורף אוטומטית לתזכורת זו (עיר/שם + קישור Waze). תזכורות מוקדמות אינן כוללות מיקום.
            </p>
          )}

          {/* Live timeline */}
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="mb-3 flex items-center gap-1.5 text-[13px] font-bold text-foreground">
              <Bell className="h-3.5 w-3.5" /> מתי יישלח, ועל אילו משמרות?
              <span className="text-[11px] font-normal text-muted-foreground">— ההרצות הקרובות</span>
            </p>
            <div className="space-y-2.5">
              {timeline.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', TYPE_META[item.reminderType]?.dotColor ?? 'bg-muted-foreground')} />
                  <div className="min-w-0 text-xs">
                    <div className="text-muted-foreground">הרצה: <span className="font-medium text-foreground">{item.runLabel} {item.runDateShort}</span> · {item.time}</div>
                    <div className="text-foreground">משמרות של <span className="font-semibold">{item.shiftLabel}</span></div>
                    {item.pulledBack && (
                      <span className="mt-1 inline-flex rounded-md border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-[10px] text-purple-700">
                        ↩ כולל משמרות שאחרת היו נשלחות בשישי/שבת
                      </span>
                    )}
                    {item.hasLocation && (
                      <span className="mt-1 mr-1 inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] text-green-700">
                        <MapPin className="h-2.5 w-2.5" /> כולל מיקום
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10px] text-muted-foreground">{HOLIDAY_DISCLAIMER}</p>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2 text-xs text-destructive">{error}</div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            {isReadOnly ? 'סגור' : 'ביטול'}
          </Button>
          {!isReadOnly && (
            <Button onClick={handleConfirm} disabled={isSaving} className="h-11">
              {isSaving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              שמור
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
