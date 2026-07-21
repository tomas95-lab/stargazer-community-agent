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
export type ProjectRole = 'owner' | 'admin' | 'qm' | 'viewer';
export type ProjectStatus = 'setup' | 'active' | 'paused' | 'completed' | 'archived';

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
  role?: ProjectRole;
  status?: ProjectStatus;
  archived_at?: string | null;
  settings?: Record<string, unknown>;
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
  guidelinesSourceName?: string;
  guidelinesChangeSummary?: string;
  warRoomLink?: string;
  agentMode?: ProjectAgentMode;
  autoReplyEnabled?: boolean;
  minConfidence?: number;
  enabled?: boolean;
  status?: ProjectStatus;
  settings?: Record<string, unknown>;
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
  role: ProjectRole;
  status: ProjectStatus;
  archivedAt: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const TABLE = 'qm_projects';
const USER_KEYS_TABLE = 'user_discourse_keys';
const USER_AI_KEYS_TABLE = 'user_ai_keys';
const AUDIT_TABLE = 'platform_audit_events';
const GUIDELINE_VERSIONS_TABLE = 'project_guideline_versions';
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

function projectRole(value: unknown): ProjectRole {
  return value === 'admin' || value === 'qm' || value === 'viewer' || value === 'owner' ? value : 'owner';
}

function projectStatus(value: unknown, enabled = true): ProjectStatus {
  return value === 'setup' || value === 'active' || value === 'paused' || value === 'completed' || value === 'archived'
    ? value
    : enabled ? 'active' : 'paused';
}

function canManageProject(row: QmProjectRow): boolean {
  return projectRole(row.role) !== 'viewer';
}

export interface GuidelineVersionSummary {
  id: string;
  projectKey: string;
  authorName: string;
  authorEmail: string;
  sourceFileName: string;
  changeSummary: string;
  characters: number;
  restoredFrom: string;
  createdAt: string;
}

function guidelineVersionSummary(row: Record<string, unknown>): GuidelineVersionSummary {
  return {
    id: text(row.id),
    projectKey: text(row.project_key),
    authorName: text(row.author_name),
    authorEmail: text(row.author_email),
    sourceFileName: text(row.source_file_name),
    changeSummary: text(row.change_summary),
    characters: Number(row.characters || 0),
    restoredFrom: text(row.restored_from),
    createdAt: text(row.created_at),
  };
}

export interface DeletedProjectResult {
  project: QmProjectRow;
  projectKey: string;
  removedProjectData: boolean;
  remainingProjectConnections: number;
}

export async function appendAuditEvent(input: {
  actorId?: string;
  projectKey: string;
  action: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await getSupabaseAdmin().from(AUDIT_TABLE).insert({
    actor_id: input.actorId || null,
    project_key: canonicalProjectId(input.projectKey),
    action: input.action,
    target_type: input.targetType || '',
    target_id: input.targetId || '',
    before_data: input.before ?? null,
    after_data: input.after ?? null,
    metadata: input.metadata || {},
  });
  if (error) console.warn('Could not write platform audit event:', error.message);
}

export async function listProjectMembers(userId: string, projectId: string): Promise<Array<{ id: string; name: string; email: string; role: ProjectRole; enabled: boolean }>> {
  const project = await getUserProject(userId, projectId);
  if (!project) throw new Error('Project not found.');
  const { data, error } = await getSupabaseAdmin().from(TABLE)
    .select('id,owner_name,owner_email,role,enabled')
    .eq('project_key', projectKeyFromRow(project))
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({ id: row.id, name: row.owner_name, email: row.owner_email, role: projectRole(row.role), enabled: row.enabled }));
}

export async function updateProjectMemberRole(userId: string, projectId: string, memberId: string, role: ProjectRole): Promise<void> {
  const project = await getUserProject(userId, projectId);
  if (!project) throw new Error('Project not found.');
  if (projectRole(project.role) !== 'owner') throw new Error('Only a project owner can change member roles.');
  const { data: member, error: memberError } = await getSupabaseAdmin().from(TABLE).select('id,owner_id,role')
    .eq('id', memberId).eq('project_key', projectKeyFromRow(project)).maybeSingle();
  if (memberError) throw new Error(memberError.message);
  if (!member) throw new Error('Project member not found.');
  if (member.owner_id === userId && role !== 'owner') throw new Error('Transfer ownership before changing your own owner role.');
  const { error } = await getSupabaseAdmin().from(TABLE).update({ role, updated_at: new Date().toISOString() }).eq('id', memberId);
  if (error) throw new Error(error.message);
  await appendAuditEvent({ actorId: userId, projectKey: projectKeyFromRow(project), action: 'project.member_role_changed', targetType: 'member', targetId: memberId, before: { role: member.role }, after: { role } });
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
    community_category_id: envFallback('COMMUNITY_CATEGORY_ID'),
    community_category_slug: envFallback('COMMUNITY_CATEGORY_SLUG', 'testing-project'),
    community_chat_channel_id: envFallback('COMMUNITY_CHAT_CHANNEL_ID'),
  };
}

function missingProjectKeyColumn(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /project_key/i.test(message) && /column|schema cache|could not find/i.test(message);
}

function missingGuidelineVersionsTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message || error || '');
  return /project_guideline_versions/i.test(message) && /does not exist|schema cache|could not find|PGRST205|42P01/i.test(message);
}

function guidelineVersionsMigrationError(): Error {
  return new Error('Guidelines history is unavailable until the pending Supabase database migration is applied.');
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
    role: projectRole(row.role),
    status: projectStatus(row.status, row.enabled),
    archivedAt: row.archived_at || '',
    settings: row.settings && typeof row.settings === 'object' ? row.settings : {},
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

export async function saveUserDiscourseKey(
  userId: string,
  apiKey: string,
  username = '',
  apiVersion = '',
  nonce = '',
): Promise<UserDiscourseKeyRow> {
  const key = text(apiKey);
  if (!key) throw new Error('Discourse API key is required.');
  const existing = await getUserDiscourseKey(userId);
  const encryptedKey = encryptSecret(key);
  const now = new Date().toISOString();
  const payload = {
    owner_id: userId,
    discourse_api_key_ciphertext: encryptedKey,
    discourse_username: text(username, existing?.discourse_username || ''),
    api_version: text(apiVersion, existing?.api_version || ''),
    nonce: text(nonce, existing?.nonce || `manual-${Date.now()}`),
    updated_at: now,
  };
  const { data, error } = await getSupabaseAdmin()
    .from(USER_KEYS_TABLE)
    .upsert(payload, { onConflict: 'owner_id' })
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  const projectPatch: Record<string, string> = {
    discourse_api_key_ciphertext: encryptedKey,
    updated_at: now,
  };
  if (payload.discourse_username) projectPatch.discourse_username = payload.discourse_username;
  const { error: projectError } = await getSupabaseAdmin()
    .from(TABLE)
    .update(projectPatch)
    .eq('owner_id', userId);
  if (projectError) throw new Error(projectError.message);
  return data as UserDiscourseKeyRow;
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
    status: projectStatus(input.status ?? existing?.status ?? shared?.status, existing?.enabled ?? shared?.enabled ?? true),
    settings: input.settings ?? existing?.settings ?? shared?.settings ?? {},
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
    .neq('status', 'archived')
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

async function recordGuidelineVersion(
  project: QmProjectRow,
  user: AuthenticatedUser,
  input: { content: string; sourceFileName?: string; changeSummary?: string; restoredFrom?: string },
): Promise<GuidelineVersionSummary | null> {
  const content = input.content.trim();
  if (!content) return null;
  const projectKey = projectKeyFromRow(project);
  const latest = await getSupabaseAdmin().from(GUIDELINE_VERSIONS_TABLE)
    .select('id,content')
    .eq('project_key', projectKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) {
    if (missingGuidelineVersionsTable(latest.error)) return null;
    throw new Error(latest.error.message);
  }
  if (latest.data?.content === content && !input.restoredFrom) return null;

  const { data, error } = await getSupabaseAdmin().from(GUIDELINE_VERSIONS_TABLE).insert({
    project_key: projectKey,
    author_id: user.id,
    author_name: user.name,
    author_email: user.email,
    content,
    characters: content.length,
    source_file_name: text(input.sourceFileName),
    change_summary: text(input.changeSummary, input.restoredFrom ? 'Restored a previous guidelines version.' : 'Updated project guidelines.'),
    restored_from: input.restoredFrom || null,
  }).select('id,project_key,author_name,author_email,source_file_name,change_summary,characters,restored_from,created_at').single();
  if (error) {
    if (missingGuidelineVersionsTable(error)) return null;
    throw new Error(error.message);
  }
  return guidelineVersionSummary(data as Record<string, unknown>);
}

export async function listGuidelineVersions(userId: string, projectId: string, limit = 30): Promise<GuidelineVersionSummary[]> {
  const project = await getUserProject(userId, projectId);
  if (!project) throw new Error('Project not found.');
  const { data, error } = await getSupabaseAdmin().from(GUIDELINE_VERSIONS_TABLE)
    .select('id,project_key,author_name,author_email,source_file_name,change_summary,characters,restored_from,created_at')
    .eq('project_key', projectKeyFromRow(project))
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(100, limit)));
  if (error) {
    if (missingGuidelineVersionsTable(error)) throw guidelineVersionsMigrationError();
    throw new Error(error.message);
  }
  return (data || []).map((row) => guidelineVersionSummary(row as Record<string, unknown>));
}

export async function getGuidelineVersion(userId: string, projectId: string, versionId: string): Promise<GuidelineVersionSummary & { content: string }> {
  const project = await getUserProject(userId, projectId);
  if (!project) throw new Error('Project not found.');
  const { data, error } = await getSupabaseAdmin().from(GUIDELINE_VERSIONS_TABLE)
    .select('*')
    .eq('id', versionId)
    .eq('project_key', projectKeyFromRow(project))
    .single();
  if (error) {
    if (missingGuidelineVersionsTable(error)) throw guidelineVersionsMigrationError();
    throw new Error(error.message);
  }
  return { ...guidelineVersionSummary(data as Record<string, unknown>), content: text(data.content) };
}

export async function restoreGuidelineVersion(user: AuthenticatedUser, projectId: string, versionId: string): Promise<QmProjectRow> {
  const project = await getUserProject(user.id, projectId);
  if (!project) throw new Error('Project not found.');
  if (!['owner', 'admin'].includes(projectRole(project.role))) throw new Error('Only a project owner or admin can restore guidelines.');
  const version = await getGuidelineVersion(user.id, projectId, versionId);
  const projectKey = projectKeyFromRow(project);
  const { error } = await getSupabaseAdmin().from(TABLE).update({
    project_guidelines: version.content,
    updated_at: new Date().toISOString(),
  }).eq('project_key', projectKey);
  if (error) throw new Error(error.message);
  await recordGuidelineVersion(project, user, {
    content: version.content,
    sourceFileName: version.sourceFileName,
    changeSummary: `Restored version from ${version.createdAt}.`,
    restoredFrom: version.id,
  });
  await appendAuditEvent({
    actorId: user.id,
    projectKey,
    action: 'project.guidelines_restored',
    targetType: 'guideline_version',
    targetId: version.id,
    before: { characters: project.project_guidelines.length },
    after: { characters: version.content.length },
  });
  return (await getUserProject(user.id, projectId)) || { ...project, project_guidelines: version.content };
}

export async function getActiveUserProject(userId: string, projectId?: string): Promise<QmProjectRow | null> {
  if (projectId) return getUserProject(userId, projectId);
  const projects = await listUserProjects(userId);
  return projects.find((project) => project.enabled && project.status !== 'archived')
    || projects.find((project) => project.status !== 'archived')
    || null;
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

export async function getSharedProjectSummary(projectKey: string): Promise<{
  projectKey: string;
  projectName: string;
  communityBaseUrl: string;
  categoryId: string;
  categorySlug: string;
  channelId: string;
  projectGuidelines: string;
  warRoomLink: string;
  agentMode: ProjectAgentMode;
  autoReplyEnabled: boolean;
  minConfidence: number;
  status: ProjectStatus;
  settings: Record<string, unknown>;
} | null> {
  const project = await getSharedProjectConnection(projectKey, true);
  if (!project) return null;
  return {
    projectKey: projectKeyFromRow(project),
    projectName: project.project_name,
    communityBaseUrl: project.community_base_url,
    categoryId: project.community_category_id,
    categorySlug: project.community_category_slug,
    channelId: project.community_chat_channel_id,
    projectGuidelines: project.project_guidelines,
    warRoomLink: project.war_room_link,
    agentMode: project.agent_mode,
    autoReplyEnabled: project.auto_reply_enabled,
    minConfidence: Number(project.min_confidence),
    status: projectStatus(project.status, project.enabled),
    settings: project.settings || {},
  };
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
  const storedKey = text(input.discourseApiKey)
    ? await saveUserDiscourseKey(user.id, input.discourseApiKey!, text(input.discourseUsername))
    : await getUserDiscourseKey(user.id);
  const hydratedInput = storedKey && !text(input.discourseUsername)
    ? { ...input, discourseUsername: storedKey.discourse_username }
    : input;
  const projectKey = projectKeyFromInput(hydratedInput);
  const userAlreadyConnected = (await listUserProjects(user.id))
    .some((project) => projectKeyFromRow(project) === projectKey);
  if (userAlreadyConnected) throw new Error('This project is already connected to your workspace.');
  const shared = await getSharedProjectConnection(projectKey, true);
  const projectInput = shared ? {
    ...hydratedInput,
    projectKey: projectKeyFromRow(shared),
    projectName: shared.project_name,
    communityBaseUrl: shared.community_base_url,
    categoryId: shared.community_category_id,
    categorySlug: shared.community_category_slug,
    channelId: shared.community_chat_channel_id,
    projectGuidelines: shared.project_guidelines,
    warRoomLink: shared.war_room_link,
    agentMode: shared.agent_mode,
    autoReplyEnabled: shared.auto_reply_enabled,
    minConfidence: Number(shared.min_confidence),
    status: projectStatus(shared.status, shared.enabled),
    settings: shared.settings || {},
  } : hydratedInput;
  const payload = {
    ...normalizeProjectInput(projectInput, user, undefined, storedKey?.discourse_api_key_ciphertext, shared),
    role: shared ? 'qm' as const : 'owner' as const,
  };
  const project = await insertProjectPayload(payload);
  await initializeProjectFiles(project);
  if (!shared) await syncSharedProjectFields(project).catch(() => undefined);
  if (!shared && project.project_guidelines.trim()) {
    await recordGuidelineVersion(project, user, {
      content: project.project_guidelines,
      sourceFileName: input.guidelinesSourceName,
      changeSummary: input.guidelinesChangeSummary || 'Initial project guidelines.',
    }).catch((err) => console.warn('Could not create initial guideline version:', err instanceof Error ? err.message : err));
  }
  await appendAuditEvent({ actorId: user.id, projectKey: projectKeyFromRow(project), action: shared ? 'project.joined' : 'project.created', targetType: 'project', targetId: project.id, after: toPublicProject(project) });
  return project;
}

export async function updateUserProject(user: AuthenticatedUser, projectId: string, input: QmProjectInput): Promise<QmProjectRow> {
  const existing = await getUserProject(user.id, projectId);
  if (!existing) throw new Error('Project not found.');
  if (text(input.discourseApiKey)) {
    await saveUserDiscourseKey(user.id, input.discourseApiKey!, text(input.discourseUsername, existing.discourse_username));
  }

  const changesSharedConfiguration = [
    input.projectKey,
    input.projectName,
    input.communityBaseUrl,
    input.categoryId,
    input.categorySlug,
    input.channelId,
    input.projectGuidelines,
    input.warRoomLink,
    input.settings,
  ].some((value) => value !== undefined);
  if (changesSharedConfiguration && !canManageProject(existing)) {
    throw new Error('Your project role does not allow editing shared settings.');
  }

  const shared = await getSharedProjectConnection(projectKeyFromInput(input, existing));
  const payload = normalizeProjectInput(input, user, existing, undefined, shared?.id === existing.id ? null : shared);
  const project = await updateProjectPayload(user.id, projectId, payload);
  await initializeProjectFiles(project);
  await syncSharedProjectFields(project).catch(() => undefined);
  if (input.projectGuidelines !== undefined && existing.project_guidelines.trim() !== project.project_guidelines.trim()) {
    await recordGuidelineVersion(project, user, {
      content: project.project_guidelines,
      sourceFileName: input.guidelinesSourceName,
      changeSummary: input.guidelinesChangeSummary,
    }).catch((err) => console.warn('Could not create guideline version:', err instanceof Error ? err.message : err));
  }
  await appendAuditEvent({ actorId: user.id, projectKey: projectKeyFromRow(project), action: 'project.updated', targetType: 'project', targetId: project.id, before: toPublicProject(existing), after: toPublicProject(project) });
  return project;
}

export async function setProjectAutomationPaused(userId: string, projectId: string, paused: boolean): Promise<QmProjectRow> {
  const existing = await getUserProject(userId, projectId);
  if (!existing) throw new Error('Project not found.');
  if (!canManageProject(existing)) throw new Error('Your project role does not allow pausing this project.');

  const patch: Pick<QmProjectRow, 'enabled' | 'status' | 'updated_at'> = {
    enabled: !paused,
    status: paused ? 'paused' : 'active',
    updated_at: new Date().toISOString(),
  };
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

export async function setProjectLifecycleStatus(userId: string, projectId: string, status: ProjectStatus): Promise<QmProjectRow> {
  const existing = await getUserProject(userId, projectId);
  if (!existing) throw new Error('Project not found.');
  if (!canManageProject(existing)) throw new Error('Your project role does not allow changing project status.');
  const projectKey = projectKeyFromRow(existing);
  const patch = {
    status,
    enabled: status === 'active',
    archived_at: status === 'archived' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await getSupabaseAdmin().from(TABLE).update(patch).eq('project_key', projectKey);
  if (error) throw new Error(error.message);
  await appendAuditEvent({ actorId: userId, projectKey, action: 'project.status_changed', targetType: 'project', targetId: existing.id, before: { status: existing.status }, after: { status } });
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
  if (!canManageProject(existing)) throw new Error('Your project role does not allow archiving this project.');

  const projectKey = projectKeyFromRow(existing);
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ enabled: false, status: 'archived', archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('project_key', projectKey);

  if (error) throw new Error(error.message);

  return {
    project: existing,
    projectKey,
    removedProjectData: false,
    remainingProjectConnections: await countProjectConnections(projectKey),
  };
}

export async function restoreUserProject(userId: string, projectId: string): Promise<QmProjectRow> {
  const existing = await getUserProject(userId, projectId);
  if (!existing) throw new Error('Project not found.');
  if (!canManageProject(existing)) throw new Error('Your project role does not allow restoring this project.');
  const projectKey = projectKeyFromRow(existing);
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ enabled: false, status: 'paused', archived_at: null, updated_at: new Date().toISOString() })
    .eq('project_key', projectKey);
  if (error) throw new Error(error.message);
  return (await getUserProject(userId, existing.id)) || { ...existing, enabled: false, status: 'paused', archived_at: null };
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
    agent_mode: row.agent_mode,
    auto_reply_enabled: row.auto_reply_enabled,
    min_confidence: row.min_confidence,
    settings: row.settings || {},
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

export function projectBotConfig(row: QmProjectRow, userKey?: UserDiscourseKeyRow | null): BotConfig {
  const keyCiphertext = text(userKey?.discourse_api_key_ciphertext) || row.discourse_api_key_ciphertext;
  return {
    communityBaseUrl: row.community_base_url || 'https://community.outlier.ai',
    communityCategoryId: row.community_category_id,
    communityCategorySlug: row.community_category_slug,
    communityChatChannelId: row.community_chat_channel_id,
    discourseApiKey: decryptSecret(keyCiphertext),
    discourseApiClientId: row.discourse_api_client_id || 'daily-thread-bot',
    discourseUsername: text(userKey?.discourse_username) || row.discourse_username,
  };
}

export async function projectBotConfigForRow(row: QmProjectRow): Promise<BotConfig> {
  return projectBotConfig(row, await getUserDiscourseKey(row.owner_id));
}

export function projectRuntimeContext(
  row: QmProjectRow,
  aiKey?: UserAiKeyRow | null,
  discourseKey?: UserDiscourseKeyRow | null,
): ProjectContext {
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
    automationSettings: {
      ...(row.settings && typeof row.settings === 'object' ? row.settings : {}),
      ...((row.settings as Record<string, unknown> | undefined)?.autoPost === undefined ? { autoPost: row.auto_reply_enabled } : {}),
    },
    agentPolicy: {
      minConfidence: row.min_confidence,
      blockedTopics: Array.isArray((row.settings as Record<string, unknown> | undefined)?.blockedTopics)
        ? (row.settings as Record<string, unknown>).blockedTopics as string[]
        : ['pay', 'payment', 'account suspension', 'disciplinary action', 'legal', 'eligibility decision'],
    },
    botConfig: projectBotConfig(row, discourseKey),
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
  const [aiKey, discourseKey] = await Promise.all([
    getUserAiKey(row.owner_id),
    getUserDiscourseKey(row.owner_id),
  ]);
  return projectRuntimeContext(row, aiKey, discourseKey);
}
