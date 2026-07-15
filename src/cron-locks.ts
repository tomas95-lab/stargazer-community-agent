import { readDataJSON, writeDataJSON } from './data-store';
import { todayDate } from './utils';

export type CronLockStatus = 'running' | 'completed' | 'error';

export interface CronRunLock {
  job: string;
  projectId: string;
  slot: string;
  argentinaDate: string;
  status: CronLockStatus;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface CronRunLockedResult<T> {
  skipped: boolean;
  reason?: 'already_completed' | 'already_running';
  lock: CronRunLock;
  result?: T;
}

const RUNNING_TTL_MS = 12 * 60 * 1000;

function safePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'default';
}

function lockPath(job: string, projectId: string, slot: string, argentinaDate: string): string {
  return `output/cron-runs/${argentinaDate}/${safePart(job)}-${safePart(projectId)}-${safePart(slot)}.json`;
}

async function readLock(job: string, projectId: string, slot: string, argentinaDate: string): Promise<CronRunLock | null> {
  try {
    return await readDataJSON<CronRunLock>(lockPath(job, projectId, slot, argentinaDate));
  } catch {
    return null;
  }
}

async function writeLock(lock: CronRunLock): Promise<void> {
  await writeDataJSON(
    lockPath(lock.job, lock.projectId, lock.slot, lock.argentinaDate),
    lock,
    `cron lock ${lock.job} ${lock.projectId} ${lock.slot} ${lock.argentinaDate}`
  );
}

export async function withCronRunLock<T>(
  job: string,
  projectId: string,
  slot: string,
  runner: () => Promise<T>,
  now = new Date(),
): Promise<CronRunLockedResult<T>> {
  const argentinaDate = todayDate(now);
  const current = await readLock(job, projectId, slot, argentinaDate);

  if (current?.status === 'completed') {
    return { skipped: true, reason: 'already_completed', lock: current };
  }

  if (current?.status === 'running') {
    const startedAt = new Date(current.startedAt).getTime();
    if (Number.isFinite(startedAt) && now.getTime() - startedAt < RUNNING_TTL_MS) {
      return { skipped: true, reason: 'already_running', lock: current };
    }
  }

  const lock: CronRunLock = {
    job,
    projectId,
    slot,
    argentinaDate,
    status: 'running',
    startedAt: now.toISOString(),
  };
  await writeLock(lock);

  try {
    const result = await runner();
    const completed = {
      ...lock,
      status: 'completed' as const,
      completedAt: new Date().toISOString(),
    };
    await writeLock(completed);
    return { skipped: false, lock: completed, result };
  } catch (err) {
    const failed = {
      ...lock,
      status: 'error' as const,
      completedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
    await writeLock(failed).catch(() => undefined);
    throw err;
  }
}
