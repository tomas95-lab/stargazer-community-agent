import { useState, useEffect } from 'react';
import { api } from '../api';

const LINK_LABELS: Record<string, string> = {
  guidelines: 'Guidelines',
  templatesZip: 'Templates ZIP',
  warRoom: 'War Room',
  validationScript: 'Validation Script',
  stargazerEval: 'Evaluation Pack',
  commonErrorsDocument: 'Common Errors Document',
};

export default function LinkManager() {
  const [links, setLinks] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getLinks().then((l) => { setLinks(l); setLoading(false); });
  }, []);

  const handleSave = async () => {
    await api.updateLinks(links);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const inputCls = 'sg-input px-3 py-2 text-sm';
  const labelCls = 'sg-label mb-1 block';

  if (loading) return <div className="py-12 text-center text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6 px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Link Manager</h1>
          <p className="mt-1 text-sm text-muted-foreground">Project links used in templates. Edit without touching code.</p>
        </div>
        <button
          onClick={handleSave}
          className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {saved ? 'Saved!' : 'Save'}
        </button>
      </div>

      <div className="sg-panel space-y-5 p-6">
        {Object.entries(LINK_LABELS).map(([key, label]) => (
          <div key={key}>
            <label className={labelCls}>{label}</label>
            <div className="flex gap-2">
              <input
                value={links[key] || ''}
                onChange={(e) => setLinks((p) => ({ ...p, [key]: e.target.value }))}
                className={inputCls}
                placeholder="https://..."
              />
              {links[key] && (
                <a
                  href={links[key]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-md border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  Open
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="sg-panel p-5">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Quick Copy</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(LINK_LABELS).map(([key, label]) => (
            links[key] ? (
              <button
                key={key}
                onClick={() => navigator.clipboard.writeText(links[key])}
                className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                Copy {label}
              </button>
            ) : null
          ))}
        </div>
      </div>
    </div>
  );
}
