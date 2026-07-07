import { Router, Request, Response } from 'express';
import { getAiUsageSummary } from '../../src/usage-guardrails';
import { requireAdminToken } from '../auth';

const router = Router();

router.get('/', requireAdminToken, async (_req: Request, res: Response) => {
  try {
    res.json(await getAiUsageSummary());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
