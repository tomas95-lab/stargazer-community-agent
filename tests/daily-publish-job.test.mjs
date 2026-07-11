import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyPublishSkipReason } from '../dist/daily-publish-job.js';
import { isArgentinaBusinessDay, todayDate } from '../dist/utils.js';

test('todayDate follows the Argentina calendar day', () => {
  assert.equal(todayDate(new Date('2026-07-11T02:30:00.000Z')), '2026-07-10');
  assert.equal(todayDate(new Date('2026-07-11T13:00:00.000Z')), '2026-07-11');
});

test('daily publish skips Saturdays in Argentina', () => {
  const saturdayAtTenArg = new Date('2026-07-11T13:00:00.000Z');
  const skip = dailyPublishSkipReason(saturdayAtTenArg);

  assert.equal(isArgentinaBusinessDay(saturdayAtTenArg), false);
  assert.equal(skip?.date, '2026-07-11');
  assert.equal(skip?.reason, 'weekend_argentina');
});

test('daily publish runs on weekdays and can be forced on weekends', () => {
  const fridayAtTenArg = new Date('2026-07-10T13:00:00.000Z');
  const saturdayAtTenArg = new Date('2026-07-11T13:00:00.000Z');

  assert.equal(dailyPublishSkipReason(fridayAtTenArg), null);
  assert.equal(dailyPublishSkipReason(saturdayAtTenArg, true), null);
});
