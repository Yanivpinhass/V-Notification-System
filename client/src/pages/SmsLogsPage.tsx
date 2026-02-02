import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { smsLogService, SmsLogEntry } from '@/services/smsLogService';
import { Loader2 } from 'lucide-react';

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('he-IL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

const formatTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const SmsLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<SmsLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await smsLogService.getLogs();
      setLogs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'אירעה שגיאה בטעינת הנתונים');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <div className="p-4">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle>יומן שליחת הודעות</CardTitle>
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
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              לא נמצאו הודעות שנשלחו
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/60">
                  <TableHead className="text-center font-semibold text-foreground">תאריך שליחה</TableHead>
                  <TableHead className="text-center font-semibold text-foreground">שעת שליחה</TableHead>
                  <TableHead className="text-center font-semibold text-foreground">תאריך משמרת</TableHead>
                  <TableHead className="text-center font-semibold text-foreground">שם צוות</TableHead>
                  <TableHead className="text-center font-semibold text-foreground">שם מתנדב</TableHead>
                  <TableHead className="text-center font-semibold text-foreground">סטטוס</TableHead>
                  <TableHead className="text-center font-semibold text-foreground">שגיאה</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-center">{formatDate(log.sentAt)}</TableCell>
                    <TableCell className="text-center">{formatTime(log.sentAt)}</TableCell>
                    <TableCell className="text-center">{formatDate(log.shiftDate)}</TableCell>
                    <TableCell className="text-right">{log.shiftName}</TableCell>
                    <TableCell className="text-right">{log.volunteerName}</TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={log.status === 'Success' ? 'default' : 'destructive'}
                        className={log.status === 'Success' ? 'bg-green-600 hover:bg-green-700' : ''}
                      >
                        {log.status === 'Success' ? 'נשלח' : 'נכשל'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-red-600">
                      {log.error || '-'}
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

export default SmsLogsPage;
