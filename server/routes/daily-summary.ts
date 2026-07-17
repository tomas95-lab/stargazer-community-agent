import { Router, Request, Response } from 'express';
import { getDailySummary } from '../../src/daily-summary';
import { requireAdminToken } from '../auth';

const router = Router();

function parseDate(value: unknown): Date {
  if (typeof value !== 'string' || !value.trim()) return new Date();
  const raw = value.length === 10 ? `${value}T12:00:00.000Z` : value;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : new Date();
}

router.get('/', requireAdminToken, async (req: Request, res: Response) => {
  try {
    res.json(await getDailySummary(parseDate(req.query.date)));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
