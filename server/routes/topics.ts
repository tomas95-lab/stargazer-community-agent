import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { PATHS, DailyThreadConfig } from '../../src/config';
import { todayDate } from '../../src/utils';

const router = Router();

function topicsFilePath(): string {
  return path.join(PATHS.data, 'topics.json');
}

function readTopics(): DailyThreadConfig[] {
  return JSON.parse(fs.readFileSync(topicsFilePath(), 'utf-8'));
}

function writeTopics(topics: DailyThreadConfig[]): void {
  fs.writeFileSync(topicsFilePath(), JSON.stringify(topics, null, 2), 'utf-8');
}

router.get('/', (_req: Request, res: Response) => {
  res.json(readTopics());
});

router.get('/today', (_req: Request, res: Response) => {
  const date = todayDate();
  const topics = readTopics();
  const match = topics.find((t) => t.date === date);
  res.json({ date, topic: match || null });
});

router.post('/', (req: Request, res: Response) => {
  const topics = readTopics();
  const newTopic: DailyThreadConfig = req.body;
  if (!newTopic.date) {
    res.status(400).json({ error: 'date is required' });
    return;
  }
  const existing = topics.findIndex((t) => t.date === newTopic.date);
  if (existing >= 0) {
    res.status(409).json({ error: `Topic for ${newTopic.date} already exists` });
    return;
  }
  topics.push(newTopic);
  topics.sort((a, b) => a.date.localeCompare(b.date));
  writeTopics(topics);
  res.status(201).json(newTopic);
});

router.put('/:date', (req: Request, res: Response) => {
  const topics = readTopics();
  const idx = topics.findIndex((t) => t.date === req.params.date);
  if (idx < 0) {
    res.status(404).json({ error: 'Topic not found' });
    return;
  }
  topics[idx] = { ...topics[idx], ...req.body, date: req.params.date };
  writeTopics(topics);
  res.json(topics[idx]);
});

router.delete('/:date', (req: Request, res: Response) => {
  const topics = readTopics();
  const idx = topics.findIndex((t) => t.date === req.params.date);
  if (idx < 0) {
    res.status(404).json({ error: 'Topic not found' });
    return;
  }
  topics.splice(idx, 1);
  writeTopics(topics);
  res.json({ ok: true });
});

export default router;
