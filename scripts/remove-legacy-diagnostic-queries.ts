import '../server/load-env';
import { getActiveUserProject, projectKeyFromRow, getSupabaseAdmin, decryptSecret } from '../server/platform-store';
import { REDASH_OWNER_ID, REDASH_BASE_URL, redashId, redashRequest } from '../src/redash';
import { UNIFIED_DIAGNOSTIC_SQL } from '../src/unified-account-query';

interface Query { id: string; name: string; queryId: number; diagnosticRole?: string; diagnosticProjectId?: string; diagnosticVersion?: number }
async function main() {
  const apply = process.argv.includes('--apply');
  const project = await getActiveUserProject(REDASH_OWNER_ID);
  if (!project?.enabled) throw new Error('No active project.');
  const projectId = projectKeyFromRow(project);
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('private_redash_connections').select('key_ciphertext,queries').eq('owner_id', REDASH_OWNER_ID).single();
  if (error || !data) throw new Error('Redash connection unavailable.');
  const key = decryptSecret(data.key_ciphertext);
  const original = data.queries as Query[];
  const unified = original.find(query => query.diagnosticRole === 'unified' && query.diagnosticVersion === 3 && query.diagnosticProjectId === projectId);
  if (!unified) throw new Error('Unified query is not registered. No deletion performed.');
  const definition = await redashRequest(key, `queries/${redashId(unified.queryId)}`);
  if (definition.is_archived || definition.query.trim() !== UNIFIED_DIAGNOSTIC_SQL.trim()) throw new Error('Unified query is unavailable or differs from validated SQL.');
  const selected = original.filter(query => query.queryId !== unified.queryId && (
    ((query.diagnosticRole === 'identity' || query.diagnosticRole === 'status')
      && (!query.diagnosticProjectId || query.diagnosticProjectId === projectId))
    || /^Private contributor lookup v2 \d{2} - /.test(query.name)
  ));
  const ids = [...new Set(selected.map(query => redashId(query.queryId)))];
  for (const id of ids) {
    const references = original.filter(query => query.queryId === id);
    if (references.some(query => !selected.includes(query))) throw new Error(`Query ${id} has unrelated references. Nothing removed.`);
    const remote = await redashRequest(key, `queries/${id}`);
    console.log(JSON.stringify({ inspectedQuery: id, name: remote.name }));
    if (!/^(?:Private contributor lookup v2 \d{2} - |Experimental (?:contributor )?(?:identity|status) diagnostic)/.test(remote.name)) {
      throw new Error(`Query ${id} was renamed or is not an experimental query. Nothing removed.`);
    }
  }
  console.log(JSON.stringify({ apply, keepUnified: unified.queryId, remove: selected.map(query => ({ id: query.queryId, name: query.name })) }, null, 2));
  if (!apply) return;
  const removed: number[] = [];
  for (const id of ids) {
    // Redash's delete operation archives the query; it does not alter warehouse data.
    const response = await fetch(`${REDASH_BASE_URL}/api/queries/${id}`, {
      method: 'DELETE', headers: { Authorization: `Key ${key}` }, redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Could not archive query ${id}: HTTP ${response.status}. Rerun to finish safely.`);
    const check = await redashRequest(key, `queries/${id}`);
    if (check.is_archived !== true) throw new Error(`Archive not confirmed for query ${id}.`);
    // Re-read each time to preserve unrelated concurrent additions/configuration.
    const latest = await db.from('private_redash_connections').select('queries').eq('owner_id', REDASH_OWNER_ID).single();
    if (latest.error) throw new Error('Could not re-read registry.');
    const remaining = (latest.data.queries as Query[]).filter(query => !selected.some(old => old.id === query.id && old.queryId === id));
    const update = await db.from('private_redash_connections').update({ queries: remaining, updated_at: new Date().toISOString() })
      .eq('owner_id', REDASH_OWNER_ID).eq('queries', JSON.stringify(latest.data.queries)).select('owner_id');
    if (update.error || update.data?.length !== 1) throw new Error(`Archived ${id}, but registry update failed or changed concurrently. Rerun cleanup.`);
    removed.push(id);
  }
  const final = await db.from('private_redash_connections').select('queries').eq('owner_id', REDASH_OWNER_ID).single();
  if (final.error || final.data.queries.some((query: Query) => selected.some(old => old.id === query.id))) throw new Error('Cleanup incomplete; registry verification failed.');
  console.log(JSON.stringify({ archivedInRedash: removed, registryEntriesRemoved: selected.length, remainingQueries: final.data.queries.length, unifiedPreserved: unified.queryId }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
