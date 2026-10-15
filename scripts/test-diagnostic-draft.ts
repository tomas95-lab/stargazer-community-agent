import '../server/load-env';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin, getActiveUserProject, projectKeyFromRow, projectRuntimeContextForRow, decryptSecret } from '../server/platform-store';
import { REDASH_OWNER_ID, redashRequest } from '../src/redash';
import { lookupEmails } from '../src/contributor-lookups';
import { IDENTITY_DIAGNOSTIC_SQL, STATUS_DIAGNOSTIC_SQL, DiagnosticQuery, startAccountDiagnostic, pollAccountDiagnostic } from '../src/redash-diagnostics';
import { runWithProjectContext } from '../src/project-context';

async function main() {
  const username = process.argv[2] || '';
  lookupEmails(username);
  const project = await getActiveUserProject(REDASH_OWNER_ID);
  if (!project?.enabled || project.owner_id !== REDASH_OWNER_ID) throw new Error('An active Tomas project is required.');
  const projectId = projectKeyFromRow(project);
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('private_redash_connections').select('key_ciphertext,queries').eq('owner_id', REDASH_OWNER_ID).single();
  if (error || !data?.key_ciphertext) throw new Error('Redash connection unavailable.');
  const key = decryptSecret(data.key_ciphertext);
  const queries = data.queries as DiagnosticQuery[];
  for (const role of ['identity', 'status'] as const) {
    const template = queries.find(query => query.diagnosticRole === role && !query.diagnosticProjectId);
    if (!template) throw new Error('Prepare the diagnostic templates first.');
    const names = role === 'identity' ? ['email_primary', 'email_alternate', 'email_legacy', 'email_legacy_alternate'] : ['contributor_id', 'project_id', 'project_tag_prefix'];
    await redashRequest(key, `queries/${template.queryId}`, {
      query: role === 'identity' ? IDENTITY_DIAGNOSTIC_SQL : STATUS_DIAGNOSTIC_SQL,
      options: { parameters: names.map(name => ({ name, title: name, type: 'text', value: '' })) },
    });
    for (const query of queries) if (query.queryId === template.queryId) { query.diagnosticVersion = 2; query.diagnosticEnabled = false; }
    if (!queries.some(query => query.diagnosticProjectId === projectId && query.diagnosticRole === role)) {
      queries.push({ ...template, id: randomUUID(), diagnosticProjectId: projectId, diagnosticVersion: 2, diagnosticEnabled: false });
    }
  }
  const saved = await db.from('private_redash_connections').update({ queries, updated_at: new Date().toISOString() }).eq('owner_id', REDASH_OWNER_ID);
  if (saved.error) throw new Error('Could not save diagnostic bindings.');
  await runWithProjectContext(await projectRuntimeContextForRow(project), async () => {
    let progress = await startAccountDiagnostic(username, process.argv[3] || 'I am EQ', true);
    let stage = '';
    const deadline = Date.now() + 4 * 60000;
    while (progress?.task && Date.now() < deadline) {
      if (stage !== progress.task.phase) { stage = progress.task.phase; console.log(JSON.stringify({ stage, project: project.project_name, automaticPosting: false })); }
      await new Promise(resolve => setTimeout(resolve, 2500));
      progress = await pollAccountDiagnostic(progress.task);
    }
    if (!progress?.draft) throw new Error('Diagnostic did not finish. No message was sent.');
    console.log(JSON.stringify({ project: project.project_name, draft: progress.draft, automaticPosting: false }));
  });
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Diagnostic failed.'); process.exitCode = 1; });
