import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();
const WEBINARS_PATH = path.resolve(__dirname, '../../data/webinars.json');

export interface Webinar {
  id: string;
  title: string;
  date: string;
  timeUtc: string;
  timeLabel: string;
  link: string;
  invitees: string[];
}

function readWebinars(): Webinar[] {
  if (!fs.existsSync(WEBINARS_PATH)) return [];
  return JSON.parse(fs.readFileSync(WEBINARS_PATH, 'utf-8'));
}

function writeWebinars(webinars: Webinar[]): void {
  fs.writeFileSync(WEBINARS_PATH, JSON.stringify(webinars, null, 2), 'utf-8');
}

router.get('/', (_req: Request, res: Response) => {
  res.json(readWebinars());
});

router.post('/', (req: Request, res: Response) => {
  const webinars = readWebinars();
  const webinar: Webinar = {
    ...req.body,
    id: Date.now().toString(),
  };
  webinars.push(webinar);
  writeWebinars(webinars);
  res.json(webinar);
});

router.put('/:id', (req: Request, res: Response) => {
  const webinars = readWebinars();
  const idx = webinars.findIndex((w) => w.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  webinars[idx] = { ...webinars[idx], ...req.body, id: req.params.id };
  writeWebinars(webinars);
  res.json(webinars[idx]);
});

router.delete('/:id', (req: Request, res: Response) => {
  const webinars = readWebinars();
  const filtered = webinars.filter((w) => w.id !== req.params.id);
  if (filtered.length === webinars.length) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  writeWebinars(filtered);
  res.json({ ok: true });
});

export default router;
