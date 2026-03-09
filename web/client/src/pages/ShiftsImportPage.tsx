import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileDropzone } from '@/components/ui/file-dropzone';
import { shiftsService } from '@/services/shiftsService';
import { ImportResult } from '@/services/volunteersService';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export const ShiftsImportPage: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (file: File | null) => {
    setSelectedFile(file);
    setResult(null);
    setError(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setResult(null);
    setError(null);

    try {
      const importResult = await shiftsService.uploadShiftsFile(selectedFile);
      setResult(importResult);
      setSelectedFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'אירעה שגיאה בעת טעינת הקובץ');
    } finally {
      setIsUploading(false);
    }
  };

  const isSuccess = result && result.errors === 0;
  const hasWarnings = result && result.errors > 0 && result.inserted > 0;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>קליטת קובץ משמרות</CardTitle>
          <CardDescription>
            העלה קובץ אקסל עם נתוני משמרות. המערכת תעבד את הקובץ ותשמור את המשמרות מהיום והלאה.
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
                טוען...
              </>
            ) : (
              'טען'
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
            <Alert className="border-green-500 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-800">הטעינה הושלמה בהצלחה</AlertTitle>
              <AlertDescription className="text-green-700">
                <div className="mt-2 space-y-1">
                  <p>סה"כ שיבוצים: {result.totalRows}</p>
                  <p>נשמרו: {result.inserted}</p>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Partial Success Alert (with errors) */}
          {hasWarnings && (
            <Alert className="border-yellow-500 bg-yellow-50">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <AlertTitle className="text-yellow-800">הטעינה הושלמה עם שגיאות</AlertTitle>
              <AlertDescription className="text-yellow-700">
                <div className="mt-2 space-y-1">
                  <p>סה"כ שיבוצים: {result.totalRows}</p>
                  <p>נשמרו: {result.inserted}</p>
                  <p className="text-red-600">שגיאות: {result.errors}</p>
                </div>
                {result.errorMessages && result.errorMessages.length > 0 && (
                  <div className="mt-3 p-2 bg-white rounded border border-yellow-300 max-h-40 overflow-y-auto">
                    <p className="font-medium mb-1">פירוט שגיאות:</p>
                    <ul className="text-sm space-y-1 list-disc list-inside">
                      {result.errorMessages.slice(0, 20).map((msg, idx) => (
                        <li key={idx}>{msg}</li>
                      ))}
                      {result.errorMessages.length > 20 && (
                        <li className="text-gray-500">
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
          {result && result.errors > 0 && result.inserted === 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>הטעינה נכשלה</AlertTitle>
              <AlertDescription>
                <div className="mt-2 space-y-1">
                  <p>סה"כ שיבוצים: {result.totalRows}</p>
                  <p>שגיאות: {result.errors}</p>
                </div>
                {result.errorMessages && result.errorMessages.length > 0 && (
                  <div className="mt-3 p-2 bg-red-50 rounded border border-red-300 max-h-40 overflow-y-auto">
                    <p className="font-medium mb-1">פירוט שגיאות:</p>
                    <ul className="text-sm space-y-1 list-disc list-inside">
                      {result.errorMessages.slice(0, 20).map((msg, idx) => (
                        <li key={idx}>{msg}</li>
                      ))}
                      {result.errorMessages.length > 20 && (
                        <li className="text-gray-500">
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

export default ShiftsImportPage;
