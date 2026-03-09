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
import { Switch } from '@/components/ui/switch';
import { volunteersService, VolunteerDto, CreateVolunteerRequest, UpdateVolunteerRequest } from '@/services/volunteersService';
import { Loader2 } from 'lucide-react';

const volunteerSchema = z.object({
  mappingName: z.string().min(2, 'שם חייב להכיל לפחות 2 תווים'),
  mobilePhone: z.string().optional(),
  approveToReceiveSms: z.boolean(),
});

type VolunteerFormData = z.infer<typeof volunteerSchema>;

interface VolunteerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  volunteer: VolunteerDto | null;
  onSaved: () => void;
}

export const VolunteerDialog: React.FC<VolunteerDialogProps> = ({
  open,
  onOpenChange,
  volunteer,
  onSaved,
}) => {
  const isEditing = volunteer !== null;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<VolunteerFormData>({
    resolver: zodResolver(volunteerSchema),
    defaultValues: {
      mappingName: '',
      mobilePhone: '',
      approveToReceiveSms: true,
    },
  });

  const errors = form.formState.errors;

  // Reset form when dialog opens/closes or volunteer changes
  useEffect(() => {
    if (open) {
      setError(null);
      if (isEditing && volunteer) {
        form.reset({
          mappingName: volunteer.mappingName,
          mobilePhone: volunteer.mobilePhone || '',
          approveToReceiveSms: volunteer.approveToReceiveSms,
        });
      } else {
        form.reset({
          mappingName: '',
          mobilePhone: '',
          approveToReceiveSms: true,
        });
      }
    }
  }, [open, volunteer, isEditing, form]);

  const handleSubmit = async (data: VolunteerFormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      if (isEditing && volunteer) {
        const request: UpdateVolunteerRequest = {
          mappingName: data.mappingName,
          mobilePhone: data.mobilePhone || null,
          approveToReceiveSms: data.approveToReceiveSms,
        };
        await volunteersService.update(volunteer.id, request);
      } else {
        const request: CreateVolunteerRequest = {
          mappingName: data.mappingName,
          mobilePhone: data.mobilePhone || null,
          approveToReceiveSms: data.approveToReceiveSms,
        };
        await volunteersService.create(request);
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
            {isEditing ? 'עריכת מתנדב' : 'מתנדב חדש'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="mappingName">
              שם <span className="text-red-500">*</span>
            </Label>
            <Input
              id="mappingName"
              {...form.register('mappingName')}
              disabled={isSubmitting}
              autoComplete="off"
            />
            {errors.mappingName && (
              <p className="text-sm text-red-500">{errors.mappingName.message}</p>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="mobilePhone">טלפון</Label>
            <Input
              id="mobilePhone"
              {...form.register('mobilePhone')}
              disabled={isSubmitting}
              dir="ltr"
              className="text-left"
              autoComplete="off"
            />
          </div>

          {/* SMS Approval */}
          <div className="flex items-center justify-between">
            <Label htmlFor="approveToReceiveSms">אישור SMS</Label>
            <Switch
              id="approveToReceiveSms"
              checked={form.watch('approveToReceiveSms')}
              onCheckedChange={(checked) => form.setValue('approveToReceiveSms', checked)}
              disabled={isSubmitting}
            />
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
