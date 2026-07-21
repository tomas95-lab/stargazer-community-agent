import { Router, Request, Response } from 'express';
import { runCommunityAgent } from '../../src/community-agent';
import { isAuthorizedCronRequest } from '../../src/cron-auth';
import { runDailyPublishJob } from '../../src/daily-publish-job';
import { runDmReviewJob } from '../../src/dm-review-job';
import { appendOperationLog, OperationStatus } from '../../src/operations-log';
import { processDueScheduledMessages } from '../../src/scheduled-messages';
import { canonicalProjectId, defaultProjectId, isLegacyProjectId, ProjectContext, projectScheduleAllowsNow, runWithProjectContext } from '../../src/project-context';
import { withCronRunLock } from '../../src/cron-locks';
import {
  isPlatformConfigured,
  listEnabledProjectConnections,
  projectAutomationPaused,
  projectKeyFromRow,
  projectRuntimeContextForRow,
  QmProjectRow,
  uniqueProjectConnections,
} from '../platform-store';

const router = Router();

function isCronAuthorized(req: Request): boolean {
  return isAuthorizedCronRequest({
    authorization: req.header('authorization') || '',
    cronSecretHeader: req.header('x-cron-secret') || '',
    endpoint: cronEndpoint(req),
    userAgent: req.header('user-agent') || '',
    vercelCronSchedule: req.header('x-vercel-cron-schedule') || '',
  });
}

function cronEndpoint(req: Request): string {
  return req.originalUrl.split('?')[0];
}

function cronSource(req: Request): string {
  const scheduler = req.header('x-scheduler');
  if (scheduler) return scheduler;
  if (req.header('x-vercel-cron-schedule')) return 'vercel-cron';
  const userAgent = req.header('user-agent') || '';
  if (userAgent.toLowerCase().includes('cron-job.org')) return 'cron-job.org';
  return 'manual';
}

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'y'].includes((value || '').trim().toLowerCase());
}

function slot(req: Request): string {
  return String(req.params.slot || 'default');
}

function requestedCronProjectId(req: Request): string {
  const query = typeof req.query.project === 'string' ? req.query.project : '';
  const header = req.header('x-project-id') || req.header('x-tenant-id') || '';
  return canonicalProjectId(query || header || process.env.CRON_PROJECT_ID || '');
}

async function legacyContext(): Promise<ProjectContext> {
  return {
    projectId: defaultProjectId(),
    source: 'default',
    projectName: 'TESTING PROJECT',
    automationPaused: await projectAutomationPaused(defaultProjectId()).catch(() => false),
  };
}

function projectCronsEnabled(): boolean {
  return truthy(process.env.PLATFORM_PROJECT_CRONS_ENABLED) || truthy(process.env.CRON_RUN_PLATFORM_PROJECTS);
}

function dmCronsEnabled(): boolean {
  return truthy(process.env.PLATFORM_DM_CRONS_ENABLED) || truthy(process.env.CRON_RUN_PLATFORM_DMS);
}

async function platformConnections(): Promise<QmProjectRow[]> {
  if (!isPlatformConfigured()) return [];
  try {
    return await listEnabledProjectConnections();
  } catch (err) {
    console.warn('Could not load platform cron connections:', err);
    return [];
  }
}

async function projectCronTargets(req: Request): Promise<ProjectContext[]> {
  const requested = requestedCronProjectId(req);
  const legacyId = defaultProjectId();

  if (requested) {
    if (isLegacyProjectId(requested) || requested === legacyId) return [await legacyContext()];
    const rows = await platformConnections();
    const row = rows.find((item) => projectKeyFromRow(item) === requested);
    if (!row) throw new Error(`Cron project not found: ${requested}`);
    return [await projectRuntimeContextForRow(row)];
  }

  if (!projectCronsEnabled()) return [await legacyContext()];

  const rows = uniqueProjectConnections(await platformConnections())
    .filter((row) => !isLegacyProjectId(projectKeyFromRow(row)));
  return [await legacyContext(), ...(await Promise.all(rows.map(projectRuntimeContextForRow)))];
}

async function dmCronTargets(req: Request): Promise<ProjectContext[]> {
  const requested = requestedCronProjectId(req);
  const legacyId = defaultProjectId();

  if (requested) {
    if (isLegacyProjectId(requested) || requested === legacyId) return [await legacyContext()];
    const rows = await platformConnections();
    const matches = rows.filter((row) => projectKeyFromRow(row) === requested);
    if (matches.length === 0) throw new Error(`Cron project not found: ${requested}`);
    return Promise.all(matches.map(projectRuntimeContextForRow));
  }

  if (!dmCronsEnabled()) return [await legacyContext()];

  const rows = (await platformConnections()).filter((row) => !isLegacyProjectId(projectKeyFromRow(row)));
  return [await legacyContext(), ...(await Promise.all(rows.map(projectRuntimeContextForRow)))];
}

async function runInContext<T>(context: ProjectContext, fn: () => Promise<T>): Promise<T> {
  return runWithProjectContext(context, fn);
}

async function logCronRequest(
  req: Request,
  status: OperationStatus,
  message: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await appendOperationLog({
    action: 'cron_request',
    status,
    message,
    metadata: {
      endpoint: cronEndpoint(req),
      slot: req.params.slot,
      source: cronSource(req),
      schedule: req.header('x-vercel-cron-schedule') || undefined,
      userAgent: (req.header('user-agent') || '').slice(0, 160),
      ...metadata,
    },
  });
}

async function handleCommunityAgentCron(req: Request, res: Response): Promise<void> {
  if (!process.env.CRON_SECRET) {
    await logCronRequest(req, 'error', 'CRON_SECRET is not configured', { authorized: false, httpStatus: 503 });
    res.status(503).json({ error: 'CRON_SECRET is not configured' });
    return;
  }

  if (!isCronAuthorized(req)) {
    await logCronRequest(req, 'error', 'Unauthorized cron request', { authorized: false, httpStatus: 401 });
    res.status(401).json({ error: 'Unauthorized cron request' });
    return;
  }

  try {
    const targets = await projectCronTargets(req);
    const runs = [];

    for (const context of targets) {
      if (context.automationPaused) {
        runs.push({ projectId: context.projectId, skipped: true, reason: 'project_paused', result: undefined });
        continue;
      }
      const withinSchedule = await runInContext(context, () => projectScheduleAllowsNow());
      if (!withinSchedule) {
        runs.push({ projectId: context.projectId, skipped: true, reason: 'outside_project_schedule', result: undefined });
        continue;
      }
      const locked = await runInContext(context, () => withCronRunLock(
        'community-agent',
        context.projectId,
        slot(req),
        () => runCommunityAgent({
          post: context.automationSettings?.autoPost ?? process.env.AGENT_AUTO_POST === 'true',
          react: context.automationSettings?.autoReact ?? process.env.AGENT_AUTO_REACT === 'true',
          includeCommunity: true,
          onlyToday: true,
          respectSchedule: true,
          skipProcessed: true,
          markProcessed: true,
          maxAnswers: Number(process.env.AGENT_MAX_ANSWERS || 4),
          messageCount: Number(process.env.AGENT_MESSAGE_COUNT || 50),
        })
      ));
      runs.push({
        projectId: context.projectId,
        skipped: locked.skipped,
        reason: locked.reason,
        result: locked.result,
      });
    }

    const posted = runs.reduce((sum, run) => sum + (run.result?.posted || 0), 0);
    const reacted = runs.reduce((sum, run) => sum + (run.result?.reacted || 0), 0);
    const checked = runs.reduce((sum, run) => sum + (run.result?.checked || 0), 0);
    const candidates = runs.reduce((sum, run) => sum + (run.result?.candidates || 0), 0);
    const needsHuman = runs.reduce((sum, run) => sum + (run.result?.needsHuman || 0), 0);
    const skipped = runs.filter((run) => run.skipped).length;

    await logCronRequest(req, skipped === runs.length ? 'skipped' : 'success', 'Community agent cron completed', {
      authorized: true,
      httpStatus: 200,
      job: 'community_agent',
      targets: runs.map((run) => run.projectId),
      checked,
      candidates,
      posted,
      reacted,
      needsHuman,
      skipped,
    });
    res.json({ ok: true, targets: runs });
  } catch (err) {
    await logCronRequest(req, 'error', err instanceof Error ? err.message : String(err), {
      authorized: true,
      httpStatus: 500,
      job: 'community_agent',
    });
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

async function handleDailyThreadCron(req: Request, res: Response): Promise<void> {
  if (!process.env.CRON_SECRET) {
    await logCronRequest(req, 'error', 'CRON_SECRET is not configured', { authorized: false, httpStatus: 503 });
    res.status(503).json({ error: 'CRON_SECRET is not configured' });
    return;
  }

  if (!isCronAuthorized(req)) {
    await logCronRequest(req, 'error', 'Unauthorized cron request', { authorized: false, httpStatus: 401 });
    res.status(401).json({ error: 'Unauthorized cron request' });
    return;
  }

  try {
    const targets = await projectCronTargets(req);
    const runs = [];

    for (const context of targets) {
      if (context.automationPaused) {
        runs.push({ projectId: context.projectId, skipped: true, reason: 'project_paused', result: undefined });
        continue;
      }
      const withinSchedule = await runInContext(context, () => projectScheduleAllowsNow());
      if (!withinSchedule) {
        runs.push({ projectId: context.projectId, skipped: true, reason: 'outside_project_schedule', result: undefined });
        continue;
      }
      const locked = await runInContext(context, () => withCronRunLock(
        'daily-thread',
        context.projectId,
        slot(req),
        () => runDailyPublishJob()
      ));
      runs.push({
        projectId: context.projectId,
        skipped: locked.skipped,
        reason: locked.reason,
        result: locked.result,
      });
    }

    const published = runs.filter((run) => run.result?.status === 'published').length;
    const skipped = runs.filter((run) => run.skipped || run.result?.status === 'skipped').length;

    await logCronRequest(req, published > 0 ? 'success' : 'skipped', 'Daily thread cron completed', {
      authorized: true,
      httpStatus: 200,
      job: 'daily_publish_job',
      targets: runs.map((run) => run.projectId),
      published,
      skipped,
    });
    res.json({ ok: true, targets: runs });
  } catch (err) {
    await logCronRequest(req, 'error', err instanceof Error ? err.message : String(err), {
      authorized: true,
      httpStatus: 500,
      job: 'daily_publish_job',
    });
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

async function handleDmReviewCron(req: Request, res: Response): Promise<void> {
  if (!process.env.CRON_SECRET) {
    await logCronRequest(req, 'error', 'CRON_SECRET is not configured', { authorized: false, httpStatus: 503 });
    res.status(503).json({ error: 'CRON_SECRET is not configured' });
    return;
  }

  if (!isCronAuthorized(req)) {
    await logCronRequest(req, 'error', 'Unauthorized cron request', { authorized: false, httpStatus: 401 });
    res.status(401).json({ error: 'Unauthorized cron request' });
    return;
  }

  try {
    const targets = await dmCronTargets(req);
    const runs = [];

    for (const context of targets) {
      if (context.automationPaused) {
        runs.push({ projectId: context.projectId, ownerId: context.ownerId, skipped: true, reason: 'project_paused', result: undefined });
        continue;
      }
      const withinSchedule = await runInContext(context, () => projectScheduleAllowsNow());
      if (!withinSchedule) {
        runs.push({ projectId: context.projectId, ownerId: context.ownerId, skipped: true, reason: 'outside_project_schedule', result: undefined });
        continue;
      }
      const locked = await runInContext(context, () => withCronRunLock(
        'dm-review',
        context.ownerId || context.projectId,
        slot(req),
        () => runDmReviewJob({
          messageCount: Number(process.env.DM_REVIEW_MESSAGE_COUNT || 50),
          maxChannels: Number(process.env.DM_REVIEW_MAX_CHANNELS || 5),
          requestDelayMs: Number(process.env.DM_REVIEW_REQUEST_DELAY_MS || 1500),
          autoReply: context.automationSettings?.dmAutoReply ?? process.env.DM_AUTO_REPLY === 'true',
          maxAutoReplies: Number(process.env.DM_AUTO_REPLY_MAX || 3),
        })
      ));
      runs.push({
        projectId: context.projectId,
        ownerId: context.ownerId,
        skipped: locked.skipped,
        reason: locked.reason,
        result: locked.result,
      });
    }

    const incomingMessages = runs.reduce((sum, run) => sum + (run.result?.incomingMessages || 0), 0);
    const scannedChannels = runs.reduce((sum, run) => sum + (run.result?.scannedChannels || 0), 0);
    const autoReplied = runs.reduce((sum, run) => sum + (run.result?.autoReply?.replied || 0), 0);
    const autoNeedsHuman = runs.reduce((sum, run) => sum + (run.result?.autoReply?.needsHuman || 0), 0);
    const errors = runs.reduce((sum, run) => sum + (run.result?.errors.length || 0), 0);
    const skipped = runs.filter((run) => run.skipped).length;

    await logCronRequest(req, errors > 0 ? 'error' : incomingMessages > 0 ? 'success' : 'skipped', 'DM review cron completed', {
      authorized: true,
      httpStatus: 200,
      job: 'dm_review',
      targets: runs.map((run) => run.ownerId ? `${run.projectId}:${run.ownerId}` : run.projectId),
      incomingMessages,
      scannedChannels,
      autoReplied,
      autoNeedsHuman,
      errors,
      skipped,
    });
    res.json({ ok: true, targets: runs });
  } catch (err) {
    await logCronRequest(req, 'error', err instanceof Error ? err.message : String(err), {
      authorized: true,
      httpStatus: 500,
      job: 'dm_review',
    });
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

async function handleScheduledMessagesCron(req: Request, res: Response): Promise<void> {
  if (!process.env.CRON_SECRET) {
    await logCronRequest(req, 'error', 'CRON_SECRET is not configured', { authorized: false, httpStatus: 503 });
    res.status(503).json({ error: 'CRON_SECRET is not configured' });
    return;
  }

  if (!isCronAuthorized(req)) {
    await logCronRequest(req, 'error', 'Unauthorized cron request', { authorized: false, httpStatus: 401 });
    res.status(401).json({ error: 'Unauthorized cron request' });
    return;
  }

  try {
    const targets = await projectCronTargets(req);
    const runs = [];

    for (const context of targets) {
      if (context.automationPaused) {
        runs.push({ projectId: context.projectId, skipped: true, reason: 'project_paused', result: undefined });
        continue;
      }
      const locked = await runInContext(context, () => withCronRunLock(
        'scheduled-messages',
        context.projectId,
        slot(req),
        () => processDueScheduledMessages()
      ));
      runs.push({
        projectId: context.projectId,
        skipped: locked.skipped,
        reason: locked.reason,
        result: locked.result,
      });
    }

    const sent = runs.reduce((sum, run) => sum + (run.result?.sent || 0), 0);
    const failed = runs.reduce((sum, run) => sum + (run.result?.failed || 0), 0);
    const due = runs.reduce((sum, run) => sum + (run.result?.due || 0), 0);
    const checked = runs.reduce((sum, run) => sum + (run.result?.checked || 0), 0);
    const skipped = runs.filter((run) => run.skipped).length;

    await logCronRequest(req, failed > 0 ? 'error' : sent > 0 ? 'success' : 'skipped', 'Scheduled messages cron completed', {
      authorized: true,
      httpStatus: 200,
      job: 'scheduled_messages',
      targets: runs.map((run) => run.projectId),
      checked,
      due,
      sent,
      failed,
      skipped,
    });
    res.json({ ok: true, targets: runs });
  } catch (err) {
    await logCronRequest(req, 'error', err instanceof Error ? err.message : String(err), {
      authorized: true,
      httpStatus: 500,
      job: 'scheduled_messages',
    });
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

router.get('/daily-thread', handleDailyThreadCron);
router.get('/daily-thread/:slot', handleDailyThreadCron);
router.get('/community-agent', handleCommunityAgentCron);
router.get('/community-agent/:slot', handleCommunityAgentCron);
router.get('/dm-review', handleDmReviewCron);
router.get('/dm-review/:slot', handleDmReviewCron);
router.get('/scheduled-messages', handleScheduledMessagesCron);
router.get('/scheduled-messages/:slot', handleScheduledMessagesCron);

export default router;
