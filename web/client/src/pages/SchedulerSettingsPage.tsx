import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { DayGroupConfigCard } from './components/DayGroupConfigCard';
import {
  schedulerService,
  SchedulerConfigEntry,
  SchedulerConfigUpdate,
} from '@/services/schedulerService';

const DAY_GROUP_TITLES: Record<string, string> = {
  SunThu: "ימים א׳–ה׳ (ראשון עד חמישי)",
  Fri: "יום ו׳ (שישי)",
  Sat: "שבת",
};

const DAY_GROUP_ORDER = ['SunThu', 'Fri', 'Sat'];

const isUserAdmin = (): boolean => {
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      const roles: string[] = user.roles || [];
      return roles.includes('Admin');
    }
  } catch {
    // ignore
  }
  return false;
};

export const SchedulerSettingsPage: React.FC = () => {
  const [configs, setConfigs] = useState<SchedulerConfigEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReadOnly = !isUserAdmin();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const configData = await schedulerService.getConfig();
      setConfigs(configData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'אירעה שגיאה בטעינת הנתונים');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleConfigChange = useCallback((updated: SchedulerConfigEntry) => {
    setConfigs((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c))
    );
  }, []);

  const validateConfigs = (): string | null => {
    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

    for (const config of configs) {
      if (!timeRegex.test(config.time)) {
        return 'פורמט שעה לא תקין (HH:mm)';
      }
      if (!config.messageTemplate || config.messageTemplate.length > 200) {
        return 'תבנית הודעה חייבת להכיל 1-200 תווים';
      }
      if (!config.messageTemplate.includes('{שם}') || !config.messageTemplate.includes('{תאריך}')) {
        return 'תבנית הודעה חייבת להכיל {שם} ו-{תאריך}';
      }
      if (config.reminderType === 'SameDay' && config.daysBeforeShift !== 0) {
        return 'תזכורת ליום המשמרת חייבת להיות 0 ימים לפני';
      }
      if (config.reminderType === 'Advance' && config.daysBeforeShift < 1) {
        return 'תזכורת מוקדמת חייבת להיות לפחות יום אחד לפני';
      }
    }
    return null;
  };

  const handleSave = async () => {
    const validationError = validateConfigs();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsSaving(true);
    try {
      const updates: SchedulerConfigUpdate[] = configs.map((c) => ({
        id: c.id,
        time: c.time,
        daysBeforeShift: c.daysBeforeShift,
        isEnabled: c.isEnabled,
        messageTemplate: c.messageTemplate,
      }));
      await schedulerService.updateConfig(updates);
      toast.success('ההגדרות נשמרו בהצלחה');
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'אירעה שגיאה בשמירת ההגדרות');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // Group configs by dayGroup
  const groupedConfigs = DAY_GROUP_ORDER.map((dayGroup) => {
    const sameDay = configs.find((c) => c.dayGroup === dayGroup && c.reminderType === 'SameDay');
    const advance = configs.find((c) => c.dayGroup === dayGroup && c.reminderType === 'Advance');
    return { dayGroup, sameDay, advance };
  }).filter((g) => g.sameDay && g.advance);

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold">הגדרות תזמון SMS</h2>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
          {error}
        </div>
      )}

      {groupedConfigs.map(({ dayGroup, sameDay, advance }) => (
        <DayGroupConfigCard
          key={dayGroup}
          title={DAY_GROUP_TITLES[dayGroup] || dayGroup}
          sameDayConfig={sameDay!}
          advanceConfig={advance!}
          isReadOnly={isReadOnly}
          onConfigChange={handleConfigChange}
        />
      ))}

      {!isReadOnly && (
        <div className="flex justify-start">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
            שמור שינויים
          </Button>
        </div>
      )}
    </div>
  );
};
