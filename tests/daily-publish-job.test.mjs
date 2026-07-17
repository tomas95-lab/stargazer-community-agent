import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyPublishSkipReason } from '../dist/daily-publish-job.js';
import { isUtcBusinessDay, todayDate } from '../dist/utils.js';

test('todayDate follows the PST calendar day', () => {
  assert.equal(todayDate(new Date('2026-07-11T02:30:00.000Z')), '2026-07-10');
  assert.equal(todayDate(new Date('2026-07-11T13:00:00.000Z')), '2026-07-11');
});

test('daily publish skips Saturdays in PST', () => {
  const saturday = new Date('2026-07-11T13:00:00.000Z');
  const skip = dailyPublishSkipReason(saturday);

  assert.equal(isUtcBusinessDay(saturday), false);
  assert.equal(skip?.date, '2026-07-11');
  assert.equal(skip?.reason, 'weekend_pst');
});

test('daily publish runs on weekdays and can be forced on weekends', () => {
  const friday = new Date('2026-07-10T13:00:00.000Z');
  const saturday = new Date('2026-07-11T13:00:00.000Z');

  assert.equal(dailyPublishSkipReason(friday), null);
  assert.equal(dailyPublishSkipReason(saturday, true), null);
});
