import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { readDataJSONOrDefault, writeDataJSON } from './data-store';
import { runtimeDb, runtimeDbConfigured } from './runtime-db';
import { getProjectContext } from './project-context';
import { REDASH_OWNER_ID, redashId, redashRequest, normalizeRedashResult, RedashTableResult } from './redash';
import { DIAGNOSTIC_COPY, sealDiagnosticDraft } from './diagnostic-disclosure';
import { CONTRIBUTOR_LOOKUPS, lookupEmails } from './contributor-lookups';
import { MONEY_HEIST_TAG_RULES, projectTagPolicy } from './project-tag-policy';
import { unifiedAccountDraft, isProjectAvailabilityQuestion } from './unified-account-draft';
import { selectDiagnosticQuery } from './diagnostic-routing';
import { PROJECT_AVAILABILITY_SQL } from './unified-account-query';

export interface DiagnosticQuery {
  id: string;
  name: string;
  queryId: number;
  diagnosticRole?: 'identity' | 'status' | 'unified';
  diagnosticProjectId?: string;
  diagnosticEnabled?: boolean;
  diagnosticAutoReply?: boolean;
  diagnosticVersion?: number;
}

export const IDENTITY_DIAGNOSTIC_SQL = CONTRIBUTOR_LOOKUPS[0].sql;

function tagSuffixes(interpretation?: string): string {
  return MONEY_HEIST_TAG_RULES.filter(rule => !interpretation || rule.interpretation === interpretation)
    .map(rule => `'${rule.suffix}'`).join(', ');
}

export const STATUS_DIAGNOSTIC_SQL = `WITH tag_signals AS (
  SELECT
    BOOLOR_AGG(LOWER(t.NAME) = '{{project_tag_prefix}}_disabled') AS access_review,
    BOOLOR_AGG(SUBSTR(LOWER(t.NAME), LENGTH('{{project_tag_prefix}}') + 2) IN (${tagSuffixes('throttle_hint')})) AS throttle_hint,
    BOOLOR_AGG(SUBSTR(LOWER(t.NAME), LENGTH('{{project_tag_prefix}}') + 2) IN (${tagSuffixes('onboarding_hint')})) AS onboarding_hint,
    BOOLOR_AGG(SUBSTR(LOWER(t.NAME), LENGTH('{{project_tag_prefix}}') + 2) NOT IN (${tagSuffixes()})) AS unknown_tag
  FROM VIEW.USER_TAGS_LONG t
  WHERE t.USER_ID = '{{contributor_id}}' AND LENGTH('{{project_tag_prefix}}') > 0
    AND STARTSWITH(LOWER(t.NAME), '{{project_tag_prefix}}_')
)
SELECT
  u._id AS "contributor_id", p._id AS "project_id",
  (LENGTH('{{project_tag_prefix}}') > 0) AS "tag_evidence_checked",
  COALESCE(tags.access_review, FALSE) AS "tag_access_review",
  COALESCE(tags.throttle_hint, FALSE) AS "tag_throttle_hint",
  COALESCE(tags.onboarding_hint, FALSE) AS "tag_onboarding_hint",
  COALESCE(tags.unknown_tag, FALSE) AS "tag_unknown",
  (pe._id IS NOT NULL) AS "permission_verified",
  up.EMPTY_QUEUE_STATUS AS "individual_eq",
  NOT EXISTS (SELECT 1 FROM PUBLIC.PIPELINEV3HUMANNODES h WHERE h.project=p._id
    AND h.status='pending' AND h.worker IS NULL AND h.review_level IN (-1, 0)) AS "project_empty",
  EXISTS (SELECT 1 FROM PUBLIC.PIPELINEV3HUMANNODES h WHERE h.project=p._id
    AND h.status='pending' AND h.worker IS NULL AND h.review_level IN (-1, 0)) AS "project_has_tasks",
  COALESCE(pe.DISABLED, FALSE) AS "access_disabled",
  (COALESCE(pe.DISABLED, FALSE) AND UPPER(TRIM(pe.DISABLE_REASON::STRING))
    IN ('QUALITY', 'LOW_QUALITY', 'QUALITY_ISSUES')) AS "quality_disabled",
  EXISTS (SELECT 1 FROM PUBLIC.USERTHROTTLES ut
    WHERE ut.USER = u._id AND ut.PROJECT = p._id
      AND COALESCE(ut.__DELETED, FALSE) = FALSE
      AND TRY_TO_TIMESTAMP_NTZ(ut.EXPIRATION::STRING) > CURRENT_TIMESTAMP()) AS "throttled"
FROM PUBLIC.USERS u
JOIN PUBLIC.PROJECTS p ON p._id = '{{project_id}}'
CROSS JOIN tag_signals tags
LEFT JOIN (
  SELECT USER_ID, PROJECT_ID, EMPTY_QUEUE_STATUS
  FROM PUBLIC.USERPROJECTPRIORITIES
  WHERE USER_ID = '{{contributor_id}}' AND PROJECT_ID = '{{project_id}}'
  QUALIFY ROW_NUMBER() OVER (ORDER BY LAST_MOVEMENT DESC NULLS LAST) = 1
) up ON up.USER_ID = u._id AND up.PROJECT_ID = p._id
LEFT JOIN PUBLIC.TASKPERMISSIONENTRIES pe
  ON pe.WORKER = u._id AND pe.PERMISSION_GROUP = p.PERMISSION_GROUP
  AND COALESCE(pe.__DELETED, FALSE) = FALSE
WHERE u._id = '{{contributor_id}}'
  AND COALESCE(u.__DELETED, FALSE) = FALSE
  AND COALESCE(p.__DELETED, FALSE) = FALSE
QUALIFY ROW_NUMBER() OVER (ORDER BY pe.UPDATED_AT DESC NULLS LAST) = 1`;

export function isAccountStatusQuestion(message: string): boolean {
  if (isProjectAvailabilityQuestion(message)) return true;
  return /\b(?:eq|empty\s+queue|throttl\w*|no\s+(?:tasks?|work)|out\s+of\s+tasks?|sin\s+tareas?|no\s+(?:tengo|hay)\s+tareas?|deshabilitad\w*|disabled|ineligible|not\s+eligible|task\s+limit|account\s+(?:is\s+)?(?:status|blocked|suspended)|cuenta\s+(?:esta\s+)?(?:bloqueada|suspendida)|(?:quality|review)\s+score|my\s+(?:score|qms|pdr)|demot\w*|reallocat\w*|another\s+chance|one\s+more\s+chance|otra\s+oportunidad|reactivat\w*|reactiv\w*|mi\s+(?:qms|pdr|puntaje|calificaci[oó]n))\b/i.test(message);
}

export function inferredContributorEmail(username: string): string | null {
  const match = username.trim().match(/^latam\.coder(\d{1,8})$/i);
  return match ? `latam.coder${match[1]}@remotasks.com+outlier` : null;
}

export interface DiagnosticDraft {
  diagnosticPending?: boolean;
  diagnosticVersion?: 3;
  diagnosticResolved?: boolean;
  action: 'human';
  confidence: number;
  draftOnly: true;
  reason: string;
  reply: string;
  guidelineSnippets: string[];
}

function draft(reply: string, reason: string): DiagnosticDraft {
  return sealDiagnosticDraft({ reply, reason });
}
const NEEDS_REVIEW = DIAGNOSTIC_COPY.review;

export function safeDiagnosticDraft(row: Record<string, unknown>, contributorId: string, projectId: string): DiagnosticDraft {
  if (row.contributor_id !== contributorId || row.project_id !== projectId || row.permission_verified !== true) {
    return draft(NEEDS_REVIEW, 'Identity or project permission could not be verified.');
  }
  const policy = projectTagPolicy(projectId);
  const confirmedQualityReassignment = policy?.descriptionsVerified === true
    && policy.rules.some(rule => rule.suffix === 'disabled' && rule.interpretation === 'quality_reassigned');
  if ((row.tag_evidence_checked === true && row.tag_access_review === true) || row.access_disabled === true || row.quality_disabled === true) {
    return draft(confirmedQualityReassignment ? DIAGNOSTIC_COPY.moneyHeistQualityReassigned : DIAGNOSTIC_COPY.access, 'Apply the confirmed project-specific access policy.');
  }
  if (row.tag_evidence_checked !== true) return draft(NEEDS_REVIEW, 'Project tag policy was not checked.');
  if (row.throttled === true) return draft(
    DIAGNOSTIC_COPY.limited,
    'An unexpired project-specific throttle was found. Limits and internal details are withheld.');
  if (row.individual_eq === false
    && row.access_disabled === false && row.quality_disabled === false
    && row.tag_access_review === false && row.throttled === false
    && row.project_empty !== true) {
    return draft(DIAGNOSTIC_COPY.unrestricted, 'Verified individual queue has no EQ restriction or active throttle.');
  }
  const flags = ['access_disabled', 'quality_disabled', 'throttled', 'project_empty', 'project_has_tasks', 'tag_access_review', 'tag_throttle_hint', 'tag_onboarding_hint', 'tag_unknown'];
  if (['access_disabled', 'quality_disabled', 'throttled'].some(flag => typeof row[flag] !== 'boolean')) {
    return draft(NEEDS_REVIEW, 'Account restriction or throttle evidence is incomplete.');
  }
  if (typeof row.project_empty !== 'boolean' || typeof row.project_has_tasks !== 'boolean') {
    return draft(NEEDS_REVIEW, 'Project availability was not returned by the query. EQ cannot be confirmed.');
  }
  if (row.project_empty === row.project_has_tasks) return draft(NEEDS_REVIEW, 'Project availability signals contradict each other.');
  if (!flags.every(flag => typeof row[flag] === 'boolean') || row.project_empty === row.project_has_tasks) {
    return draft(NEEDS_REVIEW, 'Missing or contradictory state flags.');
  }
  if (row.tag_throttle_hint === true) return draft(NEEDS_REVIEW, 'A throttle-related tag exists, but it does not confirm an active throttle.');
  if (row.tag_onboarding_hint === true) return draft(NEEDS_REVIEW, 'An onboarding-related tag needs corroboration against course completion.');
  if (row.tag_unknown === true) return draft(NEEDS_REVIEW, 'An unmapped project tag was found. Its meaning cannot be assumed.');
  if (row.project_empty === true && row.project_has_tasks === false) return draft(
    DIAGNOSTIC_COPY.empty,
    'Project source reports an empty queue. Task quantities are withheld.');
  return draft(NEEDS_REVIEW, 'No confirmed, safely disclosable cause. Task quantities are withheld.');
}

export function verifiedContributorId(rows: Array<Record<string, unknown>>, email: string | string[]): string | null {
  if (rows.length !== 1 || !(Array.isArray(email) ? email : [email]).includes(String(rows[0].email))) return null;
  const id = rows[0].contributor_id;
  return typeof id === 'string' && /^[a-f\d]{24}$/i.test(id) ? id : null;
}

function decryptKey(value: string): string {
  const secret = process.env.PLATFORM_ENCRYPTION_KEY?.trim();
  if (!secret || !value.startsWith('enc:v1:')) throw new Error('Diagnostic credential unavailable.');
  const [, , iv, tag, ciphertext] = value.split(':');
  const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}

export interface DiagnosticTask {
  version?: 3;
  scope?: 'project' | 'contributor';
  message?: string;
  conversation?: string;
  ownerId: string;
  projectId: string;
  username: string;
  statusQueryId: number;
  phase: 'identity' | 'status';
  jobId: string;
  contributorId?: string;
  expires: number;
}
export interface DiagnosticProgress { task?: DiagnosticTask; draft?: DiagnosticDraft }

function pendingPath(username: string, queryId: number, scope = 'contributor'): string {
  const fingerprint = createHash('sha256').update(`${REDASH_OWNER_ID}:${getProjectContext().projectId}:${queryId}:${username.toLowerCase()}${scope === 'project' ? ':project' : ''}`).digest('hex');
  return `output/diagnostic-jobs/${fingerprint}.json`;
}

async function savePendingTask(task: DiagnosticTask): Promise<void> {
  const secret = process.env.PLATFORM_ENCRYPTION_KEY?.trim();
  if (!secret) throw new Error('Diagnostic encryption unavailable.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), iv);
  const bytes = Buffer.concat([cipher.update(JSON.stringify(task), 'utf8'), cipher.final()]);
  const ciphertext = `enc:v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${bytes.toString('base64url')}`;
  await writeDataJSON(pendingPath(task.username, task.statusQueryId, task.scope), { ciphertext }, 'Preserve pending diagnostic job');
}

async function readPendingTask(username: string, queryId: number, scope: 'project' | 'contributor'): Promise<DiagnosticTask | null> {
  const saved = await readDataJSONOrDefault<{ ciphertext: string } | null>(pendingPath(username, queryId, scope), null);
  if (!saved) return null;
  const task = JSON.parse(decryptKey(saved.ciphertext)) as DiagnosticTask;
  return task.version === 3 && task.ownerId === REDASH_OWNER_ID && task.projectId === getProjectContext().projectId
    && task.username.toLowerCase() === username.toLowerCase() && task.statusQueryId === queryId
    && (task.scope || 'contributor') === scope
    && Number.isFinite(task.expires) && task.expires > Date.now() && task.jobId ? task : null;
}

export function diagnosticWaitMs(): number {
  const configured = Number(process.env.REDASH_DIAGNOSTIC_WAIT_MS || 60000);
  return Number.isFinite(configured) ? Math.min(120000, Math.max(1000, configured)) : 60000;
}

async function diagnosticConnection() {
  const { data, error } = await runtimeDb().from('private_redash_connections').select('key_ciphertext,queries').eq('owner_id', REDASH_OWNER_ID).maybeSingle();
  if (error || !data) throw new Error('Diagnostic connection unavailable.');
  return { key: decryptKey(data.key_ciphertext), queries: (data.queries || []) as DiagnosticQuery[] };
}

export async function activeProjectDiagnosticConnection(): Promise<{ key: string; queryId: number } | null> {
  const context = getProjectContext();
  if (!context.redashDiagnosticsAllowed || context.ownerId !== REDASH_OWNER_ID
    || context.demoMode || context.automationPaused || !runtimeDbConfigured()) return null;
  const { key, queries } = await diagnosticConnection();
  const query = queries.find(item => item.diagnosticVersion === 3 && item.diagnosticRole === 'unified'
    && item.diagnosticProjectId === context.projectId && item.diagnosticEnabled === true
    && item.diagnosticAutoReply === true);
  return query ? { key, queryId: redashId(query.queryId) } : null;
}

export async function authorizeDiagnosticReply(value: DiagnosticDraft) {
  const safe: DiagnosticDraft = sealDiagnosticDraft(value);
  const context = getProjectContext();
  if (safe.diagnosticVersion !== 3 || !safe.diagnosticResolved || !context.redashDiagnosticsAllowed
    || context.ownerId !== REDASH_OWNER_ID || context.demoMode || context.automationPaused) return safe;
  try {
    const { queries } = await diagnosticConnection();
    const enabled = queries.some(query => query.diagnosticVersion === 3 && query.diagnosticRole === 'unified'
      && query.diagnosticProjectId === context.projectId && query.diagnosticEnabled === true
      && query.diagnosticAutoReply === true);
    if (enabled) return { ...safe, action: 'reply' as const, confidence: 1, draftOnly: false as const };
  } catch { /* Missing authorization always leaves a human-reviewed draft. */ }
  return safe;
}

async function consumeDiagnosticResult(task: DiagnosticTask, result: RedashTableResult, key: string): Promise<DiagnosticProgress> {
  if (task.version === 3) {
    const row = result.rows[0];
    if (task.scope === 'project' && (result.rows.length !== 1 || row.project_id !== task.projectId
      || typeof row.project_has_tasks !== 'boolean')) {
      return { draft: draft(NEEDS_REVIEW, 'Project availability was not returned by the query. EQ cannot be confirmed.') };
    }
    if (task.scope !== 'project' && (result.rows.length !== 1 || row.project_id !== task.projectId || row.identity_matches !== 1
      || !/^[a-f\d]{24}$/i.test(String(row.contributor_id)))) {
      return { draft: draft(NEEDS_REVIEW, 'Identity ambiguous or missing.') };
    }
    try {
      return { draft: await unifiedAccountDraft(row, getProjectContext().projectName || 'this project', task.message || '', task.conversation || '', task.scope) };
    } catch {
      return { draft: draft(NEEDS_REVIEW, 'Unified query completed, but AI draft generation failed. Retry the draft.') };
    }
  }
  if (task.phase === 'identity') {
    const contributorId = verifiedContributorId(result.rows, Object.values(lookupEmails(task.username)));
    if (!contributorId) return { draft: draft(NEEDS_REVIEW, 'Identity ambiguous or missing.') };
    const response = await redashRequest(key, `queries/${redashId(task.statusQueryId)}/results`, { parameters: {
      contributor_id: contributorId, project_id: task.projectId,
      project_tag_prefix: projectTagPolicy(task.projectId)?.prefix || '',
    }, max_age: 0 });
    const next: DiagnosticTask = { ...task, phase: 'status', contributorId, jobId: String(response.job?.id || '') };
    if (response.query_result) return consumeDiagnosticResult(next, normalizeRedashResult(response.query_result), key);
    if (!next.jobId) throw new Error('Diagnostic query did not start.');
    return { task: next };
  }
  return { draft: result.rows.length === 1 && task.contributorId
    ? safeDiagnosticDraft(result.rows[0], task.contributorId, task.projectId)
    : draft(NEEDS_REVIEW, 'Status missing or ambiguous.') };
}

export async function startAccountDiagnostic(username: string, message: string, preview = false, conversation = ''): Promise<DiagnosticProgress | null> {
  const context = getProjectContext();
  if (!context.redashDiagnosticsAllowed || context.demoMode || !runtimeDbConfigured()) return null;
  try {
    const { key, queries } = await diagnosticConnection();
    const unified = queries.find(query => query.diagnosticVersion === 3 && query.diagnosticRole === 'unified'
      && query.diagnosticProjectId === context.projectId && (preview || query.diagnosticEnabled));
    if (unified) {
      const scope = isProjectAvailabilityQuestion(message) ? 'project'
        : isAccountStatusQuestion(message) ? 'contributor' : await selectDiagnosticQuery(message, conversation);
      if (!scope && !preview) return null;
      const queryScope = scope || 'contributor';
      const policy = projectTagPolicy(context.projectId);
      if (!policy || !/^[a-f\d]{24}$/i.test(context.projectId)) throw new Error('Unified lifecycle policy is not configured for this project.');
      const pending = await readPendingTask(username, unified.queryId, queryScope);
      if (pending) return { task: { ...pending, message: message.slice(0, 3000), conversation: conversation.slice(-10000) } };
      let response;
      if (queryScope === 'project') {
        const definition = await redashRequest(key, `queries/${redashId(unified.queryId)}`);
        if (redashId(definition.data_source_id) !== 30) throw new Error('Project availability requires the verified Redash database.');
        response = await redashRequest(key, 'query_results', {
          query: PROJECT_AVAILABILITY_SQL.replace('{{project_id}}', context.projectId), data_source_id: 30, max_age: 60,
        });
      } else {
        response = await redashRequest(key, `queries/${redashId(unified.queryId)}/results`, { parameters: {
          ...lookupEmails(username), project_id: context.projectId, project_tag_prefix: policy.prefix,
        }, max_age: 60 });
      }
      const task: DiagnosticTask = { version: 3, ownerId: REDASH_OWNER_ID, projectId: context.projectId,
        username, scope: queryScope, statusQueryId: unified.queryId, phase: 'status', jobId: String(response.job?.id || ''),
        message: message.slice(0, 3000), conversation: conversation.slice(-10000), expires: Date.now() + 5 * 60000 };
      if (response.query_result) return await consumeDiagnosticResult(task, normalizeRedashResult(response.query_result), key);
      if (!task.jobId) throw new Error('Unified diagnostic did not start.');
      await savePendingTask(task);
      return { task };
    }
    if (!preview && !isAccountStatusQuestion(message)) return null;
    const configured = queries.filter(query => query.diagnosticVersion === 2 && (
      preview ? (!query.diagnosticProjectId || query.diagnosticProjectId === context.projectId)
        : query.diagnosticProjectId === context.projectId && query.diagnosticEnabled));
    const identityQuery = configured.find(query => query.diagnosticRole === 'identity');
    const statusQuery = configured.find(query => query.diagnosticRole === 'status');
    if (!identityQuery || !statusQuery) {
      if (preview) throw new Error('Prepare or update diagnostic queries first.');
      if (queries.some(query => query.diagnosticProjectId === context.projectId && query.diagnosticEnabled)) return { draft: draft(NEEDS_REVIEW, 'Diagnostic queries need updating.') };
      return null;
    }
    if (!/^[a-f\d]{24}$/i.test(context.projectId)) throw new Error('A real Outlier project ID is required.');
    const parameters = lookupEmails(username);
    const response = await redashRequest(key, `queries/${redashId(identityQuery.queryId)}/results`, { parameters, max_age: 0 });
    const task: DiagnosticTask = { ownerId: REDASH_OWNER_ID, projectId: context.projectId, username,
      statusQueryId: statusQuery.queryId, phase: 'identity', jobId: String(response.job?.id || ''), expires: Date.now() + 5 * 60000 };
    if (response.query_result) return await consumeDiagnosticResult(task, normalizeRedashResult(response.query_result), key);
    if (!task.jobId) throw new Error('Diagnostic query did not start.');
    return { task };
  } catch {
    return { draft: draft(NEEDS_REVIEW, 'Diagnostic lookup unavailable.') };
  }
}

export async function pollAccountDiagnostic(task: DiagnosticTask): Promise<DiagnosticProgress> {
  const context = getProjectContext();
  if (!task || typeof task !== 'object' || !context.redashDiagnosticsAllowed || context.demoMode || task.ownerId !== REDASH_OWNER_ID
    || task.projectId !== context.projectId || !Number.isFinite(task.expires) || task.expires < Date.now()
    || !['identity', 'status'].includes(task.phase) || !task.jobId) throw new Error('Diagnostic session expired or is not authorized for this project.');
  try {
    const { key } = await diagnosticConnection();
    const response = await redashRequest(key, `jobs/${encodeURIComponent(task.jobId)}`);
    if ([4, 5].includes(response.job?.status)) {
      if (task.version === 3) await writeDataJSON(pendingPath(task.username, task.statusQueryId, task.scope), null, 'Clear failed diagnostic job');
      return { draft: draft(NEEDS_REVIEW, 'Diagnostic query failed.') };
    }
    if (response.job?.status !== 3) return { task };
    const result = await redashRequest(key, `query_results/${redashId(response.job.query_result_id)}`);
    const progress = await consumeDiagnosticResult(task, normalizeRedashResult(result.query_result), key);
    if (task.version === 3 && progress.draft) await writeDataJSON(pendingPath(task.username, task.statusQueryId, task.scope), null, 'Clear completed diagnostic job');
    return progress;
  } catch { return { draft: draft(NEEDS_REVIEW, 'Diagnostic lookup unavailable.') }; }
}

export async function accountDiagnosticDraft(username: string, message: string, conversation = ''): Promise<DiagnosticDraft | null> {
  let progress = await startAccountDiagnostic(username, message, false, conversation);
  if (!progress) return null;
  const deadline = Date.now() + diagnosticWaitMs();
  while (progress.task && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1200));
    progress = await pollAccountDiagnostic(progress.task);
  }
  return progress.draft || { ...draft(NEEDS_REVIEW, 'Diagnostic query is still running. Retry to continue the same query.'), diagnosticPending: true };
}
