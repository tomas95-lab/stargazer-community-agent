import * as fs from 'fs';
import * as path from 'path';
import { readDataJSON, writeDataJSON, writeDataText } from './data-store';
import { PATHS } from './paths';
import { assertValidProjectId, canonicalProjectId, defaultProjectId, isLegacyProjectId, LEGACY_PROJECT_ID } from './project-context';

export type ProjectAgentMode = 'draft' | 'supervised' | 'auto';

export interface ProjectCredentialsConfig {
  discourseApiKeyEnv: string;
  discourseApiClientIdEnv: string;
  discourseUsernameEnv?: string;
  discourseUsername?: string;
}

export interface ProjectCommunityConfig {
  baseUrlEnv?: string;
  baseUrl?: string;
  categoryIdEnv?: string;
  categoryId?: string;
  categorySlugEnv?: string;
  categorySlug?: string;
  channelIdEnv?: string;
  channelId?: string;
}

export interface ProjectSupportConfig {
  timezone: string;
  weekdays: number[];
  warRoomOpenTime: string;
  startTime: string;
  endTime: string;
}

export interface ProjectPathsConfig {
  topics: string;
  links: string;
  webinars: string;
  guidelines: string;
  memory: string;
  outputDir: string;
}

export interface ProjectConfig {
  id: string;
  name: string;
  enabled: boolean;
  qm: {
    name: string;
    email: string;
  };
  community: ProjectCommunityConfig;
  credentials: ProjectCredentialsConfig;
  agent: {
    mode: ProjectAgentMode;
    autoReplyEnabled: boolean;
    minConfidence: number;
  };
  support: ProjectSupportConfig;
  paths: ProjectPathsConfig;
}

export interface ProjectRegistry {
  defaultProjectId: string;
  projects: ProjectConfig[];
}

export interface ProjectEnvStatus {
  key: string;
  label: string;
  configured: boolean;
  sensitive: boolean;
  value?: string;
}

export interface ProjectView extends ProjectConfig {
  env: ProjectEnvStatus[];
  missingEnv: string[];
  resolved: {
    communityBaseUrl: string;
    categoryId: string;
    categorySlug: string;
    channelId: string;
    discourseUsername: string;
  };
}

export interface CreateProjectInput {
  id?: string;
  name?: string;
  qmName?: string;
  qmEmail?: string;
  discourseUsername?: string;
  categoryId?: string;
  categorySlug?: string;
  channelId?: string;
  baseUrl?: string;
  envPrefix?: string;
  discourseApiKeyEnv?: string;
  discourseApiClientIdEnv?: string;
  discourseUsernameEnv?: string;
  projectGuidelines?: string;
  warRoomLink?: string;
  mode?: ProjectAgentMode;
}

const REGISTRY_FILE = 'data/platform/projects.json';
const CACHE_MS = 30_000;
let registryCache: { loadedAt: number; value: ProjectRegistry } | null = null;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function envName(value: unknown): string {
  return text(value)
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96);
}

function projectEnvPrefix(projectId: string): string {
  return `PROJECT_${projectId.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
}

function clampConfidence(value: unknown): number {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return 0.5;
  return Math.max(0, Math.min(1, parsed));
}

function mode(value: unknown): ProjectAgentMode {
  return value === 'auto' || value === 'supervised' || value === 'draft' ? value : 'draft';
}

function defaultPaths(projectId: string): ProjectPathsConfig {
  if (isLegacyProjectId(projectId)) {
    return {
      topics: 'data/topics.json',
      links: 'data/links.json',
      webinars: 'data/webinars.json',
      guidelines: 'data/project-guidelines.txt',
      memory: 'data/project-memory.json',
      outputDir: 'output',
    };
  }

  return {
    topics: `data/projects/${projectId}/topics.json`,
    links: `data/projects/${projectId}/links.json`,
    webinars: `data/projects/${projectId}/webinars.json`,
    guidelines: `data/projects/${projectId}/project-guidelines.txt`,
    memory: `data/projects/${projectId}/project-memory.json`,
    outputDir: `output/projects/${projectId}`,
  };
}

export function defaultProjectConfig(): ProjectConfig {
  return {
    id: LEGACY_PROJECT_ID,
    name: 'TESTING PROJECT',
    enabled: true,
    qm: {
      name: 'Project QM',
      email: '',
    },
    community: {
      baseUrlEnv: 'COMMUNITY_BASE_URL',
      baseUrl: 'https://community.outlier.ai',
      categoryIdEnv: 'COMMUNITY_CATEGORY_ID',
      categoryId: '',
      categorySlugEnv: 'COMMUNITY_CATEGORY_SLUG',
      categorySlug: 'testing-project',
      channelIdEnv: 'COMMUNITY_CHAT_CHANNEL_ID',
      channelId: '',
    },
    credentials: {
      discourseApiKeyEnv: 'DISCOURSE_API_KEY',
      discourseApiClientIdEnv: 'DISCOURSE_API_CLIENT_ID',
      discourseUsernameEnv: 'DISCOURSE_USERNAME',
      discourseUsername: '',
    },
    agent: {
      mode: 'auto',
      autoReplyEnabled: false,
      minConfidence: 0.5,
    },
    support: {
      timezone: 'PST',
      weekdays: [1, 2, 3, 4, 5],
      warRoomOpenTime: '',
      startTime: '00:00',
      endTime: '23:59',
    },
    paths: defaultPaths(LEGACY_PROJECT_ID),
  };
}

function normalizePaths(input: unknown, projectId: string): ProjectPathsConfig {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const defaults = defaultPaths(projectId);
  return {
    topics: text(raw.topics) || defaults.topics,
    links: text(raw.links) || defaults.links,
    webinars: text(raw.webinars) || defaults.webinars,
    guidelines: text(raw.guidelines) || defaults.guidelines,
    memory: text(raw.memory) || defaults.memory,
    outputDir: text(raw.outputDir) || defaults.outputDir,
  };
}

export function normalizeProjectConfig(input: unknown): ProjectConfig {
  const defaults = defaultProjectConfig();
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const id = assertValidProjectId(text(raw.id) || defaults.id);
  const community = raw.community && typeof raw.community === 'object' ? raw.community as Record<string, unknown> : {};
  const credentials = raw.credentials && typeof raw.credentials === 'object' ? raw.credentials as Record<string, unknown> : {};
  const agent = raw.agent && typeof raw.agent === 'object' ? raw.agent as Record<string, unknown> : {};
  const support = raw.support && typeof raw.support === 'object' ? raw.support as Record<string, unknown> : {};
  const qm = raw.qm && typeof raw.qm === 'object' ? raw.qm as Record<string, unknown> : {};
  const prefix = projectEnvPrefix(id);

  return {
    id,
    name: text(raw.name) || (isLegacyProjectId(id) ? defaults.name : id),
    enabled: raw.enabled !== false,
    qm: {
      name: text(qm.name),
      email: text(qm.email),
    },
    community: {
      baseUrlEnv: envName(community.baseUrlEnv),
      baseUrl: text(community.baseUrl) || (isLegacyProjectId(id) ? defaults.community.baseUrl : 'https://community.outlier.ai'),
      categoryIdEnv: envName(community.categoryIdEnv),
      categoryId: text(community.categoryId),
      categorySlugEnv: envName(community.categorySlugEnv),
      categorySlug: text(community.categorySlug),
      channelIdEnv: envName(community.channelIdEnv),
      channelId: text(community.channelId),
    },
    credentials: {
      discourseApiKeyEnv: envName(credentials.discourseApiKeyEnv) || `${prefix}_DISCOURSE_API_KEY`,
      discourseApiClientIdEnv: envName(credentials.discourseApiClientIdEnv) || `${prefix}_DISCOURSE_API_CLIENT_ID`,
      discourseUsernameEnv: envName(credentials.discourseUsernameEnv),
      discourseUsername: text(credentials.discourseUsername),
    },
    agent: {
      mode: mode(agent.mode),
      autoReplyEnabled: agent.autoReplyEnabled === true,
      minConfidence: clampConfidence(agent.minConfidence),
    },
    support: {
      timezone: text(support.timezone) || defaults.support.timezone,
      weekdays: Array.isArray(support.weekdays)
        ? support.weekdays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
        : defaults.support.weekdays,
      warRoomOpenTime: text(support.warRoomOpenTime) || defaults.support.warRoomOpenTime,
      startTime: text(support.startTime) || defaults.support.startTime,
      endTime: text(support.endTime) || defaults.support.endTime,
    },
    paths: normalizePaths(raw.paths, id),
  };
}

export function normalizeProjectRegistry(input: unknown): ProjectRegistry {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const projects = Array.isArray(raw.projects)
    ? raw.projects.map(normalizeProjectConfig)
    : [];

  const byId = new Map<string, ProjectConfig>();
  for (const project of [defaultProjectConfig(), ...projects]) {
    byId.set(project.id, project);
  }

  const defaultId = canonicalProjectId(raw.defaultProjectId) || defaultProjectId();
  return {
    defaultProjectId: byId.has(defaultId) ? defaultId : LEGACY_PROJECT_ID,
    projects: [...byId.values()].sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export async function loadProjectRegistry(refresh = false): Promise<ProjectRegistry> {
  if (!refresh && registryCache && Date.now() - registryCache.loadedAt < CACHE_MS) {
    return registryCache.value;
  }

  let registry: ProjectRegistry;
  try {
    registry = normalizeProjectRegistry(await readDataJSON<unknown>(REGISTRY_FILE));
  } catch {
    registry = normalizeProjectRegistry({});
  }

  registryCache = { loadedAt: Date.now(), value: registry };
  return registry;
}

export function loadProjectRegistrySync(): ProjectRegistry {
  try {
    const raw = fs.readFileSync(path.resolve(PATHS.root, REGISTRY_FILE), 'utf-8');
    return normalizeProjectRegistry(JSON.parse(raw));
  } catch {
    return normalizeProjectRegistry({});
  }
}

export async function getProjectConfig(projectId?: string): Promise<ProjectConfig> {
  const registry = await loadProjectRegistry();
  const id = assertValidProjectId(projectId || registry.defaultProjectId);
  const project = registry.projects.find((item) => item.id === id);
  if (!project) throw new Error(`Project not found: ${id}`);
  return project;
}

export function getProjectConfigSync(projectId?: string): ProjectConfig {
  const registry = loadProjectRegistrySync();
  const id = assertValidProjectId(projectId || registry.defaultProjectId);
  const project = registry.projects.find((item) => item.id === id);
  if (!project) throw new Error(`Project not found: ${id}`);
  return project;
}

function envValue(envKey: string | undefined, fallback = ''): string {
  return envKey ? process.env[envKey] || fallback : fallback;
}

function envStatus(key: string | undefined, label: string, sensitive: boolean, fallback = ''): ProjectEnvStatus | null {
  if (!key) return null;
  const value = process.env[key] || fallback;
  return {
    key,
    label,
    sensitive,
    configured: Boolean(value),
    ...(sensitive ? {} : { value }),
  };
}

export function projectView(project: ProjectConfig): ProjectView {
  const statuses = [
    envStatus(project.credentials.discourseApiKeyEnv, 'Discourse API key', true),
    envStatus(project.credentials.discourseApiClientIdEnv, 'Discourse API client ID', false, 'daily-thread-bot'),
    envStatus(project.credentials.discourseUsernameEnv, 'Discourse username', false, project.credentials.discourseUsername),
    envStatus(project.community.baseUrlEnv, 'Community base URL', false, project.community.baseUrl),
    envStatus(project.community.categoryIdEnv, 'Category ID', false, project.community.categoryId),
    envStatus(project.community.categorySlugEnv, 'Category slug', false, project.community.categorySlug),
    envStatus(project.community.channelIdEnv, 'Channel ID', false, project.community.channelId),
  ].filter((item): item is ProjectEnvStatus => Boolean(item));

  return {
    ...project,
    env: statuses,
    missingEnv: statuses.filter((item) => !item.configured).map((item) => item.key),
    resolved: {
      communityBaseUrl: envValue(project.community.baseUrlEnv, project.community.baseUrl || 'https://community.outlier.ai'),
      categoryId: envValue(project.community.categoryIdEnv, project.community.categoryId),
      categorySlug: envValue(project.community.categorySlugEnv, project.community.categorySlug),
      channelId: envValue(project.community.channelIdEnv, project.community.channelId),
      discourseUsername: envValue(project.credentials.discourseUsernameEnv, project.credentials.discourseUsername),
    },
  };
}

export async function listProjectViews(): Promise<ProjectView[]> {
  const registry = await loadProjectRegistry();
  return registry.projects.map(projectView);
}

export async function saveProjectRegistry(registry: ProjectRegistry): Promise<ProjectRegistry> {
  const normalized = normalizeProjectRegistry(registry);
  await writeDataJSON(REGISTRY_FILE, normalized, 'update project registry');
  registryCache = { loadedAt: Date.now(), value: normalized };
  return normalized;
}

export async function createProject(input: CreateProjectInput): Promise<ProjectConfig> {
  const id = assertValidProjectId(input.id || input.name || '');
  if (isLegacyProjectId(id)) throw new Error('The Stargazer project already exists.');

  const registry = await loadProjectRegistry(true);
  if (registry.projects.some((project) => project.id === id)) {
    throw new Error(`Project already exists: ${id}`);
  }

  const prefix = envName(input.envPrefix) || projectEnvPrefix(id);
  const project = normalizeProjectConfig({
    id,
    name: text(input.name) || id,
    enabled: true,
    qm: {
      name: text(input.qmName),
      email: text(input.qmEmail),
    },
    community: {
      baseUrl: text(input.baseUrl) || 'https://community.outlier.ai',
      categoryId: text(input.categoryId),
      categorySlug: text(input.categorySlug),
      channelId: text(input.channelId),
    },
    credentials: {
      discourseApiKeyEnv: envName(input.discourseApiKeyEnv) || `${prefix}_DISCOURSE_API_KEY`,
      discourseApiClientIdEnv: envName(input.discourseApiClientIdEnv) || `${prefix}_DISCOURSE_API_CLIENT_ID`,
      discourseUsernameEnv: envName(input.discourseUsernameEnv),
      discourseUsername: text(input.discourseUsername),
    },
    agent: {
      mode: mode(input.mode),
      autoReplyEnabled: false,
      minConfidence: 0.5,
    },
    paths: defaultPaths(id),
  });

  await writeDataJSON(project.paths.topics, [], `initialize ${id} topics`);
  await writeDataJSON(project.paths.webinars, [], `initialize ${id} sessions`);
  await writeDataJSON(project.paths.links, {
    warRoom: text(input.warRoomLink),
    guidelines: '',
    templatesZip: '',
    validationScript: '',
    stargazerEval: '',
    commonErrorsDocument: '',
  }, `initialize ${id} links`);
  await writeDataText(project.paths.guidelines, text(input.projectGuidelines), `initialize ${id} guidelines`);
  await writeDataJSON(project.paths.memory, {
    updatedAt: new Date().toISOString(),
    facts: [
      {
        id: 'language',
        title: 'Support language',
        body: 'All user-facing community and DM replies must be written in English.',
        source: 'platform default',
      },
      {
        id: 'style',
        title: 'Writing style',
        body: 'Do not use the em dash character. Use commas, parentheses, or a regular hyphen instead.',
        source: 'platform default',
      },
    ],
  }, `initialize ${id} memory`);

  const next = await saveProjectRegistry({
    ...registry,
    projects: [...registry.projects, project],
  });

  return next.projects.find((item) => item.id === id) || project;
}
