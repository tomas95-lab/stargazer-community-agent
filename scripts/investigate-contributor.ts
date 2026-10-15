import '../server/load-env';
import { randomUUID } from 'crypto';
import { getActiveUserProject, getSupabaseAdmin, decryptSecret, projectKeyFromRow } from '../server/platform-store';
import { REDASH_OWNER_ID, redashRequest, normalizeRedashResult } from '../src/redash';
import { CONTRIBUTOR_LOOKUPS, lookupEmails, summarizeLookup } from '../src/contributor-lookups';

async function main() {
  const username = process.argv[2] || '';
  const only = process.argv[3];
  if (only && !CONTRIBUTOR_LOOKUPS.some(lookup => lookup.id === only)) throw new Error('Unknown lookup ID.');
  const emails = lookupEmails(username);
  const project = await getActiveUserProject(REDASH_OWNER_ID);
  if (!project || !project.enabled) throw new Error('No active project configured.');
  const projectId = projectKeyFromRow(project);
  if (!/^[a-f\d]{24}$/i.test(projectId)) throw new Error('Active project must have a real Outlier Project ID.');
  const configuredPrefix = typeof project.settings?.projectTagPrefix === 'string' ? project.settings.projectTagPrefix : '';
  const prefix = configuredPrefix || project.project_name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('private_redash_connections').select('key_ciphertext,queries').eq('owner_id', REDASH_OWNER_ID).single();
  if (error || !data?.key_ciphertext) throw new Error('Redash connection unavailable.');
  const key = decryptSecret(data.key_ciphertext);
  const registry = [...(data.queries || [])];
  console.log(JSON.stringify({ project: project.project_name, source: 'configured project', automaticPosting: false }));

  async function execute(queryId: number, parameters: Record<string, string>) {
    let result = await redashRequest(key, `queries/${queryId}/results`, { parameters, max_age: 0 });
    if (result.query_result) return normalizeRedashResult(result.query_result);
    const job = result.job?.id;
    if (!job) throw new Error('No Redash job returned.');
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      result = await redashRequest(key, `jobs/${encodeURIComponent(job)}`);
      if ([4, 5].includes(result.job?.status)) {
        // Do not echo database error bodies: they can contain substituted parameters.
        throw new Error('Redash execution failed; inspect privately in Redash.');
      }
      if (result.job?.status === 3) {
        const response = await redashRequest(key, `query_results/${result.job.query_result_id}`);
        return normalizeRedashResult(response.query_result);
      }
    }
    throw new Error('Redash query did not finish within the bounded wait.');
  }

  let contributorId = '';
  for (const lookup of CONTRIBUTOR_LOOKUPS) {
    if (only && lookup.id !== '01' && lookup.id !== only) continue;
    const name = `Private contributor lookup v2 ${lookup.id} - ${lookup.title}`;
    let saved = registry.find(query => query.name === name);
    if (saved) {
      const definition = await redashRequest(key, `queries/${saved.queryId}`);
      if (definition.query?.trim() !== lookup.sql.trim()) await redashRequest(key, `queries/${saved.queryId}`, { query: lookup.sql });
    }
    if (!saved) {
      const created = await redashRequest(key, 'queries', { name, query: lookup.sql, data_source_id: 30,
        options: { parameters: lookup.parameters.map(name => ({ name, title: name, type: 'text', value: '' })) } });
      saved = { id: randomUUID(), name, queryId: created.id };
      registry.push(saved);
      const updated = await db.from('private_redash_connections').update({ queries: registry, updated_at: new Date().toISOString() }).eq('owner_id', REDASH_OWNER_ID);
      if (updated.error) throw new Error('Failed to register private query.');
    }
    if (lookup.id === '12' && !/^[a-z0-9_]{1,64}$/.test(prefix)) {
      console.log(JSON.stringify({ lookup: lookup.id, queryId: saved.queryId, status: 'not_executed', reason: 'Verified project tag prefix is not configured; no prefix was guessed.' }));
      continue;
    }
    try {
      const parameters = lookup.id === '01' ? emails : Object.fromEntries(lookup.parameters.map(name => [name, name === 'project_id' ? projectId : name === 'project_tag_prefix' ? prefix : contributorId]));
      const result = await execute(saved.queryId, parameters);
      if (lookup.id === '01') {
        if (result.rows.length !== 1 || !Object.values(emails).includes(String(result.rows[0].email)) || !/^[a-f\d]{24}$/i.test(String(result.rows[0].contributor_id))) throw new Error('Identity not unique or unverified; investigation stopped.');
        contributorId = String(result.rows[0].contributor_id);
      }
      console.log(JSON.stringify({ lookup: lookup.id, queryId: saved.queryId, status: 'success', ...(lookup.id === '12' ? { prefixVerified: Boolean(configuredPrefix), diagnosticConclusionAllowed: false } : {}), ...summarizeLookup(lookup.id, result.rows) }));
    } catch (error) {
      console.log(JSON.stringify({ lookup: lookup.id, queryId: saved.queryId, status: 'failed', reason: error instanceof Error ? error.message : 'Lookup failed.' }));
      if (lookup.id === '01') throw new Error('Identity could not be confirmed. No other contributor queries were executed.');
    }
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Investigation failed.'); process.exitCode = 1; });
