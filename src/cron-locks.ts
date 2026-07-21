import { readDataJSON, writeDataJSON } from './data-store';
import { todayDate } from './utils';
import { runtimeDb, runtimeDbConfigured, runtimeTableMissing } from './runtime-db';

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
  if (runtimeDbConfigured()) {
    try {
      return await withDatabaseLock(job, projectId, slot, utcDate, runner, now);
    } catch (err) {
      if (!runtimeTableMissing(err)) throw err;
    }
  }
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

async function withDatabaseLock<T>(
  job: string,
  projectId: string,
  slot: string,
  utcDate: string,
  runner: () => Promise<T>,
  now: Date,
): Promise<CronRunLockedResult<T>> {
  const db = runtimeDb();
  const base: CronRunLock = { job, projectId, slot, utcDate, argentinaDate: utcDate, status: 'running', startedAt: now.toISOString() };
  const insert = await db.from('automation_run_locks').insert({
    job, project_key: projectId, slot, run_date: utcDate, status: 'running', started_at: base.startedAt,
  }).select('*').maybeSingle();

  if (insert.error && insert.error.code !== '23505') throw new Error(insert.error.message);
  if (insert.error?.code === '23505') {
    const currentResult = await db.from('automation_run_locks').select('*')
      .eq('job', job).eq('project_key', projectId).eq('slot', slot).eq('run_date', utcDate).single();
    if (currentResult.error) throw new Error(currentResult.error.message);
    const row = currentResult.data;
    const current: CronRunLock = {
      ...base,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at || undefined,
      error: row.error || undefined,
    };
    if (current.status === 'completed') return { skipped: true, reason: 'already_completed', lock: current };
    if (current.status === 'running' && now.getTime() - new Date(current.startedAt).getTime() < RUNNING_TTL_MS) {
      return { skipped: true, reason: 'already_running', lock: current };
    }
    const takeover = await db.from('automation_run_locks').update({ status: 'running', started_at: base.startedAt, completed_at: null, error: null })
      .eq('job', job).eq('project_key', projectId).eq('slot', slot).eq('run_date', utcDate)
      .eq('started_at', row.started_at).select('job');
    if (takeover.error) throw new Error(takeover.error.message);
    if (!takeover.data?.length) return { skipped: true, reason: 'already_running', lock: current };
  }

  try {
    const result = await runner();
    const completedAt = new Date().toISOString();
    const update = await db.from('automation_run_locks').update({ status: 'completed', completed_at: completedAt })
      .eq('job', job).eq('project_key', projectId).eq('slot', slot).eq('run_date', utcDate);
    if (update.error) throw new Error(update.error.message);
    return { skipped: false, lock: { ...base, status: 'completed', completedAt }, result };
  } catch (err) {
    await db.from('automation_run_locks').update({ status: 'error', completed_at: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) })
      .eq('job', job).eq('project_key', projectId).eq('slot', slot).eq('run_date', utcDate);
    throw err;
  }
}
