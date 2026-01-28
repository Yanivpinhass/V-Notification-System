import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authService } from '@/services/authService';
import { Loader2, RefreshCw } from 'lucide-react';

// Password validation: min 6 chars, at least one letter and one digit
const passwordPattern = /^(?=.*[a-zA-Z])(?=.*\d).{6,}$/;

// Generate a random password (12 chars, includes upper, lower, digits)
const generatePassword = (): string => {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;

  // Ensure at least one of each type
  let password = '';
  password += upper[Math.floor(Math.random() * upper.length)];
  password += lower[Math.floor(Math.random() * lower.length)];
  password += digits[Math.floor(Math.random() * digits.length)];

  // Fill the rest randomly
  for (let i = 0; i < 9; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

const changePasswordSchema = z.object({
  newPassword: z.string()
    .min(6, 'הסיסמה חייבת להכיל לפחות 6 תווים')
    .regex(passwordPattern, 'הסיסמה חייבת להכיל לפחות 6 תווים, אות אחת ומספר אחד'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'הסיסמאות אינן תואמות',
  path: ['confirmPassword'],
});

type FormData = z.infer<typeof changePasswordSchema>;

interface ChangePasswordDialogProps {
  open: boolean;
  onPasswordChanged: () => void;
}

export const ChangePasswordDialog: React.FC<ChangePasswordDialogProps> = ({
  open,
  onPasswordChanged,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
  });

  const handleGeneratePassword = () => {
    const newPass = generatePassword();
    setGeneratedPassword(newPass);
    form.setValue('newPassword', newPass);
    form.setValue('confirmPassword', newPass);
  };

  const handleSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      await authService.changePassword(data.newPassword);
      onPasswordChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'אירעה שגיאה בשינוי הסיסמה');
    } finally {
      setIsSubmitting(false);
    }
  };

  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-[400px]"
        dir="rtl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-right">שינוי סיסמה</DialogTitle>
          <DialogDescription className="text-right">
            עליך לשנות את הסיסמה שלך לפני שתוכל להמשיך
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="newPassword">
              סיסמה חדשה <span className="text-red-500">*</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="newPassword"
                type="text"
                {...form.register('newPassword')}
                disabled={isSubmitting}
                dir="ltr"
                className="text-left flex-1"
                autoComplete="new-password"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleGeneratePassword}
                disabled={isSubmitting}
                title="צור סיסמה"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            {generatedPassword && (
              <p className="text-sm text-green-600 font-mono bg-green-50 p-2 rounded">
                סיסמה שנוצרה: {generatedPassword}
              </p>
            )}
            {errors.newPassword && (
              <p className="text-sm text-red-500">{errors.newPassword.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">
              אימות סיסמה <span className="text-red-500">*</span>
            </Label>
            <Input
              id="confirmPassword"
              type="text"
              {...form.register('confirmPassword')}
              disabled={isSubmitting}
              dir="ltr"
              className="text-left"
              autoComplete="new-password"
            />
            {errors.confirmPassword && (
              <p className="text-sm text-red-500">{errors.confirmPassword.message}</p>
            )}
          </div>

          <p className="text-sm text-gray-500">
            הסיסמה חייבת להכיל לפחות 6 תווים, אות אחת ומספר אחד
          </p>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                משנה סיסמה...
              </>
            ) : (
              'שנה סיסמה'
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
