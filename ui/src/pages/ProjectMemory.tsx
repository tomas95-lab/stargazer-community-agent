import { useEffect, useState } from 'react';
import { Save as IconDeviceFloppy, LoaderCircle as IconLoader2, Plus as IconPlus, Trash2 as IconTrash } from 'lucide-react';
import { api, type ProjectMemory, type ProjectMemoryFact } from '../api';
import { Button } from '@/components/ui/button';

function emptyFact(): ProjectMemoryFact {
  return {
    id: `fact-${Date.now()}`,
    title: '',
    body: '',
    source: '',
  };
}

function normalizeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export default function ProjectMemoryPage() {
  const [memory, setMemory] = useState<ProjectMemory | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setMemory(await api.getProjectMemory());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const updateFact = (index: number, patch: Partial<ProjectMemoryFact>) => {
    setMemory((current) => {
      if (!current) return current;
      return {
        ...current,
        facts: current.facts.map((fact, factIndex) => factIndex === index ? { ...fact, ...patch } : fact),
      };
    });
  };

  const addFact = () => {
    setMemory((current) => current ? { ...current, facts: [...current.facts, emptyFact()] } : current);
  };

  const removeFact = (index: number) => {
    setMemory((current) => current ? { ...current, facts: current.facts.filter((_, factIndex) => factIndex !== index) } : current);
  };

  const save = async () => {
    if (!memory) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const cleaned: ProjectMemory = {
        ...memory,
        facts: memory.facts
          .map((fact, index) => ({
            ...fact,
            id: normalizeId(fact.id || fact.title) || `fact-${index + 1}`,
            title: fact.title.trim(),
            body: fact.body.trim(),
            source: fact.source?.trim(),
          }))
          .filter((fact) => fact.title && fact.body),
      };
      setMemory(await api.updateProjectMemory(cleaned));
      setNotice('Project memory saved');
      setTimeout(() => setNotice(''), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 px-4 lg:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Project knowledge</h1>
          <p className="mt-1 text-sm text-muted-foreground">Verified facts the agent can use when guidelines do not cover a question.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={saving || !memory}>
            {saving ? <IconLoader2 className="animate-spin" /> : <IconDeviceFloppy />}
            Save
          </Button>
        </div>
      </div>

      {error && <div className="sg-status-danger rounded-lg border p-4 text-sm">{error}</div>}
      {notice && <div className="sg-status-success rounded-lg border p-4 text-sm">{notice}</div>}

      <section className="sg-panel overflow-hidden p-0">
        <div className="sg-panel-header flex items-center justify-between gap-3 px-5 py-3">
          <p className="text-sm font-semibold text-foreground">Facts</p>
          <Button onClick={addFact} disabled={!memory || saving} variant="outline" size="sm">
            <IconPlus />
            Add fact
          </Button>
        </div>

        {loading && !memory ? (
          <p className="p-5 text-sm text-muted-foreground">Loading project memory...</p>
        ) : memory?.facts.length ? (
          <div className="divide-y divide-border">
            {memory.facts.map((fact, index) => (
              <div key={`${fact.id}-${index}`} className="grid gap-4 p-5 xl:grid-cols-[240px_1fr_auto]">
                <div className="space-y-3">
                  <div>
                    <label className="sg-label mb-1 block">Title</label>
                    <input
                      value={fact.title}
                      onChange={(event) => updateFact(index, { title: event.target.value })}
                      className="sg-input px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="sg-label mb-1 block">Source</label>
                    <input
                      value={fact.source || ''}
                      onChange={(event) => updateFact(index, { source: event.target.value })}
                      className="sg-input px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="sg-label mb-1 block">Memory</label>
                  <textarea
                    value={fact.body}
                    onChange={(event) => updateFact(index, { body: event.target.value })}
                    className="sg-input min-h-28 resize-y px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex items-start justify-end">
                  <Button onClick={() => removeFact(index)} variant="outline" size="icon-sm" disabled={saving}>
                    <IconTrash />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-5 text-sm text-muted-foreground">No facts saved.</p>
        )}
      </section>
    </div>
  );
}
