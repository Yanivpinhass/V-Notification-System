import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { volunteersService } from '@/services/volunteersService';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export const RevokeSmsApprovalPage: React.FC = () => {
  const [internalId, setInternalId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isValidInput = /^[0-9]{1,8}$/.test(internalId);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 8);
    setInternalId(value);
    setSuccess(null);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!isValidInput) return;

    setIsLoading(true);
    setSuccess(null);
    setError(null);

    try {
      await volunteersService.revokeSmsApproval(internalId);
      setSuccess('ההרשמה להודעות בוטלה בהצלחה');
      setInternalId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'אירעה שגיאה');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>ביטול הרשמה להודעות</CardTitle>
          <CardDescription>
            הזן מספר אישי של מתנדב כדי לבטל את אישור קבלת ההודעות שלו
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="internalId">מספר אישי</Label>
            <Input
              id="internalId"
              type="text"
              inputMode="numeric"
              placeholder="הזן מספר אישי"
              value={internalId}
              onChange={handleInputChange}
              disabled={isLoading}
              dir="ltr"
              className="text-right"
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!isValidInput || isLoading}
            className="w-full"
            variant="destructive"
          >
            {isLoading ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                מבצע ביטול...
              </>
            ) : (
              'ביטול הרשמה'
            )}
          </Button>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>שגיאה</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-green-500 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-800">בוצע בהצלחה</AlertTitle>
              <AlertDescription className="text-green-700">{success}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RevokeSmsApprovalPage;
