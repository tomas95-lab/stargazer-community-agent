import { BotConfig } from './config';
import { DiscourseClient } from './discourse-client';
import { assertProjectAutomationActive } from './project-context';
import { isDemoMode } from './project-context';
import { appendDemoCommunityMessage } from './demo-mode';

export class CommunityBot {
  private config: BotConfig;
  private client: DiscourseClient;

  constructor(config: BotConfig) {
    this.config = config;
    this.client = new DiscourseClient({
      baseUrl: config.communityBaseUrl,
      apiKey: config.discourseApiKey,
      apiClientId: config.discourseApiClientId,
    });
  }

  async launch(): Promise<void> {}

  async publishDailyThread(title: string, body: string, tags?: string[]): Promise<string> {
    assertProjectAutomationActive();
    if (isDemoMode()) {
      const id = await appendDemoCommunityMessage(`${title}\n\n${body}`);
      return `https://demo.community.local/t/${id}`;
    }
    const data = await this.client.createTopic({
      title,
      raw: body,
      categoryId: parseInt(this.config.communityCategoryId, 10),
      tags,
    });

    const publishedUrl = this.client.topicUrl(data.topic_slug, data.topic_id);
    console.log(`🔗 Published URL: ${publishedUrl}`);
    return publishedUrl;
  }

  async postAnnouncementToChat(announcement: string): Promise<void> {
    try {
      assertProjectAutomationActive();
      if (isDemoMode()) await appendDemoCommunityMessage(announcement);
      else await this.client.sendChatMessage(this.config.communityChatChannelId, announcement);
      console.log('✅ Announcement posted to chat');
    } catch (err) {
      console.log(`⚠️  ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async close(): Promise<void> {}
}
