import { Router, Request, Response } from 'express';
import { fetchCommunityAgentItems, fetchRecentCommunityMessages, runCommunityAgent } from '../../src/community-agent';
import { projectGuidelinesStatus } from '../../src/project-guidelines';
import { requireAdminToken } from '../auth';

const router = Router();

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

router.get('/messages', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const count = clampNumber(req.query.count, 20, 1, 50);
    const messages = await fetchRecentCommunityMessages(count);
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/overview', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const messageCount = clampNumber(req.query.messageCount, 50, 1, 100);
    const includeCommunity = req.query.includeCommunity !== 'false';
    const result = await fetchCommunityAgentItems({
      messageCount,
      includeCommunity,
      onlyToday: true,
    });
    const guidelines = await projectGuidelinesStatus();
    res.json({ ...result, guidelines });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post('/run', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const result = await runCommunityAgent({
      post: req.body?.post === true,
      maxAnswers: clampNumber(req.body?.maxAnswers, 3, 1, 10),
      messageCount: clampNumber(req.body?.messageCount, 50, 1, 100),
      includeCommunity: req.body?.includeCommunity !== false,
      onlyToday: true,
      skipProcessed: req.body?.skipProcessed !== false,
      markProcessed: req.body?.markProcessed === true,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
