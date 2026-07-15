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

export interface ProjectContext {
  projectId: string;
  source: ProjectContextSource;
  projectName?: string;
  ownerId?: string;
  botConfig?: RuntimeBotConfig;
  projectGuidelines?: string;
  projectLinks?: RuntimeProjectLinks;
  projectMemoryFacts?: RuntimeProjectMemoryFact[];
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
