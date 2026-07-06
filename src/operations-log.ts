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

const FILE = 'output/operations-log.json';
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
  entry: Omit<OperationLogEntry, 'id' | 'at'>
): Promise<void> {
  try {
    const current = await readOperationLog();
    const next = [
      {
        id: randomUUID(),
        at: new Date().toISOString(),
        ...entry,
      },
      ...current,
    ].slice(0, MAX_ENTRIES);

    await writeDataJSON(FILE, next, `log ${entry.action}`);
  } catch (err) {
    console.warn('Could not write operation log:', err);
  }
}
