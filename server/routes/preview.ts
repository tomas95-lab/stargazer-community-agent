import { Router, Request, Response } from 'express';
import { renderDailyThread, renderAnnouncement } from '../../src/templates';
import { formatPostTitle } from '../../src/utils';
import { DailyThreadConfig } from '../../src/config';
import { readDataJSON } from '../../src/data-store';
import { loadProjectLinks } from '../../src/links';

const router = Router();

router.get('/:date', async (req: Request, res: Response) => {
  try {
    const topics = await readDataJSON<DailyThreadConfig[]>('data/topics.json');
    const topic = topics.find((t) => t.date === req.params.date);
    if (!topic) {
      res.status(404).json({ error: 'Topic not found' });
      return;
    }
    const links = await loadProjectLinks();
    const thread = renderDailyThread(topic, links);
    const announcement = renderAnnouncement(topic, `https://community.outlier.ai/t/placeholder/${topic.date}`);
    const title = formatPostTitle(topic.date);
    res.json({ title, thread, announcement });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
