import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { jewishHolidaysService, JewishHolidayDto } from '@/services/jewishHolidaysService';
import { JewishHolidayDialog } from '@/components/jewish-holidays/JewishHolidayDialog';
import { DeleteJewishHolidayDialog } from '@/components/jewish-holidays/DeleteJewishHolidayDialog';
import { Plus, Pencil, Trash2, Loader2, Search } from 'lucide-react';
import { isUserAdmin } from '@/lib/auth';

const formatDateDisplay = (dateStr: string): string => {
  try {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
};

export const JewishHolidaysPage: React.FC = () => {
  const [holidays, setHolidays] = useState<JewishHolidayDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<JewishHolidayDto | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingHoliday, setDeletingHoliday] = useState<JewishHolidayDto | null>(null);

  const isAdmin = isUserAdmin();

  const loadHolidays = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await jewishHolidaysService.getAll();
      setHolidays(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'אירעה שגיאה בטעינת הנתונים');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHolidays();
  }, [loadHolidays]);

  const filteredHolidays = useMemo(() => holidays.filter(
    (h) => h.name.includes(searchTerm) || h.date.includes(searchTerm) || formatDateDisplay(h.date).includes(searchTerm)
  ), [holidays, searchTerm]);

  const handleCreate = () => {
    setEditingHoliday(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (h: JewishHolidayDto) => {
    setEditingHoliday(h);
    setIsDialogOpen(true);
  };

  const handleDeleteClick = (h: JewishHolidayDto) => {
    setDeletingHoliday(h);
    setIsDeleteDialogOpen(true);
  };

  const handleSaved = () => {
    setIsDialogOpen(false);
    setEditingHoliday(null);
    loadHolidays();
  };

  const handleDeleted = () => {
    setIsDeleteDialogOpen(false);
    setDeletingHoliday(null);
    loadHolidays();
  };

  return (
    <div className="p-4 max-w-full overflow-hidden">
      <Card className="overflow-hidden">
        <CardHeader className="pb-4 space-y-3">
          <div className="flex items-center justify-between">
            <CardTitle>חגים</CardTitle>
            {isAdmin && (
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleCreate}>
                  <Plus className="h-4 w-4 ml-2" />
                  חדש
                </Button>
              </div>
            )}
          </div>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש לפי שם או תאריך..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-md text-destructive">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredHolidays.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? 'לא נמצאו חגים התואמים לחיפוש' : 'לא נמצאו חגים'}
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/60">
                    <TableHead className="text-center font-semibold text-foreground">תאריך</TableHead>
                    <TableHead className="text-center font-semibold text-foreground">שם החג</TableHead>
                    {isAdmin && (
                      <TableHead className="text-center font-semibold text-foreground">פעולות</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHolidays.map((holiday) => (
                    <TableRow key={holiday.id}>
                      <TableCell className="text-center" dir="ltr">{formatDateDisplay(holiday.date)}</TableCell>
                      <TableCell className="text-right font-medium">{holiday.name}</TableCell>
                      {isAdmin && (
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(holiday)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteClick(holiday)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <JewishHolidayDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        holiday={editingHoliday}
        onSaved={handleSaved}
      />

      <DeleteJewishHolidayDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        holiday={deletingHoliday}
        onDeleted={handleDeleted}
      />
    </div>
  );
};

export default JewishHolidaysPage;
