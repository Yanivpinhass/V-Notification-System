import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SchedulerConfigEntry } from '@/services/schedulerService';

interface DayGroupConfigCardProps {
  title: string;
  sameDayConfig: SchedulerConfigEntry;
  advanceConfig: SchedulerConfigEntry;
  isReadOnly: boolean;
  onConfigChange: (updated: SchedulerConfigEntry) => void;
}

const TEMPLATE_MAX_LENGTH = 200;

const ReminderSection: React.FC<{
  label: string;
  config: SchedulerConfigEntry;
  isReadOnly: boolean;
  showDaysBefore: boolean;
  onChange: (updated: SchedulerConfigEntry) => void;
}> = ({ label, config, isReadOnly, showDaysBefore, onChange }) => {
  const templateLength = config.messageTemplate.length;
  const templateValid = templateLength > 0 && templateLength <= TEMPLATE_MAX_LENGTH
    && config.messageTemplate.includes('{שם}') && config.messageTemplate.includes('{תאריך}');

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
        <div className="flex items-center justify-between">
          <Label htmlFor={`template-${config.id}`} className="text-xs">תבנית הודעה</Label>
          <span className={`text-xs ${templateLength > TEMPLATE_MAX_LENGTH ? 'text-red-500' : 'text-muted-foreground'}`}>
            {templateLength}/{TEMPLATE_MAX_LENGTH} תווים
          </span>
        </div>
        <Textarea
          id={`template-${config.id}`}
          value={config.messageTemplate}
          disabled={isReadOnly}
          onChange={(e) => onChange({ ...config, messageTemplate: e.target.value })}
          rows={2}
          className="text-sm resize-none"
          dir="rtl"
        />
        {!isReadOnly && !templateValid && templateLength > 0 && (
          <p className="text-xs text-red-500">
            {templateLength > TEMPLATE_MAX_LENGTH
              ? 'חריגה ממגבלת התווים'
              : !config.messageTemplate.includes('{שם}') || !config.messageTemplate.includes('{תאריך}')
              ? 'תבנית חייבת להכיל {שם} ו-{תאריך}'
              : ''}
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
          onChange={onConfigChange}
        />
        <ReminderSection
          label="תזכורת מוקדמת"
          config={advanceConfig}
          isReadOnly={isReadOnly}
          showDaysBefore={true}
          onChange={onConfigChange}
        />
        {!isReadOnly && (
          <p className="text-xs text-muted-foreground">
            מילות מפתח: {'{שם}'} {'{שם מלא}'} {'{תאריך}'} {'{יום}'} {'{משמרת}'} {'{רכב}'}
          </p>
        )}
      </CardContent>
    </Card>
  );
};
