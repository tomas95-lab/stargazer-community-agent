import { Router, Request, Response } from 'express';
import { fetchDmAgentCandidates, runDmAgent } from '../../src/dm-agent';
import { projectGuidelinesStatus } from '../../src/project-guidelines';
import { requireAdminToken } from '../auth';

const router = Router();

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

router.get('/overview', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const result = await fetchDmAgentCandidates({
      messageCount: clampNumber(req.query.messageCount, 50, 1, 100),
      maxChannels: clampNumber(req.query.maxChannels, 100, 1, 200),
    });
    const guidelines = await projectGuidelinesStatus();
    res.json({ ...result, guidelines });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post('/run', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const result = await runDmAgent({
      post: req.body?.post === true,
      maxAnswers: clampNumber(req.body?.maxAnswers, 4, 1, 10),
      messageCount: clampNumber(req.body?.messageCount, 50, 1, 100),
      maxChannels: clampNumber(req.body?.maxChannels, 100, 1, 200),
      requestDelayMs: clampNumber(req.body?.requestDelayMs, 1500, 0, 10000),
      skipProcessed: req.body?.skipProcessed !== false,
      markProcessed: req.body?.markProcessed === true,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
