import '../server/load-env';
import { getSupabaseAdmin, getActiveUserProject, projectKeyFromRow, decryptSecret } from '../server/platform-store';
import { REDASH_OWNER_ID, redashRequest, normalizeRedashResult } from '../src/redash';
import { lookupEmails } from '../src/contributor-lookups';
import { projectTagPolicy, interpretProjectTags } from '../src/project-tag-policy';

async function main() {
  const username = process.argv[2] || '';
  const emails = lookupEmails(username);
  const project = await getActiveUserProject(REDASH_OWNER_ID);
  if (!project?.enabled) throw new Error('No configured active project.');
  const projectId = projectKeyFromRow(project);
  const policy = projectTagPolicy(projectId);
  if (!policy || !/^[a-z0-9_]+$/.test(policy.prefix)) throw new Error('No verified project tag policy.');
  const { data, error } = await getSupabaseAdmin().from('private_redash_connections').select('key_ciphertext,queries').eq('owner_id', REDASH_OWNER_ID).single();
  if (error) throw new Error('Redash connection unavailable.');
  const key = decryptSecret(data.key_ciphertext);
  async function finish(response: any) {
    const jobId = response.job?.id;
    const deadline = Date.now() + 90000;
    while (!response.query_result && jobId && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 1800));
      const job = await redashRequest(key, `jobs/${encodeURIComponent(jobId)}`);
      if ([4, 5].includes(job.job?.status)) throw new Error('Redash investigation query failed.');
      if (job.job?.status === 3) response = await redashRequest(key, `query_results/${job.job.query_result_id}`);
    }
    if (!response.query_result) throw new Error('Investigation query is still pending.');
    return normalizeRedashResult(response.query_result);
  }
  const identityQuery = data.queries.find((q: any) => q.diagnosticRole === 'identity' && q.diagnosticVersion === 2);
  const statusQuery = data.queries.find((q: any) => q.diagnosticRole === 'status' && q.diagnosticVersion === 2);
  if (!identityQuery || !statusQuery) throw new Error('Prepare current diagnostic queries first.');
  const identity = await finish(await redashRequest(key, `queries/${identityQuery.queryId}/results`, { parameters: emails, max_age: 300 }));
  if (identity.rows.length !== 1 || !Object.values(emails).includes(String(identity.rows[0].email))) throw new Error('Identity is ambiguous.');
  const id = String(identity.rows[0].contributor_id);
  if (!/^[a-f\d]{24}$/i.test(id)) throw new Error('Invalid identity.');
  const status = await finish(await redashRequest(key, `queries/${statusQuery.queryId}/results`, { parameters: {
    contributor_id: id, project_id: projectId, project_tag_prefix: policy.prefix,
  }, max_age: 300 }));
  const fields = ['permission_verified', 'tag_evidence_checked', 'tag_access_review', 'tag_throttle_hint', 'tag_onboarding_hint', 'tag_unknown', 'access_disabled', 'quality_disabled', 'throttled', 'project_empty', 'project_has_tasks'];
  console.log(JSON.stringify({ project: project.project_name, signals: status.rows.map(row => Object.fromEntries(fields.map(name => [name, typeof row[name] === 'boolean' ? row[name] : null]))) }));
  const sql = `SELECT t.NAME AS "name" FROM VIEW.USER_TAGS_LONG t WHERE t.USER_ID = '${id}' AND STARTSWITH(LOWER(t.NAME), '${policy.prefix}_') LIMIT 50`;
  const tags = await finish(await redashRequest(key, 'query_results', { query: sql, data_source_id: 30, max_age: 0 }));
  const names = tags.rows.map(row => String(row.name).toLowerCase());
  const rules = policy.rules.filter(rule => names.includes(`${policy.prefix}_${rule.suffix}`));
  console.log(JSON.stringify({ tagInterpretation: interpretProjectTags(projectId, names), verifiedRuleCodes: rules.map(rule => rule.suffix), automaticPosting: false }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Investigation failed.'); process.exitCode = 1; });
