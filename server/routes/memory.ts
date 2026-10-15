import { Router, Request, Response } from 'express';
import { loadProjectMemory, saveProjectMemory } from '../../src/project-memory';
import { projectGuidelineBriefStatus, saveProjectGuidelineBrief, setProjectGuidelineBriefEnabled } from '../../src/project-guidelines';
import { requireAdminToken } from '../auth';

const router = Router();

router.get('/', requireAdminToken, async (_req: Request, res: Response) => {
  try {
    res.json(await loadProjectMemory());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/guideline-brief', requireAdminToken, async (_req: Request, res: Response) => {
  try {
    res.json(await projectGuidelineBriefStatus());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.put('/guideline-brief', requireAdminToken, async (req: Request, res: Response) => {
  try {
    res.json(await saveProjectGuidelineBrief(req.body?.brief));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.put('/guideline-brief/enabled', requireAdminToken, async (req: Request, res: Response) => {
  try {
    res.json(await setProjectGuidelineBriefEnabled(req.body?.enabled));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.put('/', requireAdminToken, async (req: Request, res: Response) => {
  try {
    res.json(await saveProjectMemory(req.body || {}));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
