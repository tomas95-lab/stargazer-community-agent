import { BotConfig } from './config';

interface DiscourseTopicResponse {
  topic_id: number;
  topic_slug: string;
  id: number;
}

export class CommunityBot {
  private config: BotConfig;

  constructor(config: BotConfig) {
    this.config = config;
  }

  async launch(): Promise<void> {}

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'User-Api-Key': this.config.discourseApiKey,
      'User-Api-Client-Id': this.config.discourseApiClientId,
    };
  }

  async publishDailyThread(title: string, body: string, tags?: string[]): Promise<string> {
    const url = `${this.config.communityBaseUrl}/posts.json`;

    const payload: Record<string, unknown> = {
      title,
      raw: body,
      category: parseInt(this.config.communityCategoryId, 10),
      tags: tags || [],
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`Discourse API error ${res.status}: ${errorBody}`);
    }

    const data: DiscourseTopicResponse = await res.json();
    const publishedUrl = `${this.config.communityBaseUrl}/t/${data.topic_slug}/${data.topic_id}`;
    console.log(`🔗 Published URL: ${publishedUrl}`);
    return publishedUrl;
  }

  async postAnnouncementToChat(announcement: string): Promise<void> {
    const url = `${this.config.communityBaseUrl}/chat/${this.config.communityChatChannelId}.json`;

    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ message: announcement }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.log(`⚠️  Chat API error ${res.status}: ${errorBody}`);
      return;
    }

    console.log('✅ Announcement posted to chat');
  }

  async close(): Promise<void> {}
}
