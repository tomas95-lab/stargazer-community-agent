import { loadBotConfig, DailyThreadConfig } from './config';
import { renderDailyThread, renderAnnouncement } from './templates';
import { generateAndSaveAnnouncement } from './announcement';
import { CommunityBot } from './communityBot';
import { todayDate, getTodayTopic, saveFile, parseArgs, askConfirmation, formatPostTitle, isUtcBusinessDay } from './utils';
import { loadProjectLinks } from './links';
import { APP_TIME_ZONE_LABEL } from './timezone';

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'y'].includes((value || '').toLowerCase());
}

async function main(): Promise<void> {
  const { mode, yes } = parseArgs();
  const now = new Date();
  const date = todayDate(now);
  if (mode === 'publish' && !truthy(process.env.FORCE_DAILY_PUBLISH) && !isUtcBusinessDay(now)) {
    console.log(`Daily thread for ${date} skipped because it is Saturday or Sunday in ${APP_TIME_ZONE_LABEL}.`);
    console.log('Set FORCE_DAILY_PUBLISH=true only if you intentionally need an emergency weekend publish.');
    return;
  }

  const topic = await getTodayTopic(date);

  const postTitle = formatPostTitle(topic.date);
  const links = await loadProjectLinks();

  console.log(`\n📅 Date: ${topic.date}`);
  console.log(`📝 Post title: ${postTitle}`);
  console.log(`🔖 Topic: ${topic.topic}`);
  console.log(`🎯 Mode: ${mode}\n`);

  const threadContent = renderDailyThread(topic, links);

  const threadFile = saveFile(`daily-thread-${topic.date}.md`, threadContent);
  console.log(`💾 Daily thread saved: ${threadFile}`);

  if (mode === 'dry-run') {
    const placeholderUrl = `https://community.outlier.ai/t/placeholder/${topic.date}`;
    const announcementFile = await generateAndSaveAnnouncement(topic, placeholderUrl);
    console.log(`💾 Announcement (placeholder) saved: ${announcementFile}`);
    console.log('\n✅ Dry run complete. No Community API publish was attempted.\n');
    return;
  }

  const botConfig = loadBotConfig();

  showPreview(topic, threadContent, botConfig);

  if (!yes) {
    const confirmed = await askConfirmation('\n🚀 Ready to publish?');
    if (!confirmed) {
      console.log('❌ Aborted by user.\n');
      process.exit(0);
    }
  }

  const bot = new CommunityBot(botConfig);

  try {
    await bot.launch();
    console.log('🌐 Connected to Discourse API');

    const publishedUrl = await bot.publishDailyThread(postTitle, threadContent, topic.tags);

    saveFile(`published-url-${topic.date}.txt`, publishedUrl);
    console.log(`💾 Published URL saved`);

    const announcementFile = await generateAndSaveAnnouncement(topic, publishedUrl);
    console.log(`💾 Announcement saved: ${announcementFile}`);

    if (!yes) {
      const postChat = await askConfirmation('\n💬 Post announcement to chat channel?');
      if (postChat) {
        const announcementText = renderAnnouncement(topic, publishedUrl);
        await bot.postAnnouncementToChat(announcementText);
      }
    } else {
      const announcementText = renderAnnouncement(topic, publishedUrl);
      await bot.postAnnouncementToChat(announcementText);
    }

    console.log('\n✅ Done! Daily thread published and announcement generated.\n');
  } catch (err) {
    console.error('\n❌ Error during publish:', err);
    await bot.close();
    process.exit(1);
  } finally {
    await bot.close();
    process.exit(0);
  }
}

function showPreview(config: DailyThreadConfig, body: string, botConfig: { communityBaseUrl: string }): void {
  console.log('\n' + '='.repeat(60));
  console.log('PREVIEW');
  console.log('='.repeat(60));
  console.log(`Title:    ${formatPostTitle(config.date)}`);
  console.log(`Target →  ${botConfig.communityBaseUrl}`);
  console.log(`Webinar:  ${config.webinar?.enabled ? `YES (${config.webinar.timeLabel})` : 'No'}`);
  console.log('-'.repeat(60));
  console.log(body.slice(0, 500));
  if (body.length > 500) console.log('\n... (truncated)');
  console.log('='.repeat(60));
}

main();
