import test from 'node:test';
import assert from 'node:assert/strict';
import { writeJSON } from '../dist/github-storage.js';

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
    if (calls.length === 3) return jsonResponse({ type: 'file', sha: 'new-sha', content: 'e30=' });
    if (calls.length === 4) return jsonResponse({ content: { sha: 'final-sha' } });

    throw new Error(`Unexpected fetch call ${calls.length}`);
  };

  try {
    await writeJSON('data/topics.json', [{ date: '2026-07-14' }], 'sync topics');

    assert.equal(calls.length, 4);
    assert.equal(calls[1].body.sha, 'old-sha');
    assert.equal(calls[3].body.sha, 'new-sha');
    assert.equal(calls[3].body.message, 'sync topics');
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
