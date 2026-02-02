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
import { Loader2 } from 'lucide-react';
import {
  schedulerService,
  SchedulerRunLogEntry,
} from '@/services/schedulerService';

const REMINDER_TYPE_LABELS: Record<string, string> = {
  SameDay: 'ליום המשמרת',
  Advance: 'מוקדמת',
};

const STATUS_LABELS: Record<string, string> = {
  Completed: 'הושלם',
  Partial: 'חלקי',
  Failed: 'נכשל',
};

const formatRunDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatTargetDate = (dateString: string): string => {
  const parts = dateString.split('-');
  if (parts.length !== 3) return dateString;
  return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
};

export const SchedulerRunLogPage: React.FC = () => {
  const [runLogs, setRunLogs] = useState<SchedulerRunLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const logData = await schedulerService.getRunLog();
      setRunLogs(logData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'אירעה שגיאה בטעינת הנתונים');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold">היסטוריית הרצות</h2>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          {runLogs.length === 0 ? (
            <div className="text-center py-6 text-gray-500 text-sm">
              לא נמצאו הרצות
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/60">
                  <TableHead className="text-center font-semibold text-foreground">תאריך הרצה</TableHead>
                  <TableHead className="text-center font-semibold text-foreground">סוג תזכורת</TableHead>
                  <TableHead className="text-center font-semibold text-foreground">תאריך יעד</TableHead>
                  <TableHead className="text-center font-semibold text-foreground">זכאים</TableHead>
                  <TableHead className="text-center font-semibold text-foreground">נשלחו</TableHead>
                  <TableHead className="text-center font-semibold text-foreground">נכשלו</TableHead>
                  <TableHead className="text-center font-semibold text-foreground">סטטוס</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-center text-sm">{formatRunDate(log.ranAt)}</TableCell>
                    <TableCell className="text-center text-sm">
                      {REMINDER_TYPE_LABELS[log.reminderType] || log.reminderType}
                    </TableCell>
                    <TableCell className="text-center text-sm">{formatTargetDate(log.targetDate)}</TableCell>
                    <TableCell className="text-center text-sm">{log.totalEligible}</TableCell>
                    <TableCell className="text-center text-sm">{log.smsSent}</TableCell>
                    <TableCell className="text-center text-sm">{log.smsFailed}</TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={
                          log.status === 'Completed' ? 'default' :
                          log.status === 'Partial' ? 'secondary' :
                          'destructive'
                        }
                      >
                        {STATUS_LABELS[log.status] || log.status}
                      </Badge>
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
