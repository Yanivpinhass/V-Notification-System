import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { DutyLogData } from './types';
import { DutyLogPreviewDialog } from './DutyLogPreviewDialog';

interface DutyLogPreviewContextValue {
  openPreview: (data: DutyLogData) => void;
}

const DutyLogPreviewContext = createContext<DutyLogPreviewContextValue | null>(null);

export const useDutyLogPreview = (): DutyLogPreviewContextValue => {
  const ctx = useContext(DutyLogPreviewContext);
  if (!ctx) throw new Error('useDutyLogPreview must be used within <DutyLogPreviewProvider>');
  return ctx;
};

// Holds the duty-log preview state ABOVE AdminLayout. AdminLayout renders two
// structurally different trees for mobile vs desktop and swaps them at the 768px
// breakpoint — which a phone crosses when rotated to landscape, remounting the page
// and destroying any page-local dialog state. Keeping the preview here (above that
// swap) lets it survive rotation. Both entry points open it via useDutyLogPreview().
export const DutyLogPreviewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setData] = useState<DutyLogData | null>(null);
  const openPreview = useCallback((d: DutyLogData) => setData(d), []);
  const value = useMemo(() => ({ openPreview }), [openPreview]);

  return (
    <DutyLogPreviewContext.Provider value={value}>
      {children}
      <DutyLogPreviewDialog data={data} open={!!data} onOpenChange={(o) => !o && setData(null)} />
    </DutyLogPreviewContext.Provider>
  );
};
