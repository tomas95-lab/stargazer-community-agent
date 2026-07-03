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
