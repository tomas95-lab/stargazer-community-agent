import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeGeneratedText } from '../dist/text-safety.js';

test('generated text sanitizer replaces em dash characters', () => {
  assert.equal(
    sanitizeGeneratedText('Use Cursor\u2014then join the War Room.'),
    'Use Cursor-then join the War Room.'
  );
});
