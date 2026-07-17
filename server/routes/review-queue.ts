import { Router, Request, Response } from 'express';
import { getReviewQueue, updateReviewQueueItemStatus } from '../../src/review-queue';
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
    const includeResolved = req.query.includeResolved === 'true';
    res.json(await getReviewQueue(limit, { includeResolved }));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.patch('/status', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const update = await updateReviewQueueItemStatus(
      req.body?.id,
      req.body?.status,
      typeof req.body?.note === 'string' ? req.body.note : '',
    );
    res.json({ ok: true, update });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
