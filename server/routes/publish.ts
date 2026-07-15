import { Router, Request, Response } from 'express';
import { renderDailyThread, renderAnnouncement } from '../../src/templates';
import { formatPostTitle } from '../../src/utils';
import { loadBotConfig } from '../../src/config';
import { CommunityBot } from '../../src/communityBot';
import { DiscourseClient } from '../../src/discourse-client';
import { DailyThreadConfig } from '../../src/config';
import { requireAdminToken } from '../auth';
import { readDataJSON, writeDataJSON } from '../../src/data-store';
import { loadProjectLinks } from '../../src/links';
import { appendOperationLog } from '../../src/operations-log';

const router = Router();

function isDuplicateTitleError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /Discourse API error 422/i.test(message) && /Title has already been used/i.test(message);
}

async function findExistingPublishedThread(title: string, botConfig: ReturnType<typeof loadBotConfig>): Promise<string | null> {
  const client = new DiscourseClient({
    baseUrl: botConfig.communityBaseUrl,
    apiKey: botConfig.discourseApiKey,
    apiClientId: botConfig.discourseApiClientId,
  });
  const topics = await client.readCategoryTopics(parseInt(botConfig.communityCategoryId, 10), 30);
  const match = topics.find((topic) => topic.title.trim().toLowerCase() === title.trim().toLowerCase());
  return match ? client.topicUrl(match.slug, match.id) : null;
}

router.post('/:date', requireAdminToken, async (req: Request, res: Response) => {
  try {
    const topics = await readDataJSON<DailyThreadConfig[]>('data/topics.json');
    const topic = topics.find((t) => t.date === req.params.date);
    if (!topic) {
      res.status(404).json({ error: 'Topic not found' });
      return;
    }

    const postChat = req.body.postChat !== false;
    const botConfig = loadBotConfig();
    const postTitle = formatPostTitle(topic.date);
    const links = await loadProjectLinks();
    const threadContent = renderDailyThread(topic, links);

    const bot = new CommunityBot(botConfig);
    const publishedUrl = await bot.publishDailyThread(postTitle, threadContent, topic.tags);

    await writeDataJSON(
      `output/published-url-${topic.date}.txt`,
      { url: publishedUrl, date: topic.date, publishedAt: new Date().toISOString() },
      `published thread for ${topic.date}`
    );

    if (postChat) {
      const announcementText = renderAnnouncement(topic, publishedUrl);
      await bot.postAnnouncementToChat(announcementText);
    }

    await appendOperationLog({
      action: 'publish_daily_thread',
      status: 'success',
      message: `Published daily thread for ${topic.date}`,
      metadata: { date: topic.date, url: publishedUrl, postChat },
    });

    res.json({ ok: true, url: publishedUrl });
  } catch (err) {
    if (isDuplicateTitleError(err)) {
      try {
        const botConfig = loadBotConfig();
        const postTitle = formatPostTitle(req.params.date);
        const existingUrl = await findExistingPublishedThread(postTitle, botConfig);

        if (existingUrl) {
          await writeDataJSON(
            `output/published-url-${req.params.date}.txt`,
            { url: existingUrl, date: req.params.date, publishedAt: new Date().toISOString(), source: 'existing_community_topic' },
            `published thread for ${req.params.date}`
          );
        }

        await appendOperationLog({
          action: 'publish_daily_thread',
          status: 'skipped',
          message: `Daily thread for ${req.params.date} already exists in Community`,
          metadata: { date: req.params.date, reason: 'duplicate_title', url: existingUrl || undefined },
        });
        res.json({ ok: true, skipped: true, reason: 'duplicate_title', url: existingUrl || undefined });
        return;
      } catch {
        // Fall through to the original error when the existing topic cannot be confirmed.
      }
    }

    await appendOperationLog({
      action: 'publish_daily_thread',
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
      metadata: { date: req.params.date },
    });
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
