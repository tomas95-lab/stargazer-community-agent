import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertDiscourseUserApiKey,
  looksLikeEncryptedDiscoursePayload,
  validateDiscourseProjectAccess,
  validateDiscourseUserApiKey,
} from '../dist/discourse-credentials.js';

test('encrypted authorization payloads are not accepted as user API keys', () => {
  const payload = Buffer.alloc(256, 7).toString('base64');
  assert.equal(looksLikeEncryptedDiscoursePayload(payload), true);
  assert.throws(
    () => assertDiscourseUserApiKey(payload),
    /encrypted authorization code, not a User API Key/,
  );
});

test('credential validation returns the connected Discourse username', async () => {
  const previousFetch = global.fetch;
  let receivedHeaders;
  global.fetch = async (_url, init) => {
    receivedHeaders = init.headers;
    return new Response(JSON.stringify({ current_user: { username: 'qm.user' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const result = await validateDiscourseUserApiKey({
      baseUrl: 'https://community.example/',
      apiKey: 'actual-user-api-key',
      apiClientId: 'daily-thread-bot',
    });
    assert.equal(result.username, 'qm.user');
    assert.equal(receivedHeaders['User-Api-Key'], 'actual-user-api-key');
    assert.equal(receivedHeaders['User-Api-Client-Id'], 'daily-thread-bot');
  } finally {
    global.fetch = previousFetch;
  }
});

test('credential validation retries a Discourse rate limit response', async () => {
  const previousFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({ extras: { wait_seconds: 0 } }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ current_user: { username: 'qm.user' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const result = await validateDiscourseUserApiKey({
      baseUrl: 'https://community.example',
      apiKey: 'actual-user-api-key',
      maxRateLimitWaitMs: 1,
    });
    assert.equal(result.username, 'qm.user');
    assert.equal(calls, 2);
  } finally {
    global.fetch = previousFetch;
  }
});

test('project access validation checks category and channel', async () => {
  const previousFetch = global.fetch;
  const paths = [];
  global.fetch = async (url) => {
    paths.push(new URL(url).pathname);
    const body = url.endsWith('/session/current.json')
      ? { current_user: { username: 'qm.user' } }
      : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const result = await validateDiscourseProjectAccess({
      baseUrl: 'https://community.example',
      apiKey: 'actual-user-api-key',
      apiClientId: 'daily-thread-bot',
      categoryId: '5443',
      channelId: '681506',
    });
    assert.equal(result.username, 'qm.user');
    assert.deepEqual(paths, [
      '/session/current.json',
      '/c/5443.json',
      '/chat/api/channels/681506/messages.json',
    ]);
  } finally {
    global.fetch = previousFetch;
  }
});

test('project access validation reuses the username from the completed authorization', async () => {
  const previousFetch = global.fetch;
  const paths = [];
  global.fetch = async (url) => {
    paths.push(new URL(url).pathname);
    return new Response('{}', { status: 200 });
  };

  try {
    const result = await validateDiscourseProjectAccess({
      baseUrl: 'https://community.example',
      apiKey: 'actual-user-api-key',
      categoryId: '5443',
      channelId: '681506',
      knownUsername: 'qm.user',
    });
    assert.equal(result.username, 'qm.user');
    assert.deepEqual(paths, [
      '/c/5443.json',
      '/chat/api/channels/681506/messages.json',
    ]);
  } finally {
    global.fetch = previousFetch;
  }
});

test('project access validation explains inaccessible channels', async () => {
  const previousFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.endsWith('/session/current.json')) {
      return new Response(JSON.stringify({ current_user: { username: 'qm.user' } }), { status: 200 });
    }
    if (url.includes('/c/5443.json')) return new Response('{}', { status: 200 });
    return new Response(JSON.stringify({ errors: ['Not allowed'], error_type: 'invalid_access' }), { status: 403 });
  };

  try {
    await assert.rejects(
      validateDiscourseProjectAccess({
        baseUrl: 'https://community.example',
        apiKey: 'actual-user-api-key',
        categoryId: '5443',
        channelId: '681506',
      }),
      /Connected as qm\.user, but this account cannot access channel ID 681506/,
    );
  } finally {
    global.fetch = previousFetch;
  }
});
