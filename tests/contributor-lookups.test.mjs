import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupEmails, summarizeLookup } from '../dist/contributor-lookups.js';

test('lookup identity candidates preserve the exact username and reject SQL input', () => {
  const emails = Object.values(lookupEmails('latam.coder779'));
  assert.equal(emails.length, 4);
  assert.ok(emails.every(email => email.startsWith('latam.coder779@')));
  for (const username of ["latam.coder779' OR 1=1", 'latam.coder779%', 'another-user']) assert.throws(() => lookupEmails(username));
});
test('investigation summaries discard private fields and unrecognized result text', () => {
  const rows = [{ project_id: 'private-id', contributor_id: 'private-person', email: 'private@example.com', final_score: 0.125,
    task_count: 9876, disable_reason: 'private decision', active_throttle_signal: true, queue_signal: 'print private data' }];
  const result = summarizeLookup('06', rows);
  assert.deepEqual(result, { evidenceFound: true, signals: [{ active_throttle_signal: true }] });
  assert.doesNotMatch(JSON.stringify(result), /private|9876|0\.125/);
});
test('missing evidence stays missing and unknown queue states are preserved', () => {
  assert.deepEqual(summarizeLookup('03', []), { evidenceFound: false, signals: [] });
  assert.deepEqual(summarizeLookup('10', [{ queue_signal: 'UNKNOWN' }]), { evidenceFound: true, signals: [{ queue_signal: 'UNKNOWN' }] });
  assert.deepEqual(summarizeLookup('01', [{ contributor_id: 'a' }, { contributor_id: 'b' }]), { matched: false, ambiguous: true });
});

test('tag lookup preserves the disable flag without exposing tag names or descriptions', () => {
  assert.deepEqual(summarizeLookup('12', [{ disabled_tag_present: true, scoped_tag_evidence_found: true,
    tag_name: 'private_disabled_tag', description: 'private reason' }]), {
    evidenceFound: true, signals: [{ scoped_tag_evidence_found: true, disabled_tag_present: true }],
  });
});
