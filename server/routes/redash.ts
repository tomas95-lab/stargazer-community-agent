import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getRequestUser } from '../auth';
import { decryptSecret, encryptSecret, getSupabaseAdmin } from '../platform-store';
import { canUseRedash, REDASH_OWNER_ID, redashId, redashRequest, validateRedashConnection, redashParameters, normalizeRedashResult, resolveRedashDataSource } from '../../src/redash';
import { startAccountDiagnostic, pollAccountDiagnostic, type DiagnosticProgress } from '../../src/redash-diagnostics';
import { lookupEmails } from '../../src/contributor-lookups';
import { UNIFIED_DIAGNOSTIC_SQL, UNIFIED_DIAGNOSTIC_PARAMETERS } from '../../src/unified-account-query';
import { projectTagPolicy } from '../../src/project-tag-policy';
import { sealDiagnosticDraft } from '../../src/diagnostic-disclosure';
import { getCurrentProjectId } from '../../src/project-context';
import { runProjectAvailabilityJob } from '../../src/project-availability-job';

const TABLE = 'private_redash_connections';
interface Query { id: string; name: string; queryId: number; parameter?: string; diagnosticRole?: 'identity' | 'status' | 'unified'; diagnosticProjectId?: string; diagnosticEnabled?: boolean; diagnosticAutoReply?: boolean; diagnosticVersion?: number }
interface Connection { key_ciphertext: string; queries: Query[] }

export function createRedashRouter(resolveUser = getRequestUser) {
const router = Router();
router.use(async (req, res, next) => {
  try {
    if (!canUseRedash(await resolveUser(req))) { res.status(403).json({ error: 'Access denied.' }); return; }
    res.setHeader('Cache-Control', 'no-store');
    next();
  } catch { res.status(401).json({ error: 'Authentication required.' }); }
});

async function load(): Promise<Connection | null> {
  const { data, error } = await getSupabaseAdmin().from(TABLE).select('key_ciphertext,queries').eq('owner_id', REDASH_OWNER_ID).maybeSingle();
  if (error) throw new Error('Redash storage is unavailable. Apply the Redash database migration.');
  return data;
}
async function save(values: Partial<Connection>): Promise<void> {
  const { error } = await getSupabaseAdmin().from(TABLE).upsert({ owner_id: REDASH_OWNER_ID, ...values, updated_at: new Date().toISOString() });
  if (error) throw new Error('Could not save Redash configuration.');
}
function credentials(row: Connection | null): string {
  if (!row?.key_ciphertext?.startsWith('enc:v1:')) throw new Error('Connect Redash first.');
  return decryptSecret(row.key_ciphertext);
}
function safeError(res: any, error: unknown): void {
  res.status(400).json({ error: error instanceof Error ? error.message : 'Redash request failed.' });
}

router.get('/', async (_req, res) => {
  try { const row = await load(); res.json({ connected: Boolean(row?.key_ciphertext), queries: row?.queries || [] }); }
  catch (error) { safeError(res, error); }
});
router.post('/availability/check', async (_req, res) => {
  try { res.json(await runProjectAvailabilityJob({ manual: true })); }
  catch (error) { safeError(res, error); }
});
function previewResponse(progress: DiagnosticProgress | null) {
  if (!progress) throw new Error('Diagnostics are unavailable for this project or user.');
  if (progress.draft) return { status: 'complete', draft: sealDiagnosticDraft(progress.draft) };
  if (!progress.task) throw new Error('Diagnostic did not return a result.');
  return { status: 'pending', stage: progress.task.phase, token: encryptSecret(JSON.stringify(progress.task)) };
}
router.post('/diagnostics/preview', async (req, res) => {
  try {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    lookupEmails(username);
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
    if (!message || message.length > 3000) throw new Error('Enter an account-status question under 3,000 characters.');
    res.json(previewResponse(await startAccountDiagnostic(username, message, true)));
  } catch (error) { safeError(res, error); }
});
router.post('/diagnostics/preview/poll', async (req, res) => {
  try {
    const token = req.body.token;
    if (typeof token !== 'string' || !token.startsWith('enc:v1:') || token.length > 10000) throw new Error('Invalid diagnostic session.');
    let task;
    try { task = JSON.parse(decryptSecret(token)); } catch { throw new Error('Invalid diagnostic session.'); }
    res.json(previewResponse(await pollAccountDiagnostic(task)));
  } catch (error) { safeError(res, error); }
});
router.post('/diagnostics/prepare', async (_req, res) => {
  try {
    const projectId = getCurrentProjectId();
    if (!/^[a-f\d]{24}$/i.test(projectId)) throw new Error('Set the real Outlier project ID before preparing diagnostics.');
    if (!projectTagPolicy(projectId)) throw new Error('Configure a verified lifecycle policy for this project before preparing diagnostics.');
    const row = await load();
    const key = credentials(row);
    const queries = [...(row?.queries || [])];
    const source = await resolveRedashDataSource(key);
    if (source !== 30) throw new Error('Experimental SQL was verified against database 30. Your last-used database is different. Register the diagnostic queries after checking their schema.');
    const existing = queries.find(query => query.diagnosticRole === 'unified' && query.diagnosticProjectId === projectId);
    const options = { parameters: UNIFIED_DIAGNOSTIC_PARAMETERS.map(name => ({ name, title: name, type: 'text', value: '' })) };
    if (existing) {
      await redashRequest(key, `queries/${existing.queryId}`, { query: UNIFIED_DIAGNOSTIC_SQL, options });
      existing.diagnosticVersion = 3;
    } else {
      const created = await redashRequest(key, 'queries', {
        name: `Experimental unified account diagnostic - ${projectId}`, query: UNIFIED_DIAGNOSTIC_SQL,
        data_source_id: source, options,
      });
      queries.push({ id: randomUUID(), name: 'Unified account diagnostic', queryId: redashId(created.id),
        diagnosticRole: 'unified', diagnosticProjectId: projectId, diagnosticEnabled: false, diagnosticVersion: 3 });
    }
    // Preserve the old SQL and bindings for rollback; never enable new automation implicitly.
    for (const query of queries) if (query.diagnosticProjectId === projectId) {
      query.diagnosticEnabled = false;
      query.diagnosticAutoReply = false;
    }
    await save({ queries });
    res.json({ queries });
  } catch (error) { safeError(res, error); }
});
router.put('/diagnostics', async (req, res) => {
  try {
    const projectId = getCurrentProjectId();
    const row = await load();
    const configured = (row?.queries || []).filter(query => query.diagnosticProjectId === projectId);
    if (req.body.enabled === true && !configured.some(query => query.diagnosticRole === 'unified' && query.diagnosticVersion === 3)) throw new Error('Prepare the unified diagnostic query first.');
    const queries = (row?.queries || []).map(query => query.diagnosticProjectId === projectId
      ? { ...query,
        diagnosticEnabled: req.body.enabled === true && query.diagnosticRole === 'unified' && query.diagnosticVersion === 3,
        diagnosticAutoReply: req.body.enabled === true && query.diagnosticRole === 'unified' && query.diagnosticVersion === 3
          && (typeof req.body.autoReply === 'boolean' ? req.body.autoReply : query.diagnosticAutoReply === true),
      } : query);
    await save({ queries });
    res.json({ queries });
  } catch (error) { safeError(res, error); }
});
router.put('/connection', async (req, res) => {
  try {
    if (!process.env.PLATFORM_ENCRYPTION_KEY?.trim()) throw new Error('Set a dedicated PLATFORM_ENCRYPTION_KEY before storing Redash credentials.');
    const key = typeof req.body.apiKey === 'string' ? req.body.apiKey.trim() : '';
    if (!key || key.length > 1000 || /\s/.test(key)) throw new Error('Enter a valid Redash User API key.');
    await validateRedashConnection(key);
    await save({ key_ciphertext: encryptSecret(key) });
    res.json({ connected: true });
  } catch (error) { safeError(res, error); }
});
router.delete('/connection', async (_req, res) => {
  try { await save({ key_ciphertext: '' }); res.json({ connected: false }); }
  catch (error) { safeError(res, error); }
});
router.get('/data-sources', async (_req, res) => {
  try {
    const sources = await redashRequest(credentials(await load()), 'data_sources');
    if (!Array.isArray(sources)) throw new Error('Redash returned an unexpected data source list.');
    res.json({ sources: sources.map(source => ({ id: source.id, name: source.name })) });
  } catch (error) { safeError(res, error); }
});
router.post('/queries', async (req, res) => {
  try {
    const row = await load();
    const key = credentials(row);
    const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 120) : '';
    if (!name) throw new Error('Enter a query name.');
    if ((row?.queries.length || 0) >= 30) throw new Error('Maximum 30 saved queries.');
    let queryId: number;
    if (req.body.sql) {
      const sql = typeof req.body.sql === 'string' ? req.body.sql.trim() : '';
      if (sql.length > 30000) throw new Error('Keep SQL under 30,000 characters.');
      const parameters = [...new Set([...sql.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)].map(match => match[1]))];
      const created = await redashRequest(key, 'queries', {
        name, query: sql, data_source_id: await resolveRedashDataSource(key),
        options: { parameters: parameters.map(name => ({ name, title: name, type: 'text', value: '' })) },
      });
      queryId = redashId(created.id);
    } else {
      queryId = redashId(req.body.queryId);
      await redashRequest(key, `queries/${queryId}`);
    }
    const queries = [...(row?.queries || []), { id: randomUUID(), name, queryId }];
    await save({ queries });
    res.json({ queries });
  } catch (error) { safeError(res, error); }
});
router.delete('/queries/:id', async (req, res) => {
  try { const row = await load(); const queries = (row?.queries || []).filter(q => q.id !== req.params.id); await save({ queries }); res.json({ queries }); }
  catch (error) { safeError(res, error); }
});

// Job handles stay server-side and are bound to this owner and the selected query.
router.post('/queries/:id/run', async (req, res) => {
  try {
    const row = await load();
    const query = row?.queries.find(q => q.id === req.params.id);
    if (!query) throw new Error('Query not found.');
    const overrides = req.body.parameters ?? {};
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new Error('Query parameters must be a JSON object.');
    const key = credentials(row);
    const definition = await redashRequest(key, `queries/${query.queryId}`);
    const result = await redashRequest(key, `queries/${query.queryId}/results`, { parameters: redashParameters(definition, overrides), max_age: 0 });
    if (result.query_result) { res.json({ result: normalizeRedashResult(result.query_result) }); return; }
    if (!result.job?.id) throw new Error('Redash did not return a query result or job.');
    const token = encryptSecret(JSON.stringify({ owner: REDASH_OWNER_ID, jobId: String(result.job.id), expires: Date.now() + 10 * 60000 }));
    res.json({ job: token });
  } catch (error) { safeError(res, error); }
});
router.get('/jobs/:id', async (req, res) => {
  try {
    let job: { owner: string; jobId: string; expires: number };
    try { job = JSON.parse(decryptSecret(String(req.params.id))); }
    catch { throw new Error('Invalid diagnostic job.'); }
    if (job.owner !== REDASH_OWNER_ID || !job.jobId || !Number.isFinite(job.expires) || job.expires < Date.now()) throw new Error('Diagnostic job expired. Run the query again.');
    const key = credentials(await load());
    const data = await redashRequest(key, `jobs/${encodeURIComponent(job.jobId)}`);
    if (data.job?.status === 4 || data.job?.status === 5) throw new Error('Redash query failed or was cancelled. Check the query in Redash.');
    if (data.job?.status === 3) {
      const result = await redashRequest(key, `query_results/${redashId(data.job.query_result_id)}`);
      res.json({ result: normalizeRedashResult(result.query_result) }); return;
    }
    res.json({ pending: true });
  } catch (error) { safeError(res, error); }
});
return router;
}
export default createRedashRouter();
