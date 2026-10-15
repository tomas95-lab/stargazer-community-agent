import '../server/load-env';
import { randomUUID } from 'crypto';
import { getActiveUserProject, projectKeyFromRow, getSupabaseAdmin, decryptSecret } from '../server/platform-store';
import { REDASH_OWNER_ID, redashRequest, normalizeRedashResult } from '../src/redash';
import { lookupEmails } from '../src/contributor-lookups';
import { projectTagPolicy } from '../src/project-tag-policy';
import { UNIFIED_DIAGNOSTIC_SQL, UNIFIED_DIAGNOSTIC_PARAMETERS } from '../src/unified-account-query';
import { unifiedModelEvidence } from '../src/unified-account-draft';

async function main() {
  const username = process.argv[2];
  const project = await getActiveUserProject(REDASH_OWNER_ID);
  if (!project?.enabled) throw new Error('No active configured project.');
  const projectId = projectKeyFromRow(project);
  const policy = projectTagPolicy(projectId);
  if (!policy) throw new Error('No verified lifecycle policy for configured project.');
  const parameters: Record<string, string> = { ...lookupEmails(username), project_id: projectId, project_tag_prefix: policy.prefix };
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('private_redash_connections').select('key_ciphertext,queries').eq('owner_id', REDASH_OWNER_ID).single();
  if (error || !data) throw new Error('Redash connection unavailable.');
  const key = decryptSecret(data.key_ciphertext);
  const sql = UNIFIED_DIAGNOSTIC_SQL.replace(/\{\{(\w+)\}\}/g, (_match, name) => {
    const value = parameters[name];
    if (!value || !/^[a-zA-Z0-9_.@+\-]+$/.test(value)) throw new Error('Invalid query parameter.');
    return value;
  });
  let response = await redashRequest(key, 'query_results', { query: sql, data_source_id: 30, max_age: 60 });
  const jobId = response.job?.id;
  const deadline = Date.now() + 120000;
  while (!response.query_result && jobId && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const state = await redashRequest(key, `jobs/${encodeURIComponent(jobId)}`);
    if ([4, 5].includes(state.job?.status)) {
      throw new Error(`SQL validation failed: ${String(state.job.error || 'Unknown error').replace(/[a-f\d]{24}/gi, '[identifier]')}`);
    }
    if (state.job?.status === 3) response = await redashRequest(key, `query_results/${state.job.query_result_id}`);
  }
  if (!response.query_result) throw new Error('Query still pending after bounded wait.');
  const rows = normalizeRedashResult(response.query_result).rows;
  if (rows.length !== 1 || rows[0].identity_matches !== 1 || rows[0].project_id !== projectId) throw new Error('Identity or project not verified.');
  console.log(JSON.stringify({ project: project.project_name, evidence: unifiedModelEvidence(rows[0]), externalAiCalls: 0, messagesSent: 0 }, null, 2));
  const updateOnly = process.argv.includes('--update-sql');
  if (!process.argv.includes('--register') && !updateOnly) return;
  const queries = [...(data.queries || [])];
  let query = queries.find(q => q.diagnosticRole === 'unified' && q.diagnosticProjectId === projectId);
  if (updateOnly && !query) throw new Error('No unified query to update. No registry settings changed.');
  const definition = { query: UNIFIED_DIAGNOSTIC_SQL, options: {
    parameters: UNIFIED_DIAGNOSTIC_PARAMETERS.map(name => ({ name, title: name, type: 'text', value: '' })),
  } };
  if (query) await redashRequest(key, `queries/${query.queryId}`, definition);
  else {
    const created = await redashRequest(key, 'queries', { ...definition, data_source_id: 30,
      name: `Experimental unified account diagnostic - ${projectId}` });
    query = { id: randomUUID(), name: 'Unified account diagnostic', queryId: created.id,
      diagnosticRole: 'unified', diagnosticProjectId: projectId, diagnosticVersion: 3, diagnosticEnabled: false };
    queries.push(query);
  }
  if (updateOnly) {
    const stored = await redashRequest(key, `queries/${query.queryId}`);
    if (stored.query.trim() !== UNIFIED_DIAGNOSTIC_SQL.trim()) throw new Error('Updated SQL verification failed.');
    console.log(JSON.stringify({ updatedQuery: query.queryId, automationSettingsChanged: false }));
    return;
  }
  for (const q of queries) if (q.diagnosticProjectId === projectId) q.diagnosticEnabled = false;
  const saved = await db.from('private_redash_connections').update({ queries, updated_at: new Date().toISOString() }).eq('owner_id', REDASH_OWNER_ID);
  if (saved.error) throw new Error('Could not register unified query.');
  console.log(JSON.stringify({ registeredQuery: query.queryId, automationEnabled: false, previousQueriesDeleted: false }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
