import { readDataJSON, writeDataJSON } from './data-store';
import { todayDate } from './utils';

export type CronLockStatus = 'running' | 'completed' | 'error';

export interface CronRunLock {
  job: string;
  projectId: string;
  slot: string;
  utcDate: string;
  argentinaDate?: string;
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

function lockPath(job: string, projectId: string, slot: string, utcDate: string): string {
  return `output/cron-runs/${utcDate}/${safePart(job)}-${safePart(projectId)}-${safePart(slot)}.json`;
}

async function readLock(job: string, projectId: string, slot: string, utcDate: string): Promise<CronRunLock | null> {
  try {
    return await readDataJSON<CronRunLock>(lockPath(job, projectId, slot, utcDate));
  } catch {
    return null;
  }
}

async function writeLock(lock: CronRunLock): Promise<void> {
  await writeDataJSON(
    lockPath(lock.job, lock.projectId, lock.slot, lock.utcDate),
    lock,
    `cron lock ${lock.job} ${lock.projectId} ${lock.slot} ${lock.utcDate}`
  );
}

export async function withCronRunLock<T>(
  job: string,
  projectId: string,
  slot: string,
  runner: () => Promise<T>,
  now = new Date(),
): Promise<CronRunLockedResult<T>> {
  const utcDate = todayDate(now);
  const current = await readLock(job, projectId, slot, utcDate);

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
    utcDate,
    argentinaDate: utcDate,
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
