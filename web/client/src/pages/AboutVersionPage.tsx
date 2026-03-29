import { useState, useEffect } from 'react';

export const AboutVersionPage = () => {
  const [version, setVersion] = useState<string | null>(null);
  const [versionCode, setVersionCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        setVersion(data.version ?? null);
        setVersionCode(data.versionCode ?? null);
      })
      .catch((err) => {
        console.error('Failed to fetch version info:', err);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-6">אודות</h1>
      <div className="bg-card border rounded-lg p-6 space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">גרסה</span>
          <span className="font-mono font-semibold text-lg">
            {loading ? '...' : version || 'לא זמין'}
          </span>
        </div>
        {versionCode && (
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">מספר Build</span>
            <span className="font-mono">{versionCode}</span>
          </div>
        )}
      </div>
    </div>
  );
};
