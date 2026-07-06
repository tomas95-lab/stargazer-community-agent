import { timingSafeEqual } from 'crypto';
import { Router, Request, Response } from 'express';
import { runCommunityAgent } from '../../src/community-agent';
import { runDailyPublishJob } from '../../src/daily-publish-job';
import { runDmReviewJob } from '../../src/dm-review-job';

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

async function handleCommunityAgentCron(req: Request, res: Response): Promise<void> {
  if (!process.env.CRON_SECRET) {
    res.status(503).json({ error: 'CRON_SECRET is not configured' });
    return;
  }

  if (!isCronAuthorized(req)) {
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

    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

async function handleDailyThreadCron(req: Request, res: Response): Promise<void> {
  if (!process.env.CRON_SECRET) {
    res.status(503).json({ error: 'CRON_SECRET is not configured' });
    return;
  }

  if (!isCronAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized cron request' });
    return;
  }

  try {
    const result = await runDailyPublishJob();
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

async function handleDmReviewCron(req: Request, res: Response): Promise<void> {
  if (!process.env.CRON_SECRET) {
    res.status(503).json({ error: 'CRON_SECRET is not configured' });
    return;
  }

  if (!isCronAuthorized(req)) {
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
    res.json({ ok: true, result });
  } catch (err) {
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
