import test from 'node:test';
import assert from 'node:assert/strict';
import { DiscourseClient } from '../dist/discourse-client.js';

test('DiscourseClient normalizes base URL for topic links', () => {
  const client = new DiscourseClient({
    baseUrl: 'https://community.example/',
    apiKey: 'key',
    apiClientId: 'client',
  });

  assert.equal(client.topicUrl('daily-thread', 123), 'https://community.example/t/daily-thread/123');
});

test('DiscourseClient can send a chat message as a threaded reply', async () => {
  const previousFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      json: async () => ({ id: 456 }),
    };
  };

  try {
    const client = new DiscourseClient({
      baseUrl: 'https://community.example/',
      apiKey: 'key',
      apiClientId: 'client',
    });

    await client.sendChatMessage('42', 'Answer in thread', {
      inReplyToId: 123,
      threadId: 999,
    });

    assert.equal(calls[0].url, 'https://community.example/chat/42.json');
    assert.equal(calls[0].init.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      message: 'Answer in thread',
      in_reply_to_id: 123,
      thread_id: 999,
    });
  } finally {
    global.fetch = previousFetch;
  }
});
