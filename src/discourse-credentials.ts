export interface DiscourseCredentialOptions {
  baseUrl: string;
  apiKey: string;
  apiClientId?: string;
  timeoutMs?: number;
  rateLimitRetries?: number;
  maxRateLimitWaitMs?: number;
}

export interface DiscourseProjectAccessOptions extends DiscourseCredentialOptions {
  categoryId: string;
  channelId: string;
  knownUsername?: string;
}

export interface DiscourseProjectAccessResult {
  username: string;
  categoryId: string;
  channelId: string;
}

interface DiscourseResponseBody {
  errors?: string[];
  error_type?: string;
  current_user?: { username?: string };
  username?: string;
  extras?: { wait_seconds?: number | string };
}

function cleanBaseUrl(value: string): string {
  const baseUrl = value.trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(baseUrl)) throw new Error('Community base URL must use HTTPS.');
  return baseUrl;
}

export function looksLikeEncryptedDiscoursePayload(value: string): boolean {
  const compact = value.trim().replace(/[\r\n\t ]/g, '');
  return compact.length >= 256
    && compact.length <= 1024
    && /^[A-Za-z0-9+/=_-]+$/.test(compact);
}

export function assertDiscourseUserApiKey(value: string): string {
  const apiKey = value.trim();
  if (!apiKey) throw new Error('Discourse User API Key is required.');
  if (looksLikeEncryptedDiscoursePayload(apiKey)) {
    throw new Error('This is an encrypted authorization code, not a User API Key. Paste it into the Authorization code field and click Verify connection.');
  }
  if (/\s/.test(apiKey)) throw new Error('The Discourse User API Key cannot contain spaces.');
  return apiKey;
}

function requestHeaders(apiKey: string, apiClientId?: string): Record<string, string> {
  return {
    Accept: 'application/json',
    'User-Api-Key': apiKey,
    ...(apiClientId?.trim() ? { 'User-Api-Client-Id': apiClientId.trim() } : {}),
  };
}

async function discourseRequest(
  options: DiscourseCredentialOptions,
  path: string,
): Promise<{ response: Response; body: DiscourseResponseBody }> {
  const apiKey = assertDiscourseUserApiKey(options.apiKey);
  const retries = Math.max(0, Math.floor(options.rateLimitRetries ?? 1));
  const maxWaitMs = Math.max(0, options.maxRateLimitWaitMs ?? 30_000);
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(`${cleanBaseUrl(options.baseUrl)}${path}`, {
      headers: requestHeaders(apiKey, options.apiClientId),
      signal: AbortSignal.timeout(options.timeoutMs || 8_000),
    });
    const body = await response.json().catch(() => ({})) as DiscourseResponseBody;
    if (response.status !== 429 || attempt >= retries) return { response, body };

    const headerSeconds = Number(response.headers.get('retry-after'));
    const bodySeconds = Number(body.extras?.wait_seconds);
    const waitSeconds = Number.isFinite(headerSeconds)
      ? headerSeconds
      : Number.isFinite(bodySeconds) ? bodySeconds : 2;
    const waitMs = Math.min(maxWaitMs, Math.max(250, waitSeconds * 1000));
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

function responseError(body: DiscourseResponseBody, fallback: string): string {
  return body.errors?.filter(Boolean).join(' ') || body.error_type || fallback;
}

export async function validateDiscourseUserApiKey(options: DiscourseCredentialOptions): Promise<{ username: string }> {
  let result: Awaited<ReturnType<typeof discourseRequest>>;
  try {
    result = await discourseRequest(options, '/session/current.json');
  } catch (err) {
    if (err instanceof Error && /authorization code|User API Key|required|HTTPS|spaces/i.test(err.message)) throw err;
    throw new Error(`Community connection could not be reached. ${err instanceof Error ? err.message : String(err)}`.trim());
  }

  if (!result.response.ok) {
    if (result.response.status === 429) {
      const waitSeconds = Number(result.body.extras?.wait_seconds);
      const waitText = Number.isFinite(waitSeconds) ? ` Wait ${Math.ceil(waitSeconds)} seconds and try again.` : ' Try again in a few seconds.';
      throw new Error(`Community is temporarily rate limiting connection checks.${waitText}`);
    }
    if (result.response.status === 401 || result.response.status === 403) {
      throw new Error('Community rejected this User API Key. Reconnect Discourse and authorize the app again.');
    }
    throw new Error(`Community credential check returned ${result.response.status}: ${responseError(result.body, 'Unknown error')}`);
  }

  const username = result.body.current_user?.username?.trim() || result.body.username?.trim() || '';
  if (!username) throw new Error('Community accepted the key but did not return a Discourse username.');
  return { username };
}

async function validateReadableResource(
  options: DiscourseCredentialOptions,
  path: string,
  resourceLabel: string,
  resourceId: string,
  username: string,
): Promise<void> {
  let result: Awaited<ReturnType<typeof discourseRequest>>;
  try {
    result = await discourseRequest(options, path);
  } catch (err) {
    throw new Error(`Could not check ${resourceLabel} ID ${resourceId}. ${err instanceof Error ? err.message : String(err)}`.trim());
  }
  if (result.response.ok) return;
  if (result.response.status === 401 || result.response.status === 403) {
    throw new Error(`Connected as ${username}, but this account cannot access ${resourceLabel} ID ${resourceId}. Open that resource in Community with the same account, then try again.`);
  }
  if (result.response.status === 404) {
    throw new Error(`${resourceLabel[0].toUpperCase()}${resourceLabel.slice(1)} ID ${resourceId} was not found. Check the ID and try again.`);
  }
  throw new Error(`${resourceLabel[0].toUpperCase()}${resourceLabel.slice(1)} check returned ${result.response.status}: ${responseError(result.body, 'Unknown error')}`);
}

export async function validateDiscourseProjectAccess(
  options: DiscourseProjectAccessOptions,
): Promise<DiscourseProjectAccessResult> {
  const categoryId = options.categoryId.trim();
  const channelId = options.channelId.trim();
  if (!/^\d+$/.test(categoryId)) throw new Error('Community category ID must be numeric.');
  if (!/^\d+$/.test(channelId)) throw new Error('Community channel ID must be numeric.');

  const username = options.knownUsername?.trim()
    || (await validateDiscourseUserApiKey(options)).username;
  await validateReadableResource(options, `/c/${encodeURIComponent(categoryId)}.json?page=0`, 'category', categoryId, username);
  await validateReadableResource(
    options,
    `/chat/api/channels/${encodeURIComponent(channelId)}/messages.json?page_size=1`,
    'channel',
    channelId,
    username,
  );
  return { username, categoryId, channelId };
}
