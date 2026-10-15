import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretProjectTags, projectTagPolicy } from '../dist/project-tag-policy.js';
const project = '6a96fa0eeb622ed112e30794';

test('tags without descriptions retain private mappings but benign tags do not imply disablement', () => {
  for (const tag of ['money_heist_trusted_reviewer', 'money_heist_course_intro_pass', 'money_heist_new_contributor', 'money_heist_throttled_attempter']) {
    const result = interpretProjectTags(project, [tag]);
    assert.equal(result.accessReview, false);
    assert.doesNotMatch(JSON.stringify(result), /tasks|24h|L12|money_heist/);
  }
  assert.equal(interpretProjectTags(project, ['money_heist_disabled']).accessReview, true);
  assert.equal(interpretProjectTags(project, ['money_heist_disabled']).qualityReassigned, true);
  assert.equal(interpretProjectTags('another-project', ['money_heist_disabled']).accessReview, false);
  assert.equal(interpretProjectTags(project, ['money_heist_unmapped']).unknownTag, true);
  assert.ok(projectTagPolicy(project).rules.every(rule => rule.internalDescription.length > 0));
  assert.equal(projectTagPolicy(project).descriptionsVerified, true);
});
