import { Router, Request, Response } from 'express';
import { loadTopics, formatPostTitle, saveFile } from '../../src/utils';
import { renderDailyThread, renderAnnouncement } from '../../src/templates';
import { loadBotConfig } from '../../src/config';
import { CommunityBot } from '../../src/communityBot';

const router = Router();

router.post('/:date', async (req: Request, res: Response) => {
  const topics = loadTopics();
  const topic = topics.find((t) => t.date === req.params.date);
  if (!topic) {
    res.status(404).json({ error: 'Topic not found' });
    return;
  }

  const postChat = req.body.postChat !== false;

  try {
    const botConfig = loadBotConfig();
    const postTitle = formatPostTitle(topic.date);
    const threadContent = renderDailyThread(topic);

    saveFile(`daily-thread-${topic.date}.md`, threadContent);

    const bot = new CommunityBot(botConfig);
    const publishedUrl = await bot.publishDailyThread(postTitle, threadContent, topic.tags);

    saveFile(`published-url-${topic.date}.txt`, publishedUrl);

    if (postChat) {
      const announcementText = renderAnnouncement(topic, publishedUrl);
      await bot.postAnnouncementToChat(announcementText);
    }

    res.json({ ok: true, url: publishedUrl });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
