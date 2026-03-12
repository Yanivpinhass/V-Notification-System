import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Loader2, Send, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { settingsService } from '@/services/settingsService';

export const SmsSettingsPage: React.FC = () => {
  // Test SMS dialog
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('הודעת בדיקה ממערכת מגב');
  const [isSendingTest, setIsSendingTest] = useState(false);

  const handleSendTest = async () => {
    if (!testPhone.trim()) {
      toast.error('יש להזין מספר טלפון');
      return;
    }
    setIsSendingTest(true);
    try {
      const result = await settingsService.sendTestSms(testPhone.trim(), testMessage.trim() || undefined);
      if (result.success) {
        toast.success('הודעת הבדיקה נשלחה בהצלחה');
        setTestDialogOpen(false);
        setTestPhone('');
      } else {
        toast.error(result.error || 'שליחת הודעת הבדיקה נכשלה');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'אירעה שגיאה בשליחת הבדיקה');
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold">הגדרות SMS</h2>

      {/* SIM Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-5 w-5" />
            כרטיס SIM לשליחת הודעות
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            הודעות SMS נשלחות מכרטיס ה-SIM שמוגדר כברירת מחדל להודעות בהגדרות הטלפון.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            לשינוי: הגדרות הטלפון &larr; חיבורים &larr; מנהל SIM &larr; הודעות
          </p>
        </CardContent>
      </Card>

      {/* Test SMS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-5 w-5" />
            בדיקת שליחת SMS
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            שלח הודעת SMS לבדיקה כדי לוודא שהשליחה עובדת.
          </p>
          <Button variant="outline" onClick={() => setTestDialogOpen(true)}>
            <Send className="h-4 w-4 ml-2" />
            שלח הודעת בדיקה
          </Button>
        </CardContent>
      </Card>

      {/* Test SMS Dialog */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>שליחת SMS לבדיקה</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="test-phone">מספר טלפון</Label>
              <Input
                id="test-phone"
                type="tel"
                dir="ltr"
                placeholder="05XXXXXXXX"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="test-message">תוכן ההודעה</Label>
              <Input
                id="test-message"
                dir="rtl"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2 sm:justify-start">
            <Button onClick={handleSendTest} disabled={isSendingTest}>
              {isSendingTest && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              שלח
            </Button>
            <DialogClose asChild>
              <Button variant="outline">ביטול</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
