import { Router, Request, Response } from 'express';
import { requireAdminToken } from '../auth';
import { readDataJSON, writeDataJSON } from '../../src/data-store';
import { appendOperationLog } from '../../src/operations-log';

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
    return await readDataJSON<Webinar[]>(FILE);
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

router.post('/', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const webinars = await readWebinars();
    const webinar: Webinar = { ...req.body, id: Date.now().toString() };
    webinars.push(webinar);
    await writeDataJSON(FILE, webinars, `add ${webinar.type} on ${webinar.date}`);
    await appendOperationLog({
      action: 'create_session',
      status: 'success',
      message: `Created ${webinar.type} for ${webinar.date}`,
      metadata: { id: webinar.id, type: webinar.type, date: webinar.date, title: webinar.title },
    });
    res.json(webinar);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.put('/:id', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const webinars = await readWebinars();
    const idx = webinars.findIndex((w) => w.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    webinars[idx] = { ...webinars[idx], ...req.body, id: req.params.id };
    await writeDataJSON(FILE, webinars, `update session ${req.params.id}`);
    await appendOperationLog({
      action: 'update_session',
      status: 'success',
      message: `Updated session ${req.params.id}`,
      metadata: { id: req.params.id },
    });
    res.json(webinars[idx]);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.delete('/:id', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const webinars = await readWebinars();
    const filtered = webinars.filter((w) => w.id !== req.params.id);
    if (filtered.length === webinars.length) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    await writeDataJSON(FILE, filtered, `delete session ${req.params.id}`);
    await appendOperationLog({
      action: 'delete_session',
      status: 'success',
      message: `Deleted session ${req.params.id}`,
      metadata: { id: req.params.id },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
