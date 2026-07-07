import { Router, Request, Response } from 'express';
import { readOperationDetail, readOperationLog } from '../../src/operations-log';
import { requireAdminToken } from '../auth';

const router = Router();

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

router.get('/', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const limit = clampNumber(req.query.limit, 50, 1, 100);
    const entries = await readOperationLog(limit);
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/:id', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const record = await readOperationDetail(req.params.id);
    if (!record) {
      res.status(404).json({ error: 'Operation not found' });
      return;
    }

    res.json({ ...record, hasDetail: record.detail !== undefined });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
