import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'crypto';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { BotConfig } from '../src/config';
import { deleteDataPath, readDataJSON, writeDataJSON } from '../src/data-store';
import {
  canonicalProjectId,
  isLegacyProjectId,
  LEGACY_PROJECT_ALIAS,
  LEGACY_PROJECT_ID,
  ProjectContext,
} from '../src/project-context';

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
  project_key?: string;
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
  projectKey?: string;
  projectName?: string;
  communityBaseUrl?: string;
  categoryId?: string;
  categorySlug?: string;
  channelId?: string;
  discourseUsername?: string;
  discourseApiClientId?: string;
  discourseApiKey?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
  aiDailyTokenLimit?: number | null;
  aiDailyCallLimit?: number | null;
  projectGuidelines?: string;
  warRoomLink?: string;
  agentMode?: ProjectAgentMode;
  autoReplyEnabled?: boolean;
  minConfidence?: number;
  enabled?: boolean;
}

export interface QmProjectPublic {
  id: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  projectKey: string;
  projectName: string;
  communityBaseUrl: string;
  categoryId: string;
  categorySlug: string;
  channelId: string;
  discourseUsername: string;
  discourseApiClientId: string;
  discourseApiKeyConfigured: boolean;
  anthropicApiKeyConfigured: boolean;
  anthropicModel: string;
  aiDailyTokenLimit: number | null;
  aiDailyCallLimit: number | null;
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
const USER_AI_KEYS_TABLE = 'user_ai_keys';
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

export interface DeletedProjectResult {
  project: QmProjectRow;
  projectKey: string;
  removedProjectData: boolean;
  remainingProjectConnections: number;
}

function positiveIntOrNull(value: unknown, fallback: number | null = null): number | null {
  if (value === undefined) return fallback;
  if (value === null || value === '') return null;
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function anthropicModel(value: unknown, fallback = 'claude-haiku-4-5'): string {
  return text(value, fallback) || fallback;
}

function envFallback(key: string, fallback = ''): string {
  return env(key) || fallback;
}

function looksLikeStargazer(value: string): boolean {
  return value.toLowerCase().includes('stargazer');
}

export function projectKeyFromRow(row: Pick<QmProjectRow, 'id' | 'project_name' | 'project_key'>): string {
  const explicit = canonicalProjectId(row.project_key || '');
  if (explicit) return explicit;
  if (looksLikeStargazer(row.project_name || '')) return LEGACY_PROJECT_ID;
  return canonicalProjectId(row.project_name || '') || canonicalProjectId(row.id) || LEGACY_PROJECT_ID;
}

function projectKeyFromInput(input: QmProjectInput, existing?: QmProjectRow): string {
  const explicit = canonicalProjectId(input.projectKey || '');
  if (explicit) return explicit;
  if (existing) return projectKeyFromRow(existing);
  const fromName = canonicalProjectId(input.projectName || '');
  if (fromName) return fromName;
  return LEGACY_PROJECT_ID;
}

function legacyStargazerDefaults(projectKey: string): Partial<QmProjectRow> {
  if (!isLegacyProjectId(projectKey)) return {};
  return {
    project_name: 'TESTING PROJECT',
    community_base_url: envFallback('COMMUNITY_BASE_URL', 'https://community.outlier.ai'),
    community_category_id: envFallback('COMMUNITY_CATEGORY_ID', '15895'),
    community_category_slug: envFallback('COMMUNITY_CATEGORY_SLUG', 'stargazer-axiom'),
    community_chat_channel_id: envFallback('COMMUNITY_CHAT_CHANNEL_ID', '828853'),
  };
}

function missingProjectKeyColumn(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /project_key/i.test(message) && /column|schema cache|could not find/i.test(message);
}

function projectKeyLookupValues(projectKey: string): string[] {
  const key = canonicalProjectId(projectKey);
  if (!key) return [];
  return isLegacyProjectId(key) ? [LEGACY_PROJECT_ID, LEGACY_PROJECT_ALIAS] : [key];
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

function publicProject(row: QmProjectRow, aiKey?: UserAiKeyRow | null): QmProjectPublic {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerEmail: row.owner_email,
    ownerName: row.owner_name,
    projectKey: projectKeyFromRow(row),
    projectName: row.project_name,
    communityBaseUrl: row.community_base_url,
    categoryId: row.community_category_id,
    categorySlug: row.community_category_slug,
    channelId: row.community_chat_channel_id,
    discourseUsername: row.discourse_username,
    discourseApiClientId: row.discourse_api_client_id,
    discourseApiKeyConfigured: Boolean(row.discourse_api_key_ciphertext),
    anthropicApiKeyConfigured: Boolean(aiKey?.anthropic_api_key_ciphertext),
    anthropicModel: anthropicModel(aiKey?.anthropic_model),
    aiDailyTokenLimit: positiveIntOrNull(aiKey?.ai_daily_token_limit),
    aiDailyCallLimit: positiveIntOrNull(aiKey?.ai_daily_call_limit),
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

export function toPublicProject(row: QmProjectRow, aiKey?: UserAiKeyRow | null): QmProjectPublic {
  return publicProject(row, aiKey);
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

export interface UserAiKeyRow {
  owner_id: string;
  anthropic_api_key_ciphertext: string;
  anthropic_model: string;
  ai_daily_token_limit: number | null;
  ai_daily_call_limit: number | null;
  created_at: string;
  updated_at: string;
}

export async function getUserAiKey(userId: string): Promise<UserAiKeyRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(USER_AI_KEYS_TABLE)
    .select('*')
    .eq('owner_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as UserAiKeyRow | null;
}

function hasAiInput(input: QmProjectInput): boolean {
  return Boolean(
    text(input.anthropicApiKey)
    || input.anthropicModel !== undefined
    || input.aiDailyTokenLimit !== undefined
    || input.aiDailyCallLimit !== undefined
  );
}

export async function saveUserAiKey(userId: string, input: QmProjectInput): Promise<UserAiKeyRow | null> {
  const existing = await getUserAiKey(userId);
  if (!existing && !hasAiInput(input)) return null;

  const anthropicApiKey = text(input.anthropicApiKey);
  const payload: Partial<UserAiKeyRow> & { owner_id: string } = {
    owner_id: userId,
    anthropic_model: anthropicModel(input.anthropicModel, existing?.anthropic_model || 'claude-haiku-4-5'),
    ai_daily_token_limit: positiveIntOrNull(input.aiDailyTokenLimit, existing?.ai_daily_token_limit ?? null),
    ai_daily_call_limit: positiveIntOrNull(input.aiDailyCallLimit, existing?.ai_daily_call_limit ?? null),
    updated_at: new Date().toISOString(),
    ...(anthropicApiKey
      ? { anthropic_api_key_ciphertext: encryptSecret(anthropicApiKey) }
      : existing
        ? {}
        : { anthropic_api_key_ciphertext: '' }),
  };

  const { data, error } = await getSupabaseAdmin()
    .from(USER_AI_KEYS_TABLE)
    .upsert(payload, { onConflict: 'owner_id' })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as UserAiKeyRow;
}

function normalizeProjectInput(
  input: QmProjectInput,
  user: AuthenticatedUser,
  existing?: QmProjectRow,
  storedDiscourseKeyCiphertext?: string,
  shared?: QmProjectRow | null,
): Partial<QmProjectRow> {
  const discourseApiKey = text(input.discourseApiKey);
  const projectKey = projectKeyFromInput(input, existing);
  const legacyDefaults = legacyStargazerDefaults(projectKey);
  const projectName = text(input.projectName, existing?.project_name || shared?.project_name || legacyDefaults.project_name || 'Community project');
  const categoryId = text(input.categoryId, existing?.community_category_id || shared?.community_category_id || legacyDefaults.community_category_id || '');
  const channelId = text(input.channelId, existing?.community_chat_channel_id || shared?.community_chat_channel_id || legacyDefaults.community_chat_channel_id || '');
  const discourseUsername = text(input.discourseUsername, existing?.discourse_username || '');

  if (!projectName) throw new Error('Project name is required.');
  if (!projectKey) throw new Error('Project ID is required.');
  if (!categoryId) throw new Error('Category ID is required.');
  if (!channelId) throw new Error('Community channel ID is required.');
  if (!discourseUsername) throw new Error('Discourse username is required so the agent can identify your own Community messages.');
  if (!existing && !discourseApiKey && !storedDiscourseKeyCiphertext) {
    throw new Error('Connect Discourse or paste a Discourse API key before saving this project.');
  }

  return {
    owner_id: user.id,
    owner_email: user.email,
    owner_name: text(input.ownerName, existing?.owner_name || user.name),
    project_key: projectKey,
    project_name: projectName,
    community_base_url: text(input.communityBaseUrl, existing?.community_base_url || shared?.community_base_url || legacyDefaults.community_base_url || 'https://community.outlier.ai').replace(/\/+$/, ''),
    community_category_id: categoryId,
    community_category_slug: text(input.categorySlug, existing?.community_category_slug || shared?.community_category_slug || legacyDefaults.community_category_slug || ''),
    community_chat_channel_id: channelId,
    discourse_username: discourseUsername,
    discourse_api_client_id: text(input.discourseApiClientId, existing?.discourse_api_client_id || 'daily-thread-bot'),
    ...(discourseApiKey
      ? { discourse_api_key_ciphertext: encryptSecret(discourseApiKey) }
      : !existing && storedDiscourseKeyCiphertext
        ? { discourse_api_key_ciphertext: storedDiscourseKeyCiphertext }
        : {}),
    project_guidelines: text(input.projectGuidelines, existing?.project_guidelines || shared?.project_guidelines || ''),
    war_room_link: text(input.warRoomLink, existing?.war_room_link || shared?.war_room_link || ''),
    agent_mode: agentMode(input.agentMode || existing?.agent_mode),
    auto_reply_enabled: input.autoReplyEnabled ?? existing?.auto_reply_enabled ?? false,
    min_confidence: clampConfidence(input.minConfidence ?? existing?.min_confidence),
    enabled: existing?.enabled ?? shared?.enabled ?? true,
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

export async function listEnabledProjectConnections(): Promise<QmProjectRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select('*')
    .eq('enabled', true)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []) as QmProjectRow[];
}

export async function projectAutomationPaused(projectKey: string): Promise<boolean> {
  const key = canonicalProjectId(projectKey);
  if (!key) return false;

  try {
    const { data, error } = await getSupabaseAdmin()
      .from(TABLE)
      .select('enabled')
      .in('project_key', projectKeyLookupValues(key));
    if (error) throw new Error(error.message);
    const rows = (data || []) as Pick<QmProjectRow, 'enabled'>[];
    return rows.length > 0 && rows.every((row) => row.enabled === false);
  } catch (err) {
    if (missingProjectKeyColumn(err)) return false;
    throw err;
  }
}

export function uniqueProjectConnections(rows: QmProjectRow[]): QmProjectRow[] {
  const byProjectKey = new Map<string, QmProjectRow>();
  for (const row of rows) {
    const key = projectKeyFromRow(row);
    if (!byProjectKey.has(key)) byProjectKey.set(key, row);
  }
  return Array.from(byProjectKey.values());
}

export async function getUserProject(userId: string, projectId: string): Promise<QmProjectRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select('*')
    .eq('owner_id', userId)
    .eq('id', projectId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data) return data as QmProjectRow;

  try {
    const { data: byKey, error: byKeyError } = await getSupabaseAdmin()
      .from(TABLE)
      .select('*')
      .eq('owner_id', userId)
      .in('project_key', projectKeyLookupValues(projectId))
      .order('created_at', { ascending: true })
      .limit(1);

    if (byKeyError) throw new Error(byKeyError.message);
    return (byKey?.[0] || null) as QmProjectRow | null;
  } catch (err) {
    if (missingProjectKeyColumn(err)) return null;
    throw err;
  }
}

export async function getActiveUserProject(userId: string, projectId?: string): Promise<QmProjectRow | null> {
  if (projectId) return getUserProject(userId, projectId);
  const projects = await listUserProjects(userId);
  return projects.find((project) => project.enabled) || projects[0] || null;
}

export async function getSharedProjectConnection(projectKey: string, includePaused = false): Promise<QmProjectRow | null> {
  const key = canonicalProjectId(projectKey);
  if (!key) return null;

  try {
    let query = getSupabaseAdmin()
      .from(TABLE)
      .select('*')
      .in('project_key', projectKeyLookupValues(key))
      .order('created_at', { ascending: true })
      .limit(1);
    if (!includePaused) query = query.eq('enabled', true);
    const { data, error } = await query;

    if (error) throw new Error(error.message);
    return (data?.[0] || null) as QmProjectRow | null;
  } catch (err) {
    if (missingProjectKeyColumn(err)) return null;
    throw err;
  }
}

async function insertProjectPayload(payload: Partial<QmProjectRow>): Promise<QmProjectRow> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .insert(payload)
    .select('*')
    .single();

  if (!error) return data as QmProjectRow;
  if (!missingProjectKeyColumn(new Error(error.message))) throw new Error(error.message);

  const fallbackPayload = { ...payload };
  delete fallbackPayload.project_key;
  const retry = await getSupabaseAdmin()
    .from(TABLE)
    .insert(fallbackPayload)
    .select('*')
    .single();

  if (retry.error) throw new Error(retry.error.message);
  return retry.data as QmProjectRow;
}

async function updateProjectPayload(userId: string, projectId: string, payload: Partial<QmProjectRow>): Promise<QmProjectRow> {
  const query = getSupabaseAdmin()
    .from(TABLE)
    .update(payload)
    .eq('owner_id', userId)
    .eq('id', projectId)
    .select('*')
    .single();
  const { data, error } = await query;

  if (!error) return data as QmProjectRow;
  if (!missingProjectKeyColumn(new Error(error.message))) throw new Error(error.message);

  const fallbackPayload = { ...payload };
  delete fallbackPayload.project_key;
  const retry = await getSupabaseAdmin()
    .from(TABLE)
    .update(fallbackPayload)
    .eq('owner_id', userId)
    .eq('id', projectId)
    .select('*')
    .single();

  if (retry.error) throw new Error(retry.error.message);
  return retry.data as QmProjectRow;
}

export async function createUserProject(user: AuthenticatedUser, input: QmProjectInput): Promise<QmProjectRow> {
  const storedKey = await getUserDiscourseKey(user.id);
  const hydratedInput = storedKey && !text(input.discourseUsername)
    ? { ...input, discourseUsername: storedKey.discourse_username }
    : input;
  const shared = await getSharedProjectConnection(projectKeyFromInput(hydratedInput));
  const payload = normalizeProjectInput(hydratedInput, user, undefined, storedKey?.discourse_api_key_ciphertext, shared);
  const project = await insertProjectPayload(payload);
  await initializeProjectFiles(project);
  await syncSharedProjectFields(project).catch(() => undefined);
  return project;
}

export async function updateUserProject(user: AuthenticatedUser, projectId: string, input: QmProjectInput): Promise<QmProjectRow> {
  const existing = await getUserProject(user.id, projectId);
  if (!existing) throw new Error('Project not found.');

  const shared = await getSharedProjectConnection(projectKeyFromInput(input, existing));
  const payload = normalizeProjectInput(input, user, existing, undefined, shared?.id === existing.id ? null : shared);
  const project = await updateProjectPayload(user.id, projectId, payload);
  await initializeProjectFiles(project);
  await syncSharedProjectFields(project).catch(() => undefined);
  return project;
}

export async function setProjectAutomationPaused(userId: string, projectId: string, paused: boolean): Promise<QmProjectRow> {
  const existing = await getUserProject(userId, projectId);
  if (!existing) throw new Error('Project not found.');

  const patch = { enabled: !paused, updated_at: new Date().toISOString() };
  const projectKey = projectKeyFromRow(existing);
  try {
    const { error } = await getSupabaseAdmin()
      .from(TABLE)
      .update(patch)
      .in('project_key', projectKeyLookupValues(projectKey));
    if (error) throw new Error(error.message);
  } catch (err) {
    if (!missingProjectKeyColumn(err)) throw err;
    const { error } = await getSupabaseAdmin()
      .from(TABLE)
      .update(patch)
      .eq('owner_id', userId)
      .eq('id', existing.id);
    if (error) throw new Error(error.message);
  }

  return (await getUserProject(userId, existing.id)) || { ...existing, ...patch };
}

async function countProjectConnections(projectKey: string): Promise<number> {
  const key = canonicalProjectId(projectKey);
  if (!key) return 0;

  try {
    const { count, error } = await getSupabaseAdmin()
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .in('project_key', projectKeyLookupValues(key));

    if (error) throw new Error(error.message);
    return count || 0;
  } catch (err) {
    if (missingProjectKeyColumn(err)) return 1;
    throw err;
  }
}

async function deleteProjectFiles(projectKey: string, projectName: string): Promise<boolean> {
  const key = canonicalProjectId(projectKey);
  if (!key || isLegacyProjectId(key)) return false;

  await Promise.all([
    deleteDataPath(`data/projects/${key}`, `delete ${projectName} project data`),
    deleteDataPath(`output/projects/${key}`, `delete ${projectName} project output`),
  ]);
  return true;
}

export async function deleteUserProject(userId: string, projectId: string): Promise<DeletedProjectResult> {
  const existing = await getUserProject(userId, projectId);
  if (!existing) throw new Error('Project not found.');

  const projectKey = projectKeyFromRow(existing);
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .delete()
    .eq('owner_id', userId)
    .eq('id', existing.id);

  if (error) throw new Error(error.message);

  const remainingProjectConnections = await countProjectConnections(projectKey);
  const removedProjectData = remainingProjectConnections === 0
    ? await deleteProjectFiles(projectKey, existing.project_name)
    : false;

  return {
    project: existing,
    projectKey,
    removedProjectData,
    remainingProjectConnections,
  };
}

async function writeDataJSONIfMissing<T>(filePath: string, data: T, message: string): Promise<void> {
  try {
    await readDataJSON<T>(filePath);
  } catch {
    await writeDataJSON(filePath, data, message);
  }
}

async function syncSharedProjectFields(row: QmProjectRow): Promise<void> {
  const projectKey = projectKeyFromRow(row);
  if (!projectKey) return;

  const patch = {
    project_name: row.project_name,
    community_base_url: row.community_base_url,
    community_category_id: row.community_category_id,
    community_category_slug: row.community_category_slug,
    community_chat_channel_id: row.community_chat_channel_id,
    project_guidelines: row.project_guidelines,
    war_room_link: row.war_room_link,
    updated_at: new Date().toISOString(),
  };

  try {
    const { error } = await getSupabaseAdmin()
      .from(TABLE)
      .update(patch)
      .eq('project_key', projectKey)
      .neq('id', row.id);
    if (error) throw new Error(error.message);
  } catch (err) {
    if (!missingProjectKeyColumn(err)) throw err;
  }
}

async function initializeProjectFiles(row: QmProjectRow): Promise<void> {
  const projectKey = projectKeyFromRow(row);
  if (isLegacyProjectId(projectKey)) return;

  const base = `data/projects/${projectKey}`;
  await Promise.all([
    writeDataJSONIfMissing(`${base}/topics.json`, [], `initialize ${row.project_name} topics`),
    writeDataJSONIfMissing(`${base}/webinars.json`, [], `initialize ${row.project_name} sessions`),
    writeDataJSONIfMissing(`${base}/links.json`, {
      warRoom: row.war_room_link,
      guidelines: '',
      templatesZip: '',
      validationScript: '',
      stargazerEval: '',
      commonErrorsDocument: '',
    }, `initialize ${row.project_name} links`),
    writeDataJSONIfMissing(`${base}/project-memory.json`, {
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

export function projectRuntimeContext(row: QmProjectRow, aiKey?: UserAiKeyRow | null): ProjectContext {
  const projectLinks: ProjectContext['projectLinks'] = {};
  if (text(row.war_room_link)) projectLinks.warRoom = text(row.war_room_link);
  const anthropicApiKey = text(aiKey?.anthropic_api_key_ciphertext)
    ? decryptSecret(aiKey!.anthropic_api_key_ciphertext)
    : '';

  return {
    projectId: projectKeyFromRow(row),
    source: 'header',
    projectName: row.project_name,
    ownerId: row.owner_id,
    automationPaused: row.enabled === false,
    botConfig: projectBotConfig(row),
    aiConfig: {
      anthropicApiKey,
      anthropicModel: anthropicModel(aiKey?.anthropic_model),
      dailyTokenLimit: positiveIntOrNull(aiKey?.ai_daily_token_limit),
      dailyCallLimit: positiveIntOrNull(aiKey?.ai_daily_call_limit),
    },
    ...(text(row.project_guidelines) ? { projectGuidelines: text(row.project_guidelines) } : {}),
    ...(Object.keys(projectLinks).length > 0 ? { projectLinks } : {}),
  };
}

export async function projectRuntimeContextForRow(row: QmProjectRow): Promise<ProjectContext> {
  const aiKey = await getUserAiKey(row.owner_id);
  return projectRuntimeContext(row, aiKey);
}
