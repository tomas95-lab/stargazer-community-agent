import { useState, useEffect } from 'react';
import { BellRing, Plus, RefreshCw, Send, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { api, type AiUsageSummary, type AutomationHealthJob, type AutomationHealthResult, type ProjectHealthResult, type PushStatus } from '../api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { APP_TIME_ZONE_LABEL, formatAppDateTime } from '@/lib/timezone';
import { disableWebPush, enableWebPush, webPushSubscription, webPushSupported } from '@/lib/web-push';
import { usePlatform } from '@/platform';

const LABELS: Record<string, string> = {
  COMMUNITY_BASE_URL: 'Community Base URL',
  COMMUNITY_CATEGORY_ID: 'Category ID',
  COMMUNITY_CATEGORY_SLUG: 'Category Slug',
  COMMUNITY_CHAT_CHANNEL_ID: 'Chat Channel ID',
  DISCOURSE_API_KEY: 'Discourse API Key',
  DISCOURSE_API_CLIENT_ID: 'Discourse API Client ID',
  DISCOURSE_USERNAME: 'Discourse Username',
  STORAGE_BACKEND_REQUESTED: 'Storage Backend Requested',
  STORAGE_BACKEND_ACTIVE: 'Storage Backend Active',
  STORAGE_FALLBACK: 'Legacy Storage Fallback',
  AI_PROVIDER: 'AI Provider',
  GEMINI_CONNECTION_MODE: 'Gemini Connection',
  PLATFORM_GEMINI_CONFIGURED: 'Platform Gemini Ready',
  GEMINI_MODEL: 'Gemini Model',
  CRON_CONFIGURED: 'Cron Configured',
  AGENT_AUTO_POST: 'Agent Auto Post',
  AGENT_THREAD_SCAN_LIMIT: 'Agent Thread Scan Limit',
  AGENT_THREAD_MESSAGE_COUNT: 'Agent Thread Message Count',
  DM_AUTO_REPLY: 'DM Auto Reply',
  DM_AUTO_REPLY_MAX: 'DM Auto Reply Max',
  AI_DAILY_TOKEN_LIMIT: 'AI Daily Token Limit',
  AI_DAILY_CALL_LIMIT: 'AI Daily Call Limit',
  AI_PROJECT_DAILY_TOKEN_LIMIT: 'Project Daily Token Limit',
  AI_PROJECT_DAILY_CALL_LIMIT: 'Project Daily Call Limit',
  PLATFORM_AI_DAILY_TOKEN_LIMIT: 'Platform Daily Token Limit',
  PLATFORM_AI_DAILY_CALL_LIMIT: 'Platform Daily Call Limit',
  AI_GUARDRAILS_ENFORCE: 'AI Guardrails Enforced',
  PLATFORM_CONFIGURED: 'Platform Configured',
  PLATFORM_ENCRYPTION_CONFIGURED: 'Platform Encryption Configured',
};

const DAYS = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 0, label: 'Sun' },
];

interface PolicyState {
  timezone: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  autoPost: boolean;
  autoReact: boolean;
  dmAutoReply: boolean;
  minConfidence: number;
  communityMaxAnswers: number;
  dmMaxAutoReplies: number;
  blockedTopics: string[];
}

const DEFAULT_POLICY: PolicyState = {
  timezone: 'America/Los_Angeles', weekdays: [1, 2, 3, 4, 5], startTime: '00:00', endTime: '23:59',
  autoPost: false, autoReact: false, dmAutoReply: false, minConfidence: 0.5,
  communityMaxAnswers: 3, dmMaxAutoReplies: 3,
  blockedTopics: ['pay', 'payment', 'account suspension', 'disciplinary action', 'legal', 'eligibility decision'],
};

function settingNumber(settings: Record<string, unknown>, key: string, fallback: number): number {
  const value = Number(settings[key]);
  return Number.isFinite(value) ? value : fallback;
}

function healthClass(value: AutomationHealthJob['health']): string {
  if (value === 'ok') return 'sg-status-success';
  if (value === 'warning') return 'border-border bg-secondary text-secondary-foreground';
  if (value === 'error') return 'sg-status-warning';
  return 'border-border bg-secondary text-secondary-foreground';
}

function healthLabel(value: AutomationHealthJob['health']): string {
  if (value === 'ok') return 'ok';
  if (value === 'warning') return 'check';
  if (value === 'error') return 'attention';
  return 'pending';
}

function metricValue(job: AutomationHealthJob): string {
  const metadata = job.lastAppResult?.metadata || job.lastCronRequest?.metadata || {};
  if (job.action === 'community_agent') {
    const checked = metadata.checked;
    const posted = metadata.posted;
    if (typeof checked === 'number' || typeof posted === 'number') return `${checked || 0} checked, ${posted || 0} posted`;
  }
  if (job.action === 'dm_review') {
    const incoming = metadata.incomingMessages;
    const replied = metadata.autoReplied;
    if (typeof incoming === 'number' || typeof replied === 'number') return `${incoming || 0} DMs, ${replied || 0} replies`;
  }
  if (job.action === 'daily_publish_job') {
    const resultStatus = metadata.resultStatus || job.lastAppResult?.status;
    if (typeof resultStatus === 'string') return resultStatus;
  }
  return '-';
}

function formatNumber(value?: number | null): string {
  if (value === null || value === undefined) return 'Not set';
  return new Intl.NumberFormat('en-US').format(value);
}

export default function Settings() {
  const { currentProject, refreshProjects } = usePlatform();
  const [config, setConfig] = useState<Record<string, string>>({});
  const [health, setHealth] = useState<AutomationHealthResult | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState('');
  const [usage, setUsage] = useState<AiUsageSummary | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState('');
  const [projectHealth, setProjectHealth] = useState<ProjectHealthResult | null>(null);
  const [projectHealthLoading, setProjectHealthLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [schedule, setSchedule] = useState<PolicyState>(DEFAULT_POLICY);
  const [blockedTopicDraft, setBlockedTopicDraft] = useState('');
  const [policyMessage, setPolicyMessage] = useState('');
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState('');

  useEffect(() => {
    api.getConfig().then(setConfig);
    loadHealth();
    loadUsage();
  }, []);

  useEffect(() => {
    if (!currentProject) return;
    const settings = currentProject.settings || {};
    setSchedule({
      timezone: typeof settings.timezone === 'string' ? settings.timezone : 'America/Los_Angeles',
      weekdays: Array.isArray(settings.weekdays) ? settings.weekdays.filter((value): value is number => typeof value === 'number' && value >= 0 && value <= 6) : [1, 2, 3, 4, 5],
      startTime: typeof settings.startTime === 'string' ? settings.startTime : '00:00',
      endTime: typeof settings.endTime === 'string' ? settings.endTime : '23:59',
      autoPost: settings.autoPost === true,
      autoReact: settings.autoReact === true,
      dmAutoReply: settings.dmAutoReply === true,
      minConfidence: currentProject.minConfidence,
      communityMaxAnswers: settingNumber(settings, 'communityMaxAnswers', 3),
      dmMaxAutoReplies: settingNumber(settings, 'dmMaxAutoReplies', 3),
      blockedTopics: Array.isArray(settings.blockedTopics) ? settings.blockedTopics.filter((value): value is string => typeof value === 'string') : DEFAULT_POLICY.blockedTopics,
    });
    setProjectHealthLoading(true);
    api.getProjectHealth(currentProject.id)
      .then(setProjectHealth)
      .catch(() => setProjectHealth(null))
      .finally(() => setProjectHealthLoading(false));
    api.getPushStatus()
      .then(async (status) => {
        setPushStatus(status);
        setPushSubscribed(Boolean(status.configured && await webPushSubscription()));
      })
      .catch(() => { setPushStatus(null); setPushSubscribed(false); });
  }, [currentProject]);

  const saveSchedule = async () => {
    if (!currentProject) return;
    setScheduleSaving(true);
    try {
      const { minConfidence: requestedConfidence, ...automationSettings } = schedule;
      const minConfidence = Math.max(0, Math.min(1, requestedConfidence));
      const settings = {
        ...currentProject.settings,
        ...automationSettings,
        communityMaxAnswers: Math.max(0, Math.floor(schedule.communityMaxAnswers)),
        dmMaxAutoReplies: Math.max(0, Math.floor(schedule.dmMaxAutoReplies)),
      };
      await api.updateProject(currentProject.id, { minConfidence, autoReplyEnabled: schedule.autoPost, settings });
      await refreshProjects();
      setPolicyMessage('Automation policy saved for every QM on this project.');
    } finally {
      setScheduleSaving(false);
    }
  };

  const addBlockedTopic = () => {
    const value = blockedTopicDraft.trim().toLowerCase();
    if (!value || schedule.blockedTopics.includes(value)) return;
    setSchedule((current) => ({ ...current, blockedTopics: [...current.blockedTopics, value] }));
    setBlockedTopicDraft('');
  };

  const togglePush = async () => {
    setPushBusy(true);
    setPushMessage('');
    try {
      if (pushSubscribed) {
        await disableWebPush();
        setPushSubscribed(false);
        setPushMessage('Web Push disabled on this device.');
      } else {
        await enableWebPush(pushStatus || undefined);
        setPushSubscribed(true);
        setPushMessage('Web Push enabled on this device.');
      }
      setPushStatus(await api.getPushStatus());
    } catch (err) {
      setPushMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setPushBusy(false);
    }
  };

  const testPush = async () => {
    setPushBusy(true);
    setPushMessage('');
    try {
      const result = await api.testPush();
      setPushMessage(result.sent ? 'Test notification sent.' : 'No active subscription received the test.');
    } catch (err) {
      setPushMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setPushBusy(false);
    }
  };

  const loadHealth = () => {
    setHealthLoading(true);
    setHealthError('');
    api.getAutomationHealth()
      .then(setHealth)
      .catch((err) => setHealthError(err instanceof Error ? err.message : String(err)))
      .finally(() => setHealthLoading(false));
  };

  const loadUsage = () => {
    setUsageLoading(true);
    setUsageError('');
    api.getAiUsage()
      .then(setUsage)
      .catch((err) => setUsageError(err instanceof Error ? err.message : String(err)))
      .finally(() => setUsageLoading(false));
  };

  const inputCls = 'sg-input cursor-not-allowed px-3 py-2 text-sm text-muted-foreground';

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden px-4 lg:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <span className="rounded-full border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">Environment managed</span>
      </div>

      <section className="sg-panel min-w-0 overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Project Health Center</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Live checks for {currentProject?.projectName || 'the active project'}.</p>
          </div>
          <Badge variant={projectHealth?.healthy ? 'secondary' : 'outline'}>
            {projectHealthLoading ? 'checking' : projectHealth?.healthy ? 'healthy' : 'attention needed'}
          </Badge>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-px bg-border md:grid-cols-2 lg:grid-cols-4">
          {(projectHealth?.checks || []).map((check) => (
            <div key={check.id} className="bg-background p-4">
              <p className="text-sm font-medium text-foreground">{check.label}</p>
              <p className={`mt-1 text-xs ${check.ok ? 'text-muted-foreground' : 'text-destructive'}`}>{check.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {currentProject && (currentProject.role === 'owner' || currentProject.role === 'admin') ? (
        <section className="sg-panel overflow-hidden p-0">
          <div className="flex min-w-0 items-start gap-3 border-b px-4 py-4 sm:px-6">
            <ShieldAlert className="mt-0.5 size-5 text-primary" />
            <div className="min-w-0"><h2 className="text-lg font-semibold text-foreground">Policy Builder</h2><p className="mt-1 break-words text-sm text-muted-foreground">Define when the agent can act, what it must escalate, and how much it may send per run.</p></div>
          </div>

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-0 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
            <div className="min-w-0 space-y-6 p-4 sm:p-6 xl:border-r">
              <div>
                <h3 className="text-sm font-semibold">Operating window</h3>
                <div className="mt-3 grid gap-4 md:grid-cols-3">
                  <label className="text-sm"><span className="sg-label mb-1 block">Timezone</span><Input value={schedule.timezone} onChange={(event) => setSchedule({ ...schedule, timezone: event.target.value })} /></label>
                  <label className="text-sm"><span className="sg-label mb-1 block">Start time</span><Input type="time" value={schedule.startTime} onChange={(event) => setSchedule({ ...schedule, startTime: event.target.value })} /></label>
                  <label className="text-sm"><span className="sg-label mb-1 block">End time</span><Input type="time" value={schedule.endTime} onChange={(event) => setSchedule({ ...schedule, endTime: event.target.value })} /></label>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {DAYS.map((day) => {
                    const active = schedule.weekdays.includes(day.value);
                    return <Button key={day.value} type="button" size="sm" variant={active ? 'secondary' : 'outline'} className="h-8 w-12 px-0" onClick={() => setSchedule((current) => ({ ...current, weekdays: active ? current.weekdays.filter((value) => value !== day.value) : [...current.weekdays, day.value] }))}>{day.label}</Button>;
                  })}
                </div>
              </div>

              <div className="border-t pt-5">
                <h3 className="text-sm font-semibold">Allowed automatic actions</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {[
                    ['autoPost', 'Community replies', 'Post high-confidence answers in threads.'],
                    ['autoReact', 'Community reactions', 'Acknowledge useful messages with a reaction.'],
                    ['dmAutoReply', 'DM replies', 'Use the same safety policy in private messages.'],
                  ].map(([key, label, detail]) => (
                    <label key={key} className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                      <Checkbox checked={Boolean(schedule[key as keyof PolicyState])} onCheckedChange={(checked) => setSchedule((current) => ({ ...current, [key]: checked === true }))} />
                      <span><span className="block text-sm font-medium">{label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span></span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 border-t pt-5 md:grid-cols-3">
                <label><span className="sg-label mb-1 block">Minimum confidence</span><Input type="number" min="0" max="1" step="0.05" value={schedule.minConfidence} onChange={(event) => setSchedule({ ...schedule, minConfidence: Number(event.target.value) })} /><span className="mt-1 block text-xs text-muted-foreground">Below this value, a QM reviews the message.</span></label>
                <label><span className="sg-label mb-1 block">Community replies per run</span><Input type="number" min="0" max="25" value={schedule.communityMaxAnswers} onChange={(event) => setSchedule({ ...schedule, communityMaxAnswers: Number(event.target.value) })} /></label>
                <label><span className="sg-label mb-1 block">DM replies per run</span><Input type="number" min="0" max="25" value={schedule.dmMaxAutoReplies} onChange={(event) => setSchedule({ ...schedule, dmMaxAutoReplies: Number(event.target.value) })} /></label>
              </div>

              <div className="border-t pt-5">
                <h3 className="text-sm font-semibold">Always escalate these topics</h3>
                <p className="mt-1 text-xs text-muted-foreground">A matching message goes directly to Human Review, even when the model is confident.</p>
                <div className="mt-3 flex gap-2"><Input value={blockedTopicDraft} onChange={(event) => setBlockedTopicDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addBlockedTopic(); } }} placeholder="Add a sensitive topic" /><Button type="button" variant="outline" onClick={addBlockedTopic}><Plus />Add</Button></div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {schedule.blockedTopics.map((topic) => <Badge key={topic} variant="secondary" className="gap-1 py-1"><span>{topic}</span><button type="button" aria-label={`Remove ${topic}`} onClick={() => setSchedule((current) => ({ ...current, blockedTopics: current.blockedTopics.filter((value) => value !== topic) }))}><X className="size-3" /></button></Badge>)}
                </div>
              </div>
            </div>

            <aside className="min-w-0 bg-muted/25 p-4 sm:p-6">
              <h3 className="text-sm font-semibold">Policy preview</h3>
              <div className="mt-4 space-y-4 text-sm">
                <div><p className="font-medium">The agent can operate</p><p className="mt-1 leading-6 text-muted-foreground">{schedule.weekdays.length ? DAYS.filter((day) => schedule.weekdays.includes(day.value)).map((day) => day.label).join(', ') : 'No days selected'}, {schedule.startTime} to {schedule.endTime} in {schedule.timezone}.</p></div>
                <div><p className="font-medium">It may answer</p><p className="mt-1 leading-6 text-muted-foreground">Community {schedule.autoPost ? 'automatically' : 'in suggestion mode'}, DMs {schedule.dmAutoReply ? 'automatically' : 'in suggestion mode'}, at {Math.round(schedule.minConfidence * 100)}% confidence or higher.</p></div>
                <div><p className="font-medium">It must escalate</p><p className="mt-1 leading-6 text-muted-foreground">Low-confidence questions and messages matching {schedule.blockedTopics.length} protected topic{schedule.blockedTopics.length === 1 ? '' : 's'}.</p></div>
              </div>
              {policyMessage ? <p className="mt-5 rounded-md border bg-background p-3 text-xs text-muted-foreground">{policyMessage}</p> : null}
              <Button className="mt-5 w-full" onClick={() => void saveSchedule()} disabled={scheduleSaving || schedule.weekdays.length === 0}>{scheduleSaving ? 'Saving...' : 'Save policy'}</Button>
            </aside>
          </div>
        </section>
      ) : null}

      <section className="sg-panel overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-start gap-3"><BellRing className="mt-0.5 size-5 shrink-0 text-primary" /><div className="min-w-0"><h2 className="text-lg font-semibold">Web Push notifications</h2><p className="mt-1 break-words text-sm text-muted-foreground">Receive Community, DM, reply, and human-review alerts even when this tab is closed.</p></div></div>
          <Badge variant={pushSubscribed ? 'secondary' : 'outline'}>{pushSubscribed ? 'enabled on this device' : pushStatus?.configured ? 'available' : 'server setup required'}</Badge>
        </div>
        <div className="flex min-w-0 flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div><p className="text-sm font-medium">{pushStatus?.subscriptions || 0} saved subscription{pushStatus?.subscriptions === 1 ? '' : 's'} for this project</p><p className="mt-1 text-xs text-muted-foreground">Browser support: {webPushSupported() ? 'ready' : 'unavailable'}. Permission is controlled by your browser and operating system.</p>{pushMessage ? <p className="mt-2 text-xs text-muted-foreground">{pushMessage}</p> : null}</div>
          <div className="flex shrink-0 gap-2"><Button variant="outline" onClick={() => void testPush()} disabled={pushBusy || !pushSubscribed}><Send />Send test</Button><Button onClick={() => void togglePush()} disabled={pushBusy || !pushStatus?.configured}>{pushSubscribed ? 'Disable on this device' : 'Enable Web Push'}</Button></div>
        </div>
      </section>

      <div className="sg-panel overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-border px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Cron Health</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              External scheduler status, app execution result, and next run.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={health?.providerConfigured ? 'secondary' : 'outline'}>
              {health?.providerConfigured ? 'cron-job.org connected' : 'provider missing'}
            </Badge>
            <Button onClick={loadHealth} disabled={healthLoading} variant="outline" size="sm">
              <RefreshCw className={healthLoading ? 'animate-spin' : ''} />
              Refresh
            </Button>
          </div>
        </div>

        {healthError || health?.providerError ? (
          <div className="sg-status-warning m-4 rounded-lg border p-3 text-sm">
            {healthError || health?.providerError}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Job</th>
                <th className="px-4 py-3 text-left font-semibold">Last Scheduler</th>
                <th className="px-4 py-3 text-left font-semibold">Last App Result</th>
                <th className="px-4 py-3 text-left font-semibold">Next Run</th>
                <th className="px-4 py-3 text-left font-semibold">Metrics</th>
                <th className="px-4 py-3 text-left font-semibold">Reason</th>
              </tr>
            </thead>
            <tbody>
              {healthLoading && !health ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-sm text-muted-foreground">Loading cron health...</td>
                </tr>
              ) : health?.jobs.length ? (
                health.jobs.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${healthClass(item.health)}`}>
                        {healthLabel(item.health)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{item.title}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{item.endpoint}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <p>{formatAppDateTime(item.provider?.lastExecution || item.lastCronRequest?.at)} {APP_TIME_ZONE_LABEL}</p>
                      <p className="mt-1 text-xs">{item.provider?.lastStatusLabel || item.lastCronRequest?.status || '-'}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <p>{formatAppDateTime(item.lastAppResult?.at)} {APP_TIME_ZONE_LABEL}</p>
                      <p className="mt-1 text-xs">{item.lastAppResult?.status || '-'}</p>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {formatAppDateTime(item.provider?.nextExecution)} {APP_TIME_ZONE_LABEL}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{metricValue(item)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.healthReason}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-sm text-muted-foreground">No automation jobs found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sg-panel overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-border px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">AI Fair-Use Guardrails</h2>
            <p className="mt-1 text-sm text-muted-foreground">Usage for the current QM. Platform, project, and QM limits keep shared Gemini capacity available to everyone.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={usage?.limits.enforce ? 'secondary' : 'outline'}>
              {usage?.limits.enforce ? 'enforced' : 'observe only'}
            </Badge>
            <Button onClick={loadUsage} disabled={usageLoading} variant="outline" size="sm">
              <RefreshCw className={usageLoading ? 'animate-spin' : ''} />
              Refresh
            </Button>
          </div>
        </div>

        {usageError ? (
          <div className="sg-status-warning m-4 rounded-lg border p-3 text-sm">{usageError}</div>
        ) : null}

        <div className="grid gap-3 p-4 md:grid-cols-4">
          <div className="rounded-md border border-border bg-background p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Calls Today</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{formatNumber(usage?.today.calls)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Limit {formatNumber(usage?.limits.dailyCallLimit)}</p>
          </div>
          <div className="rounded-md border border-border bg-background p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Tokens Today</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{formatNumber(usage?.today.totalTokens)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Limit {formatNumber(usage?.limits.dailyTokenLimit)}</p>
          </div>
          <div className="rounded-md border border-border bg-background p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Input Tokens</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{formatNumber(usage?.today.inputTokens)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{usage?.utcDate || usage?.argentinaDate || `${APP_TIME_ZONE_LABEL} day`}</p>
          </div>
          <div className="rounded-md border border-border bg-background p-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Output Tokens</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{formatNumber(usage?.today.outputTokens)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Remaining {formatNumber(usage?.remaining.tokens)}</p>
          </div>
        </div>

        {usage?.warnings.length ? (
          <div className="mx-4 mb-4 space-y-1 rounded-lg border p-3 text-sm sg-status-warning">
            {usage.warnings.map((warning) => <p key={warning}>{warning}</p>)}
          </div>
        ) : null}

        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Time</th>
                <th className="px-4 py-3 text-left font-semibold">Feature</th>
                <th className="px-4 py-3 text-left font-semibold">Model</th>
                <th className="px-4 py-3 text-left font-semibold">Tokens</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {usageLoading && !usage ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-sm text-muted-foreground">Loading AI usage...</td>
                </tr>
              ) : usage?.recentEvents.length ? (
                usage.recentEvents.slice(0, 10).map((event) => (
                  <tr key={event.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-muted-foreground">{formatAppDateTime(event.at)} {APP_TIME_ZONE_LABEL}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{event.feature}</td>
                    <td className="px-4 py-3 text-muted-foreground">{event.model}</td>
                    <td className="px-4 py-3 text-foreground">{formatNumber(event.totalTokens)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{event.status}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-sm text-muted-foreground">No AI usage recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sg-panel space-y-4 p-6">
        {Object.entries(LABELS).map(([key, label]) => (
          <div key={key}>
            <label className="sg-label mb-1 block">{label}</label>
            <input
              type={key === 'DISCOURSE_API_KEY' ? 'password' : 'text'}
              value={config[key] || ''}
              readOnly
              className={inputCls}
            />
          </div>
        ))}
      </div>

      <div className="sg-panel overflow-hidden p-0">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">Automation Schedule</h2>
          <p className="mt-1 text-sm text-muted-foreground">Automation schedule in {APP_TIME_ZONE_LABEL}.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Job</th>
                <th className="px-4 py-3 text-left font-semibold">Endpoint</th>
                <th className="px-4 py-3 text-left font-semibold">{APP_TIME_ZONE_LABEL}</th>
                <th className="px-4 py-3 text-left font-semibold">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {(health?.jobs || []).map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{item.job}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{item.endpoint}</td>
                  <td className="px-4 py-3 text-foreground">{item.utc}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">Settings are read from server environment variables.</p>
    </div>
  );
}
