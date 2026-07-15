import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import {
  AlertTriangle,
  ClipboardCheck,
  GraduationCap,
  Headphones,
  KeyRound,
  Loader2,
  MessageSquareText,
  PenLine,
  Plus,
  Radio,
  Save,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { api, type CommsTemplate, type TemplateVariable } from '../api';
import CommsForm from '../components/CommsForm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  { id: 'urgent_alert', label: 'Urgent Alert' },
  { id: 'webinar_alignment', label: 'Webinar / Alignment' },
  { id: 'war_room', label: 'War Room' },
  { id: 'throttle_quality', label: 'Throttle / Quality' },
  { id: 'reviewer_qma_allocation', label: 'Reviewer / QMA' },
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'access_cursor_setup', label: 'Access / Cursor' },
  { id: 'quality_feedback_escalation', label: 'Quality Feedback' },
  { id: 'daily_thread_announcement', label: 'Daily Announcement' },
  { id: 'custom', label: 'Custom Message' },
];

const TONES = ['friendly', 'firm', 'urgent', 'formal', 'slack_casual'];
const AUDIENCES = [
  'all_contributors',
  'reviewers_only',
  'qma_only',
  'invited_contributors',
  'new_contributors',
  'throttled_contributors',
  'specific_users',
];

const CATEGORY_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  urgent_alert: AlertTriangle,
  webinar_alignment: Radio,
  war_room: Headphones,
  throttle_quality: SlidersHorizontal,
  reviewer_qma_allocation: Users,
  onboarding: GraduationCap,
  access_cursor_setup: KeyRound,
  quality_feedback_escalation: ClipboardCheck,
  daily_thread_announcement: MessageSquareText,
  custom: PenLine,
};

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function titleFromKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function variablesFromBody(body: string): string[] {
  return Array.from(body.matchAll(/\{\{([a-zA-Z0-9_ -]+)\}\}/g))
    .map((match) => slug(match[1]))
    .filter(Boolean)
    .filter((key, index, keys) => keys.indexOf(key) === index);
}

function blankTemplate(category: string): CommsTemplate {
  return {
    id: '',
    category,
    name: '',
    description: '',
    defaultTone: 'friendly',
    supportedTones: ['friendly'],
    audience: ['all_contributors'],
    variables: [],
    body: '',
  };
}

function syncVariables(body: string, current: TemplateVariable[]): TemplateVariable[] {
  const keys = variablesFromBody(body);
  return keys.map((key) => {
    const existing = current.find((item) => item.key === key);
    return existing || {
      key,
      label: titleFromKey(key),
      required: true,
      placeholder: '',
      defaultValue: '',
    };
  });
}

function TemplateEditor({
  initialTemplate,
  activeCategory,
  onCancel,
  onSaved,
}: {
  initialTemplate?: CommsTemplate | null;
  activeCategory: string;
  onCancel: () => void;
  onSaved: (template: CommsTemplate) => void;
}) {
  const editing = Boolean(initialTemplate);
  const [template, setTemplate] = useState<CommsTemplate>(() => initialTemplate || blankTemplate(activeCategory));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setTemplate(initialTemplate || blankTemplate(activeCategory));
    setError('');
  }, [initialTemplate, activeCategory]);

  const set = <K extends keyof CommsTemplate>(key: K, value: CommsTemplate[K]) => {
    setTemplate((current) => ({ ...current, [key]: value }));
  };

  const setBody = (body: string) => {
    setTemplate((current) => ({
      ...current,
      body,
      variables: syncVariables(body, current.variables),
    }));
  };

  const updateVariable = (key: string, patch: Partial<TemplateVariable>) => {
    setTemplate((current) => ({
      ...current,
      variables: current.variables.map((variable) =>
        variable.key === key ? { ...variable, ...patch } : variable
      ),
    }));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...template,
        id: editing ? template.id : slug(template.id || template.name),
        supportedTones: template.supportedTones.length ? template.supportedTones : [template.defaultTone],
      };
      const saved = editing
        ? await api.updateCommsTemplate(template.id, payload)
        : await api.createCommsTemplate(payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{editing ? 'Edit template' : 'Create template'}</h3>
          <p className="text-sm text-muted-foreground">
            Variables are detected from placeholders like {'{{warRoomLink}}'}.
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onCancel}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="templateName">Name</Label>
          <Input
            id="templateName"
            value={template.name}
            onChange={(event) => {
              const name = event.target.value;
              setTemplate((current) => ({
                ...current,
                name,
                id: editing || current.id ? current.id : slug(name),
              }));
            }}
            placeholder="War Room Reminder"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="templateId">Template ID</Label>
          <Input
            id="templateId"
            value={template.id}
            onChange={(event) => set('id', slug(event.target.value))}
            disabled={editing}
            placeholder="war_room_reminder"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="templateCategory">Category</Label>
          <select
            id="templateCategory"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={template.category}
            onChange={(event) => set('category', event.target.value)}
          >
            {CATEGORIES.map((category) => (
              <option key={category.id} value={category.id}>{category.label}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="templateTone">Default tone</Label>
          <select
            id="templateTone"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={template.defaultTone}
            onChange={(event) => {
              const tone = event.target.value;
              setTemplate((current) => ({
                ...current,
                defaultTone: tone,
                supportedTones: Array.from(new Set([tone, ...current.supportedTones])),
              }));
            }}
          >
            {TONES.map((tone) => (
              <option key={tone} value={tone}>{tone.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-2 md:col-span-2">
          <Label htmlFor="templateDescription">Description</Label>
          <Input
            id="templateDescription"
            value={template.description}
            onChange={(event) => set('description', event.target.value)}
            placeholder="What this template is for"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <Label htmlFor="templateBody">Message body</Label>
        <Textarea
          id="templateBody"
          className="min-h-56 font-mono text-sm"
          value={template.body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Hi team, please join {{warRoomLink}} for support."
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label>Supported tones</Label>
          <div className="flex flex-wrap gap-2">
            {TONES.map((tone) => (
              <label key={tone} className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                <input
                  type="checkbox"
                  checked={template.supportedTones.includes(tone)}
                  onChange={(event) => {
                    setTemplate((current) => ({
                      ...current,
                      supportedTones: event.target.checked
                        ? Array.from(new Set([...current.supportedTones, tone]))
                        : current.supportedTones.filter((item) => item !== tone),
                    }));
                  }}
                />
                {tone.replace(/_/g, ' ')}
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          <Label>Audience</Label>
          <div className="flex flex-wrap gap-2">
            {AUDIENCES.map((audience) => (
              <label key={audience} className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                <input
                  type="checkbox"
                  checked={template.audience.includes(audience)}
                  onChange={(event) => {
                    setTemplate((current) => ({
                      ...current,
                      audience: event.target.checked
                        ? Array.from(new Set([...current.audience, audience]))
                        : current.audience.filter((item) => item !== audience),
                    }));
                  }}
                />
                {audience.replace(/_/g, ' ')}
              </label>
            ))}
          </div>
        </div>
      </div>

      {template.variables.length > 0 ? (
        <div className="mt-4 grid gap-3">
          <Label>Variables</Label>
          {template.variables.map((variable) => (
            <div key={variable.key} className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_1fr_auto]">
              <div className="grid gap-1">
                <span className="text-xs font-medium text-muted-foreground">{`{{${variable.key}}}`}</span>
                <Input
                  value={variable.label}
                  onChange={(event) => updateVariable(variable.key, { label: event.target.value })}
                  placeholder="Label"
                />
              </div>
              <div className="grid gap-1">
                <span className="text-xs font-medium text-muted-foreground">Default value</span>
                <Input
                  value={variable.defaultValue || ''}
                  onChange={(event) => updateVariable(variable.key, { defaultValue: event.target.value })}
                  placeholder="Optional"
                />
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={variable.required}
                  onChange={(event) => updateVariable(variable.key, { required: event.target.checked })}
                />
                Required
              </label>
            </div>
          ))}
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save template
        </Button>
      </div>
    </div>
  );
}

export default function CommsAutomator() {
  const [activeCategory, setActiveCategory] = useState('urgent_alert');
  const [templates, setTemplates] = useState<CommsTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<CommsTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<CommsTemplate | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    setSelectedTemplate(null);
    api.getCommsTemplates(activeCategory)
      .then((items) => setTemplates(items))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [activeCategory]);

  const deleteTemplate = async (template: CommsTemplate) => {
    if (!confirm(`Delete ${template.name}?`)) return;
    setError('');
    try {
      await api.deleteCommsTemplate(template.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const ActiveIcon = CATEGORY_ICONS[activeCategory];
  const title = useMemo(
    () => CATEGORIES.find((category) => category.id === activeCategory)?.label || 'Comms',
    [activeCategory]
  );

  return (
    <div className="flex min-h-[600px] flex-col gap-6 px-6 lg:flex-row">
      <aside className="w-full shrink-0 lg:w-52">
        <Card className="overflow-hidden p-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setActiveCategory(cat.id);
                setSelectedTemplate(null);
                setEditingTemplate(undefined);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors',
                activeCategory === cat.id
                  ? 'bg-primary font-medium text-primary-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              {(() => {
                const Icon = CATEGORY_ICONS[cat.id];
                return <Icon className="size-4" />;
              })()}
              <span>{cat.label}</span>
            </button>
          ))}
        </Card>
      </aside>

      <div className="min-w-0 flex-1">
        {selectedTemplate ? (
          <CommsForm
            template={selectedTemplate}
            onBack={() => setSelectedTemplate(null)}
          />
        ) : editingTemplate !== undefined ? (
          <TemplateEditor
            initialTemplate={editingTemplate}
            activeCategory={activeCategory}
            onCancel={() => setEditingTemplate(undefined)}
            onSaved={(template) => {
              setActiveCategory(template.category);
              setEditingTemplate(undefined);
              load();
            }}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <ActiveIcon className="size-5 text-primary" />
                <h2 className="text-xl font-semibold text-foreground">{title}</h2>
              </div>
              <Button type="button" onClick={() => setEditingTemplate(null)}>
                <Plus className="size-4" />
                New template
              </Button>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading templates...
              </div>
            ) : templates.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-card/60 px-4 py-12 text-center">
                <PenLine className="mx-auto mb-3 size-8 text-primary" />
                <p className="font-medium text-foreground">No templates in this category</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create the first comms template for this project.
                </p>
                <Button type="button" className="mt-4" onClick={() => setEditingTemplate(null)}>
                  <Plus className="size-4" />
                  Create template
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className="group rounded-lg border border-border bg-card p-5 text-left transition-colors hover:border-primary/50 hover:bg-secondary"
                  >
                    <button className="w-full text-left" onClick={() => setSelectedTemplate(template)}>
                      <h3 className="mb-1 font-semibold text-foreground transition-colors group-hover:text-primary">
                        {template.name}
                      </h3>
                      <p className="mb-3 text-sm text-muted-foreground">{template.description}</p>
                    </button>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">
                        {template.defaultTone}
                      </Badge>
                      {template.audience.slice(0, 2).map((audience) => (
                        <Badge key={audience} variant="outline">
                          {audience.replace(/_/g, ' ')}
                        </Badge>
                      ))}
                      {template.variables.length > 0 && (
                        <Badge variant="outline" className="text-muted-foreground">
                          {template.variables.length} var{template.variables.length !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setEditingTemplate(template)}>
                        <PenLine className="size-4" />
                        Edit
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => void deleteTemplate(template)}>
                        <Trash2 className="size-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
