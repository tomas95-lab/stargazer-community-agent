import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { api, type AiUsageSummary, type AutomationHealthJob, type AutomationHealthResult } from '../api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const LABELS: Record<string, string> = {
  COMMUNITY_BASE_URL: 'Community Base URL',
  COMMUNITY_CATEGORY_ID: 'Category ID',
  COMMUNITY_CATEGORY_SLUG: 'Category Slug',
  COMMUNITY_CHAT_CHANNEL_ID: 'Chat Channel ID',
  DISCOURSE_API_KEY: 'Discourse API Key',
  DISCOURSE_API_CLIENT_ID: 'Discourse API Client ID',
  DISCOURSE_USERNAME: 'Discourse Username',
  DATA_STORE_REQUESTED: 'Data Store Requested',
  DATA_STORE_ACTIVE: 'Data Store Active',
  ANTHROPIC_CONFIGURED: 'Legacy Claude Fallback',
  ANTHROPIC_MODEL: 'Legacy Claude Model',
  CRON_CONFIGURED: 'Cron Configured',
  AGENT_AUTO_POST: 'Agent Auto Post',
  AGENT_THREAD_SCAN_LIMIT: 'Agent Thread Scan Limit',
  AGENT_THREAD_MESSAGE_COUNT: 'Agent Thread Message Count',
  DM_AUTO_REPLY: 'DM Auto Reply',
  DM_AUTO_REPLY_MAX: 'DM Auto Reply Max',
  AI_DAILY_TOKEN_LIMIT: 'AI Daily Token Limit',
  AI_DAILY_CALL_LIMIT: 'AI Daily Call Limit',
  AI_GUARDRAILS_ENFORCE: 'AI Guardrails Enforced',
  PLATFORM_CONFIGURED: 'Platform Configured',
  PLATFORM_ENCRYPTION_CONFIGURED: 'Platform Encryption Configured',
};

function formatUtcDate(value?: string): string {
  if (!value) return 'Not yet';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function healthClass(value: AutomationHealthJob['health']): string {
  if (value === 'ok') return 'sg-status-success';
  if (value === 'warning') return 'sg-status-warning';
  if (value === 'error') return 'sg-status-danger';
  return 'border-border bg-secondary text-secondary-foreground';
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
  const [config, setConfig] = useState<Record<string, string>>({});
  const [health, setHealth] = useState<AutomationHealthResult | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState('');
  const [usage, setUsage] = useState<AiUsageSummary | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState('');

  useEffect(() => {
    api.getConfig().then(setConfig);
    loadHealth();
    loadUsage();
  }, []);

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
    <div className="space-y-6 px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <span className="rounded-full border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">Environment managed</span>
      </div>

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
                        {item.health}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{item.title}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{item.endpoint}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <p>{formatUtcDate(item.provider?.lastExecution || item.lastCronRequest?.at)} UTC</p>
                      <p className="mt-1 text-xs">{item.provider?.lastStatusLabel || item.lastCronRequest?.status || '-'}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <p>{formatUtcDate(item.lastAppResult?.at)} UTC</p>
                      <p className="mt-1 text-xs">{item.lastAppResult?.status || '-'}</p>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {formatUtcDate(item.provider?.nextExecution)} UTC
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
            <h2 className="text-lg font-semibold text-foreground">AI Cost Guardrails</h2>
            <p className="mt-1 text-sm text-muted-foreground">Daily calls and token usage tracked from local Claude requests.</p>
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
            <p className="mt-1 text-xs text-muted-foreground">{usage?.utcDate || usage?.argentinaDate || 'UTC day'}</p>
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
                    <td className="px-4 py-3 text-muted-foreground">{formatUtcDate(event.at)} UTC</td>
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
          <p className="mt-1 text-sm text-muted-foreground">Automation schedule in UTC.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Job</th>
                <th className="px-4 py-3 text-left font-semibold">Endpoint</th>
                <th className="px-4 py-3 text-left font-semibold">UTC</th>
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
