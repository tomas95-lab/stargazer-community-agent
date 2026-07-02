import { Router, Request, Response } from 'express';
import { DailyThreadConfig } from '../../src/config';
import { todayDate } from '../../src/utils';
import { readJSON, writeJSON } from '../../src/github-storage';

const router = Router();
const FILE = 'data/topics.json';

async function readTopics(): Promise<{ topics: DailyThreadConfig[]; sha: string }> {
  const { data, sha } = await readJSON<DailyThreadConfig[]>(FILE);
  return { topics: data, sha };
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const { topics } = await readTopics();
    res.json(topics);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/today', async (_req: Request, res: Response) => {
  try {
    const date = todayDate();
    const { topics } = await readTopics();
    const match = topics.find((t) => t.date === date);
    res.json({ date, topic: match || null });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { topics } = await readTopics();
    const newTopic: DailyThreadConfig = req.body;
    if (!newTopic.date) {
      res.status(400).json({ error: 'date is required' });
      return;
    }
    if (topics.find((t) => t.date === newTopic.date)) {
      res.status(409).json({ error: `Topic for ${newTopic.date} already exists` });
      return;
    }
    topics.push(newTopic);
    topics.sort((a, b) => a.date.localeCompare(b.date));
    await writeJSON(FILE, topics, `add topic for ${newTopic.date}`);
    res.status(201).json(newTopic);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.put('/:date', async (req: Request, res: Response) => {
  try {
    const { topics } = await readTopics();
    const idx = topics.findIndex((t) => t.date === req.params.date);
    if (idx < 0) {
      res.status(404).json({ error: 'Topic not found' });
      return;
    }
    topics[idx] = { ...topics[idx], ...req.body, date: req.params.date };
    await writeJSON(FILE, topics, `update topic for ${req.params.date}`);
    res.json(topics[idx]);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.delete('/:date', async (req: Request, res: Response) => {
  try {
    const { topics } = await readTopics();
    const idx = topics.findIndex((t) => t.date === req.params.date);
    if (idx < 0) {
      res.status(404).json({ error: 'Topic not found' });
      return;
    }
    topics.splice(idx, 1);
    await writeJSON(FILE, topics, `delete topic for ${req.params.date}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
