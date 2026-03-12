import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { SchedulerConfigEntry } from '@/services/schedulerService';
import { MessageTemplateEntry } from '@/services/messageTemplateService';

interface DayGroupConfigCardProps {
  title: string;
  sameDayConfig: SchedulerConfigEntry;
  advanceConfig: SchedulerConfigEntry;
  isReadOnly: boolean;
  templates: MessageTemplateEntry[];
  onConfigChange: (updated: SchedulerConfigEntry) => void;
}

const ReminderSection: React.FC<{
  label: string;
  config: SchedulerConfigEntry;
  isReadOnly: boolean;
  showDaysBefore: boolean;
  templates: MessageTemplateEntry[];
  onChange: (updated: SchedulerConfigEntry) => void;
}> = ({ label, config, isReadOnly, showDaysBefore, templates, onChange }) => {
  const selectedTemplate = templates.find((t) => t.id === config.messageTemplateId);

  return (
    <div className="space-y-3 p-4 border rounded-lg">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-medium text-sm min-w-0 truncate">{label}</h4>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Switch
            id={`enabled-${config.id}`}
            checked={config.isEnabled === 1}
            disabled={isReadOnly}
            onCheckedChange={(checked) =>
              onChange({ ...config, isEnabled: checked ? 1 : 0 })
            }
          />
          <Label htmlFor={`enabled-${config.id}`} className="text-xs text-muted-foreground whitespace-nowrap">
            {config.isEnabled ? 'פעיל' : 'מושבת'}
          </Label>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="space-y-1 w-40">
          <Label htmlFor={`time-${config.id}`} className="text-xs">שעה</Label>
          <Input
            id={`time-${config.id}`}
            type="time"
            value={config.time}
            disabled={isReadOnly}
            onChange={(e) => onChange({ ...config, time: e.target.value })}
            className="text-center"
          />
        </div>

        {showDaysBefore && (
          <div className="space-y-1 w-32">
            <Label htmlFor={`days-${config.id}`} className="text-xs">ימים לפני משמרת</Label>
            <Select
              value={config.daysBeforeShift.toString()}
              disabled={isReadOnly}
              onValueChange={(val) =>
                onChange({ ...config, daysBeforeShift: parseInt(val, 10) })
              }
            >
              <SelectTrigger id={`days-${config.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <SelectItem key={d} value={d.toString()}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor={`template-${config.id}`} className="text-xs">תבנית הודעה</Label>
        <Select
          value={config.messageTemplateId.toString()}
          disabled={isReadOnly}
          onValueChange={(val) =>
            onChange({ ...config, messageTemplateId: parseInt(val, 10) })
          }
        >
          <SelectTrigger id={`template-${config.id}`}>
            <SelectValue placeholder="בחר תבנית הודעה" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id.toString()}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedTemplate && (
          <p className="text-xs text-muted-foreground mt-1 p-2 bg-muted/40 rounded" dir="rtl">
            {selectedTemplate.content}
          </p>
        )}
      </div>
    </div>
  );
};

export const DayGroupConfigCard: React.FC<DayGroupConfigCardProps> = ({
  title,
  sameDayConfig,
  advanceConfig,
  isReadOnly,
  templates,
  onConfigChange,
}) => {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ReminderSection
          label="תזכורת ליום המשמרת"
          config={sameDayConfig}
          isReadOnly={isReadOnly}
          showDaysBefore={false}
          templates={templates}
          onChange={onConfigChange}
        />
        <ReminderSection
          label="תזכורת מוקדמת"
          config={advanceConfig}
          isReadOnly={isReadOnly}
          showDaysBefore={true}
          templates={templates}
          onChange={onConfigChange}
        />
      </CardContent>
    </Card>
  );
};
