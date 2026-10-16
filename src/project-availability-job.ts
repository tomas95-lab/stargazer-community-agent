import { loadBotConfig } from './config';
import { withCronRunLock } from './cron-locks';
import { readDataJSONOrDefault, writeDataJSON } from './data-store';
import { DiscourseClient } from './discourse-client';
import { appendOperationLog } from './operations-log';
import { getProjectContext, projectScheduleAllowsNow } from './project-context';
import { activeProjectDiagnosticConnection } from './redash-diagnostics';
import { normalizeRedashResult, redashId, redashRequest, REDASH_OWNER_ID } from './redash';
import { PROJECT_AVAILABILITY_SQL } from './unified-account-query';

export { PROJECT_AVAILABILITY_SQL } from './unified-account-query';

export const EMPTY_BATCH_MESSAGE = 'Hi everyone! We have completed the current batch of tasks. More tasks are expected to be added soon. In the meantime, please work on your secondary projects. We will share updates as they become available.';

const STATE_PATH = 'output/project-availability-state.json';
interface AvailabilityState {
  hasTasks?: boolean;
  observedAt?: string;
  notice?: 'sending' | 'sent' | 'uncertain';
  messageId?: number;
  channelId?: string;
  pendingQuery?: { jobId: string; expires: number };
}
export interface ProjectAvailabilityRun {
  status: 'skipped' | 'available' | 'notified' | 'already_notified' | 'pending' | 'error';
  reason?: string;
  channelId?: string;
  messageId?: number;
}

class PendingAvailability extends Error {}

async function checkAvailability(key: string, queryId: number, state: AvailabilityState): Promise<boolean> {
  const projectId = getProjectContext().projectId;
  if (!/^[a-f\d]{24}$/i.test(projectId)) throw new Error('A real project ID is required for availability checks.');
  let response;
  if (state.pendingQuery && state.pendingQuery.expires > Date.now()) {
    response = { job: { id: state.pendingQuery.jobId } };
  } else {
    const definition = await redashRequest(key, `queries/${queryId}`);
    // Keep the same verified database as the unified diagnostic, never guess a source.
    if (redashId(definition.data_source_id) !== 30) throw new Error('Availability query requires the verified Redash database.');
    response = await redashRequest(key, 'query_results', {
      query: PROJECT_AVAILABILITY_SQL.replace('{{project_id}}', projectId), data_source_id: 30, max_age: 0,
    });
    if (!response.query_result && response.job?.id) {
      state.pendingQuery = { jobId: String(response.job.id), expires: Date.now() + 10 * 60000 };
      await writeDataJSON(STATE_PATH, state, 'Preserve pending project availability query');
    }
  }
  const deadline = Date.now() + 20000;
  while (!response.query_result && state.pendingQuery && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1200));
    const job = await redashRequest(key, `jobs/${encodeURIComponent(state.pendingQuery.jobId)}`);
    if ([4, 5].includes(job.job?.status)) {
      delete state.pendingQuery;
      await writeDataJSON(STATE_PATH, state, 'Clear failed project availability query');
      throw new Error('Project availability query failed. No announcement was sent.');
    }
    if (job.job?.status === 3) response = await redashRequest(key, `query_results/${redashId(job.job.query_result_id)}`);
  }
  if (!response.query_result) throw new PendingAvailability('Project availability query is still running; the next cron will retry.');
  const rows = normalizeRedashResult(response.query_result).rows;
  if (rows.length !== 1 || rows[0].project_id !== projectId || typeof rows[0].project_has_tasks !== 'boolean') {
    throw new Error('Project availability was not verified. No announcement was sent.');
  }
  delete state.pendingQuery;
  state.observedAt = typeof rows[0].observed_at === 'string' ? rows[0].observed_at : new Date().toISOString();
  return rows[0].project_has_tasks;
}

export async function runProjectAvailabilityJob(options: { manual?: boolean } = {}): Promise<ProjectAvailabilityRun> {
  const context = getProjectContext();
  if (context.ownerId !== REDASH_OWNER_ID || !context.redashDiagnosticsAllowed || context.demoMode
    || context.automationPaused || (!options.manual && (!projectScheduleAllowsNow()
      || !(context.automationSettings?.autoPost ?? process.env.AGENT_AUTO_POST === 'true')))) {
    return { status: 'skipped', reason: 'not_authorized_or_not_active' };
  }
  try {
    const connection = await activeProjectDiagnosticConnection();
    if (!connection) return { status: 'skipped', reason: 'diagnostics_disabled' };
    const locked = await withCronRunLock('project-task-availability', context.projectId, 'daily', async () => {
      const state = await readDataJSONOrDefault<AvailabilityState>(STATE_PATH, {});
      const hasTasks = await checkAvailability(connection.key, connection.queryId, state);
      state.hasTasks = hasTasks;
      if (hasTasks) {
        delete state.notice;
        delete state.messageId;
        delete state.channelId;
        await writeDataJSON(STATE_PATH, state, 'Project has tasks; reset batch notification');
        return { status: 'available' as const };
      }
      if (state.notice) {
        await writeDataJSON(STATE_PATH, state, 'Project still empty; preserve existing batch notification');
        return { status: 'already_notified' as const, reason: state.notice === 'sent' ? 'same_empty_batch' : 'delivery_requires_verification' };
      }
      // Require this project's runtime credential; never fall back to a legacy account.
      if (!context.botConfig?.discourseApiKey || !context.botConfig.communityChatChannelId) {
        throw new Error('Project Community credentials or channel are unavailable.');
      }
      const config = loadBotConfig();
      state.channelId = config.communityChatChannelId;
      state.notice = 'sending';
      await writeDataJSON(STATE_PATH, state, 'Claim empty-batch announcement before sending');
      try {
        const client = new DiscourseClient({ baseUrl: config.communityBaseUrl,
          apiKey: config.discourseApiKey, apiClientId: config.discourseApiClientId });
        const response = await client.sendChatMessage(state.channelId, EMPTY_BATCH_MESSAGE);
        state.notice = 'sent';
        state.messageId = response.message_id || response.id;
        await writeDataJSON(STATE_PATH, state, 'Record empty-batch announcement');
      } catch {
        state.notice = 'uncertain';
        await writeDataJSON(STATE_PATH, state, 'Avoid duplicate announcement after uncertain delivery');
        throw new Error('Batch announcement delivery needs verification before retrying.');
      }
      return { status: 'notified' as const, channelId: state.channelId, messageId: state.messageId };
    }, new Date(), { repeatCompleted: true });
    const result = locked.result || { status: 'skipped' as const, reason: locked.reason };
    if (!locked.skipped) await appendOperationLog({ action: 'project_task_availability',
      status: 'success', message: result.status === 'notified' ? 'Empty-batch announcement sent' : 'Project availability checked',
      metadata: { result: result.status, source: options.manual ? 'manual' : 'cron', ...('channelId' in result ? { channelId: result.channelId } : {}),
        ...('messageId' in result ? { messageId: result.messageId } : {}) } });
    return result;
  } catch (error) {
    const pending = error instanceof PendingAvailability;
    const reason = error instanceof Error ? error.message : 'Project availability check failed. No announcement was sent.';
    await appendOperationLog({ action: 'project_task_availability', status: pending ? 'skipped' : 'error', message: reason });
    return { status: pending ? 'pending' : 'error', reason };
  }
}
