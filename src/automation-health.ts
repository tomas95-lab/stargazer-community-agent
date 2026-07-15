import { OperationLogEntry, readOperationLog } from './operations-log';

export interface AutomationJobDefinition {
  id: string;
  title: string;
  job: string;
  endpoint: string;
  utc: string;
  purpose: string;
  action: string;
}

export interface AutomationProviderJob {
  provider: 'cron-job.org';
  jobId: number;
  title: string;
  enabled: boolean;
  url: string;
  timezone?: string;
  nextExecution?: string;
  lastExecution?: string;
  lastStatus: number;
  lastStatusLabel: string;
}

export interface AutomationHealthJob extends AutomationJobDefinition {
  provider?: AutomationProviderJob;
  lastCronRequest?: OperationLogEntry;
  lastAppResult?: OperationLogEntry;
  health: 'ok' | 'warning' | 'error' | 'pending';
  healthReason: string;
}

export interface AutomationHealthResult {
  generatedAt: string;
  providerConfigured: boolean;
  providerError?: string;
  jobs: AutomationHealthJob[];
}

interface CronJobOrgListJob {
  jobId: number;
  title: string;
  enabled: boolean;
  url: string;
  nextExecution?: number;
  lastExecution?: number;
  lastStatus?: number;
  schedule?: {
    timezone?: string;
  };
}

interface CronJobOrgJobsResponse {
  jobs?: CronJobOrgListJob[];
}

const CRON_JOB_ORG_API = 'https://api.cron-job.org';
const MATCH_WINDOW_MS = 15 * 60 * 1000;

export const AUTOMATION_JOBS: AutomationJobDefinition[] = [
  {
    id: 'daily-thread-1000',
    title: 'Daily Thread 13:00 UTC',
    job: 'Daily Thread',
    endpoint: '/api/cron/daily-thread/1000',
    utc: '13:00 UTC Mon-Fri',
    purpose: 'Primary weekday publish attempt',
    action: 'daily_publish_job',
  },
  {
    id: 'daily-thread-1100',
    title: 'Daily Thread retry 14:00 UTC',
    job: 'Daily Thread',
    endpoint: '/api/cron/daily-thread/1100',
    utc: '14:00 UTC Mon-Fri',
    purpose: 'Weekday retry if not already published',
    action: 'daily_publish_job',
  },
  {
    id: 'community-agent-1000',
    title: 'Community Agent 13:00 UTC',
    job: 'Community Agent',
    endpoint: '/api/cron/community-agent/1000',
    utc: '13:00 UTC',
    purpose: 'Community check',
    action: 'community_agent',
  },
  {
    id: 'community-agent-1130',
    title: 'Community Agent 14:30 UTC',
    job: 'Community Agent',
    endpoint: '/api/cron/community-agent/1130',
    utc: '14:30 UTC',
    purpose: 'Community check',
    action: 'community_agent',
  },
  {
    id: 'community-agent-1300',
    title: 'Community Agent 16:00 UTC',
    job: 'Community Agent',
    endpoint: '/api/cron/community-agent/1300',
    utc: '16:00 UTC',
    purpose: 'Community check',
    action: 'community_agent',
  },
  {
    id: 'community-agent-1430',
    title: 'Community Agent 17:30 UTC',
    job: 'Community Agent',
    endpoint: '/api/cron/community-agent/1430',
    utc: '17:30 UTC',
    purpose: 'Community check',
    action: 'community_agent',
  },
  {
    id: 'community-agent-1600',
    title: 'Community Agent 19:00 UTC',
    job: 'Community Agent',
    endpoint: '/api/cron/community-agent/1600',
    utc: '19:00 UTC',
    purpose: 'Community check',
    action: 'community_agent',
  },
  {
    id: 'community-agent-1730',
    title: 'Community Agent 20:30 UTC',
    job: 'Community Agent',
    endpoint: '/api/cron/community-agent/1730',
    utc: '20:30 UTC',
    purpose: 'Community check',
    action: 'community_agent',
  },
  {
    id: 'community-agent-1900',
    title: 'Community Agent 22:00 UTC',
    job: 'Community Agent',
    endpoint: '/api/cron/community-agent/1900',
    utc: '22:00 UTC',
    purpose: 'Final community check',
    action: 'community_agent',
  },
  {
    id: 'dm-review-1530',
    title: 'DM Review 18:30 UTC',
    job: 'DM Review',
    endpoint: '/api/cron/dm-review/1530',
    utc: '18:30 UTC',
    purpose: 'Afternoon DM scan',
    action: 'dm_review',
  },
  {
    id: 'dm-review-1800',
    title: 'DM Review 21:00 UTC',
    job: 'DM Review',
    endpoint: '/api/cron/dm-review/1800',
    utc: '21:00 UTC',
    purpose: 'End-of-day DM scan',
    action: 'dm_review',
  },
];

function secondsToIso(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return new Date(value * 1000).toISOString();
}

function cronJobStatusLabel(value: number): string {
  if (value === 0) return 'not_run';
  if (value === 1) return 'success';
  if (value === 2) return 'dns_error';
  if (value === 3) return 'connection_error';
  if (value === 4) return 'http_error';
  if (value === 5) return 'timeout';
  if (value === 6) return 'too_much_response_data';
  if (value === 7) return 'invalid_url';
  if (value === 8) return 'internal_error';
  if (value === 9) return 'unknown_error';
  return `status_${value}`;
}

function normalizeProviderJob(job: CronJobOrgListJob): AutomationProviderJob {
  const lastStatus = typeof job.lastStatus === 'number' ? job.lastStatus : 0;
  return {
    provider: 'cron-job.org',
    jobId: job.jobId,
    title: job.title,
    enabled: job.enabled,
    url: job.url,
    timezone: job.schedule?.timezone,
    nextExecution: secondsToIso(job.nextExecution),
    lastExecution: secondsToIso(job.lastExecution),
    lastStatus,
    lastStatusLabel: cronJobStatusLabel(lastStatus),
  };
}

async function fetchCronJobOrgJobs(): Promise<{ jobs: AutomationProviderJob[]; error?: string; configured: boolean }> {
  const apiKey = process.env.CRON_JOB_ORG_API_KEY || process.env.CRONJOB_ORG_API_KEY || '';
  if (!apiKey.trim()) return { jobs: [], configured: false };

  try {
    const response = await fetch(`${CRON_JOB_ORG_API}/jobs`, {
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
      },
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) as CronJobOrgJobsResponse : {};
    if (!response.ok) throw new Error(text || response.statusText);
    return {
      jobs: (body.jobs || []).map(normalizeProviderJob),
      configured: true,
    };
  } catch (err) {
    return {
      jobs: [],
      configured: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function endpointFromEntry(entry: OperationLogEntry): string | undefined {
  const metadata = entry.metadata || {};
  const endpoint = metadata.endpoint;
  return typeof endpoint === 'string' ? endpoint : undefined;
}

function findLastCronRequest(entries: OperationLogEntry[], endpoint: string): OperationLogEntry | undefined {
  return entries.find((entry) => entry.action === 'cron_request' && endpointFromEntry(entry) === endpoint);
}

function providerForEndpoint(jobs: AutomationProviderJob[], endpoint: string): AutomationProviderJob | undefined {
  return jobs.find((job) => {
    try {
      return new URL(job.url).pathname === endpoint;
    } catch {
      return job.url.includes(endpoint);
    }
  });
}

function withinMatchWindow(entryAt: string, referenceAt: string): boolean {
  const entryTime = new Date(entryAt).getTime();
  const referenceTime = new Date(referenceAt).getTime();
  return Number.isFinite(entryTime) &&
    Number.isFinite(referenceTime) &&
    entryTime >= referenceTime &&
    entryTime - referenceTime <= MATCH_WINDOW_MS;
}

function nearMatchWindow(entryAt: string, referenceAt: string): boolean {
  const entryTime = new Date(entryAt).getTime();
  const referenceTime = new Date(referenceAt).getTime();
  return Number.isFinite(entryTime) &&
    Number.isFinite(referenceTime) &&
    Math.abs(entryTime - referenceTime) <= MATCH_WINDOW_MS;
}

function findMatchingCronRequest(
  entries: OperationLogEntry[],
  endpoint: string,
  referenceAt?: string,
): OperationLogEntry | undefined {
  const matches = entries.filter((entry) => entry.action === 'cron_request' && endpointFromEntry(entry) === endpoint);
  if (!referenceAt) return matches[0];
  return matches.find((entry) => nearMatchWindow(entry.at, referenceAt));
}

function findLastAppResult(
  entries: OperationLogEntry[],
  action: string,
  referenceAt?: string,
): OperationLogEntry | undefined {
  if (!referenceAt) return undefined;
  return entries.find((entry) => entry.action === action && withinMatchWindow(entry.at, referenceAt));
}

function isCronRequestResult(entry: OperationLogEntry | undefined): boolean {
  return entry?.action === 'cron_request';
}

function healthFor(
  provider: AutomationProviderJob | undefined,
  appResult: OperationLogEntry | undefined,
): Pick<AutomationHealthJob, 'health' | 'healthReason'> {
  if (!provider) return { health: 'pending', healthReason: 'No external scheduler job found yet.' };
  if (!provider.enabled) return { health: 'error', healthReason: 'External scheduler job is disabled.' };
  if (!provider.lastExecution) return { health: 'pending', healthReason: 'Scheduled but not executed yet.' };
  if (!appResult && provider.lastStatusLabel !== 'success') {
    return { health: 'error', healthReason: `External scheduler failed with ${provider.lastStatusLabel}.` };
  }
  if (!appResult) return { health: 'pending', healthReason: 'Waiting for the app execution log.' };
  if (appResult.status === 'error') return { health: 'error', healthReason: appResult.message };
  if (provider.lastStatusLabel !== 'success') {
    return { health: 'ok', healthReason: `App completed. External scheduler reported ${provider.lastStatusLabel}.` };
  }
  if (isCronRequestResult(appResult)) return { health: 'ok', healthReason: appResult.message };
  if (appResult.status === 'skipped') return { health: 'ok', healthReason: appResult.message };
  return { health: 'ok', healthReason: appResult.message };
}

export async function getAutomationHealth(): Promise<AutomationHealthResult> {
  const [providerResult, entries] = await Promise.all([
    fetchCronJobOrgJobs(),
    readOperationLog(500),
  ]);
  const jobs = AUTOMATION_JOBS.map((definition): AutomationHealthJob => {
    const provider = providerForEndpoint(providerResult.jobs, definition.endpoint);
    const cronRequest = findMatchingCronRequest(entries, definition.endpoint, provider?.lastExecution)
      || (!provider?.lastExecution ? findLastCronRequest(entries, definition.endpoint) : undefined);
    const referenceAt = cronRequest?.at || provider?.lastExecution;
    const appResult = findLastAppResult(entries, definition.action, referenceAt) || cronRequest;
    const health = healthFor(provider, appResult);

    return {
      ...definition,
      provider,
      lastCronRequest: cronRequest,
      lastAppResult: appResult,
      ...health,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    providerConfigured: providerResult.configured,
    providerError: providerResult.error,
    jobs,
  };
}
