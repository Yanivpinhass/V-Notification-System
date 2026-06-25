import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Clock, Loader2, Share2, X } from 'lucide-react';
import { DutyLogData } from './types';
import { DutyLogReport } from './DutyLogReport';
import { exportDutyLogPng } from './exportDutyLogPng';

const REPORT_WIDTH = 1123;
const AREA_PADDING = 16; // p-2 (8px) each side
const MAX_ZOOM = 5;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

interface Props {
  data: DutyLogData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Vec {
  x: number;
  y: number;
}

// ONE shared preview for both entry points (the form page and the Shifts per-team
// button). A PLAIN portal overlay (NOT a Radix Dialog) on purpose: Radix dismisses
// on focus/interaction-outside, which the Android WebView triggers on rotation —
// closing the preview. This overlay only closes via the buttons/backdrop, so it
// survives rotation. The 1123px landscape report is scaled to fit WIDTH *and*
// HEIGHT (re-fitting on rotation), with pinch-to-zoom + drag-to-pan on top. Safe-area
// insets keep the header/footer clear of the Android status/navigation bars.
export const DutyLogPreviewDialog: React.FC<Props> = ({ data, open, onOpenChange }) => {
  const areaRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(() =>
    typeof window !== 'undefined' ? Math.min(1, (window.innerWidth - 32) / REPORT_WIDTH) : 0.5,
  );
  const [naturalHeight, setNaturalHeight] = useState(0);
  const [exporting, setExporting] = useState(false);

  // Editable hours — seeded from data, override the report + export live.
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);

  // User pinch-zoom / pan (layered on top of the fit `scale`).
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Vec>({ x: 0, y: 0 });

  // Seed the editable hours from each new preview's data (and collapse the editor).
  // Relies on openPreview receiving a FRESH DutyLogData per call, so [data] changes
  // each open and a prior edit never leaks. useLayoutEffect runs pre-paint → no flash.
  useLayoutEffect(() => {
    if (data) {
      setStartTime(data.startTime);
      setEndTime(data.endTime);
      setEditorOpen(false);
    }
  }, [data]);

  // ── Fit-to-screen measurement ──
  useLayoutEffect(() => {
    if (!open || !data) return;
    let raf = 0;
    const compute = () => {
      const area = areaRef.current;
      const report = reportRef.current;
      if (!area || !report) return;
      const availW = area.clientWidth - AREA_PADDING;
      const availH = area.clientHeight - AREA_PADDING;
      const naturalH = report.offsetHeight; // layout height — unaffected by transform
      if (naturalH <= 0 || availW <= 0) return;
      const s =
        availH > 0
          ? Math.min(availW / REPORT_WIDTH, availH / naturalH, 1)
          : Math.min(availW / REPORT_WIDTH, 1);
      setNaturalHeight(naturalH);
      setScale(s);
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };
    compute();
    const ro = new ResizeObserver(schedule);
    if (areaRef.current) ro.observe(areaRef.current);
    if (reportRef.current) ro.observe(reportRef.current);
    document.fonts.ready.then(schedule).catch(() => {});
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
    };
  }, [open, data]);

  // Reset zoom/pan on open, on new data, and on rotation (clean re-fit).
  useEffect(() => {
    if (!open) return;
    const reset = () => {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    };
    reset();
    window.addEventListener('orientationchange', reset);
    window.addEventListener('resize', reset);
    return () => {
      window.removeEventListener('orientationchange', reset);
      window.removeEventListener('resize', reset);
    };
  }, [open, data]);

  // Escape closes (desktop nicety).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  // ── Pinch-zoom + pan gesture ──
  const gesture = useRef<
    | null
    | {
        mode: 'pinch' | 'pan';
        startDist: number;
        startZoom: number;
        startPan: Vec;
        startMid: Vec; // relative to area centre
        startPointer: Vec; // client coords (pan)
      }
  >(null);

  const clampPan = useCallback(
    (p: Vec, z: number): Vec => {
      const area = areaRef.current;
      if (!area) return p;
      const maxX = Math.max(0, (REPORT_WIDTH * scale * z - area.clientWidth) / 2);
      const maxY = Math.max(0, (naturalHeight * scale * z - area.clientHeight) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, p.x)),
        y: Math.min(maxY, Math.max(-maxY, p.y)),
      };
    },
    [scale, naturalHeight],
  );

  const areaCentre = () => {
    const r = areaRef.current!.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const { cx, cy } = areaCentre();
      gesture.current = {
        mode: 'pinch',
        startDist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1,
        startZoom: zoom,
        startPan: pan,
        startMid: { x: (a.clientX + b.clientX) / 2 - cx, y: (a.clientY + b.clientY) / 2 - cy },
        startPointer: { x: 0, y: 0 },
      };
    } else if (e.touches.length === 1 && zoom > 1) {
      const t = e.touches[0];
      gesture.current = {
        mode: 'pan',
        startDist: 0,
        startZoom: zoom,
        startPan: pan,
        startMid: { x: 0, y: 0 },
        startPointer: { x: t.clientX, y: t.clientY },
      };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const g = gesture.current;
    if (!g) return;
    if (g.mode === 'pinch' && e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const { cx, cy } = areaCentre();
      const midX = (a.clientX + b.clientX) / 2 - cx;
      const midY = (a.clientY + b.clientY) / 2 - cy;
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const newZoom = Math.min(MAX_ZOOM, Math.max(1, g.startZoom * (dist / g.startDist)));
      const k = newZoom / g.startZoom;
      // Keep the content point under the pinch midpoint fixed as it zooms/moves.
      const next = {
        x: midX - (g.startMid.x - g.startPan.x) * k,
        y: midY - (g.startMid.y - g.startPan.y) * k,
      };
      setZoom(newZoom);
      setPan(clampPan(next, newZoom));
    } else if (g.mode === 'pan' && e.touches.length === 1) {
      const t = e.touches[0];
      setPan(
        clampPan(
          { x: g.startPan.x + (t.clientX - g.startPointer.x), y: g.startPan.y + (t.clientY - g.startPointer.y) },
          zoom,
        ),
      );
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      gesture.current = null;
      if (zoom <= 1.02) {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    } else if (e.touches.length === 1 && gesture.current?.mode === 'pinch') {
      // pinch → pan handoff when one finger lifts
      const t = e.touches[0];
      gesture.current = {
        mode: 'pan',
        startDist: 0,
        startZoom: zoom,
        startPan: pan,
        startMid: { x: 0, y: 0 },
        startPointer: { x: t.clientX, y: t.clientY },
      };
    }
  };

  const timesValid = TIME_RE.test(startTime) && TIME_RE.test(endTime);
  const effectiveData = useMemo(
    () => (data ? { ...data, startTime, endTime } : null),
    [data, startTime, endTime],
  );
  // Show last-valid times while a field is mid-edit/cleared (keeps the preview stable).
  const reportData = timesValid ? effectiveData : data;

  const handleExport = async () => {
    if (!data || !timesValid) return;
    setExporting(true);
    try {
      await exportDutyLogPng(effectiveData);
    } finally {
      setExporting(false);
    }
  };

  // Toggling the editor resizes the preview area (band in/out) → reset zoom/pan so the
  // report cleanly re-fits and isn't left panned against stale clamp bounds.
  const toggleEditor = () => {
    setEditorOpen((o) => !o);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  if (!open || !data) return null;

  return createPortal(
    <div
      dir="rtl"
      className="fixed inset-0 z-[60] bg-black/70 flex items-stretch justify-center sm:items-center"
      style={{
        paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(0.5rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.5rem, env(safe-area-inset-right))',
      }}
      onClick={() => onOpenChange(false)}
    >
      <div
        className="flex flex-col min-h-0 w-full bg-background rounded-2xl border shadow-lg overflow-hidden sm:w-[95vw] sm:max-w-[1200px] sm:h-[90vh] sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (RTL: title right, close X left) */}
        <div className="flex items-center justify-between gap-2 p-3 sm:p-4 border-b shrink-0">
          <span className="text-base sm:text-lg font-semibold">תצוגה מקדימה — יומן הפעלה</span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="סגור"
            className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Fit-to-screen + pinch-zoomable preview area */}
        <div
          ref={areaRef}
          className="flex-1 min-h-0 overflow-hidden bg-muted/30 flex items-center justify-center p-2"
          style={{ touchAction: 'none' }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              willChange: 'transform',
            }}
          >
            <div style={{ position: 'relative', width: REPORT_WIDTH * scale, height: naturalHeight * scale }}>
              {/* RTL: anchor to the right and scale from the top-right, else the 1123px
                  report right-aligns and its top-left lands off-screen (blank preview). */}
              <div
                ref={reportRef}
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: REPORT_WIDTH,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top right',
                }}
              >
                <DutyLogReport data={reportData} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 p-3 sm:p-4 border-t shrink-0">
          {editorOpen && (
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1">
                <label htmlFor="dutyLogStartTime" className="text-xs text-muted-foreground">
                  שעת התחלה
                </label>
                <Input
                  id="dutyLogStartTime"
                  type="time"
                  dir="ltr"
                  className="text-left"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="flex-1 space-y-1">
                <label htmlFor="dutyLogEndTime" className="text-xs text-muted-foreground">
                  שעת סיום
                </label>
                <Input
                  id="dutyLogEndTime"
                  type="time"
                  dir="ltr"
                  className="text-left"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="outline" onClick={toggleEditor} className="min-h-[44px] gap-2">
              <Clock className="h-4 w-4" />
              שנה שעות
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" className="min-h-[44px] flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>
                סגור
              </Button>
              <Button onClick={handleExport} disabled={exporting || !timesValid} className="min-h-[44px] flex-1 sm:flex-none gap-2">
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                שתף יומן הפעלה
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
