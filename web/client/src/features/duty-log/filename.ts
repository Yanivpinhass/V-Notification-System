import { DutyLogData } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

// Strip filesystem-illegal characters, collapse whitespace to "-", cap length.
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// Shared filename builder: יומן-הפעלה-{shiftName}-{dd-MM-yyyy}.png
export function buildDutyLogFilename(data: DutyLogData): string {
  const d = data.date;
  const dateStr = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
  return `${sanitizeFilename(`יומן-הפעלה-${data.shiftName}-${dateStr}`)}.png`;
}
