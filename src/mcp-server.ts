import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadBotConfig } from './config';
import { CommunityBot } from './communityBot';
import { renderDailyThread, renderAnnouncement } from './templates';
import { formatPostTitle, todayDate } from './utils';
import { DiscourseClient } from './discourse-client';
import { readDataJSON } from './data-store';
import { loadProjectLinks } from './links';
import { assertProjectAutomationActive } from './project-context';

function discourseClient(): DiscourseClient {
  const config = loadBotConfig();
  return new DiscourseClient({
    baseUrl: config.communityBaseUrl,
    apiKey: config.discourseApiKey,
    apiClientId: config.discourseApiClientId,
  });
}

const server = new McpServer({
  name: 'community-management-agent',
  version: '1.0.0',
});

server.tool(
  'publish_daily_thread',
  'Publish today\'s daily thread to the active project community.',
  {
    date: z.string().optional().describe('Date in YYYY-MM-DD format. Defaults to today.'),
    post_chat: z.boolean().optional().describe('Also post announcement to chat channel. Defaults to true.'),
  },
  async ({ date, post_chat }) => {
    const targetDate = date || todayDate();
    const postChat = post_chat !== false;

    const topics = await readDataJSON<Array<{ date: string; [key: string]: unknown }>>('data/topics.json');
    const topic = topics.find((t) => t.date === targetDate) || { ...topics[0], date: targetDate };

    if (!topic) return { content: [{ type: 'text', text: 'No topics found.' }] };

    const botConfig = loadBotConfig();
    const bot = new CommunityBot(botConfig);
    const title = formatPostTitle(targetDate);
    const typedTopic = topic as unknown as Parameters<typeof renderDailyThread>[0];
    const links = await loadProjectLinks();
    const body = renderDailyThread(typedTopic, links);

    const url = await bot.publishDailyThread(title, body, (topic as { tags?: string[] }).tags);

    if (postChat) {
      const announcement = renderAnnouncement(typedTopic, url);
      await bot.postAnnouncementToChat(announcement);
    }

    return { content: [{ type: 'text', text: `✅ Published: ${url}` }] };
  }
);

server.tool(
  'send_chat_message',
  'Send a message to the active project community chat channel.',
  {
    message: z.string().describe('The message to send to the chat channel.'),
  },
  async ({ message }) => {
    try {
      assertProjectAutomationActive();
      await discourseClient().sendChatMessage(loadBotConfig().communityChatChannelId, message);
      return { content: [{ type: 'text', text: '✅ Message sent to chat.' }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `❌ ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

server.tool(
  'read_chat_messages',
  'Read recent messages from the active project community chat channel.',
  {
    count: z.number().optional().describe('Number of recent messages to fetch. Defaults to 20.'),
  },
  async ({ count }) => {
    const limit = count || 20;
    try {
      const msgs = await discourseClient().readChatMessages(loadBotConfig().communityChatChannelId, limit);
      const text = msgs.map((m) => `[${m.user?.username}] ${m.message}`).join('\n');
      return { content: [{ type: 'text', text: text || 'No messages found.' }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `❌ ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

server.tool(
  'read_community_posts',
  'Read recent posts/topics from the active project community forum.',
  {
    category_id: z.number().optional().describe('Category ID to filter. Defaults to the active project category.'),
    count: z.number().optional().describe('Number of topics to fetch. Defaults to 10.'),
  },
  async ({ category_id, count }) => {
    const catId = category_id || parseInt(loadBotConfig().communityCategoryId, 10);
    if (!Number.isFinite(catId)) return { content: [{ type: 'text', text: 'No category is configured for the active project.' }] };
    const limit = count || 10;
    try {
      const client = discourseClient();
      const topics = await client.readCategoryTopics(catId, limit);
      const text = topics.map((t) => `- [${t.title}](${client.topicUrl(t.slug, t.id)}) (${t.posts_count} replies)`).join('\n');
      return { content: [{ type: 'text', text: text || 'No topics found.' }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `❌ ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

server.tool(
  'reply_to_topic',
  'Reply to a specific topic in the active project community forum.',
  {
    topic_id: z.number().describe('The topic ID to reply to.'),
    message: z.string().describe('The reply message content (supports markdown).'),
  },
  async ({ topic_id, message }) => {
    try {
      assertProjectAutomationActive();
      const data = await discourseClient().replyToTopic(topic_id, message);
      return { content: [{ type: 'text', text: `✅ Reply posted (post ID: ${data.id})` }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `❌ ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

server.tool(
  'read_topic_posts',
  'Read all posts/replies inside a specific topic.',
  {
    topic_id: z.number().describe('The topic ID to read.'),
  },
  async ({ topic_id }) => {
    try {
      const data = await discourseClient().readTopic(topic_id);
      const posts = data.post_stream?.posts || [];
      const text = `# ${data.title}\n\n` + posts.map((p) => `**${p.username}** (${p.created_at.split('T')[0]}):\n${p.cooked.replace(/<[^>]+>/g, '').trim()}`).join('\n\n---\n\n');
      return { content: [{ type: 'text', text: text }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `❌ ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
