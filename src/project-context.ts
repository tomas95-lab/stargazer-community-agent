import { AsyncLocalStorage } from 'async_hooks';

export const STARGAZER_PROJECT_ID = '69cd3d3788bf65e1468428b1';
export const LEGACY_PROJECT_ID = STARGAZER_PROJECT_ID;
export const LEGACY_PROJECT_ALIAS = 'stargazer';
export const PROJECT_ID_HEADER = 'x-project-id';

export type ProjectContextSource = 'header' | 'query' | 'env' | 'default';

export interface RuntimeBotConfig {
  communityBaseUrl: string;
  communityCategoryId: string;
  communityCategorySlug: string;
  communityChatChannelId: string;
  discourseApiKey: string;
  discourseApiClientId: string;
  discourseUsername: string;
}

export interface RuntimeProjectLinks {
  warRoom?: string;
  guidelines?: string;
  templatesZip?: string;
  validationScript?: string;
  stargazerEval?: string;
  commonErrorsDocument?: string;
}

export interface RuntimeProjectMemoryFact {
  id: string;
  title: string;
  body: string;
  source?: string;
}

export interface RuntimeAiConfig {
  anthropicApiKey?: string;
  anthropicModel?: string;
  dailyTokenLimit?: number | null;
  dailyCallLimit?: number | null;
  enforceLimits?: boolean;
}

export interface RuntimeAutomationSettings {
  timezone?: string;
  weekdays?: number[];
  startTime?: string;
  endTime?: string;
  autoPost?: boolean;
  autoReact?: boolean;
  dmAutoReply?: boolean;
  communityMaxAnswers?: number;
  dmMaxAutoReplies?: number;
}

export interface RuntimeAgentPolicy {
  minConfidence?: number;
  blockedTopics?: string[];
}

export interface ProjectContext {
  projectId: string;
  source: ProjectContextSource;
  projectName?: string;
  ownerId?: string;
  botConfig?: RuntimeBotConfig;
  aiConfig?: RuntimeAiConfig;
  projectGuidelines?: string;
  projectLinks?: RuntimeProjectLinks;
  projectMemoryFacts?: RuntimeProjectMemoryFact[];
  automationPaused?: boolean;
  automationSettings?: RuntimeAutomationSettings;
  agentPolicy?: RuntimeAgentPolicy;
  demoMode?: boolean;
}

const storage = new AsyncLocalStorage<ProjectContext>();

function normalizeProjectId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function sanitizeProjectId(value: unknown): string {
  if (typeof value !== 'string') return '';
  return normalizeProjectId(value);
}

export function isLegacyProjectId(value: unknown): boolean {
  const id = sanitizeProjectId(value);
  return id === LEGACY_PROJECT_ID || id === LEGACY_PROJECT_ALIAS;
}

export function canonicalProjectId(value: unknown): string {
  const id = sanitizeProjectId(value);
  if (!id) return '';
  return isLegacyProjectId(id) ? LEGACY_PROJECT_ID : id;
}

export function assertValidProjectId(value: unknown): string {
  const id = canonicalProjectId(value);
  if (!id || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(id)) {
    throw new Error('Invalid project id. Use lowercase letters, numbers, and hyphens.');
  }
  return id;
}

export function defaultProjectId(): string {
  return canonicalProjectId(process.env.DEFAULT_PROJECT_ID) || LEGACY_PROJECT_ID;
}

export function envProjectId(): string {
  return (
    canonicalProjectId(process.env.QM_PROJECT_ID) ||
    canonicalProjectId(process.env.PROJECT_ID) ||
    canonicalProjectId(process.env.TENANT_ID) ||
    defaultProjectId()
  );
}

export function getProjectContext(): ProjectContext {
  return storage.getStore() || { projectId: envProjectId(), source: process.env.QM_PROJECT_ID || process.env.PROJECT_ID || process.env.TENANT_ID ? 'env' : 'default' };
}

export function getCurrentProjectId(): string {
  return getProjectContext().projectId;
}

export function assertProjectAutomationActive(): void {
  if (getProjectContext().automationPaused) {
    throw new Error('This project is paused. Resume it from Projects before sending or publishing messages.');
  }
}

export function isDemoMode(): boolean {
  return getProjectContext().demoMode === true;
}

export function assertExternalWriteAllowed(): void {
  if (isDemoMode()) {
    throw new Error('Demo Mode blocks external Community writes. Use the simulated Community workspace instead.');
  }
}

export function projectScheduleAllowsNow(now = new Date()): boolean {
  const settings = getProjectContext().automationSettings;
  if (!settings) return true;
  const timezone = settings.timezone || 'America/Los_Angeles';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const weekdayName = parts.find((part) => part.type === 'weekday')?.value || '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayName);
  if (settings.weekdays?.length && !settings.weekdays.includes(weekday)) return false;
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  const current = hour * 60 + minute;
  const parse = (value: string | undefined, fallback: number) => {
    const match = value?.match(/^(\d{1,2}):(\d{2})$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
  };
  const start = parse(settings.startTime, 0);
  const end = parse(settings.endTime, 24 * 60 - 1);
  return start <= end ? current >= start && current <= end : current >= start || current <= end;
}

export function runWithProjectContext<T>(context: ProjectContext, fn: () => T): T {
  return storage.run(context, fn);
}

function normalizeRelativePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.includes('..')) {
    throw new Error(`Invalid data path: ${filePath}`);
  }
  return parts.join('/');
}

function shouldScope(filePath: string, projectId: string): boolean {
  if (!projectId || isLegacyProjectId(projectId)) return false;
  if (filePath.startsWith('data/platform/') || filePath.startsWith('data/projects/')) return false;
  if (filePath.startsWith('output/projects/')) return false;
  return true;
}

export function projectScopedDataPath(filePath: string, projectId = getCurrentProjectId()): string {
  const id = assertValidProjectId(projectId);
  const normalized = normalizeRelativePath(filePath);
  if (!shouldScope(normalized, id)) return normalized;

  const dataFiles = new Map<string, string>([
    ['data/topics.json', `data/projects/${id}/topics.json`],
    ['data/links.json', `data/projects/${id}/links.json`],
    ['data/webinars.json', `data/projects/${id}/webinars.json`],
    ['data/comms-templates.json', `data/projects/${id}/comms-templates.json`],
    ['data/composer-templates.json', `data/projects/${id}/composer-templates.json`],
    ['data/scheduled-messages.json', `data/projects/${id}/scheduled-messages.json`],
    ['data/project-guidelines.txt', `data/projects/${id}/project-guidelines.txt`],
    ['data/project-memory.json', `data/projects/${id}/project-memory.json`],
  ]);

  const directData = dataFiles.get(normalized);
  if (directData) return directData;

  if (normalized === 'output') return `output/projects/${id}`;
  if (normalized.startsWith('output/operation-details/')) {
    return normalized.replace('output/operation-details/', `output/projects/${id}/operation-details/`);
  }
  if (normalized.startsWith('output/')) {
    return normalized.replace('output/', `output/projects/${id}/`);
  }

  return normalized;
}
