import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { jewishHolidaysService, JewishHolidayDto } from '@/services/jewishHolidaysService';
import { Loader2 } from 'lucide-react';

interface DeleteJewishHolidayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holiday: JewishHolidayDto | null;
  onDeleted: () => void;
}

export const DeleteJewishHolidayDialog: React.FC<DeleteJewishHolidayDialogProps> = ({
  open,
  onOpenChange,
  holiday,
  onDeleted,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!holiday) return;

    setIsDeleting(true);
    setError(null);

    try {
      await jewishHolidaysService.deleteHoliday(holiday.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'אירעה שגיאה במחיקת החג');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancel = () => {
    setError(null);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-right">מחיקת חג</AlertDialogTitle>
          <AlertDialogDescription className="text-right">
            האם אתה בטוח שברצונך למחוק את "{holiday?.name}" ({holiday?.date})?
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
            {error}
          </div>
        )}

        <AlertDialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isDeleting}
          >
            ביטול
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                מוחק...
              </>
            ) : (
              'מחק'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
