import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';
import { DutyLogData } from './types';
import { DutyLogReport } from './DutyLogReport';
import { buildDutyLogFilename } from './filename';

// Native media bridge exposed by the Android WebView (MediaBridge.kt → window.NativeMedia).
// Absent on desktop → falls back to <a download>.
declare global {
  interface Window {
    NativeMedia?: {
      saveImageToGallery: (base64: string, filename: string) => boolean;
      shareImage: (base64: string, filename: string) => void;
    };
  }
}

// Hebrew + Latin + digit sample to force the @fontsource unicode-range subset requests.
const FONT_SAMPLE = 'יומן הפעלה לצוות מרחבים אבגדהוזחטיכלמנסעפצקרשת 0123456789';
const REPORT_WIDTH = 1123;
const MAX_EDGE = 2400;

let isExporting = false;

const nextFrame = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

/**
 * Render the DutyLogReport off-screen in its OWN React root, wait for fonts +
 * emblem to be ready, rasterize to PNG, then save (Android native bridge) or
 * download (desktop). Always cleans up its DOM. Re-entrancy guarded.
 */
export async function exportDutyLogPng(data: DutyLogData): Promise<void> {
  if (isExporting) return;
  isExporting = true;

  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  try {
    // Lazy-load the heavy lib (kept out of the main bundle). Default export only.
    const html2canvas = (await import('html2canvas')).default;

    // Mount off-screen but fully laid out (html2canvas can't capture display:none).
    container = document.createElement('div');
    container.style.cssText =
      `position:absolute; left:-10000px; top:0; width:${REPORT_WIDTH}px; background:#ffffff;`;
    document.body.appendChild(container);

    root = createRoot(container);
    flushSync(() => {
      root!.render(<DutyLogReport data={data} />);
    });

    const node = container.firstElementChild as HTMLElement | null;
    if (!node) throw new Error('duty-log report node missing');
    const emblemImg = container.querySelector('img') as HTMLImageElement | null;

    // Readiness sequence (worst case = cold WebView font swap).
    await Promise.all([
      document.fonts.load(`400 16px 'Noto Sans Hebrew'`, FONT_SAMPLE),
      document.fonts.load(`500 16px 'Noto Sans Hebrew'`, FONT_SAMPLE),
      document.fonts.load(`700 16px 'Noto Sans Hebrew'`, FONT_SAMPLE),
    ]).catch(() => {});
    await document.fonts.ready;
    if (emblemImg) {
      await emblemImg.decode().catch(() => {});
    }
    await nextFrame();

    // Cap canvas size: scale by DPR (≤2), then clamp the longest edge to ~2400px.
    const longestEdge = Math.max(node.offsetWidth, node.offsetHeight) || REPORT_WIDTH;
    const scale = Math.min(Math.min(2, window.devicePixelRatio || 1), MAX_EDGE / longestEdge);

    const canvas = await html2canvas(node, {
      backgroundColor: '#ffffff',
      scale,
      useCORS: false,
    });

    const filename = buildDutyLogFilename(data);

    if (window.NativeMedia?.saveImageToGallery) {
      // Android: hand the raw base64 to the native bridge (save to gallery + share).
      const base64 = canvas.toDataURL('image/png').split(',')[1] || '';
      const saved = window.NativeMedia.saveImageToGallery(base64, filename);
      if (saved) {
        toast.success('התמונה נשמרה לגלריה');
      } else {
        toast.error('שמירת התמונה נכשלה');
      }
      try {
        window.NativeMedia.shareImage?.(base64, filename);
      } catch {
        /* sharing is best-effort */
      }
      return;
    }

    // Desktop: blob download (guard against a null canvas on older engines).
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    if (!blob) {
      toast.error('יצירת התמונה נכשלה');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('הדו"ח הורד בהצלחה');
  } catch (err) {
    console.error('exportDutyLogPng failed', err);
    toast.error('יצירת התמונה נכשלה');
  } finally {
    try {
      root?.unmount();
    } catch {
      /* noop */
    }
    container?.remove();
    isExporting = false;
  }
}
