export interface DiscourseClientConfig {
  baseUrl: string;
  apiKey: string;
  apiClientId: string;
}

export interface DiscourseTopicResponse {
  topic_id: number;
  topic_slug: string;
  id: number;
}

export interface DiscourseChatMessage {
  id: number;
  message: string;
  cooked?: string;
  excerpt?: string;
  chat_channel_id?: number;
  thread_id?: number | null;
  thread?: {
    id: number;
    preview?: {
      last_reply_created_at?: string;
      last_reply_excerpt?: string;
      last_reply_id?: number;
      last_reply_user?: {
        username: string;
      };
      reply_count?: number;
    };
  };
  in_reply_to_id?: number;
  reply_to_msg_id?: number;
  reply_to_message_id?: number;
  user: {
    id?: number;
    username: string;
    name?: string;
    moderator?: boolean;
    admin?: boolean;
    staff?: boolean;
    primary_group_name?: string;
  };
  created_at: string;
}

export interface DiscourseChatUser {
  id?: number;
  username: string;
  name?: string;
}

export interface DiscourseChannelLastMessage {
  id: number;
  message?: string;
  cooked?: string;
  excerpt?: string;
  chat_channel_id?: number;
  thread_id?: number | null;
  user?: DiscourseChatMessage['user'];
  created_at: string;
}

export interface DiscourseDirectMessageChannel {
  id: number;
  title?: string | null;
  slug?: string | null;
  unicode_title?: string | null;
  last_message?: DiscourseChannelLastMessage;
  last_message_id?: number;
  last_message_created_at?: string;
  current_user_membership?: Record<string, unknown>;
  users?: DiscourseChatUser[];
  chatable?: {
    users?: DiscourseChatUser[];
    direct_message_users?: DiscourseChatUser[];
    participants?: DiscourseChatUser[];
    group_users?: DiscourseChatUser[];
  };
}

export interface DiscourseTopicSummary {
  title: string;
  posts_count: number;
  last_posted_at: string;
  slug: string;
  id: number;
}

export interface DiscourseTopicPost {
  id?: number;
  username: string;
  name?: string;
  raw?: string;
  cooked: string;
  created_at: string;
}

export interface DiscourseTopicDetails {
  id?: number;
  title?: string;
  slug?: string;
  post_stream?: { posts?: DiscourseTopicPost[] };
}

export interface DiscourseChatMessageQuery {
  pageSize?: number;
  targetMessageId?: number;
  direction?: 'past' | 'future';
  fetchFromLastRead?: boolean;
}

export class DiscourseClient {
  private baseUrl: string;
  private apiKey: string;
  private apiClientId: string;

  constructor(config: DiscourseClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.apiClientId = config.apiClientId;
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'User-Api-Key': this.apiKey,
      'User-Api-Client-Id': this.apiClientId,
    };
  }

  private rateLimitMaxWaitMs(): number {
    const seconds = Number(process.env.DISCOURSE_RATE_LIMIT_MAX_WAIT_SECONDS || 30);
    return Math.max(0, Number.isFinite(seconds) ? seconds * 1000 : 30000);
  }

  private rateLimitRetryCount(): number {
    const retries = Number(process.env.DISCOURSE_RATE_LIMIT_RETRIES || 2);
    return Math.max(0, Number.isFinite(retries) ? Math.floor(retries) : 2);
  }

  private parseRateLimitWaitMs(res: Response, body: string): number {
    const retryAfter = Number(res.headers.get('retry-after'));
    if (Number.isFinite(retryAfter)) {
      return Math.min(this.rateLimitMaxWaitMs(), Math.max(0, retryAfter * 1000));
    }

    try {
      const parsed = JSON.parse(body) as { extras?: { wait_seconds?: unknown } };
      const waitSeconds = Number(parsed.extras?.wait_seconds);
      if (Number.isFinite(waitSeconds)) {
        return Math.min(this.rateLimitMaxWaitMs(), Math.max(0, waitSeconds * 1000));
      }
    } catch {
      // Fall through to the text fallback below.
    }

    const match = body.match(/wait\s+(\d+)\s+seconds?/i);
    const waitSeconds = match ? Number(match[1]) : 5;
    return Math.min(this.rateLimitMaxWaitMs(), Math.max(0, waitSeconds * 1000));
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async request<T>(path: string, init?: RequestInit, attempt = 0): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...this.headers(),
        ...(init?.headers as Record<string, string> | undefined),
      },
    });

    if (!res.ok) {
      const body = await res.text();
      const method = (init?.method || 'GET').toUpperCase();
      if (res.status === 429 && method === 'GET' && attempt < this.rateLimitRetryCount()) {
        await this.sleep(this.parseRateLimitWaitMs(res, body));
        return this.request<T>(path, init, attempt + 1);
      }
      throw new Error(`Discourse API error ${res.status}: ${body.slice(0, 500)}`);
    }

    return res.json() as Promise<T>;
  }

  async createTopic(params: {
    title: string;
    raw: string;
    categoryId: number;
    tags?: string[];
  }): Promise<DiscourseTopicResponse> {
    return this.request<DiscourseTopicResponse>('/posts.json', {
      method: 'POST',
      body: JSON.stringify({
        title: params.title,
        raw: params.raw,
        category: params.categoryId,
        tags: params.tags || [],
      }),
    });
  }

  async replyToTopic(topicId: number, raw: string): Promise<{ id: number }> {
    return this.request<{ id: number }>('/posts.json', {
      method: 'POST',
      body: JSON.stringify({ topic_id: topicId, raw }),
    });
  }

  async sendChatMessage(
    channelId: string,
    message: string,
    options: { inReplyToId?: number; threadId?: number | null } = {}
  ): Promise<{ message_id?: number; id?: number }> {
    const body: Record<string, string | number> = { message };
    if (options.inReplyToId) body.in_reply_to_id = options.inReplyToId;
    if (options.threadId) body.thread_id = options.threadId;

    return this.request<{ message_id?: number; id?: number }>(`/chat/${channelId}.json`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async reactToChatMessage(
    channelId: string,
    messageId: number,
    emoji: string,
    action: 'add' | 'remove' = 'add'
  ): Promise<{ success?: string }> {
    return this.request<{ success?: string }>(`/chat/${channelId}/react/${messageId}.json`, {
      method: 'PUT',
      body: JSON.stringify({
        emoji,
        react_action: action,
      }),
    });
  }

  private chatMessageQuery(params: DiscourseChatMessageQuery): string {
    const query = new URLSearchParams();
    query.set('page_size', String(Math.max(1, Math.floor(params.pageSize || 20))));
    if (params.targetMessageId !== undefined) query.set('target_message_id', String(params.targetMessageId));
    if (params.direction) query.set('direction', params.direction);
    if (params.fetchFromLastRead) query.set('fetch_from_last_read', 'true');
    return query.toString();
  }

  async readChatMessages(channelId: string, count = 20, options: Omit<DiscourseChatMessageQuery, 'pageSize'> = {}): Promise<DiscourseChatMessage[]> {
    const query = this.chatMessageQuery({ ...options, pageSize: count });
    const data = await this.request<{ messages?: DiscourseChatMessage[] }>(
      `/chat/api/channels/${channelId}/messages.json?${query}`
    );
    return data.messages || [];
  }

  async readChatThreadMessages(channelId: string, threadId: number | string, count = 30, options: Omit<DiscourseChatMessageQuery, 'pageSize'> = {}): Promise<DiscourseChatMessage[]> {
    const query = this.chatMessageQuery({ ...options, pageSize: count });
    const data = await this.request<{ messages?: DiscourseChatMessage[] }>(
      `/chat/api/channels/${channelId}/threads/${threadId}/messages.json?${query}`
    );
    return data.messages || [];
  }

  async readMyChatChannels(): Promise<{
    publicChannels: unknown[];
    directMessageChannels: DiscourseDirectMessageChannel[];
  }> {
    const data = await this.request<{
      public_channels?: unknown[];
      direct_message_channels?: DiscourseDirectMessageChannel[];
    }>('/chat/api/me/channels.json');

    return {
      publicChannels: data.public_channels || [],
      directMessageChannels: data.direct_message_channels || [],
    };
  }

  async readDirectMessageChannels(): Promise<DiscourseDirectMessageChannel[]> {
    const data = await this.readMyChatChannels();
    return data.directMessageChannels;
  }

  async readCategoryTopics(categoryId: number, count = 10): Promise<DiscourseTopicSummary[]> {
    const data = await this.request<{
      topic_list?: { topics?: DiscourseTopicSummary[] };
    }>(`/c/${categoryId}.json?page=0`);
    return (data.topic_list?.topics || []).slice(0, count);
  }

  async readTopic(topicId: number): Promise<DiscourseTopicDetails> {
    return this.request<DiscourseTopicDetails>(`/t/${topicId}.json`);
  }

  topicUrl(slug: string, topicId: number): string {
    return `${this.baseUrl}/t/${slug}/${topicId}`;
  }
}
