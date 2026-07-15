import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Clipboard,
  Loader2,
  Megaphone,
  MessageSquareText,
  RefreshCcw,
  Send,
  Sparkles,
  Wand2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {
  api,
  type ComposerTemplate,
  type ComposerChannel,
  type ComposerObjective,
  type ComposerResult,
  type ComposerTone,
} from '../api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const CHANNELS: Array<{ value: ComposerChannel; label: string }> = [
  { value: 'community', label: 'Community' },
  { value: 'dm', label: 'DM' },
  { value: 'daily_thread', label: 'Daily Thread' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'announcement', label: 'Announcement' },
];

const TONES: Array<{ value: ComposerTone; label: string }> = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'direct', label: 'Direct' },
  { value: 'warm_supportive', label: 'Warm Supportive' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'short_clear', label: 'Short and Clear' },
];

const OBJECTIVES: Array<{ value: ComposerObjective; label: string }> = [
  { value: 'inform', label: 'Inform' },
  { value: 'remind', label: 'Remind' },
  { value: 'ask_for_action', label: 'Ask for Action' },
  { value: 'de_escalate', label: 'De-escalate' },
  { value: 'explain_guideline', label: 'Explain Guideline' },
];

function FieldLabel({ children }: { children: string }) {
  return <label className="sg-label mb-1 block">{children}</label>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

export default function MessageComposer() {
  const [searchParams] = useSearchParams();
  const [templates, setTemplates] = useState<ComposerTemplate[]>([]);
  const [templateId, setTemplateId] = useState('custom');
  const [prompt, setPrompt] = useState('');
  const [audience, setAudience] = useState('Project contributors');
  const [extraContext, setExtraContext] = useState('');
  const [channel, setChannel] = useState<ComposerChannel>('community');
  const [tone, setTone] = useState<ComposerTone>('professional');
  const [objective, setObjective] = useState<ComposerObjective>('inform');
  const [variantCount, setVariantCount] = useState('2');
  const [includeWarRoomLink, setIncludeWarRoomLink] = useState(false);
  const [result, setResult] = useState<ComposerResult | null>(null);
  const [activeVariant, setActiveVariant] = useState('0');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedVariant = result?.variants[Number(activeVariant)];
  const canSendToChat = channel === 'community' || channel === 'reminder' || channel === 'announcement';
  const allWarnings = useMemo(() => {
    const warnings = result?.variants.flatMap((variant) => variant.warnings) || [];
    return Array.from(new Set(warnings)).slice(0, 5);
  }, [result]);

  useEffect(() => {
    api.getComposerTemplates()
      .then((result) => setTemplates(result.templates))
      .catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    const queryPrompt = searchParams.get('prompt');
    const queryChannel = searchParams.get('channel') as ComposerChannel | null;
    const queryAudience = searchParams.get('audience');
    if (queryPrompt) setPrompt(queryPrompt);
    if (queryAudience) setAudience(queryAudience);
    if (queryChannel && CHANNELS.some((item) => item.value === queryChannel)) setChannel(queryChannel);
  }, [searchParams]);

  useEffect(() => {
    setDraft(selectedVariant?.message || '');
  }, [selectedVariant?.message]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    if (id === 'custom') return;
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    setPrompt(template.prompt);
    setAudience(template.audience);
    setExtraContext(template.extraContext);
    setChannel(template.channel);
    setTone(template.tone);
    setObjective(template.objective);
    setIncludeWarRoomLink(template.includeWarRoomLink);
    setResult(null);
    setDraft('');
  };

  const generate = async () => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const next = await api.generateComposedMessage({
        prompt,
        audience,
        channel,
        tone,
        objective,
        extraContext,
        variantCount: Number(variantCount),
        includeWarRoomLink,
      });
      setResult(next);
      setActiveVariant('0');
      setDraft(next.variants[0]?.message || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!draft.trim()) return;
    await navigator.clipboard.writeText(draft);
    setNotice('Copied');
    setTimeout(() => setNotice(''), 2000);
  };

  const sendToChat = async () => {
    if (!draft.trim()) return;
    setSending(true);
    setError('');
    setNotice('');
    try {
      await api.sendToChat(draft);
      setNotice('Sent to community chat');
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 px-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Wand2 className="size-5 text-primary" />
            <h1 className="text-2xl font-semibold text-foreground">Message Composer</h1>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Mode" value="Draft" />
          <Metric label="Language" value="English" />
          <Metric label="Source" value="Guidelines" />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(340px,420px)_1fr]">
        <section className="sg-panel space-y-4 p-5">
          <div>
            <FieldLabel>Template</FieldLabel>
            <Select value={templateId} onValueChange={applyTemplate}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom message</SelectItem>
                {templates.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {templateId !== 'custom' && (
              <p className="mt-2 text-xs text-muted-foreground">
                {templates.find((item) => item.id === templateId)?.description}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <div>
              <FieldLabel>Channel</FieldLabel>
              <Select value={channel} onValueChange={(value) => setChannel(value as ComposerChannel)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <FieldLabel>Tone</FieldLabel>
              <Select value={tone} onValueChange={(value) => setTone(value as ComposerTone)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <FieldLabel>Objective</FieldLabel>
              <Select value={objective} onValueChange={(value) => setObjective(value as ComposerObjective)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OBJECTIVES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <FieldLabel>Versions</FieldLabel>
              <Select value={variantCount} onValueChange={setVariantCount}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 version</SelectItem>
                  <SelectItem value="2">2 versions</SelectItem>
                  <SelectItem value="3">3 versions</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <FieldLabel>Audience</FieldLabel>
            <input
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
              className="sg-input px-3 py-2 text-sm"
            />
          </div>

          <div>
            <FieldLabel>Description</FieldLabel>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="sg-input min-h-36 resize-y px-3 py-2 text-sm"
              placeholder="Reminder for contributors who passed courses and are EQ or project-ineligible to come to the War Room for Cursor access."
            />
          </div>

          <div>
            <FieldLabel>Context</FieldLabel>
            <textarea
              value={extraContext}
              onChange={(event) => setExtraContext(event.target.value)}
              className="sg-input min-h-24 resize-y px-3 py-2 text-sm"
              placeholder="Optional details, constraints, dates, or links."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={includeWarRoomLink}
                onChange={(event) => setIncludeWarRoomLink(event.target.checked)}
                className="accent-primary"
              />
              War Room link
            </label>
          </div>

          <Button onClick={generate} disabled={loading || !prompt.trim()} className="w-full">
            {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {loading ? 'Generating' : 'Generate'}
          </Button>
        </section>

        <section className="space-y-4">
          {error && <div className="sg-status-danger rounded-lg border p-4 text-sm">{error}</div>}
          {notice && <div className="sg-status-success rounded-lg border p-4 text-sm">{notice}</div>}

          <div className="sg-panel overflow-hidden">
            <div className="sg-panel-header flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <MessageSquareText className="size-4 text-primary" />
                <span className="truncate text-sm font-semibold text-foreground">
                  {selectedVariant?.title || 'Draft preview'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={copy} disabled={!draft.trim()} variant="outline" size="sm">
                  <Clipboard />
                  Copy
                </Button>
                <Button onClick={generate} disabled={loading || !prompt.trim()} variant="outline" size="sm">
                  <RefreshCcw />
                  Regenerate
                </Button>
                <Button onClick={sendToChat} disabled={!draft.trim() || sending || !canSendToChat} size="sm">
                  {sending ? <Loader2 className="animate-spin" /> : <Send />}
                  {sending ? 'Sending' : 'Send to Chat'}
                </Button>
              </div>
            </div>

            {result && result.variants.length > 1 && (
              <div className="border-b border-border px-4 py-3">
                <Tabs value={activeVariant} onValueChange={setActiveVariant}>
                  <TabsList>
                    {result.variants.map((_, index) => (
                      <TabsTrigger key={index} value={String(index)}>
                        Version {index + 1}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
            )}

            <div className="grid min-h-[420px] gap-0 lg:grid-cols-2">
              <div className="border-b border-border lg:border-r lg:border-b-0">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="min-h-[420px] w-full resize-none bg-background p-5 text-sm leading-6 text-foreground outline-none"
                  placeholder="Generated draft will appear here."
                />
              </div>
              <div className="prose prose-sm max-w-none p-5 text-foreground">
                {draft ? (
                  <ReactMarkdown>{draft}</ReactMarkdown>
                ) : (
                  <div className="flex h-full min-h-[360px] items-center justify-center text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Megaphone className="size-4" />
                      Draft preview
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {result && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="sg-panel p-4">
                <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Draft context</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{CHANNELS.find((item) => item.value === result.channel)?.label}</Badge>
                  <Badge variant="secondary">{TONES.find((item) => item.value === result.tone)?.label}</Badge>
                  <Badge variant="secondary">{OBJECTIVES.find((item) => item.value === result.objective)?.label}</Badge>
                  <Badge variant="outline">{result.guidelineSnippets.length} guideline snippets</Badge>
                </div>
                {selectedVariant?.notes && (
                  <p className="mt-3 text-sm text-muted-foreground">{selectedVariant.notes}</p>
                )}
              </div>

              <div className="sg-panel p-4">
                <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Warnings</p>
                {allWarnings.length > 0 ? (
                  <div className="space-y-2">
                    {allWarnings.map((warning) => (
                      <p key={warning} className="text-sm text-muted-foreground">{warning}</p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No warnings returned.</p>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
