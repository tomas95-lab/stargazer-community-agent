import '../server/load-env';
import { createHash } from 'crypto';
import { getActiveUserProject, getSupabaseAdmin, projectRuntimeContextForRow } from '../server/platform-store';
import { projectScopedDataPath, runWithProjectContext } from '../src/project-context';
import { appendOperationLog, readOperationDetails, readOperationLog } from '../src/operations-log';
import { REDASH_OWNER_ID } from '../src/redash';

async function main() {
  const itemId = process.argv[2];
  if (!/^community:\d+:\d+$/.test(itemId || '')) throw new Error('A single Community message ID is required.');
  const project = await getActiveUserProject(REDASH_OWNER_ID);
  if (!project?.enabled || project.owner_id !== REDASH_OWNER_ID) throw new Error('An active Tomas-owned project is required.');
  const context = await projectRuntimeContextForRow(project);
  await runWithProjectContext(context, async () => {
    const events = (await readOperationLog()).filter(event => event.action === 'community_agent');
    const details = await readOperationDetails(events.map(event => event.id));
    const failure = [...details.values()].flatMap(detail => (detail as any)?.decisions || [])
      .find(decision => decision.itemId === itemId && !decision.posted && !decision.reacted
        && decision.action === 'human' && ['Diagnostic lookup unavailable.', 'Diagnostic query failed.'].includes(decision.reason));
    if (!failure) throw new Error('No verified failed diagnostic was found for this message.');
    const db = getSupabaseAdmin();
    const path = projectScopedDataPath('output/community-agent-state.json');
    const { data: row, error } = await db.from('project_data_files').select('content,updated_at')
      .eq('project_key', context.projectId).eq('file_path', path).single();
    if (error || !row) throw new Error('Could not read the project agent state.');
    const state = JSON.parse(row.content);
    const entry = state.processed?.[itemId];
    if (!entry) { console.log(JSON.stringify({ alreadyEligibleForRetry: true, messagesSent: 0 })); return; }
    if (entry.action !== 'human' || entry.posted || entry.reacted) throw new Error('Message was already handled. Nothing changed.');
    if (!process.argv.includes('--apply')) {
      console.log(JSON.stringify({ readyToRequeue: true, username: failure.username, messagesSent: 0 })); return;
    }
    const running = await db.from('automation_run_locks').select('job').eq('project_key', context.projectId)
      .eq('job', 'community-agent').eq('status', 'running').gte('started_at', new Date(Date.now() - 12 * 60000).toISOString()).limit(1);
    if (running.error || running.data?.length) throw new Error('A Community run may be active. Retry later.');
    delete state.processed[itemId];
    const content = JSON.stringify(state, null, 2) + '\n';
    const saved = await db.from('project_data_files').update({ content,
      size_bytes: Buffer.byteLength(content), content_sha256: createHash('sha256').update(content).digest('hex'),
      updated_at: new Date().toISOString(), last_write_reason: 'Requeue one verified failed Community diagnostic',
    }).eq('project_key', context.projectId).eq('file_path', path).eq('updated_at', row.updated_at)
      .eq('content', row.content).select('file_path');
    if (saved.error || saved.data?.length !== 1) throw new Error('Agent state changed concurrently. Nothing overwritten.');
    await appendOperationLog({ action: 'community_diagnostic_retry', status: 'success',
      message: 'Requeued a failed Community diagnostic', metadata: { itemId, username: failure.username } }, { previousProcessedEntry: entry });
    console.log(JSON.stringify({ requeued: true, username: failure.username, otherMessagesChanged: false, messagesSent: 0 }));
  });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
