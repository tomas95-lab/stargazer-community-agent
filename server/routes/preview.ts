import { Router, Request, Response } from 'express';
import { renderDailyThread, renderAnnouncement } from '../../src/templates';
import { loadTopics, formatPostTitle } from '../../src/utils';

const router = Router();

router.get('/:date', (req: Request, res: Response) => {
  const topics = loadTopics();
  const topic = topics.find((t) => t.date === req.params.date);
  if (!topic) {
    res.status(404).json({ error: 'Topic not found' });
    return;
  }

  const thread = renderDailyThread(topic);
  const announcement = renderAnnouncement(topic, `https://community.outlier.ai/t/placeholder/${topic.date}`);
  const title = formatPostTitle(topic.date);

  res.json({ title, thread, announcement });
});

export default router;
