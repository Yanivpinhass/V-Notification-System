import * as React from "react";
import { cn } from "@/lib/utils";
import { Upload, FileSpreadsheet, X } from "lucide-react";
import { Button } from "./button";

interface FileDropzoneProps {
  onFileSelect: (file: File | null) => void;
  acceptedTypes?: string[];
  maxSizeMB?: number;
  disabled?: boolean;
  selectedFile?: File | null;
  error?: string;
  className?: string;
}

const FileDropzone = React.forwardRef<HTMLDivElement, FileDropzoneProps>(
  (
    {
      onFileSelect,
      acceptedTypes = [".xlsx", ".xls"],
      maxSizeMB = 10,
      disabled = false,
      selectedFile,
      error,
      className,
    },
    ref
  ) => {
    const [isDragOver, setIsDragOver] = React.useState(false);
    const [localError, setLocalError] = React.useState<string | null>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const displayError = error || localError;

    const validateFile = (file: File): boolean => {
      // Check file type
      const fileName = file.name.toLowerCase();
      const isValidType = acceptedTypes.some((ext) =>
        fileName.endsWith(ext.toLowerCase())
      );

      if (!isValidType) {
        setLocalError(`יש לבחור קובץ אקסל (${acceptedTypes.join(", ")})`);
        return false;
      }

      // Check file size
      const maxBytes = maxSizeMB * 1024 * 1024;
      if (file.size > maxBytes) {
        setLocalError(`גודל הקובץ חורג מהמותר (${maxSizeMB}MB)`);
        return false;
      }

      setLocalError(null);
      return true;
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) {
        setIsDragOver(true);
      }
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (disabled) return;

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (validateFile(file)) {
          onFileSelect(file);
        }
      }
    };

    const handleClick = () => {
      if (!disabled && inputRef.current) {
        inputRef.current.click();
      }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (validateFile(file)) {
          onFileSelect(file);
        }
      }
      // Reset input so the same file can be selected again
      e.target.value = "";
    };

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation();
      onFileSelect(null);
      setLocalError(null);
    };

    const formatFileSize = (bytes: number): string => {
      if (bytes < 1024) {
        return `${bytes} B`;
      } else if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
      } else {
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      }
    };

    return (
      <div ref={ref} className={cn("w-full", className)}>
        {/* Hidden file input */}
        <input
          ref={inputRef}
          type="file"
          accept={acceptedTypes.join(",")}
          onChange={handleFileChange}
          className="hidden"
          disabled={disabled}
        />

        {/* Dropzone area */}
        <div
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
            isDragOver && !disabled
              ? "border-primary bg-primary/5"
              : "border-gray-300 hover:border-gray-400",
            disabled && "opacity-50 cursor-not-allowed",
            displayError && "border-destructive"
          )}
        >
          {selectedFile ? (
            <div className="flex items-center justify-center gap-3">
              <FileSpreadsheet className="h-10 w-10 text-green-600" />
              <div className="text-right">
                <p className="font-medium text-gray-900">{selectedFile.name}</p>
                <p className="text-sm text-gray-500">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleClear}
                className="mr-2 h-8 w-8 hover:bg-destructive/10"
                disabled={disabled}
              >
                <X className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Upload
                className={cn(
                  "mx-auto h-12 w-12",
                  isDragOver ? "text-primary" : "text-gray-400"
                )}
              />
              <div>
                <p className="font-medium text-gray-700">
                  גרור קובץ אקסל לכאן
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  או לחץ לבחירת קובץ
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  ({acceptedTypes.join(", ")})
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Error message */}
        {displayError && (
          <p className="text-sm text-destructive mt-2 text-right">
            {displayError}
          </p>
        )}
      </div>
    );
  }
);

FileDropzone.displayName = "FileDropzone";

export { FileDropzone };
