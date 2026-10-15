export const REDASH_BASE_URL = 'https://redash.scale.com';
export const REDASH_OWNER_ID = 'b6f44318-a33e-4d01-958c-5d591d9267bc';

export function canUseRedash(user: { id: string; email?: string; isDemo?: boolean } | null | undefined): boolean {
  return Boolean(user && !user.isDemo && user.id === REDASH_OWNER_ID
    && user.email?.toLowerCase() === 'tomas.ruiz@contractors.scale.com');
}

export function redashId(value: unknown): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Enter a valid Redash query or data source ID.');
  return id;
}

export async function resolveRedashDataSource(key: string): Promise<number> {
  const sources = await redashRequest(key, 'data_sources');
  if (!Array.isArray(sources) || !sources.length) throw new Error('No accessible Redash database was found.');
  if (sources.length === 1) return redashId(sources[0].id);
  const recent = await redashRequest(key, 'queries/my?page_size=1&order=-updated_at');
  const sourceId = recent?.results?.[0]?.data_source_id;
  if (sources.some((source: any) => source.id === sourceId)) return redashId(sourceId);
  throw new Error('Could not identify your last-used database. Save a query in Redash first, or add an existing Redash query here.');
}

export async function validateRedashConnection(key: string): Promise<void> {
  const data = await redashRequest(key, 'queries?page_size=1');
  if (!Array.isArray(data?.results)) throw new Error('Redash returned an unexpected query list. Check your User API key and API access.');
}

export function redashParameters(definition: { options?: { parameters?: Array<{ name: string; value?: unknown }> } }, overrides: unknown = {}): Record<string, unknown> {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new Error('Query parameters must be a JSON object.');
  const defaults = Object.fromEntries((definition.options?.parameters || []).map(item => [item.name, item.value]));
  return { ...defaults, ...overrides };
}

export interface RedashTableResult {
  columns: Array<{ name: string }>;
  rows: Array<Record<string, unknown>>;
  retrieved_at?: string;
}

export function normalizeRedashResult(value: unknown): RedashTableResult {
  if (!value || typeof value !== 'object') throw new Error('Redash returned an invalid query result.');
  const result = value as Record<string, any>;
  const table = result.data ?? result;
  if (!Array.isArray(table.rows) || !Array.isArray(table.columns)
    || !table.columns.every((column: any) => column && typeof column.name === 'string')
    || !table.rows.every((row: unknown) => row && typeof row === 'object' && !Array.isArray(row))) {
    throw new Error('Redash returned an invalid table. Open the query in Redash to check its result.');
  }
  return { columns: table.columns.map((column: any) => ({ name: column.name })), rows: table.rows,
    retrieved_at: typeof result.retrieved_at === 'string' ? result.retrieved_at : undefined };
}

export async function redashRequest(key: string, endpoint: string, body?: unknown): Promise<any> {
  let response: globalThis.Response;
  try {
    response = await fetch(`${REDASH_BASE_URL}/api/${endpoint}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error('Redash could not be reached. Check network access or VPN and try again.');
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('Redash rejected the key or query permissions.');
    if (response.status === 429) throw new Error('Redash is rate limited. Wait before trying again.');
    if (response.status >= 500) throw new Error('Redash returned a server error. Your key has not been validated. Try again or check Redash availability.');
    throw new Error(`Redash request failed (${response.status}).`);
  }
  const raw = await response.text();
  if (raw.length > 2_000_000) throw new Error('Redash result is too large. Add a row limit to the query.');
  try { return JSON.parse(raw); } catch { throw new Error('Redash returned an unexpected response. Check API access or VPN.'); }
}
