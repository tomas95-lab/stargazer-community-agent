import { randomUUID } from 'crypto';
import { readDataJSON, writeDataJSON } from './data-store';
import { runtimeDb, runtimeDbConfigured, runtimeScope, runtimeTableMissing } from './runtime-db';

export type OperationStatus = 'success' | 'error' | 'skipped';

export interface OperationLogEntry {
  id: string;
  at: string;
  action: string;
  status: OperationStatus;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface OperationDetailRecord {
  entry: OperationLogEntry;
  detail?: unknown;
}

const FILE = 'output/operations-log.json';
const DETAIL_DIR = 'output/operation-details';
const MAX_ENTRIES = 500;

export async function readOperationLog(limit = MAX_ENTRIES): Promise<OperationLogEntry[]> {
  if (runtimeDbConfigured()) {
    try {
      const scope = runtimeScope();
      const query = runtimeDb().from('automation_events').select('id,created_at,action,status,message,metadata')
        .eq('project_key', scope.projectKey).order('created_at', { ascending: false }).limit(Math.max(1, Math.min(MAX_ENTRIES, limit)));
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data || []).map((row) => ({
        id: row.id,
        at: row.created_at,
        action: row.action,
        status: row.status,
        message: row.message,
        metadata: row.metadata || {},
      })) as OperationLogEntry[];
    } catch (err) {
      if (!runtimeTableMissing(err)) throw err;
    }
  }
  try {
    const entries = await readDataJSON<OperationLogEntry[]>(FILE);
    return entries.slice(0, Math.max(1, Math.min(MAX_ENTRIES, limit)));
  } catch {
    return [];
  }
}

export async function appendOperationLog(
  entry: Omit<OperationLogEntry, 'id' | 'at'>,
  detail?: unknown,
): Promise<OperationLogEntry | undefined> {
  if (runtimeDbConfigured()) {
    try {
      const scope = runtimeScope();
      const { data, error } = await runtimeDb().from('automation_events').insert({
        project_key: scope.projectKey,
        owner_id: scope.ownerId,
        action: entry.action,
        status: entry.status,
        message: entry.message,
        metadata: entry.metadata || {},
        detail: detail ?? null,
      }).select('id,created_at').single();
      if (error) throw new Error(error.message);
      const nextEntry = { id: data.id, at: data.created_at, ...entry };
      await import('./push-notifications')
        .then(({ dispatchOperationPush }) => dispatchOperationPush(nextEntry))
        .catch(() => undefined);
      return nextEntry;
    } catch (err) {
      if (!runtimeTableMissing(err)) {
        console.warn('Could not write operation log:', err);
        return undefined;
      }
    }
  }
  try {
    const current = await readOperationLog();
    const nextEntry = {
      id: randomUUID(),
      at: new Date().toISOString(),
      ...entry,
    };
    const next = [
      nextEntry,
      ...current,
    ].slice(0, MAX_ENTRIES);

    await writeDataJSON(FILE, next, `log ${entry.action}`);
    if (detail !== undefined) {
      await writeOperationDetail(nextEntry, detail).catch((err) => {
        console.warn('Could not write operation detail:', err);
      });
    }

    await import('./push-notifications')
      .then(({ dispatchOperationPush }) => dispatchOperationPush(nextEntry))
      .catch(() => undefined);

    return nextEntry;
  } catch (err) {
    console.warn('Could not write operation log:', err);
    return undefined;
  }
}

function operationDetailPath(id: string): string {
  if (!/^[a-z0-9-]{8,80}$/i.test(id)) throw new Error('Invalid operation id');
  return `${DETAIL_DIR}/${id}.json`;
}

export async function writeOperationDetail(entry: OperationLogEntry, detail: unknown): Promise<void> {
  await writeDataJSON(
    operationDetailPath(entry.id),
    { entry, detail },
    `log detail ${entry.action}`
  );
}

export async function readOperationDetail(id: string): Promise<OperationDetailRecord | null> {
  if (runtimeDbConfigured()) {
    try {
      const scope = runtimeScope();
      const { data, error } = await runtimeDb().from('automation_events')
        .select('id,created_at,action,status,message,metadata,detail')
        .eq('id', id).eq('project_key', scope.projectKey).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        entry: { id: data.id, at: data.created_at, action: data.action, status: data.status, message: data.message, metadata: data.metadata || {} },
        detail: data.detail,
      };
    } catch (err) {
      if (!runtimeTableMissing(err)) throw err;
    }
  }
  const entries = await readOperationLog();
  const entry = entries.find((item) => item.id === id);
  if (!entry) return null;

  try {
    const record = await readDataJSON<OperationDetailRecord>(operationDetailPath(id));
    return {
      entry,
      detail: record.detail,
    };
  } catch {
    return { entry };
  }
}

export async function readOperationDetails(ids: string[]): Promise<Map<string, unknown>> {
  const validIds = [...new Set(ids.filter((id) => /^[a-z0-9-]{8,80}$/i.test(id)))];
  if (!validIds.length) return new Map();

  if (runtimeDbConfigured()) {
    try {
      const scope = runtimeScope();
      const { data, error } = await runtimeDb().from('automation_events')
        .select('id,detail')
        .eq('project_key', scope.projectKey)
        .in('id', validIds);
      if (error) throw new Error(error.message);
      return new Map((data || []).filter((row) => row.detail !== null).map((row) => [row.id, row.detail]));
    } catch (err) {
      if (!runtimeTableMissing(err)) throw err;
    }
  }

  const records = await Promise.all(validIds.map(async (id) => {
    try {
      const record = await readDataJSON<OperationDetailRecord>(operationDetailPath(id));
      return [id, record.detail] as const;
    } catch {
      return null;
    }
  }));
  return new Map(records.filter((record): record is readonly [string, unknown] => Boolean(record)));
}
