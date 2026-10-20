import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('tsx/cjs');
const { availabilityFeedback, availabilityAnnouncementUrl, checkAvailabilityUntilComplete } = require('../ui/src/lib/task-availability.ts');

test('every availability outcome has explicit feedback, including unknown responses', () => {
  for (const status of ['available', 'notified', 'already_notified', 'pending', 'error', 'skipped', 'unknown']) {
    const feedback = availabilityFeedback({ status });
    assert.ok(feedback.title.length > 0);
    assert.ok(feedback.message.length > 0);
  }
  const previous = availabilityFeedback({ status: 'already_notified' });
  assert.match(previous.message, /already sent.*no duplicate/);
  assert.equal(previous.error, false);
  assert.match(availabilityFeedback({ status: 'skipped', reason: 'diagnostics_disabled' }).message, /Diagnostics/);
  assert.match(availabilityFeedback({ status: 'skipped', reason: 'already_running' }).message, /running/);
  assert.equal(availabilityFeedback({ status: 'already_notified', reason: 'delivery_requires_verification' }).error, true);
});

test('announcement link requires a confirmed message and safe Community URL', () => {
  const result = { status: 'already_notified', messageId: 123 };
  assert.equal(availabilityAnnouncementUrl('https://community.outlier.ai', result), 'https://community.outlier.ai/chat/message/123');
  for (const base of ['javascript:alert(1)', 'http://community.outlier.ai', 'https://user:password@community.outlier.ai', 'invalid']) {
    assert.equal(availabilityAnnouncementUrl(base, result), undefined);
  }
  for (const invalid of [{ status: 'pending', messageId: 123 }, { ...result, reason: 'delivery_requires_verification' },
    { ...result, messageId: 0 }, { ...result, messageId: '123' }, { status: 'notified' }]) {
    assert.equal(availabilityAnnouncementUrl('https://community.outlier.ai', invalid), undefined);
  }
});

test('pending query is resumed automatically and stops as soon as a result arrives', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let checks = 0;
  let progress = 0;
  const promise = checkAvailabilityUntilComplete(async () => ++checks === 1 ? { status: 'pending' } : { status: 'available' },
    new AbortController().signal, () => progress++);
  await new Promise(setImmediate);
  t.mock.timers.tick(2500);
  assert.equal((await promise).status, 'available');
  assert.equal(checks, 2);
  assert.equal(progress, 1);
});

test('pending retries are bounded, rather than leaving the button busy indefinitely', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let checks = 0;
  const promise = checkAvailabilityUntilComplete(async () => { checks++; return { status: 'pending' }; },
    new AbortController().signal, () => {});
  for (let i = 0; i < 3; i++) {
    await new Promise(setImmediate);
    t.mock.timers.tick(2500);
  }
  assert.equal((await promise).status, 'pending');
  assert.equal(checks, 4);
});

test('project switch or unmount aborts polling before any further check', async () => {
  const controller = new AbortController();
  let checks = 0;
  const promise = checkAvailabilityUntilComplete(async () => { checks++; return { status: 'pending' }; },
    controller.signal, () => {});
  const rejected = assert.rejects(promise, { name: 'AbortError' });
  await new Promise(setImmediate);
  controller.abort();
  await rejected;
  assert.equal(checks, 1);
});

test('terminal outcomes and network failures never trigger automatic extra checks', async () => {
  for (const status of ['notified', 'already_notified', 'available', 'error', 'skipped']) {
    let checks = 0;
    const result = await checkAvailabilityUntilComplete(async () => { checks++; return { status }; },
      new AbortController().signal, () => assert.fail('Unexpected retry'));
    assert.equal(result.status, status);
    assert.equal(checks, 1);
  }
  await assert.rejects(checkAvailabilityUntilComplete(async () => { throw new Error('Network unavailable'); },
    new AbortController().signal, () => assert.fail('Unexpected retry')), /Network unavailable/);
});
