import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Link2, Plus, Trash2 } from 'lucide-react';

import { api } from '../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const CORE_LINKS = ['guidelines', 'warRoom'];

function linkLabel(key: string): string {
  if (key === 'warRoom') return 'War Room';
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function linkKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, character: string) => character.toUpperCase())
    .replace(/[^a-z0-9]/g, '');
}

export default function LinkManager() {
  const [links, setLinks] = useState<Record<string, string>>({});
  const [resourceName, setResourceName] = useState('');
  const [resourceUrl, setResourceUrl] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getLinks()
      .then((result) => setLinks(result))
      .finally(() => setLoading(false));
  }, []);

  const keys = useMemo(
    () => Array.from(new Set([...CORE_LINKS, ...Object.keys(links)])).filter((key) => CORE_LINKS.includes(key) || links[key]),
    [links],
  );

  const handleSave = async () => {
    await api.updateLinks(links);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addResource = () => {
    const key = linkKey(resourceName);
    if (!key || !resourceUrl.trim()) return;
    setLinks((current) => ({ ...current, [key]: resourceUrl.trim() }));
    setResourceName('');
    setResourceUrl('');
  };

  if (loading) return <div className="px-4 py-12 text-center text-muted-foreground lg:px-6">Loading links...</div>;

  return (
    <div className="space-y-5 px-4 lg:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link2 className="size-5 text-primary" />
            <h1 className="text-2xl font-semibold text-foreground">Project links</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Resources available to templates and the support agent.</p>
        </div>
        <Button onClick={() => void handleSave()}>{saved ? 'Saved' : 'Save changes'}</Button>
      </div>

      <section className="sg-panel divide-y p-0">
        {keys.map((key) => (
          <div key={key} className="grid gap-2 p-4 sm:grid-cols-[minmax(140px,220px)_minmax(0,1fr)_auto] sm:items-center">
            <Label htmlFor={`link-${key}`}>{linkLabel(key)}</Label>
            <Input
              id={`link-${key}`}
              value={links[key] || ''}
              onChange={(event) => setLinks((current) => ({ ...current, [key]: event.target.value }))}
              placeholder="https://..."
            />
            <div className="flex gap-2">
              {links[key] ? (
                <Button asChild variant="outline" size="icon">
                  <a href={links[key]} target="_blank" rel="noopener noreferrer" aria-label={`Open ${linkLabel(key)}`}>
                    <ExternalLink />
                  </a>
                </Button>
              ) : null}
              {!CORE_LINKS.includes(key) ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${linkLabel(key)}`}
                  onClick={() => setLinks((current) => {
                    const next = { ...current };
                    delete next[key];
                    return next;
                  })}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </section>

      <section className="sg-panel p-4">
        <h2 className="text-sm font-semibold">Add resource</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(160px,0.6fr)_minmax(0,1fr)_auto]">
          <Input value={resourceName} onChange={(event) => setResourceName(event.target.value)} placeholder="Resource name" />
          <Input value={resourceUrl} onChange={(event) => setResourceUrl(event.target.value)} placeholder="https://..." />
          <Button variant="outline" onClick={addResource} disabled={!resourceName.trim() || !resourceUrl.trim()}>
            <Plus />
            Add
          </Button>
        </div>
      </section>
    </div>
  );
}
