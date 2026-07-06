import { Router, Request, Response } from 'express';
import { fetchTodayDmReview, runDmReviewJob } from '../../src/dm-review-job';
import { requireAdminToken } from '../auth';

const router = Router();

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

router.get('/', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const result = await fetchTodayDmReview({
      messageCount: clampNumber(req.query.messageCount, 50, 1, 100),
      maxChannels: clampNumber(req.query.maxChannels, 100, 1, 200),
      fullScan: req.query.fullScan === 'true',
      writeReport: false,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post('/run', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const result = await runDmReviewJob({
      messageCount: clampNumber(req.body?.messageCount, 50, 1, 100),
      maxChannels: clampNumber(req.body?.maxChannels, 100, 1, 200),
      requestDelayMs: clampNumber(req.body?.requestDelayMs, Number(process.env.DM_REVIEW_REQUEST_DELAY_MS || 1500), 0, 10000),
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
