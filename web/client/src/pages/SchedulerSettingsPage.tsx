import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, ChevronDown, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { isUserAdmin } from '@/lib/auth';
import {
  schedulerService,
  SchedulerConfigEntry,
  SchedulerConfigUpdate,
} from '@/services/schedulerService';
import { messageTemplateService, MessageTemplateEntry } from '@/services/messageTemplateService';
import { ReminderRow } from './scheduler/ReminderRow';
import { ReminderEditModal } from './scheduler/ReminderEditModal';
import {
  DAY_GROUP_ORDER,
  GROUP_META,
  SAME_DAY,
  ADVANCE,
  WEEKDAY_ADVANCE,
  EXPLAINER_TITLE,
  EXPLAINER_BODY,
} from './scheduler/schedulerPreview';

export const SchedulerSettingsPage: React.FC = () => {
  const [configs, setConfigs] = useState<SchedulerConfigEntry[]>([]);
  const [templates, setTemplates] = useState<MessageTemplateEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [editingConfig, setEditingConfig] = useState<SchedulerConfigEntry | null>(null);
  const [explainerOpen, setExplainerOpen] = useState(false);

  const isReadOnly = !isUserAdmin();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [configData, templateData] = await Promise.all([
        schedulerService.getConfig(),
        messageTemplateService.getAll(),
      ]);
      setConfigs(configData);
      setTemplates(templateData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'אירעה שגיאה בטעינת הנתונים');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const mergeConfig = useCallback((updated: SchedulerConfigEntry) => {
    setConfigs((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setEditingConfig((prev) => (prev && prev.id === updated.id ? updated : prev));
  }, []);

  const withSaving = async (id: number, fn: () => Promise<void>) => {
    setSavingIds((prev) => new Set(prev).add(id));
    try {
      await fn();
    } finally {
      setSavingIds((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
    }
  };

  const handleToggle = (config: SchedulerConfigEntry, next: boolean) => {
    void withSaving(config.id, async () => {
      try {
        const updated = await schedulerService.updateOne({
          id: config.id,
          time: config.time,
          daysBeforeShift: config.daysBeforeShift,
          isEnabled: next ? 1 : 0,
          messageTemplateId: config.messageTemplateId,
        });
        mergeConfig(updated);
        toast.success('הסטטוס עודכן');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'אירעה שגיאה בשמירה');
      }
    });
  };

  const handleSaveOne = (update: SchedulerConfigUpdate) => {
    void withSaving(update.id, async () => {
      try {
        const updated = await schedulerService.updateOne(update);
        mergeConfig(updated);
        setEditingConfig(null);
        toast.success('התזכורת עודכנה בהצלחה');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'אירעה שגיאה בשמירה');
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Group by day group; each group must have at least SameDay + Advance (WeekdayAdvance is optional
  // and only exists for SunThu). Keep the predicate `sameDay && advance` — do NOT require weekdayAdvance.
  const groups = DAY_GROUP_ORDER.map((dg) => {
    const sameDay = configs.find((c) => c.dayGroup === dg && c.reminderType === SAME_DAY);
    const advance = configs.find((c) => c.dayGroup === dg && c.reminderType === ADVANCE);
    const weekdayAdvance = configs.find((c) => c.dayGroup === dg && c.reminderType === WEEKDAY_ADVANCE);
    const rows = [sameDay, advance, weekdayAdvance].filter(Boolean) as SchedulerConfigEntry[];
    return { dg, sameDay, advance, rows };
  }).filter((g) => g.sameDay && g.advance);

  const templateName = (id: number) => templates.find((t) => t.id === id)?.name;
  const editingSaving = editingConfig ? savingIds.has(editingConfig.id) : false;

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <h2 className="text-lg font-semibold">הגדרות תזמון SMS</h2>

      {error && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 p-4 text-destructive">{error}</div>
      )}

      {/* Explainer */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <button
          type="button"
          onClick={() => setExplainerOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-right"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <Info className="h-4 w-4 text-primary" /> {EXPLAINER_TITLE}
          </span>
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', explainerOpen && 'rotate-180')} />
        </button>
        {explainerOpen && (
          <div className="space-y-2 border-t px-4 py-3 text-sm text-muted-foreground">
            <p>{EXPLAINER_BODY}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {DAY_GROUP_ORDER.map((dg) => (
                <span key={dg} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {GROUP_META[dg]?.sendLabel}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {groups.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">לא נמצאו תזמונים</p>
      )}

      {groups.map((g) => (
        <div key={g.dg} className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <h3 className="text-sm font-bold">{GROUP_META[g.dg]?.sendLabel ?? g.dg}</h3>
            <Badge variant="secondary" className="font-medium text-muted-foreground">{g.rows.length} תזכורות</Badge>
          </div>
          {g.rows.map((c) => (
            <ReminderRow
              key={c.id}
              config={c}
              templateName={templateName(c.messageTemplateId)}
              isReadOnly={isReadOnly}
              isSaving={savingIds.has(c.id)}
              onToggle={handleToggle}
              onEdit={setEditingConfig}
            />
          ))}
        </div>
      ))}

      <p className="pt-2 text-center text-[11px] text-muted-foreground">
        כל שינוי נשמר מיד. קבוצת הימים קובעת מתי התזכורת נשלחת — לא מתי המשמרת מתקיימת.
      </p>

      <ReminderEditModal
        config={editingConfig}
        templates={templates}
        isReadOnly={isReadOnly}
        isSaving={editingSaving}
        onClose={() => setEditingConfig(null)}
        onSave={handleSaveOne}
      />
    </div>
  );
};
