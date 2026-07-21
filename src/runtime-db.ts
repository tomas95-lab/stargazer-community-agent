import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getProjectContext } from './project-context';

let client: SupabaseClient | null = null;

function env(key: string): string {
  return process.env[key]?.trim() || '';
}

export function runtimeDbConfigured(): boolean {
  const backend = (process.env.STORAGE_BACKEND || process.env.DATA_STORE || '').trim().toLowerCase();
  if (backend === 'local') return false;
  return Boolean(env('SUPABASE_URL') && (env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')));
}

export function runtimeDb(): SupabaseClient {
  if (!runtimeDbConfigured()) throw new Error('Runtime database is not configured.');
  client ||= createClient(env('SUPABASE_URL'), env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}

export function runtimeScope(): { projectKey: string; ownerId: string | null } {
  const context = getProjectContext();
  return { projectKey: context.projectId, ownerId: context.ownerId || null };
}

export function runtimeTableMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message || error || '');
  return /does not exist|schema cache|could not find|PGRST205|42P01/i.test(message);
}
