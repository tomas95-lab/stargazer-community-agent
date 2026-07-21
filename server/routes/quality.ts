import { Request, Response, Router } from 'express';
import { getQualityMetrics } from '../../src/quality-metrics';
import { requireAdminToken } from '../auth';

const router = Router();

router.get('/', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const days = Math.max(1, Math.min(90, Number(req.query.days || 14)));
    res.json(await getQualityMetrics(days));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
