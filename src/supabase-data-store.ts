import { runtimeDb, runtimeDbConfigured } from './runtime-db';
import { canonicalProjectId, getCurrentProjectId } from './project-context';
import { createHash } from 'crypto';

export type StoredContentType = 'json' | 'text';

export interface SupabaseDataFile {
  projectKey: string;
  path: string;
  contentType: StoredContentType;
  content: string;
  size: number;
  updatedAt: string;
}

export class DataFileNotFoundError extends Error {
  constructor(filePath: string) {
    super(`Data file not found: ${filePath}`);
    this.name = 'DataFileNotFoundError';
  }
}

const TABLE = 'project_data_files';

function normalizePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const parts = normalized.split('/').filter(Boolean);
  if (
    !normalized ||
    normalized.length > 500 ||
    parts.includes('..') ||
    parts.includes('.') ||
    !/^(data|output)(?:\/[A-Za-z0-9._/-]+)?$/.test(normalized)
  ) {
    throw new Error(`Invalid data path: ${filePath}`);
  }
  return parts.join('/');
}

export function projectKeyForDataPath(filePath: string, fallback = getCurrentProjectId()): string {
  const normalized = normalizePath(filePath);
  const match = normalized.match(/^(?:data|output)\/projects\/([^/]+)(?:\/|$)/);
  return canonicalProjectId(match?.[1]) || canonicalProjectId(fallback);
}

export function supabaseDataStoreConfigured(): boolean {
  return runtimeDbConfigured();
}

export async function assertSupabaseDataStoreReady(): Promise<void> {
  const { error } = await runtimeDb().from(TABLE).select('file_path').limit(1);
  if (error) {
    throw new Error(`Supabase content storage is not ready: ${error.message}. Apply supabase/schema.sql first.`);
  }
}

function scope(filePath: string, projectKey?: string): { path: string; projectKey: string } {
  const normalized = normalizePath(filePath);
  const key = canonicalProjectId(projectKey) || projectKeyForDataPath(normalized);
  if (!key) throw new Error(`Could not resolve a project for data path: ${filePath}`);
  return { path: normalized, projectKey: key };
}

export async function readSupabaseDataFile(filePath: string, projectKey?: string): Promise<SupabaseDataFile> {
  const target = scope(filePath, projectKey);
  const { data, error } = await runtimeDb()
    .from(TABLE)
    .select('project_key,file_path,content_type,content,size_bytes,updated_at')
    .eq('project_key', target.projectKey)
    .eq('file_path', target.path)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new DataFileNotFoundError(target.path);
  return {
    projectKey: data.project_key,
    path: data.file_path,
    contentType: data.content_type,
    content: data.content,
    size: Number(data.size_bytes) || Buffer.byteLength(data.content || '', 'utf8'),
    updatedAt: data.updated_at,
  };
}

export async function writeSupabaseDataFile(
  filePath: string,
  content: string,
  contentType: StoredContentType,
  reason: string,
  projectKey?: string,
): Promise<void> {
  const target = scope(filePath, projectKey);
  const now = new Date().toISOString();
  const { error } = await runtimeDb().from(TABLE).upsert({
    project_key: target.projectKey,
    file_path: target.path,
    content_type: contentType,
    content,
    size_bytes: Buffer.byteLength(content, 'utf8'),
    content_sha256: createHash('sha256').update(content).digest('hex'),
    last_write_reason: reason.slice(0, 240),
    updated_at: now,
  }, { onConflict: 'project_key,file_path' });
  if (error) throw new Error(error.message);
}

export async function deleteSupabaseDataPath(filePath: string, projectKey?: string): Promise<void> {
  const target = scope(filePath, projectKey);
  const prefix = `${target.path}/`;
  const upperBound = `${prefix}\uffff`;
  const db = runtimeDb();
  const [exact, descendants] = await Promise.all([
    db.from(TABLE).delete().eq('project_key', target.projectKey).eq('file_path', target.path),
    db.from(TABLE).delete().eq('project_key', target.projectKey).gte('file_path', prefix).lt('file_path', upperBound),
  ]);
  if (exact.error) throw new Error(exact.error.message);
  if (descendants.error) throw new Error(descendants.error.message);
}

export async function listSupabaseDataDirectory(filePath: string, projectKey?: string): Promise<SupabaseDataFile[]> {
  const target = scope(filePath, projectKey);
  const prefix = `${target.path}/`;
  const upperBound = `${prefix}\uffff`;
  const { data, error } = await runtimeDb()
    .from(TABLE)
    .select('project_key,file_path,content_type,content,size_bytes,updated_at')
    .eq('project_key', target.projectKey)
    .gte('file_path', prefix)
    .lt('file_path', upperBound)
    .order('file_path', { ascending: true });
  if (error) throw new Error(error.message);

  return (data || [])
    .filter((row) => !row.file_path.slice(prefix.length).includes('/'))
    .map((row) => ({
      projectKey: row.project_key,
      path: row.file_path,
      contentType: row.content_type,
      content: row.content,
      size: Number(row.size_bytes) || Buffer.byteLength(row.content || '', 'utf8'),
      updatedAt: row.updated_at,
    }));
}

export async function countSupabaseDataFiles(projectKey?: string): Promise<number> {
  const key = canonicalProjectId(projectKey) || canonicalProjectId(getCurrentProjectId());
  const { count, error } = await runtimeDb()
    .from(TABLE)
    .select('file_path', { count: 'exact', head: true })
    .eq('project_key', key);
  if (error) throw new Error(error.message);
  return count || 0;
}
