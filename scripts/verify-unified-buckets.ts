import '../server/load-env';
import { getSupabaseAdmin, decryptSecret } from '../server/platform-store';
import { REDASH_OWNER_ID, redashRequest, normalizeRedashResult } from '../src/redash';
import { UNIFIED_DIAGNOSTIC_SQL } from '../src/unified-account-query';

async function main() {
  const cases = [
    { id: 'new', window: 3, scores: [3, 4], expected: 'attempter_new' },
    { id: 'disable', window: 3, scores: [2, 2, 3], expected: 'disabled' },
    { id: 'untrusted', window: 3, scores: [1, 1, 4], expected: 'attempter_untrusted' },
    { id: 'normal_third_boundary', window: 3, scores: [2, 3, 4], expected: 'attempter_normal' },
    { id: 'trusted', window: 3, scores: [3, 4, 4], expected: 'attempter_trusted' },
    { id: 'promote', window: 3, scores: [4, 4, 4], expected: 'reviewer_new' },
    { id: 'reviewer_new', window: 2, scores: [4], expected: 'reviewer_new' },
    { id: 'reviewer_demote_score', window: 2, scores: [3, 3], expected: 'reviewer_demoted' },
    { id: 'reviewer_demote_pdr', window: 2, scores: [2, 5], expected: 'reviewer_demoted' },
    { id: 'reviewer_untrusted', window: 2, scores: [3, 4], expected: 'reviewer_untrusted' },
    { id: 'reviewer_trusted', window: 2, scores: [4, 4], expected: 'reviewer_trusted' },
    { id: 'uncovered', window: 3, scores: [2, 2, 5], expected: null },
  ];
  const literal = (value: unknown) => value === null ? 'NULL' : typeof value === 'string' ? `'${value}'` : String(value);
  const rows = cases.map(item => {
    const n = item.scores.length;
    const defects = item.scores.filter(score => score <= 2).length;
    const fields = {
      fixture: item.id, permission_found: true, review_window: item.window, recent_graded: n,
      recent_qms: item.scores.reduce((sum, score) => sum + score, 0) / n,
      recent_defects: defects, recent_pdr: defects / n, recent_has_four_or_five: item.scores.some(score => score >= 4),
      current_bucket: item.expected, multiple_bucket_tags: false, disabled_tag: false, disabled: false,
      excluded: false, demoted_tag: false, active_throttle: false, project_has_tasks: true,
      role_has_tasks: true, individual_eq: false, qualified: true,
    };
    return `SELECT ${Object.entries(fields).map(([key, value]) => `${literal(value)} AS "${key}"`).join(',')}`;
  });
  const marker = '), classified AS (';
  const suffix = UNIFIED_DIAGNOSTIC_SQL.slice(UNIFIED_DIAGNOSTIC_SQL.indexOf(marker));
  // Execute the exact production classification SQL against synthetic rows only.
  const sql = `WITH evidence AS (${rows.join(' UNION ALL ')}` + suffix;
  const { data, error } = await getSupabaseAdmin().from('private_redash_connections').select('key_ciphertext').eq('owner_id', REDASH_OWNER_ID).single();
  if (error || !data) throw new Error('Redash connection unavailable.');
  const key = decryptSecret(data.key_ciphertext);
  let result = await redashRequest(key, 'query_results', { query: sql, data_source_id: 30, max_age: 0 });
  const jobId = result.job?.id;
  const deadline = Date.now() + 90000;
  while (!result.query_result && jobId && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    const job = await redashRequest(key, `jobs/${encodeURIComponent(jobId)}`);
    if ([4, 5].includes(job.job?.status)) throw new Error(`Fixture SQL failed: ${job.job.error}`);
    if (job.job?.status === 3) result = await redashRequest(key, `query_results/${job.job.query_result_id}`);
  }
  if (!result.query_result) throw new Error('Fixture validation timed out.');
  const actual = normalizeRedashResult(result.query_result).rows;
  for (const item of cases) {
    const row = actual.find(row => row.fixture === item.id);
    if (!row || row.expected_bucket !== item.expected) throw new Error(`Bucket mismatch: ${item.id}`);
  }
  console.log(JSON.stringify({ syntheticCasesPassed: cases.length, realContributorQueries: 0, aiCalls: 0, messagesSent: 0 }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
