import { Router, Request, Response } from 'express';
import { readJSON, writeJSON } from '../../src/github-storage';

const router = Router();
const FILE = 'data/webinars.json';

export interface Webinar {
  id: string;
  type: 'webinar' | 'onboarding';
  title: string;
  date: string;
  timeUtc: string;
  timeLabel: string;
  link: string;
  invitees: string[];
}

async function readWebinars(): Promise<Webinar[]> {
  try {
    const { data } = await readJSON<Webinar[]>(FILE);
    return data;
  } catch {
    return [];
  }
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    res.json(await readWebinars());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const webinars = await readWebinars();
    const webinar: Webinar = { ...req.body, id: Date.now().toString() };
    webinars.push(webinar);
    await writeJSON(FILE, webinars, `add ${webinar.type} on ${webinar.date}`);
    res.json(webinar);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const webinars = await readWebinars();
    const idx = webinars.findIndex((w) => w.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    webinars[idx] = { ...webinars[idx], ...req.body, id: req.params.id };
    await writeJSON(FILE, webinars, `update session ${req.params.id}`);
    res.json(webinars[idx]);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const webinars = await readWebinars();
    const filtered = webinars.filter((w) => w.id !== req.params.id);
    if (filtered.length === webinars.length) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    await writeJSON(FILE, filtered, `delete session ${req.params.id}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
