import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens } from '../dist/usage-guardrails.js';

test('usage guardrails estimate tokens from text length', () => {
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('abcde'), 2);
  assert.equal(estimateTokens(''), 1);
});
