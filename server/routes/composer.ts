import { Router, Request, Response } from 'express';
import { generateComposedMessage } from '../../src/message-composer';
import { requireAdminToken } from '../auth';

const router = Router();

router.post('/generate', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const result = await generateComposedMessage(req.body || {});
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes('Describe what') || message.includes('too long') ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

export default router;
