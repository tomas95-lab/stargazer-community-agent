import * as dotenv from 'dotenv';
dotenv.config();

import { loadBotConfig } from './config';
import { CommunityBot } from './communityBot';
import { renderAnnouncement, renderDailyThread } from './templates';
import { readDataText, writeDataJSON } from './data-store';
import { loadProjectLinks } from './links';
import { appendOperationLog } from './operations-log';
import { formatPostTitle, getTodayTopic, todayDate } from './utils';

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'y'].includes((value || '').toLowerCase());
}

async function wasAlreadyPublished(date: string): Promise<boolean> {
  try {
    await readDataText(`output/published-url-${date}.txt`);
    return true;
  } catch {
    return false;
  }
}

export async function runDailyPublishJob(): Promise<void> {
  const date = todayDate();
  const force = truthy(process.env.FORCE_DAILY_PUBLISH);
  const postChat = process.env.DAILY_PUBLISH_POST_CHAT !== 'false';

  if (!force && await wasAlreadyPublished(date)) {
    console.log(`Daily thread for ${date} already has a published URL. Skipping.`);
    await appendOperationLog({
      action: 'daily_publish_job',
      status: 'skipped',
      message: `Daily thread for ${date} was already published`,
      metadata: { date },
    });
    return;
  }

  const topic = await getTodayTopic(date);
  const links = await loadProjectLinks();
  const title = formatPostTitle(topic.date);
  const body = renderDailyThread(topic, links);
  const bot = new CommunityBot(loadBotConfig());

  try {
    const url = await bot.publishDailyThread(title, body, topic.tags);
    await writeDataJSON(
      `output/published-url-${topic.date}.txt`,
      { url, date: topic.date, publishedAt: new Date().toISOString(), source: 'daily_publish_job' },
      `published thread for ${topic.date}`
    );

    if (postChat) {
      await bot.postAnnouncementToChat(renderAnnouncement(topic, url));
    }

    await appendOperationLog({
      action: 'daily_publish_job',
      status: 'success',
      message: `Published daily thread for ${topic.date}`,
      metadata: { date: topic.date, url, postChat },
    });
  } catch (err) {
    await appendOperationLog({
      action: 'daily_publish_job',
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
      metadata: { date: topic.date },
    });
    throw err;
  }
}

if (require.main === module) {
  runDailyPublishJob().catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
}
