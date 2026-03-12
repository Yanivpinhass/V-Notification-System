import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileDropzone } from '@/components/ui/file-dropzone';
import { volunteersService, ImportResult } from '@/services/volunteersService';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export const VolunteersImportPage: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (file: File | null) => {
    setSelectedFile(file);
    // Clear previous results when a new file is selected
    setResult(null);
    setError(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setResult(null);
    setError(null);

    try {
      const importResult = await volunteersService.uploadVolunteersFile(selectedFile);
      setResult(importResult);
      // Clear file selection on success
      setSelectedFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'אירעה שגיאה בעת העלאת הקובץ');
    } finally {
      setIsUploading(false);
    }
  };

  const isSuccess = result && result.errors === 0;
  const hasWarnings = result && result.errors > 0 && (result.inserted > 0 || result.updated > 0);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>קליטת קובץ מתנדבים</CardTitle>
          <CardDescription>
            העלה קובץ אקסל עם פרטי מתנדבים. עמודות נדרשות: מ.א, שם, טלפון
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileDropzone
            onFileSelect={handleFileSelect}
            selectedFile={selectedFile}
            disabled={isUploading}
            acceptedTypes={['.xlsx', '.xls']}
            maxSizeMB={10}
          />

          <Button
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
            className="w-full"
          >
            {isUploading ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                מעלה קובץ...
              </>
            ) : (
              'העלה קובץ'
            )}
          </Button>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>שגיאה</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Success Alert */}
          {isSuccess && (
            <Alert className="border-success/40 bg-success/10">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <AlertTitle className="text-success">הייבוא הושלם בהצלחה</AlertTitle>
              <AlertDescription className="text-success">
                <div className="mt-2 space-y-1">
                  <p>סה"כ שורות: {result.totalRows}</p>
                  <p>נוספו: {result.inserted}</p>
                  <p>עודכנו: {result.updated}</p>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Partial Success Alert (with errors) */}
          {hasWarnings && (
            <Alert className="border-warning/50 bg-warning/10">
              <AlertCircle className="h-4 w-4 text-warning" />
              <AlertTitle className="text-warning">הייבוא הושלם עם שגיאות</AlertTitle>
              <AlertDescription className="text-warning">
                <div className="mt-2 space-y-1">
                  <p>סה"כ שורות: {result.totalRows}</p>
                  <p>נוספו: {result.inserted}</p>
                  <p>עודכנו: {result.updated}</p>
                  <p className="text-destructive">שגיאות: {result.errors}</p>
                </div>
                {result.errorMessages && result.errorMessages.length > 0 && (
                  <div className="mt-3 p-2 bg-white rounded border border-warning/30 max-h-40 overflow-y-auto">
                    <p className="font-medium mb-1">פירוט שגיאות:</p>
                    <ul className="text-sm space-y-1 list-disc list-inside">
                      {result.errorMessages.slice(0, 20).map((msg, idx) => (
                        <li key={idx}>{msg}</li>
                      ))}
                      {result.errorMessages.length > 20 && (
                        <li className="text-muted-foreground">
                          ...ועוד {result.errorMessages.length - 20} שגיאות
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Complete Failure Alert (all rows failed) */}
          {result && result.errors > 0 && result.inserted === 0 && result.updated === 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>הייבוא נכשל</AlertTitle>
              <AlertDescription>
                <div className="mt-2 space-y-1">
                  <p>סה"כ שורות: {result.totalRows}</p>
                  <p>שגיאות: {result.errors}</p>
                </div>
                {result.errorMessages && result.errorMessages.length > 0 && (
                  <div className="mt-3 p-2 bg-destructive/10 rounded border border-destructive/20 max-h-40 overflow-y-auto">
                    <p className="font-medium mb-1">פירוט שגיאות:</p>
                    <ul className="text-sm space-y-1 list-disc list-inside">
                      {result.errorMessages.slice(0, 20).map((msg, idx) => (
                        <li key={idx}>{msg}</li>
                      ))}
                      {result.errorMessages.length > 20 && (
                        <li className="text-muted-foreground">
                          ...ועוד {result.errorMessages.length - 20} שגיאות
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default VolunteersImportPage;
