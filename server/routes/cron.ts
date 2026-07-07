import { timingSafeEqual } from 'crypto';
import { Router, Request, Response } from 'express';
import { runCommunityAgent } from '../../src/community-agent';
import { runDailyPublishJob } from '../../src/daily-publish-job';
import { runDmReviewJob } from '../../src/dm-review-job';
import { appendOperationLog, OperationStatus } from '../../src/operations-log';

const router = Router();

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return constantTimeEquals(req.header('authorization') || '', `Bearer ${secret}`);
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
    const result = await runCommunityAgent({
      post: process.env.AGENT_AUTO_POST === 'true',
      includeCommunity: true,
      onlyToday: true,
      respectSchedule: true,
      skipProcessed: true,
      markProcessed: true,
      maxAnswers: Number(process.env.AGENT_MAX_ANSWERS || 4),
      messageCount: Number(process.env.AGENT_MESSAGE_COUNT || 50),
    });

    await logCronRequest(req, 'success', 'Community agent cron completed', {
      authorized: true,
      httpStatus: 200,
      job: 'community_agent',
      checked: result.checked,
      candidates: result.candidates,
      posted: result.posted,
      needsHuman: result.needsHuman,
    });
    res.json({ ok: true, result });
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
    const result = await runDailyPublishJob();
    await logCronRequest(req, result.status === 'skipped' ? 'skipped' : 'success', 'Daily thread cron completed', {
      authorized: true,
      httpStatus: 200,
      job: 'daily_publish_job',
      resultStatus: result.status,
      date: result.date,
      reason: result.reason,
      url: result.url,
    });
    res.json({ ok: true, result });
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
    const result = await runDmReviewJob({
      messageCount: Number(process.env.DM_REVIEW_MESSAGE_COUNT || 50),
      maxChannels: Number(process.env.DM_REVIEW_MAX_CHANNELS || 5),
      requestDelayMs: Number(process.env.DM_REVIEW_REQUEST_DELAY_MS || 1500),
      autoReply: process.env.DM_AUTO_REPLY === 'true',
      maxAutoReplies: Number(process.env.DM_AUTO_REPLY_MAX || 3),
    });
    await logCronRequest(req, result.errors.length > 0 ? 'error' : result.incomingMessages > 0 ? 'success' : 'skipped', 'DM review cron completed', {
      authorized: true,
      httpStatus: 200,
      job: 'dm_review',
      incomingMessages: result.incomingMessages,
      scannedChannels: result.scannedChannels,
      autoReplied: result.autoReply?.replied || 0,
      autoNeedsHuman: result.autoReply?.needsHuman || 0,
      errors: result.errors.length,
    });
    res.json({ ok: true, result });
  } catch (err) {
    await logCronRequest(req, 'error', err instanceof Error ? err.message : String(err), {
      authorized: true,
      httpStatus: 500,
      job: 'dm_review',
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

export default router;
