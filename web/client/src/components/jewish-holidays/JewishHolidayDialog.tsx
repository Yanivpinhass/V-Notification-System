import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { jewishHolidaysService, JewishHolidayDto, JewishHolidayRequest } from '@/services/jewishHolidaysService';
import { Loader2 } from 'lucide-react';

const holidaySchema = z.object({
  date: z.string().min(1, 'תאריך נדרש').regex(/^\d{4}-\d{2}-\d{2}$/, 'פורמט תאריך לא תקין'),
  name: z.string().min(2, 'שם חייב להכיל לפחות 2 תווים'),
});

type HolidayFormData = z.infer<typeof holidaySchema>;

interface JewishHolidayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holiday: JewishHolidayDto | null;
  onSaved: () => void;
}

export const JewishHolidayDialog: React.FC<JewishHolidayDialogProps> = ({
  open,
  onOpenChange,
  holiday,
  onSaved,
}) => {
  const isEditing = holiday !== null;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<HolidayFormData>({
    resolver: zodResolver(holidaySchema),
    defaultValues: {
      date: '',
      name: '',
    },
  });

  const errors = form.formState.errors;

  useEffect(() => {
    if (open) {
      setError(null);
      if (isEditing && holiday) {
        form.reset({
          date: holiday.date,
          name: holiday.name,
        });
      } else {
        form.reset({
          date: '',
          name: '',
        });
      }
    }
  }, [open, holiday, isEditing, form]);

  const handleSubmit = async (data: HolidayFormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const request: JewishHolidayRequest = {
        date: data.date,
        name: data.name,
      };

      if (isEditing && holiday) {
        await jewishHolidaysService.update(holiday.id, request);
      } else {
        await jewishHolidaysService.create(request);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'אירעה שגיאה בשמירת הנתונים');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">
            {isEditing ? 'עריכת חג' : 'חג חדש'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="date">
              תאריך <span className="text-destructive">*</span>
            </Label>
            <Input
              id="date"
              type="date"
              {...form.register('date')}
              disabled={isSubmitting}
              dir="ltr"
              className="text-left"
            />
            {errors.date && (
              <p className="text-sm text-destructive">{errors.date.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">
              שם החג <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              {...form.register('name')}
              disabled={isSubmitting}
              autoComplete="off"
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              ביטול
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  שומר...
                </>
              ) : (
                'שמור'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
