import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckCircle2, Info, XCircle, Loader2 } from 'lucide-react';
import { volunteerSmsService } from '@/services/volunteerSmsService';

type PageState =
  | { type: 'initial' }
  | { type: 'loading' }
  | { type: 'not_found'; message: string }
  | { type: 'already_approved' }
  | { type: 'form' }
  | { type: 'submitting' }
  | { type: 'success' }
  | { type: 'rate_limited' };

const internalIdSchema = z.object({
  internalId: z.string().min(1),
});

const smsApprovalSchema = z.object({
  firstName: z.string().min(1, 'שם פרטי הוא שדה חובה'),
  lastName: z.string().min(1, 'שם משפחה הוא שדה חובה'),
  mobilePhone: z.string().min(9, 'מספר טלפון לא תקין'),
  approveToReceiveSms: z.literal(true, {
    errorMap: () => ({ message: 'יש לאשר קבלת הודעות SMS' }),
  }),
});

type InternalIdFormData = z.infer<typeof internalIdSchema>;
type SmsApprovalFormData = z.infer<typeof smsApprovalSchema>;

const VolunteerSmsApprovalPage: React.FC = () => {
  const { accessKey } = useParams<{ accessKey: string }>();
  const [pageState, setPageState] = useState<PageState>({ type: 'initial' });
  const [internalId, setInternalId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const approvalForm = useForm<SmsApprovalFormData>({
    resolver: zodResolver(smsApprovalSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      mobilePhone: '',
      approveToReceiveSms: false,
    },
  });

  const handleInternalIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = e.target.value.replace(/\D/g, '');
    setInternalId(digitsOnly);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/[^\d\-]/g, '');
    approvalForm.setValue('mobilePhone', cleaned);
  };

  const handleVerify = async () => {
    if (!accessKey || !internalId) return;

    setPageState({ type: 'loading' });
    setError(null);

    try {
      const response = await volunteerSmsService.verifyVolunteer(accessKey, internalId);

      if (response.status === 'already_approved') {
        setPageState({ type: 'already_approved' });
      } else {
        setPageState({ type: 'form' });
      }
    } catch (err: any) {
      if (err.message?.includes('429') || err.message?.includes('Too Many')) {
        setPageState({ type: 'rate_limited' });
      } else {
        setPageState({ type: 'not_found', message: err.message || 'המספר האישי אינו קיים במערכת' });
      }
    }
  };

  const handleSubmitApproval = async (data: SmsApprovalFormData) => {
    if (!accessKey) return;

    setPageState({ type: 'submitting' });
    setError(null);

    try {
      await volunteerSmsService.submitApproval(accessKey, {
        internalId,
        firstName: data.firstName,
        lastName: data.lastName,
        mobilePhone: data.mobilePhone,
        approveToReceiveSms: data.approveToReceiveSms,
      });

      setPageState({ type: 'success' });
    } catch (err: any) {
      if (err.message?.includes('429') || err.message?.includes('Too Many')) {
        setPageState({ type: 'rate_limited' });
      } else {
        setError(err.message || 'אירעה שגיאה בשמירת הנתונים');
        setPageState({ type: 'form' });
      }
    }
  };

  const handleTryAgain = () => {
    setInternalId('');
    setError(null);
    setPageState({ type: 'initial' });
    approvalForm.reset();
  };

  const renderContent = () => {
    switch (pageState.type) {
      case 'initial':
        return (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold text-primary">
                אישור קבלת הודעות SMS
              </CardTitle>
              <CardDescription className="text-base text-muted-foreground">
                הכנס מספר אישי (לא תעודת זהות)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="internalId" className="text-right block">
                  מספר אישי
                </Label>
                <Input
                  id="internalId"
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  value={internalId}
                  onChange={handleInternalIdChange}
                  className="text-left"
                  dir="ltr"
                />
              </div>
              <Button
                onClick={handleVerify}
                className="w-full"
                disabled={internalId.length === 0}
              >
                התחבר
              </Button>
            </CardContent>
          </>
        );

      case 'loading':
        return (
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="mt-4 text-muted-foreground">בודק...</p>
          </CardContent>
        );

      case 'not_found':
        return (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold text-primary">
                אישור קבלת הודעות SMS
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription className="text-right mr-2">
                  {pageState.message}
                </AlertDescription>
              </Alert>
              <Button onClick={handleTryAgain} className="w-full" variant="outline">
                נסה שוב
              </Button>
            </CardContent>
          </>
        );

      case 'already_approved':
        return (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold text-primary">
                אישור קבלת הודעות SMS
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="border-blue-200 bg-blue-50">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-right mr-2 text-blue-800">
                  קיים אישור לקבלת SMS - להסרה יש לצור קשר עם המב"ס
                </AlertDescription>
              </Alert>
            </CardContent>
          </>
        );

      case 'form':
        return (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold text-primary">
                אישור קבלת הודעות SMS
              </CardTitle>
              <CardDescription className="text-base text-muted-foreground">
                מלא את הפרטים הבאים
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription className="text-right">
                    {error}
                  </AlertDescription>
                </Alert>
              )}

              <form onSubmit={approvalForm.handleSubmit(handleSubmitApproval)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-right block">
                    שם פרטי
                  </Label>
                  <Input
                    id="firstName"
                    type="text"
                    maxLength={20}
                    {...approvalForm.register('firstName')}
                    className="text-right"
                    dir="rtl"
                  />
                  {approvalForm.formState.errors.firstName && (
                    <p className="text-sm text-destructive text-right">
                      {approvalForm.formState.errors.firstName.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-right block">
                    שם משפחה
                  </Label>
                  <Input
                    id="lastName"
                    type="text"
                    maxLength={20}
                    {...approvalForm.register('lastName')}
                    className="text-right"
                    dir="rtl"
                  />
                  {approvalForm.formState.errors.lastName && (
                    <p className="text-sm text-destructive text-right">
                      {approvalForm.formState.errors.lastName.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mobilePhone" className="text-right block">
                    מספר טלפון נייד
                  </Label>
                  <Input
                    id="mobilePhone"
                    type="text"
                    inputMode="tel"
                    maxLength={12}
                    value={approvalForm.watch('mobilePhone')}
                    onChange={handlePhoneChange}
                    className="text-left"
                    dir="ltr"
                    placeholder="05X-XXXXXXX"
                  />
                  {approvalForm.formState.errors.mobilePhone && (
                    <p className="text-sm text-destructive text-right">
                      {approvalForm.formState.errors.mobilePhone.message}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="approveToReceiveSms"
                    checked={approvalForm.watch('approveToReceiveSms')}
                    onCheckedChange={(checked) =>
                      approvalForm.setValue('approveToReceiveSms', checked === true)
                    }
                  />
                  <Label htmlFor="approveToReceiveSms" className="text-right cursor-pointer">
                    אני מאשר/ת קבלת הודעות SMS
                  </Label>
                </div>
                {approvalForm.formState.errors.approveToReceiveSms && (
                  <p className="text-sm text-destructive text-right">
                    {approvalForm.formState.errors.approveToReceiveSms.message}
                  </p>
                )}

                <Button type="submit" className="w-full">
                  שמור
                </Button>
              </form>
            </CardContent>
          </>
        );

      case 'submitting':
        return (
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="mt-4 text-muted-foreground">שומר...</p>
          </CardContent>
        );

      case 'success':
        return (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold text-primary">
                אישור קבלת הודעות SMS
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-right mr-2 text-green-800">
                  האישור נקלט בהצלחה
                </AlertDescription>
              </Alert>
            </CardContent>
          </>
        );

      case 'rate_limited':
        return (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold text-primary">
                אישור קבלת הודעות SMS
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <AlertDescription className="text-right">
                  יותר מדי בקשות, נסה שוב מאוחר יותר
                </AlertDescription>
              </Alert>
            </CardContent>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 font-hebrew" dir="rtl">
      <Card className="w-full max-w-md bg-white">
        {renderContent()}
      </Card>
    </div>
  );
};

export default VolunteerSmsApprovalPage;
