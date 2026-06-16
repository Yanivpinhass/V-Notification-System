import React from 'react';
import { Pencil, Loader2, MapPin } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { SchedulerConfigEntry } from '@/services/schedulerService';
import {
  TYPE_META,
  buildSummary,
  buildRowHint,
  SAME_DAY,
  type TimelineItem,
} from './schedulerPreview';

const fmtUpdated = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const HintText: React.FC<{ item: TimelineItem }> = ({ item }) => {
  const verb = item.reminderType === SAME_DAY ? 'תזכורת למשמרות של' : 'משמרות של';
  return (
    <>
      לדוגמה: <span className="font-medium text-foreground">{item.runLabel} {item.runDateShort}</span> בשעה {item.time} → {verb}{' '}
      <span className="font-medium text-foreground">{item.shiftLabel}</span>
    </>
  );
};

interface ReminderRowProps {
  config: SchedulerConfigEntry;
  templateName?: string;
  isReadOnly: boolean;
  isSaving: boolean;
  onToggle: (config: SchedulerConfigEntry, next: boolean) => void;
  onEdit: (config: SchedulerConfigEntry) => void;
}

export const ReminderRow: React.FC<ReminderRowProps> = ({
  config,
  templateName,
  isReadOnly,
  isSaving,
  onToggle,
  onEdit,
}) => {
  const meta = TYPE_META[config.reminderType];
  const Icon = meta?.icon;
  const enabled = config.isEnabled === 1;
  const hint = buildRowHint(config);
  const saved = fmtUpdated(config.updatedAt);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onEdit(config)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(config); } }}
      className={cn(
        'flex items-stretch gap-3 rounded-xl border bg-card p-3 shadow-sm transition hover:shadow cursor-pointer text-right',
        !enabled && 'opacity-60'
      )}
    >
      {/* Enable toggle (right/start in RTL) — clicks here must not open the modal */}
      <div
        className="flex shrink-0 flex-col items-center justify-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <Switch
          checked={enabled}
          disabled={isReadOnly || isSaving}
          onCheckedChange={(v) => onToggle(config, v)}
          aria-label={enabled ? 'מושבת' : 'הפעל'}
        />
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
          {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : enabled ? 'פעיל' : 'מושבת'}
        </span>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-primary" />}
          <span className="truncate text-sm font-semibold">{meta?.title ?? config.reminderType}</span>
          {meta?.hasLocation && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              <MapPin className="h-3 w-3" /> מיקום
            </span>
          )}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">{buildSummary(config)}</div>
        {hint && (
          <div className="mt-1 text-xs text-muted-foreground">
            <HintText item={hint} />
          </div>
        )}
        <div className="mt-1 text-xs text-muted-foreground">
          תבנית: {templateName ?? '—'}{saved && ` · נשמר ${saved}`}
        </div>
      </div>

      {/* Edit (left/end in RTL) */}
      <button
        type="button"
        aria-label="עריכה"
        onClick={(e) => { e.stopPropagation(); onEdit(config); }}
        className="flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  );
};
