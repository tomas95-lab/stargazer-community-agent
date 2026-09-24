import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_MESSAGE_LOOKBACK_HOURS,
  messageLookbackWindow,
  normalizeMessageLookbackHours,
} from '../dist/message-window.js';
import { runWithProjectContext } from '../dist/project-context.js';

test('message lookback defaults to 24 hours and clamps unsafe values', () => {
  assert.equal(normalizeMessageLookbackHours(undefined), 24);
  assert.equal(normalizeMessageLookbackHours(0), 1);
  assert.equal(normalizeMessageLookbackHours(999), MAX_MESSAGE_LOOKBACK_HOURS);
});

test('message lookback reads the active project setting', () => {
  const now = new Date('2026-09-24T18:00:00.000Z');
  const window = runWithProjectContext({
    projectId: 'lookback-test',
    source: 'header',
    automationSettings: { messageLookbackHours: 30 },
  }, () => messageLookbackWindow(now));

  assert.equal(window.lookbackHours, 30);
  assert.equal(window.startUtc, '2026-09-23T12:00:00.000Z');
  assert.equal(window.endUtc, '2026-09-24T18:00:00.000Z');
});
