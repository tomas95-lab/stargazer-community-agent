import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

export interface PlatformAuthUser {
  id: string;
  email: string;
  name: string;
}

export interface PlatformProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  enabled: boolean;
}

export interface PlatformProject {
  id: string;
  name: string;
  category: {
    id: string;
    slug: string;
  };
  channel: {
    id: string;
  };
  projectGuidelines: string;
  discourseApiKeyConfigured: boolean;
  enabled: boolean;
}

export interface PlatformContext {
  user: PlatformAuthUser;
  profile: PlatformProfile;
  projects: PlatformProject[];
}

export interface PlatformProjectInput {
  id?: unknown;
  name?: unknown;
  categoryId?: unknown;
  categorySlug?: unknown;
  channelId?: unknown;
  projectGuidelines?: unknown;
  discourseApiKey?: unknown;
  enabled?: unknown;
}

export interface NormalizedPlatformProjectInput {
  id?: string;
  name: string;
  categoryId: string;
  categorySlug: string;
  channelId: string;
  projectGuidelines: string;
  discourseApiKey?: string;
  enabled: boolean;
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function optionalUuid(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) {
    throw new Error('Invalid project id.');
  }
  return raw;
}

function bounded(value: unknown, label: string, max: number, fallback = ''): string {
  const raw = text(value, fallback);
  if (!raw) throw new Error(`${label} is required.`);
  if (raw.length > max) throw new Error(`${label} is too long.`);
  return raw;
}

export function supabasePlatformConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY && process.env.SUPABASE_SECRET_KEY);
}

function supabaseUrl(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error('SUPABASE_URL is not configured.');
  return url;
}

function publishableKey(): string {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error('SUPABASE_PUBLISHABLE_KEY is not configured.');
  return key;
}

function secretKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('SUPABASE_SECRET_KEY is not configured.');
  return key;
}

export function supabaseServerClient(): SupabaseClient {
  return createClient(supabaseUrl(), secretKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function supabasePublicClient(): SupabaseClient {
  return createClient(supabaseUrl(), publishableKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function authUserFromSupabase(user: User): PlatformAuthUser {
  const metadata = user.user_metadata || {};
  const name = text(metadata.name) || text(metadata.full_name) || user.email || 'User';
  return {
    id: user.id,
    email: user.email || '',
    name,
  };
}

export async function verifySupabaseAccessToken(token: string): Promise<PlatformAuthUser> {
  if (!token) throw new Error('Missing Supabase access token.');
  const { data, error } = await supabasePublicClient().auth.getUser(token);
  if (error || !data.user) throw new Error('Invalid Supabase session.');
  return authUserFromSupabase(data.user);
}

function mapProfile(row: Record<string, unknown>, user: PlatformAuthUser): PlatformProfile {
  return {
    id: text(row.id, user.id),
    email: text(row.email, user.email),
    name: text(row.name, user.name),
    role: text(row.role, 'user'),
    enabled: row.enabled !== false,
  };
}

function mapProject(row: Record<string, unknown>): PlatformProject {
  const category = row.categories && typeof row.categories === 'object' ? row.categories as Record<string, unknown> : {};
  const channel = row.channels && typeof row.channels === 'object' ? row.channels as Record<string, unknown> : {};
  return {
    id: text(row.id),
    name: text(row.name, 'Project'),
    category: {
      id: text(row.category_id) || text(category.id),
      slug: text(category.slug),
    },
    channel: {
      id: text(row.channel_id) || text(channel.id),
    },
    projectGuidelines: text(row.project_guidelines),
    discourseApiKeyConfigured: Boolean(text(row.discourse_api_key_secret_name)),
    enabled: row.enabled !== false,
  };
}

export async function ensurePlatformProfile(user: PlatformAuthUser): Promise<PlatformProfile> {
  const client = supabaseServerClient();
  const payload = {
    id: user.id,
    email: user.email,
    name: user.name,
    enabled: true,
  };

  const { data, error } = await client
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
    .select('id,email,name,role,enabled')
    .single();

  if (error) throw new Error(`Could not load platform profile. Run the Supabase platform schema first. ${error.message}`);
  return mapProfile(data as Record<string, unknown>, user);
}

export async function getPlatformContext(user: PlatformAuthUser): Promise<PlatformContext> {
  const client = supabaseServerClient();
  const profile = await ensurePlatformProfile(user);
  const { data, error } = await client
    .from('user_projects')
    .select('id,name,category_id,channel_id,project_guidelines,discourse_api_key_secret_name,enabled,categories(id,slug),channels(id)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Could not load user projects. ${error.message}`);

  return {
    user,
    profile,
    projects: (data || []).map((row) => mapProject(row as Record<string, unknown>)),
  };
}

export async function getPlatformProjectDiscourseKey(user: PlatformAuthUser, projectIdInput: unknown): Promise<string | null> {
  const projectId = optionalUuid(projectIdInput);
  if (!projectId) throw new Error('Project id is required.');

  const client = supabaseServerClient();
  const { data: project, error: projectError } = await client
    .from('user_projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (projectError || !project) throw new Error('Project not found.');

  const { data, error } = await client.rpc('get_user_project_discourse_key', {
    p_project_id: projectId,
  });
  if (error) throw new Error(`Could not load Discourse API key. ${error.message}`);

  return typeof data === 'string' && data ? data : null;
}

export function normalizePlatformProjectInput(input: PlatformProjectInput): NormalizedPlatformProjectInput {
  return {
    id: optionalUuid(input.id),
    name: bounded(input.name, 'Project name', 120, 'Community Project'),
    categoryId: bounded(input.categoryId, 'Category ID', 80),
    categorySlug: bounded(input.categorySlug, 'Category slug', 160),
    channelId: bounded(input.channelId, 'Channel ID', 80),
    projectGuidelines: bounded(input.projectGuidelines, 'Project guidelines', 100000),
    discourseApiKey: text(input.discourseApiKey) || undefined,
    enabled: input.enabled !== false,
  };
}

export async function upsertPlatformProject(user: PlatformAuthUser, input: PlatformProjectInput): Promise<PlatformContext> {
  const project = normalizePlatformProjectInput(input);
  const client = supabaseServerClient();
  await ensurePlatformProfile(user);

  const categoryResult = await client
    .from('categories')
    .upsert({ id: project.categoryId, slug: project.categorySlug }, { onConflict: 'id' });
  if (categoryResult.error) throw new Error(`Could not save category. ${categoryResult.error.message}`);

  const channelResult = await client
    .from('channels')
    .upsert({ id: project.channelId }, { onConflict: 'id' });
  if (channelResult.error) throw new Error(`Could not save channel. ${channelResult.error.message}`);

  const payload = {
    ...(project.id ? { id: project.id } : {}),
    user_id: user.id,
    name: project.name,
    category_id: project.categoryId,
    channel_id: project.channelId,
    project_guidelines: project.projectGuidelines,
    enabled: project.enabled,
  };

  const { data, error } = await client
    .from('user_projects')
    .upsert(payload, { onConflict: project.id ? 'id' : 'user_id,category_id,channel_id' })
    .select('id')
    .single();
  if (error) throw new Error(`Could not save project. ${error.message}`);

  const projectId = text((data as Record<string, unknown>).id);
  if (project.discourseApiKey) {
    const { error: secretError } = await client.rpc('set_user_project_discourse_key', {
      p_project_id: projectId,
      p_secret: project.discourseApiKey,
    });
    if (secretError) throw new Error(`Could not store Discourse API key securely. Run the Supabase Vault functions in docs/supabase-platform.sql. ${secretError.message}`);
  }

  return getPlatformContext(user);
}
