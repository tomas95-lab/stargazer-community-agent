import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'crypto';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { BotConfig } from '../src/config';
import { writeDataJSON } from '../src/data-store';
import { ProjectContext } from '../src/project-context';

export type ProjectAgentMode = 'draft' | 'supervised' | 'auto';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

export interface QmProjectRow {
  id: string;
  owner_id: string;
  owner_email: string;
  owner_name: string;
  project_name: string;
  community_base_url: string;
  community_category_id: string;
  community_category_slug: string;
  community_chat_channel_id: string;
  discourse_username: string;
  discourse_api_client_id: string;
  discourse_api_key_ciphertext: string;
  project_guidelines: string;
  war_room_link: string;
  agent_mode: ProjectAgentMode;
  auto_reply_enabled: boolean;
  min_confidence: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface QmProjectInput {
  ownerName?: string;
  projectName?: string;
  communityBaseUrl?: string;
  categoryId?: string;
  categorySlug?: string;
  channelId?: string;
  discourseUsername?: string;
  discourseApiClientId?: string;
  discourseApiKey?: string;
  projectGuidelines?: string;
  warRoomLink?: string;
  agentMode?: ProjectAgentMode;
  autoReplyEnabled?: boolean;
  minConfidence?: number;
}

export interface QmProjectPublic {
  id: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  projectName: string;
  communityBaseUrl: string;
  categoryId: string;
  categorySlug: string;
  channelId: string;
  discourseUsername: string;
  discourseApiClientId: string;
  discourseApiKeyConfigured: boolean;
  projectGuidelines: string;
  projectGuidelinesCharacters: number;
  warRoomLink: string;
  agentMode: ProjectAgentMode;
  autoReplyEnabled: boolean;
  minConfidence: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const TABLE = 'qm_projects';
const USER_KEYS_TABLE = 'user_discourse_keys';
let supabaseAdmin: SupabaseClient | null = null;

function env(key: string): string {
  return process.env[key]?.trim() || '';
}

export function isPlatformConfigured(): boolean {
  return Boolean(env('SUPABASE_URL') && (env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')));
}

export function getSupabaseAdmin(): SupabaseClient {
  if (!isPlatformConfigured()) {
    throw new Error('Supabase platform env vars are not configured.');
  }

  if (!supabaseAdmin) {
    supabaseAdmin = createClient(
      env('SUPABASE_URL'),
      env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  }

  return supabaseAdmin;
}

export function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function clampConfidence(value: unknown): number {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return 0.5;
  return Math.max(0, Math.min(1, parsed));
}

function agentMode(value: unknown): ProjectAgentMode {
  return value === 'auto' || value === 'supervised' || value === 'draft' ? value : 'supervised';
}

function encryptionSecret(): string {
  return env('PLATFORM_ENCRYPTION_KEY') || env('SUPABASE_JWT_SECRET') || env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
}

function encryptionKey(): Buffer {
  const secret = encryptionSecret();
  if (!secret) throw new Error('PLATFORM_ENCRYPTION_KEY is required to encrypt project credentials.');
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptSecret(value: string): string {
  if (!value.startsWith('enc:v1:')) return value;
  const [, , ivRaw, tagRaw, encryptedRaw] = value.split(':');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function adminTokenMatches(value: string): boolean {
  const configured = env('ADMIN_TOKEN');
  return Boolean(configured && value && safeEquals(value, configured));
}

function userName(user: User): string {
  return text(user.user_metadata?.name) || text(user.user_metadata?.full_name) || text(user.email).split('@')[0] || 'QM';
}

export async function getUserFromAccessToken(accessToken: string): Promise<AuthenticatedUser> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new Error(error?.message || 'Invalid Supabase session.');
  }

  return {
    id: data.user.id,
    email: data.user.email || '',
    name: userName(data.user),
  };
}

function publicProject(row: QmProjectRow): QmProjectPublic {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerEmail: row.owner_email,
    ownerName: row.owner_name,
    projectName: row.project_name,
    communityBaseUrl: row.community_base_url,
    categoryId: row.community_category_id,
    categorySlug: row.community_category_slug,
    channelId: row.community_chat_channel_id,
    discourseUsername: row.discourse_username,
    discourseApiClientId: row.discourse_api_client_id,
    discourseApiKeyConfigured: Boolean(row.discourse_api_key_ciphertext),
    projectGuidelines: row.project_guidelines,
    projectGuidelinesCharacters: row.project_guidelines.length,
    warRoomLink: row.war_room_link,
    agentMode: row.agent_mode,
    autoReplyEnabled: row.auto_reply_enabled,
    minConfidence: row.min_confidence,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toPublicProject(row: QmProjectRow): QmProjectPublic {
  return publicProject(row);
}

export interface UserDiscourseKeyRow {
  owner_id: string;
  discourse_api_key_ciphertext: string;
  discourse_username: string;
  api_version: string;
  nonce: string;
  created_at: string;
  updated_at: string;
}

export async function getUserDiscourseKey(userId: string): Promise<UserDiscourseKeyRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(USER_KEYS_TABLE)
    .select('*')
    .eq('owner_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as UserDiscourseKeyRow | null;
}

function normalizeProjectInput(
  input: QmProjectInput,
  user: AuthenticatedUser,
  existing?: QmProjectRow,
  storedDiscourseKeyCiphertext?: string,
): Partial<QmProjectRow> {
  const discourseApiKey = text(input.discourseApiKey);
  const projectName = text(input.projectName, existing?.project_name || 'Community project');
  const categoryId = text(input.categoryId, existing?.community_category_id || '');
  const channelId = text(input.channelId, existing?.community_chat_channel_id || '');

  if (!projectName) throw new Error('Project name is required.');
  if (!categoryId) throw new Error('Category ID is required.');
  if (!channelId) throw new Error('Community channel ID is required.');
  if (!existing && !discourseApiKey && !storedDiscourseKeyCiphertext) {
    throw new Error('Connect Discourse or paste a Discourse API key before saving this project.');
  }

  return {
    owner_id: user.id,
    owner_email: user.email,
    owner_name: text(input.ownerName, existing?.owner_name || user.name),
    project_name: projectName,
    community_base_url: text(input.communityBaseUrl, existing?.community_base_url || 'https://community.outlier.ai').replace(/\/+$/, ''),
    community_category_id: categoryId,
    community_category_slug: text(input.categorySlug, existing?.community_category_slug || ''),
    community_chat_channel_id: channelId,
    discourse_username: text(input.discourseUsername, existing?.discourse_username || ''),
    discourse_api_client_id: text(input.discourseApiClientId, existing?.discourse_api_client_id || 'daily-thread-bot'),
    ...(discourseApiKey
      ? { discourse_api_key_ciphertext: encryptSecret(discourseApiKey) }
      : !existing && storedDiscourseKeyCiphertext
        ? { discourse_api_key_ciphertext: storedDiscourseKeyCiphertext }
        : {}),
    project_guidelines: text(input.projectGuidelines, existing?.project_guidelines || ''),
    war_room_link: text(input.warRoomLink, existing?.war_room_link || ''),
    agent_mode: agentMode(input.agentMode || existing?.agent_mode),
    auto_reply_enabled: input.autoReplyEnabled ?? existing?.auto_reply_enabled ?? false,
    min_confidence: clampConfidence(input.minConfidence ?? existing?.min_confidence),
    enabled: true,
    updated_at: new Date().toISOString(),
  };
}

export async function listUserProjects(userId: string): Promise<QmProjectRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []) as QmProjectRow[];
}

export async function getUserProject(userId: string, projectId: string): Promise<QmProjectRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select('*')
    .eq('owner_id', userId)
    .eq('id', projectId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as QmProjectRow | null;
}

export async function getActiveUserProject(userId: string, projectId?: string): Promise<QmProjectRow | null> {
  if (projectId) return getUserProject(userId, projectId);
  const projects = await listUserProjects(userId);
  return projects.find((project) => project.enabled) || projects[0] || null;
}

export async function createUserProject(user: AuthenticatedUser, input: QmProjectInput): Promise<QmProjectRow> {
  const storedKey = await getUserDiscourseKey(user.id);
  const hydratedInput = storedKey && !text(input.discourseUsername)
    ? { ...input, discourseUsername: storedKey.discourse_username }
    : input;
  const payload = normalizeProjectInput(hydratedInput, user, undefined, storedKey?.discourse_api_key_ciphertext);
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert(payload)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  const project = data as QmProjectRow;
  await initializeProjectFiles(project);
  return project;
}

export async function updateUserProject(user: AuthenticatedUser, projectId: string, input: QmProjectInput): Promise<QmProjectRow> {
  const existing = await getUserProject(user.id, projectId);
  if (!existing) throw new Error('Project not found.');

  const payload = normalizeProjectInput(input, user, existing);
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update(payload)
    .eq('owner_id', user.id)
    .eq('id', projectId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as QmProjectRow;
}

async function initializeProjectFiles(row: QmProjectRow): Promise<void> {
  const base = `data/projects/${row.id}`;
  await Promise.all([
    writeDataJSON(`${base}/topics.json`, [], `initialize ${row.project_name} topics`),
    writeDataJSON(`${base}/webinars.json`, [], `initialize ${row.project_name} sessions`),
    writeDataJSON(`${base}/links.json`, {
      warRoom: row.war_room_link,
      guidelines: '',
      templatesZip: '',
      validationScript: '',
      stargazerEval: '',
      commonErrorsDocument: '',
    }, `initialize ${row.project_name} links`),
    writeDataJSON(`${base}/project-memory.json`, {
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
        {
          id: 'project-name',
          title: 'Project name',
          body: `The active project is ${row.project_name}.`,
          source: 'project settings',
        },
        {
          id: 'war-room-hours',
          title: 'War Room hours',
          body: 'The War Room is open Monday through Friday from 11:15 AM to 7:00 PM ARG. It is closed Saturdays and Sundays.',
          source: 'platform default',
        },
      ],
    }, `initialize ${row.project_name} memory`),
  ]);
}

export function projectBotConfig(row: QmProjectRow): BotConfig {
  return {
    communityBaseUrl: row.community_base_url || 'https://community.outlier.ai',
    communityCategoryId: row.community_category_id,
    communityCategorySlug: row.community_category_slug,
    communityChatChannelId: row.community_chat_channel_id,
    discourseApiKey: decryptSecret(row.discourse_api_key_ciphertext),
    discourseApiClientId: row.discourse_api_client_id || 'daily-thread-bot',
    discourseUsername: row.discourse_username,
  };
}

export function projectRuntimeContext(row: QmProjectRow): ProjectContext {
  return {
    projectId: row.id,
    source: 'header',
    projectName: row.project_name,
    ownerId: row.owner_id,
    botConfig: projectBotConfig(row),
    projectGuidelines: row.project_guidelines,
    projectLinks: {
      warRoom: row.war_room_link,
      guidelines: '',
      templatesZip: '',
      validationScript: '',
      stargazerEval: '',
      commonErrorsDocument: '',
    },
  };
}
