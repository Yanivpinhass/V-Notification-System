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
import { locationsService, LocationDto, LocationRequest } from '@/services/locationsService';
import { Loader2 } from 'lucide-react';

const locationSchema = z.object({
  name: z.string().min(2, 'שם חייב להכיל לפחות 2 תווים'),
  address: z.string().optional(),
  city: z.string().optional(),
  navigation: z.string().optional(),
});

type LocationFormData = z.infer<typeof locationSchema>;

interface LocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location: LocationDto | null;
  onSaved: () => void;
}

export const LocationDialog: React.FC<LocationDialogProps> = ({
  open,
  onOpenChange,
  location,
  onSaved,
}) => {
  const isEditing = location !== null;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<LocationFormData>({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      name: '',
      address: '',
      city: '',
      navigation: '',
    },
  });

  const errors = form.formState.errors;

  useEffect(() => {
    if (open) {
      setError(null);
      if (isEditing && location) {
        form.reset({
          name: location.name,
          address: location.address || '',
          city: location.city || '',
          navigation: location.navigation || '',
        });
      } else {
        form.reset({
          name: '',
          address: '',
          city: '',
          navigation: '',
        });
      }
    }
  }, [open, location, isEditing, form]);

  const handleSubmit = async (data: LocationFormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      if (isEditing && location) {
        const request: LocationRequest = {
          name: data.name,
          address: data.address || null,
          city: data.city || null,
          navigation: data.navigation || null,
        };
        await locationsService.update(location.id, request);
      } else {
        const request: LocationRequest = {
          name: data.name,
          address: data.address || null,
          city: data.city || null,
          navigation: data.navigation || null,
        };
        await locationsService.create(request);
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
            {isEditing ? 'עריכת מיקום' : 'מיקום חדש'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">
              שם <span className="text-destructive">*</span>
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

          <div className="space-y-2">
            <Label htmlFor="address">כתובת</Label>
            <Input
              id="address"
              {...form.register('address')}
              disabled={isSubmitting}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="city">עיר</Label>
            <Input
              id="city"
              {...form.register('city')}
              disabled={isSubmitting}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="navigation">ניווט (קישור Waze)</Label>
            <Input
              id="navigation"
              {...form.register('navigation')}
              disabled={isSubmitting}
              dir="ltr"
              className="text-left"
              autoComplete="off"
              placeholder="https://waze.com/ul/..."
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
