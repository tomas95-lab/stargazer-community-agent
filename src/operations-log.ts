import { randomUUID } from 'crypto';
import { readDataJSON, writeDataJSON } from './data-store';

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
