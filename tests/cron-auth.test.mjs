import test from 'node:test';
import assert from 'node:assert/strict';
import { isAuthorizedCronRequest, isExpectedVercelCron } from '../dist/cron-auth.js';

test('cron auth accepts the configured bearer secret', () => {
  assert.equal(
    isAuthorizedCronRequest(
      { authorization: 'Bearer test-secret' },
      'test-secret',
    ),
    true,
  );
});

test('cron auth rejects an incorrect bearer secret', () => {
  assert.equal(
    isAuthorizedCronRequest(
      { authorization: 'Bearer wrong-secret' },
      'test-secret',
    ),
    false,
  );
});

test('cron auth accepts the dedicated cron secret header', () => {
  assert.equal(
    isAuthorizedCronRequest(
      { cronSecretHeader: 'test-secret' },
      'test-secret',
    ),
    true,
  );
});

test('cron auth accepts expected Vercel Cron headers for a known endpoint', () => {
  const input = {
    endpoint: '/api/cron/daily-thread/1100',
    userAgent: 'vercel-cron/1.0',
    vercelCronSchedule: '0 14 * * 1-5',
  };

  assert.equal(isExpectedVercelCron(input), true);
  assert.equal(isAuthorizedCronRequest(input, 'test-secret'), true);
});

test('cron auth rejects Vercel Cron headers with the wrong schedule', () => {
  assert.equal(
    isAuthorizedCronRequest(
      {
        endpoint: '/api/cron/daily-thread/1100',
        userAgent: 'vercel-cron/1.0',
        vercelCronSchedule: '0 13 * * 1-5',
      },
      'test-secret',
    ),
    false,
  );
});
