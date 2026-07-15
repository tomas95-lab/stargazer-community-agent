import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, writeJSON } from '../dist/github-storage.js';

function jsonResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

test('writeJSON retries with the latest GitHub content SHA after a 409 conflict', async () => {
  const previousFetch = global.fetch;
  const previousToken = process.env.GITHUB_TOKEN;
  const previousOwner = process.env.GITHUB_OWNER;
  const previousRepo = process.env.GITHUB_REPO;
  const calls = [];

  process.env.GITHUB_TOKEN = 'token';
  process.env.GITHUB_OWNER = 'owner';
  process.env.GITHUB_REPO = 'repo';

  global.fetch = async (url, init = {}) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });

    if (calls.length === 1) return jsonResponse({ type: 'file', sha: 'old-sha', content: 'e30=' });
    if (calls.length === 2) {
      return jsonResponse(
        {
          message: 'is at new-sha but expected old-sha',
          documentation_url: 'https://docs.github.com/rest/repos/contents#create-or-update-file-contents',
        },
        false,
        409,
      );
    }
    if (calls.length === 3) return jsonResponse({ content: { sha: 'final-sha' } });

    throw new Error(`Unexpected fetch call ${calls.length}`);
  };

  try {
    await writeJSON('data/topics.json', [{ date: '2026-07-14' }], 'sync topics');

    assert.equal(calls.length, 3);
    assert.equal(calls[1].body.sha, 'old-sha');
    assert.equal(calls[2].body.sha, 'new-sha');
    assert.equal(calls[2].body.message, 'sync topics');
  } finally {
    global.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousToken;
    if (previousOwner === undefined) delete process.env.GITHUB_OWNER;
    else process.env.GITHUB_OWNER = previousOwner;
    if (previousRepo === undefined) delete process.env.GITHUB_REPO;
    else process.env.GITHUB_REPO = previousRepo;
  }
});

test('writeJSON uses the latest SHA reported in GitHub 409 response', async () => {
  const previousFetch = global.fetch;
  const previousToken = process.env.GITHUB_TOKEN;
  const previousOwner = process.env.GITHUB_OWNER;
  const previousRepo = process.env.GITHUB_REPO;
  const previousSetTimeout = global.setTimeout;
  const calls = [];

  process.env.GITHUB_TOKEN = 'token';
  process.env.GITHUB_OWNER = 'owner';
  process.env.GITHUB_REPO = 'repo';
  global.setTimeout = (fn) => {
    fn();
    return 0;
  };

  global.fetch = async (url, init = {}) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });

    if (calls.length === 1) return jsonResponse({ type: 'file', sha: 'ee92944682dc6c2e4bcd06b1cba9242541c31a8c', content: 'e30=' });
    if (calls.length === 2) {
      return jsonResponse(
        {
          message: 'is at 5045ad200756a9b7b8838c900bcbe24a02ba6979 but expected ee92944682dc6c2e4bcd06b1cba9242541c31a8c',
          documentation_url: 'https://docs.github.com/rest/repos/contents#create-or-update-file-contents',
          status: '409',
        },
        false,
        409,
      );
    }
    if (calls.length === 3) return jsonResponse({ content: { sha: 'final-sha' } });

    throw new Error(`Unexpected fetch call ${calls.length}`);
  };

  try {
    await writeJSON('data/topics.json', [{ date: '2026-07-15' }], 'sync topics');

    assert.equal(calls.length, 3);
    assert.equal(calls[1].body.sha, 'ee92944682dc6c2e4bcd06b1cba9242541c31a8c');
    assert.equal(calls[2].body.sha, '5045ad200756a9b7b8838c900bcbe24a02ba6979');
  } finally {
    global.fetch = previousFetch;
    global.setTimeout = previousSetTimeout;
    if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousToken;
    if (previousOwner === undefined) delete process.env.GITHUB_OWNER;
    else process.env.GITHUB_OWNER = previousOwner;
    if (previousRepo === undefined) delete process.env.GITHUB_REPO;
    else process.env.GITHUB_REPO = previousRepo;
  }
});

test('writeFile also retries GitHub 409 conflicts', async () => {
  const previousFetch = global.fetch;
  const previousToken = process.env.GITHUB_TOKEN;
  const previousOwner = process.env.GITHUB_OWNER;
  const previousRepo = process.env.GITHUB_REPO;
  const previousSetTimeout = global.setTimeout;
  const calls = [];

  process.env.GITHUB_TOKEN = 'token';
  process.env.GITHUB_OWNER = 'owner';
  process.env.GITHUB_REPO = 'repo';
  global.setTimeout = (fn) => {
    fn();
    return 0;
  };

  global.fetch = async (url, init = {}) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });

    if (calls.length === 1) return jsonResponse({ type: 'file', sha: 'old-sha', content: 'b2xk' });
    if (calls.length === 2) {
      return jsonResponse({ message: 'is at new-sha but expected old-sha' }, false, 409);
    }
    if (calls.length === 3) return jsonResponse({ content: { sha: 'final-sha' } });

    throw new Error(`Unexpected fetch call ${calls.length}`);
  };

  try {
    await writeFile('data/project-guidelines.txt', 'new text', 'sync guidelines');

    assert.equal(calls.length, 3);
    assert.equal(calls[2].body.sha, 'new-sha');
    assert.equal(Buffer.from(calls[2].body.content, 'base64').toString('utf8'), 'new text');
  } finally {
    global.fetch = previousFetch;
    global.setTimeout = previousSetTimeout;
    if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousToken;
    if (previousOwner === undefined) delete process.env.GITHUB_OWNER;
    else process.env.GITHUB_OWNER = previousOwner;
    if (previousRepo === undefined) delete process.env.GITHUB_REPO;
    else process.env.GITHUB_REPO = previousRepo;
  }
});
