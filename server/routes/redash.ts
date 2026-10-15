import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getRequestUser } from '../auth';
import { decryptSecret, encryptSecret, getSupabaseAdmin } from '../platform-store';
import { canUseRedash, REDASH_OWNER_ID, redashId, redashRequest, validateRedashConnection, redashParameters, normalizeRedashResult, resolveRedashDataSource } from '../../src/redash';

const TABLE = 'private_redash_connections';
interface Query { id: string; name: string; queryId: number; parameter?: string }
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
