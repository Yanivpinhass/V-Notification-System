import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { shiftsService, CanceledShiftDto } from '@/services/shiftsService';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

const currentMonthIso = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const formatShiftDate = (iso: string): string => {
  try {
    return format(new Date(iso), 'dd/MM/yyyy', { locale: he });
  } catch {
    return iso;
  }
};

const formatDayOfWeek = (iso: string): string => {
  try {
    return format(new Date(iso), 'EEEE', { locale: he });
  } catch {
    return '';
  }
};

const formatCanceledAt = (iso: string | null): string => {
  if (!iso) return '';
  try {
    return format(new Date(iso), 'dd/MM/yyyy HH:mm', { locale: he });
  } catch {
    return iso;
  }
};

export const CanceledShiftsPage: React.FC = () => {
  const [month, setMonth] = useState<string>(currentMonthIso());
  const [rows, setRows] = useState<CanceledShiftDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CanceledShiftDto | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await shiftsService.getCanceledShifts(month);
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'אירעה שגיאה בטעינת הנתונים');
    } finally {
      setIsLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await shiftsService.deleteShift(deleteTarget.id);
      toast.success('הרשומה נמחקה לצמיתות');
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה במחיקת הרשומה');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-4" dir="rtl">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle>משמרות מבוטלות</CardTitle>
          <div className="flex items-center gap-2 pt-3">
            <Label htmlFor="canceled-month" className="text-sm">חודש:</Label>
            <Input
              id="canceled-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-44"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : error ? (
            <p className="text-destructive py-6 text-center">{error}</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center">לא נמצאו משמרות מבוטלות בחודש זה</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">תאריך</TableHead>
                    <TableHead className="text-right">יום</TableHead>
                    <TableHead className="text-right">משמרת</TableHead>
                    <TableHead className="text-right">רכב</TableHead>
                    <TableHead className="text-right">מתנדב</TableHead>
                    <TableHead className="text-right">טלפון</TableHead>
                    <TableHead className="text-right">מיקום</TableHead>
                    <TableHead className="text-right">בוטל בתאריך</TableHead>
                    <TableHead className="text-right">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{formatShiftDate(row.shiftDate)}</TableCell>
                      <TableCell>{formatDayOfWeek(row.shiftDate)}</TableCell>
                      <TableCell>{row.shiftName}</TableCell>
                      <TableCell>{row.carId || '-'}</TableCell>
                      <TableCell>{row.volunteerName || 'מתנדב לא מזוהה'}</TableCell>
                      <TableCell>{row.volunteerPhone || '-'}</TableCell>
                      <TableCell>{row.locationName || '-'}</TableCell>
                      <TableCell>{formatCanceledAt(row.canceledAt)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteTarget(row)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && !isDeleting && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת רשומה מבוטלת</AlertDialogTitle>
            <AlertDialogDescription>
              פעולה זו לא ניתנת לביטול. הרשומה תימחק לצמיתות מבסיס הנתונים.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-row gap-2 pt-2">
            <AlertDialogCancel disabled={isDeleting} className="mt-0">ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'מחק לצמיתות'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
