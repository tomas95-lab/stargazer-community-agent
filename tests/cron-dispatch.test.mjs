import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCronDispatchUrl, shouldDispatchExternalCron } from '../dist/cron-dispatch.js';

test('cron-job.org requests are dispatched in Vercel', () => {
  assert.equal(shouldDispatchExternalCron({
    endpoint: '/api/cron/community-agent/1300',
    method: 'GET',
    source: 'cron-job-org',
    userAgent: 'cron-job.org',
    isVercel: true,
  }), true);
});

test('native Vercel and already dispatched requests run normally', () => {
  assert.equal(shouldDispatchExternalCron({
    endpoint: '/api/cron/community-agent/1300',
    source: 'vercel-cron',
    isVercel: true,
  }), false);
  assert.equal(shouldDispatchExternalCron({
    endpoint: '/api/cron/community-agent/1300',
    source: 'cron-job-org',
    alreadyDispatched: true,
    isVercel: true,
  }), false);
});

test('cron dispatch URL keeps the complete endpoint and query', () => {
  assert.equal(buildCronDispatchUrl({
    originalUrl: '/api/cron/community-agent/1300?project=example',
    productionUrl: 'stargazer-community-agent.vercel.app',
  }), 'https://stargazer-community-agent.vercel.app/api/cron/community-agent/1300?project=example');
});

test('cron dispatch URL rejects unsafe request hosts', () => {
  assert.throws(() => buildCronDispatchUrl({
    originalUrl: '/api/cron/community-agent/1300',
    host: 'example.com/path',
  }), /safe cron dispatch host/i);
});
