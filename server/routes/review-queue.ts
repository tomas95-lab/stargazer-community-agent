import { Router, Request, Response } from 'express';
import { getReviewQueue } from '../../src/review-queue';
import { requireAdminToken } from '../auth';

const router = Router();

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

router.get('/', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const limit = clampNumber(req.query.limit, 150, 1, 500);
    res.json(await getReviewQueue(limit));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
