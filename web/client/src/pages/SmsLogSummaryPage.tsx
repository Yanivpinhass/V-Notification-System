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
import { smsLogService, SmsLogSummaryEntry } from '@/services/smsLogService';
import { Loader2 } from 'lucide-react';

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('he-IL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

export const SmsLogSummaryPage: React.FC = () => {
  const [summary, setSummary] = useState<SmsLogSummaryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await smsLogService.getSummary();
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'אירעה שגיאה בטעינת הנתונים');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  return (
    <div className="p-4">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle>סיכום שליחה לפי צוות</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : summary.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              לא נמצאו נתוני משמרות
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/60">
                  <TableHead className="text-center font-semibold text-foreground">תאריך</TableHead>
                  <TableHead className="text-center font-semibold text-foreground">שם צוות</TableHead>
                  <TableHead className="text-center font-semibold text-foreground">מתנדבים בצוות</TableHead>
                  <TableHead className="text-center font-semibold text-foreground">נשלחו בהצלחה</TableHead>
                  <TableHead className="text-center font-semibold text-foreground">נכשלו</TableHead>
                  <TableHead className="text-center font-semibold text-foreground">לא נשלחו</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((row, index) => (
                  <TableRow key={`${row.shiftDate}-${row.shiftName}-${index}`}>
                    <TableCell className="text-center">{formatDate(row.shiftDate)}</TableCell>
                    <TableCell className="text-right">{row.shiftName}</TableCell>
                    <TableCell className="text-center">{row.totalVolunteers}</TableCell>
                    <TableCell className="text-center text-green-600 font-medium">
                      {row.sentSuccess}
                    </TableCell>
                    <TableCell className={`text-center ${row.sentFail > 0 ? 'text-red-600 font-medium' : ''}`}>
                      {row.sentFail}
                    </TableCell>
                    <TableCell className={`text-center ${row.notSent > 0 ? 'text-orange-600 font-medium' : ''}`}>
                      {row.notSent}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SmsLogSummaryPage;
