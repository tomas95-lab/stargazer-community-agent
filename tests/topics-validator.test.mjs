import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeTopics,
  TOPICS_JSON_EXAMPLE,
  validateTopicsPayload,
} from '../dist/topics-validator.js';

test('topics import accepts array payloads', () => {
  const result = validateTopicsPayload(TOPICS_JSON_EXAMPLE);

  assert.equal(result.ok, true);
  assert.equal(result.topics.length, 1);
  assert.equal(result.errors.length, 0);
});

test('topics import accepts object payloads with topics array', () => {
  const result = validateTopicsPayload({ topics: TOPICS_JSON_EXAMPLE });

  assert.equal(result.ok, true);
  assert.equal(result.topics[0].date, '2026-07-20');
});

test('topics import reports required field errors', () => {
  const result = validateTopicsPayload([{ date: '2026-07-20', title: 'Missing fields' }]);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.path === 'topic'));
  assert.ok(result.errors.some((item) => item.path === 'quickRule'));
});

test('topics import validates duplicate dates', () => {
  const result = validateTopicsPayload([TOPICS_JSON_EXAMPLE[0], TOPICS_JSON_EXAMPLE[0]]);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.message.includes('Duplicate date')));
});

test('mergeTopics appends and updates by date', () => {
  const incoming = TOPICS_JSON_EXAMPLE[0];
  const existing = [{ ...incoming, date: '2026-07-19', title: 'Old' }, { ...incoming, title: 'Previous' }];
  const result = mergeTopics(existing, [{ ...incoming, title: 'Updated' }], 'append');

  assert.equal(result.created, 0);
  assert.equal(result.updated, 1);
  assert.equal(result.topics.find((topic) => topic.date === incoming.date)?.title, 'Updated');
});
