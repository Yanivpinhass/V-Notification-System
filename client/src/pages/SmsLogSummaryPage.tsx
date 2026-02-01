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
      const data = await smsLogService.getSummary(7);
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
          <CardTitle>סיכום שליחה לפי צוות (7 ימים אחרונים)</CardTitle>
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
                <TableRow>
                  <TableHead className="text-right">תאריך</TableHead>
                  <TableHead className="text-right">שם צוות</TableHead>
                  <TableHead className="text-right">מתנדבים בצוות</TableHead>
                  <TableHead className="text-right">נשלחו בהצלחה</TableHead>
                  <TableHead className="text-right">נכשלו</TableHead>
                  <TableHead className="text-right">לא נשלחו</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((row, index) => (
                  <TableRow key={`${row.shiftDate}-${row.shiftName}-${index}`}>
                    <TableCell>{formatDate(row.shiftDate)}</TableCell>
                    <TableCell>{row.shiftName}</TableCell>
                    <TableCell>{row.totalVolunteers}</TableCell>
                    <TableCell className="text-green-600 font-medium">
                      {row.sentSuccess}
                    </TableCell>
                    <TableCell className={row.sentFail > 0 ? 'text-red-600 font-medium' : ''}>
                      {row.sentFail}
                    </TableCell>
                    <TableCell className={row.notSent > 0 ? 'text-orange-600 font-medium' : ''}>
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
