import React, { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isUserAdmin } from '@/lib/auth';
import { adminSchedulerService, AdminSchedulerConfig } from '@/services/adminSchedulerService';
import { adminSettingsService, AdminTemplates } from '@/services/adminSettingsService';
import { messageTemplateService, MessageTemplateEntry } from '@/services/messageTemplateService';

// Settings page for the administrative-shifts advance reminder (single AdminAdvance SchedulerConfig
// row) + the three template roles (advance / assignment / today). The advance template id lives on the
// config row; assignment + today live in AppSettings. SystemManager sees disabled controls (PUTs are
// Admin-only) — matching SchedulerSettingsPage / CallbackSettingsPage.
export const AdminSchedulerSettingsPage: React.FC = () => {
  const [config, setConfig] = useState<AdminSchedulerConfig | null>(null);
  const [roles, setRoles] = useState<AdminTemplates>({ assignmentTemplateId: null, todayTemplateId: null });
  const [templates, setTemplates] = useState<MessageTemplateEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReadOnly = !isUserAdmin();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [configData, rolesData, templateData] = await Promise.all([
        adminSchedulerService.getConfig(),
        adminSettingsService.getTemplates(),
        messageTemplateService.getAll(),
      ]);
      setConfig(configData);
      setRoles(rolesData);
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

  const handleSave = async () => {
    if (!config || isReadOnly) return;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(config.time)) {
      toast.error('שעה לא תקינה (HH:mm)');
      return;
    }
    if (roles.assignmentTemplateId == null || roles.todayTemplateId == null) {
      toast.error('יש לבחור תבנית שיבוץ ותבנית ליום המשמרת');
      return;
    }
    setIsSaving(true);
    try {
      const updated = await adminSchedulerService.updateConfig({
        time: config.time,
        isEnabled: config.isEnabled,
        messageTemplateId: config.messageTemplateId,
      });
      await adminSettingsService.updateTemplates({
        assignmentTemplateId: roles.assignmentTemplateId,
        todayTemplateId: roles.todayTemplateId,
      });
      setConfig(updated);
      toast.success('ההגדרות נשמרו בהצלחה');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'אירעה שגיאה בשמירה');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="p-4" dir="rtl">
        <div className="rounded-md border border-destructive/20 bg-destructive/10 p-4 text-destructive">
          {error ?? 'הגדרת תזמון מנהלית לא נמצאה'}
        </div>
      </div>
    );
  }

  const templateSelect = (value: number | null, onChange: (id: number) => void) => (
    <Select
      dir="rtl"
      value={value != null ? String(value) : undefined}
      onValueChange={(v) => onChange(Number(v))}
      disabled={isReadOnly}
    >
      <SelectTrigger>
        <SelectValue placeholder="בחר תבנית" />
      </SelectTrigger>
      <SelectContent>
        {templates.map((t) => (
          <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-6 p-4" dir="rtl">
      <h2 className="text-lg font-semibold">הגדרות תזמון למשמרות מנהליות</h2>

      {/* Advance reminder */}
      <div className="space-y-4 rounded-xl border bg-card p-4">
        <h3 className="text-sm font-bold">תזכורת מקדימה (יום לפני, בימי חול בלבד)</h3>

        <div className="flex items-center justify-between">
          <Label htmlFor="admin-advance-enabled">פעיל</Label>
          <Switch
            id="admin-advance-enabled"
            dir="ltr"
            checked={config.isEnabled === 1}
            onCheckedChange={(c) => setConfig({ ...config, isEnabled: c ? 1 : 0 })}
            disabled={isReadOnly}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="admin-advance-time">שעת שליחה</Label>
          <Input
            id="admin-advance-time"
            type="time"
            dir="ltr"
            className="w-40"
            value={config.time}
            onChange={(e) => setConfig({ ...config, time: e.target.value })}
            disabled={isReadOnly}
          />
        </div>

        <div className="space-y-1">
          <Label>תבנית ההודעה המקדימה</Label>
          {templateSelect(config.messageTemplateId, (id) => setConfig({ ...config, messageTemplateId: id }))}
        </div>
      </div>

      {/* Template roles */}
      <div className="space-y-4 rounded-xl border bg-card p-4">
        <h3 className="text-sm font-bold">תבניות הודעה למשמרות מנהליות</h3>

        <div className="space-y-1">
          <Label>תבנית שיבוץ (בשליחה ידנית לפני יום המשמרת)</Label>
          {templateSelect(roles.assignmentTemplateId, (id) => setRoles({ ...roles, assignmentTemplateId: id }))}
        </div>

        <div className="space-y-1">
          <Label>תבנית ליום המשמרת</Label>
          {templateSelect(roles.todayTemplateId, (id) => setRoles({ ...roles, todayTemplateId: id }))}
        </div>
      </div>

      {!isReadOnly && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            שמירה
          </Button>
        </div>
      )}

      <p className="pt-2 text-center text-[11px] text-muted-foreground">
        התזכורת המקדימה נשלחת יום לפני המשמרת, בימי חול בלבד (לעולם לא בשישי/שבת/חג/ערב חג).
      </p>
    </div>
  );
};
