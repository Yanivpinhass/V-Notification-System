import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, PhoneForwarded, Smartphone, Info } from 'lucide-react';
import { toast } from 'sonner';
import { isUserAdmin } from '@/lib/auth';
import { callbackConfigService, CallbackConfig } from '@/services/callbackConfigService';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const GATE_PHONE_RE = /^[0-9+\-]+$/;

// Android-only feature: the auto-callback runs in native receivers, so it has no meaning in the
// web build. Presence of the WebView's window.NativeMedia bridge marks "running in the Android
// app" (same convention as the duty-log PNG export) — no new bridge needed.
const isAndroidApp = (): boolean =>
  typeof window !== 'undefined' && !!(window as unknown as { NativeMedia?: unknown }).NativeMedia;

export const CallbackSettingsPage: React.FC = () => {
  const isReadOnly = !isUserAdmin();

  const [isActive, setIsActive] = useState(false);
  const [allCallers, setAllCallers] = useState(false);
  const [allDay, setAllDay] = useState(false);
  const [fromHour, setFromHour] = useState('08:00');
  const [toHour, setToHour] = useState('20:00');
  const [gatePhone, setGatePhone] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const applyConfig = (cfg: CallbackConfig) => {
    setIsActive(cfg.isActive);
    setAllCallers(cfg.allCallers);
    setAllDay(cfg.allDay);
    setFromHour(cfg.fromHour || '08:00');
    setToHour(cfg.toHour || '20:00');
    setGatePhone(cfg.gatePhone || '');
  };

  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      applyConfig(await callbackConfigService.getConfig());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'אירעה שגיאה בטעינת ההגדרות');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAndroidApp()) loadConfig();
    else setIsLoading(false);
  }, [loadConfig]);

  const handleSave = async () => {
    const phone = gatePhone.trim();
    if (isActive && (phone.length < 9 || !GATE_PHONE_RE.test(phone))) {
      toast.error('יש להזין מספר טלפון תקין לשער');
      return;
    }
    if (!allDay && (!TIME_RE.test(fromHour) || !TIME_RE.test(toHour))) {
      toast.error('פורמט שעה לא תקין. נדרש HH:mm');
      return;
    }
    setIsSaving(true);
    try {
      const saved = await callbackConfigService.updateConfig({
        isActive,
        gatePhone: phone,
        fromHour,
        toHour,
        allDay,
        allCallers,
      });
      applyConfig(saved);
      toast.success('ההגדרות נשמרו');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'אירעה שגיאה בשמירה');
    } finally {
      setIsSaving(false);
    }
  };

  // Web build (no Android bridge): the feature can't run here, so show a notice instead of the form.
  if (!isAndroidApp()) {
    return (
      <div className="p-4 space-y-4" dir="rtl">
        <h2 className="text-lg font-semibold">חיוג חוזר לשער</h2>
        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <Smartphone className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              הגדרה זו זמינה רק באפליקציית האנדרואיד המותקנת על טלפון הניידת.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4" dir="rtl">
      <h2 className="text-lg font-semibold">חיוג חוזר לשער</h2>

      {isLoading ? (
        <div className="flex items-center justify-center p-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin ml-2" /> טוען...
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" className="mt-3" onClick={loadConfig}>נסה שוב</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PhoneForwarded className="h-5 w-5" />
                הגדרת חיוג חוזר לשער
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Active */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="text-sm font-medium">הפעלת חיוג חוזר לשער</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    שיחה נכנסת שלא נענתה תוך 20 שניות תידחה והשער יחויג אוטומטית.
                  </p>
                </div>
                <Switch
                  checked={isActive}
                  disabled={isReadOnly || isSaving}
                  onCheckedChange={setIsActive}
                  aria-label="הפעלת חיוג חוזר לשער"
                />
              </div>

              {/* All callers */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="text-sm font-medium">כל המתקשרים</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    הפעלה עבור כל מתקשר — לא רק מתנדבים במשמרת היום/אתמול. בכיבוי, מסונן למתנדבי המשמרת בלבד.
                  </p>
                </div>
                <Switch
                  checked={allCallers}
                  disabled={isReadOnly || isSaving}
                  onCheckedChange={setAllCallers}
                  aria-label="כל המתקשרים"
                />
              </div>

              {/* Gate phone */}
              <div className="space-y-2">
                <Label htmlFor="gate-phone" className="text-sm font-medium">מספר טלפון לשער</Label>
                <Input
                  id="gate-phone"
                  type="tel"
                  dir="ltr"
                  className="text-left"
                  placeholder="05XXXXXXXX"
                  value={gatePhone}
                  disabled={isReadOnly || isSaving}
                  onChange={(e) => setGatePhone(e.target.value)}
                />
              </div>

              {/* All day */}
              <div className="flex items-center justify-between gap-4">
                <Label className="text-sm font-medium">פעיל כל היום</Label>
                <Switch
                  checked={allDay}
                  disabled={isReadOnly || isSaving}
                  onCheckedChange={setAllDay}
                  aria-label="פעיל כל היום"
                />
              </div>

              {/* Time window (disabled when All-day) */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="from-hour" className="text-sm font-medium">משעה</Label>
                  <Input
                    id="from-hour"
                    type="time"
                    dir="ltr"
                    className="text-left"
                    value={fromHour}
                    disabled={isReadOnly || isSaving || allDay}
                    onChange={(e) => setFromHour(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="to-hour" className="text-sm font-medium">עד שעה</Label>
                  <Input
                    id="to-hour"
                    type="time"
                    dir="ltr"
                    className="text-left"
                    value={toHour}
                    disabled={isReadOnly || isSaving || allDay}
                    onChange={(e) => setToHour(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                ניתן להגדיר חלון שחוצה חצות (לדוגמה 20:00 עד 06:00).
              </p>

              {!isReadOnly && (
                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                    שמירה
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Static guidance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Info className="h-5 w-5" />
                הרשאות וצריכת סוללה
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>כדי שהתכונה תפעל יש לאשר לאפליקציה את הרשאות הטלפון (חיוג, ניהול שיחות וקריאת יומן שיחות) בעת ההפעלה.</p>
              <p>
                להבטחת פעולה רציפה: הגדרות הטלפון &larr; אפליקציות &larr; מגב &larr; סוללה &larr; הגדר ל"ללא הגבלה" (Unrestricted),
                וודא שהאפליקציה אינה מועברת ל"שינה".
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default CallbackSettingsPage;
