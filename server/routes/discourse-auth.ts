import {
  constants,
  generateKeyPairSync,
  privateDecrypt,
  randomBytes,
} from 'crypto';
import { Router, Request, Response } from 'express';
import { AuthenticatedRequest, requirePlatformUser } from '../auth';
import {
  decryptSecret,
  encryptSecret,
  getSupabaseAdmin,
  getUserProject,
  text,
} from '../platform-store';

const router = Router();

const ATTEMPTS_TABLE = 'discourse_auth_attempts';
const USER_KEYS_TABLE = 'user_discourse_keys';
const PROJECTS_TABLE = 'qm_projects';
const APPLICATION_NAME = process.env.DISCOURSE_AUTH_APPLICATION_NAME || 'DailyThreadBot';
const CLIENT_ID = process.env.DISCOURSE_AUTH_CLIENT_ID || 'daily-thread-bot';
const SCOPES = process.env.DISCOURSE_AUTH_SCOPES || 'read,write';
const DISCOURSE_AUTH_BASE_URL = (process.env.DISCOURSE_AUTH_BASE_URL || 'https://community.outlier.ai').replace(/\/+$/, '');
const ATTEMPT_TTL_MS = Math.max(60_000, Number(process.env.DISCOURSE_AUTH_TTL_SECONDS || 600) * 1000);

interface DiscourseAuthAttempt {
  id: string;
  owner_id: string;
  project_id?: string | null;
  nonce: string;
  private_key_ciphertext: string;
  return_to: string;
  created_at: string;
  expires_at: string;
  consumed_at?: string | null;
}

interface DiscoursePayload {
  key?: string;
  nonce?: string;
  push?: boolean;
  api?: number | string;
}

function publicBaseUrl(req: Request): string {
  const explicit = text(process.env.PUBLIC_BASE_URL) || text(process.env.APP_BASE_URL) || text(process.env.SERVER_PUBLIC_URL);
  if (explicit) return explicit.replace(/\/+$/, '');

  const vercelUrl = text(process.env.VERCEL_URL);
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;

  const proto = text(req.header('x-forwarded-proto')) || req.protocol || 'http';
  const host = text(req.header('x-forwarded-host')) || req.get('host') || 'localhost:3001';
  return `${proto.split(',')[0]}://${host}`.replace(/\/+$/, '');
}

function frontendBaseUrl(req: Request): string {
  const explicit = text(process.env.FRONTEND_BASE_URL) || text(process.env.APP_FRONTEND_URL);
  if (explicit) return explicit.replace(/\/+$/, '');

  const host = req.get('host') || '';
  if (host.startsWith('localhost:3001') || host.startsWith('127.0.0.1:3001')) return 'http://localhost:5173';
  return publicBaseUrl(req);
}

function safeReturnTo(value: unknown): string {
  const raw = text(value) || '/project';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/project';
  return raw.slice(0, 300);
}

function redirectWithStatus(req: Request, res: Response, returnTo: string, status: 'connected' | 'error', message?: string): void {
  const target = new URL(safeReturnTo(returnTo), `${frontendBaseUrl(req)}/`);
  target.searchParams.set('discourse', status);
  if (message) target.searchParams.set('message', message.slice(0, 180));
  res.redirect(302, target.toString());
}

function encodeAuthParam(value: string): string {
  return encodeURIComponent(value);
}

export function buildDiscourseAuthorizationUrl(params: {
  baseUrl: string;
  applicationName: string;
  clientId: string;
  scopes: string;
  publicKey: string;
  nonce: string;
  authRedirect: string;
  padding: string;
}): string {
  const authUrl = new URL('/user-api-key/new', `${params.baseUrl.replace(/\/+$/, '')}/`);
  const query = [
    ['application_name', params.applicationName],
    ['client_id', params.clientId],
    ['scopes', params.scopes],
    ['public_key', params.publicKey],
    ['nonce', params.nonce],
    ['auth_redirect', params.authRedirect],
    ['padding', params.padding],
  ]
    .map(([key, value]) => `${key}=${encodeAuthParam(value)}`)
    .join('&')
    .replace(/scopes=([^&]+)/, (match) => match.replace(/%2C/gi, ','));

  return `${authUrl.toString()}?${query}`;
}

function encryptedPayloadBuffer(payload: string): Buffer {
  return Buffer.from(payload.replace(/ /g, '+'), 'base64');
}

function decryptPayload(payload: string, privateKeyPem: string): DiscoursePayload {
  const decrypted = privateDecrypt(
    {
      key: privateKeyPem,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
    },
    encryptedPayloadBuffer(payload),
  );
  return JSON.parse(decrypted.toString('utf8')) as DiscoursePayload;
}

async function deleteExpiredAttempts(): Promise<void> {
  await getSupabaseAdmin()
    .from(ATTEMPTS_TABLE)
    .delete()
    .lt('expires_at', new Date().toISOString());
}

async function fetchAttempt(id: string): Promise<DiscourseAuthAttempt | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(ATTEMPTS_TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as DiscourseAuthAttempt | null;
}

async function deleteAttempt(id: string): Promise<void> {
  await getSupabaseAdmin().from(ATTEMPTS_TABLE).delete().eq('id', id);
}

async function fetchDiscourseUsername(userApiKey: string): Promise<string> {
  try {
    const res = await fetch(`${DISCOURSE_AUTH_BASE_URL}/session/current.json`, {
      headers: {
        'Content-Type': 'application/json',
        'User-Api-Key': userApiKey,
        'User-Api-Client-Id': CLIENT_ID,
      },
    });
    if (!res.ok) return '';
    const data = await res.json() as { current_user?: { username?: string }; username?: string };
    return text(data.current_user?.username) || text(data.username);
  } catch {
    return '';
  }
}

router.post('/start', requirePlatformUser, async (req: Request, res: Response) => {
  try {
    await deleteExpiredAttempts().catch(() => undefined);

    const authReq = req as AuthenticatedRequest;
    const user = authReq.authUser!;
    const projectId = text(req.body?.projectId);
    if (projectId) {
      const project = await getUserProject(user.id, projectId);
      if (!project) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }
    }

    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const nonce = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + ATTEMPT_TTL_MS).toISOString();
    const { data, error } = await getSupabaseAdmin()
      .from(ATTEMPTS_TABLE)
      .insert({
        owner_id: user.id,
        project_id: projectId || null,
        nonce,
        private_key_ciphertext: encryptSecret(privateKey),
        return_to: safeReturnTo(req.body?.returnTo),
        expires_at: expiresAt,
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);

    const attempt = data as DiscourseAuthAttempt;
    const callbackUrl = new URL('/api/discourse-auth/callback', `${publicBaseUrl(req)}/`);
    callbackUrl.searchParams.set('attempt_id', attempt.id);

    const authorizationUrl = buildDiscourseAuthorizationUrl({
      baseUrl: DISCOURSE_AUTH_BASE_URL,
      applicationName: APPLICATION_NAME,
      clientId: CLIENT_ID,
      scopes: SCOPES,
      publicKey,
      nonce,
      authRedirect: callbackUrl.toString(),
      padding: 'oaep',
    });

    res.json({
      authorizationUrl,
      nonce,
      expiresAt,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/status', requirePlatformUser, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { data, error } = await getSupabaseAdmin()
      .from(USER_KEYS_TABLE)
      .select('owner_id, discourse_username, api_version, created_at, updated_at')
      .eq('owner_id', authReq.authUser!.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    res.json({
      connected: Boolean(data),
      username: data?.discourse_username || '',
      apiVersion: data?.api_version || '',
      createdAt: data?.created_at || '',
      updatedAt: data?.updated_at || '',
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/callback', async (req: Request, res: Response) => {
  const attemptId = text(req.query.attempt_id);
  let returnTo = '/project';

  try {
    await deleteExpiredAttempts().catch(() => undefined);

    if (!attemptId) {
      redirectWithStatus(req, res, returnTo, 'error', 'Missing authorization attempt.');
      return;
    }

    const attempt = await fetchAttempt(attemptId);
    if (!attempt) {
      redirectWithStatus(req, res, returnTo, 'error', 'Authorization expired or was already used.');
      return;
    }
    returnTo = attempt.return_to;

    if (attempt.consumed_at) {
      await deleteAttempt(attempt.id);
      redirectWithStatus(req, res, returnTo, 'error', 'Authorization was already used.');
      return;
    }

    if (new Date(attempt.expires_at).getTime() <= Date.now()) {
      await deleteAttempt(attempt.id);
      redirectWithStatus(req, res, returnTo, 'error', 'Authorization expired. Please try again.');
      return;
    }

    const payloadParam = typeof req.query.payload === 'string' ? req.query.payload : '';
    if (!payloadParam) {
      redirectWithStatus(req, res, returnTo, 'error', 'Authorization payload was missing.');
      return;
    }

    const payload = decryptPayload(payloadParam, decryptSecret(attempt.private_key_ciphertext));
    if (!payload.key || !payload.nonce || payload.nonce !== attempt.nonce) {
      await deleteAttempt(attempt.id);
      redirectWithStatus(req, res, returnTo, 'error', 'Authorization could not be verified. Please try again.');
      return;
    }

    const username = await fetchDiscourseUsername(payload.key);
    const encryptedKey = encryptSecret(payload.key);
    const now = new Date().toISOString();

    const { error: upsertError } = await getSupabaseAdmin()
      .from(USER_KEYS_TABLE)
      .upsert({
        owner_id: attempt.owner_id,
        discourse_api_key_ciphertext: encryptedKey,
        discourse_username: username,
        api_version: payload.api ? String(payload.api) : '',
        nonce: payload.nonce,
        updated_at: now,
      }, { onConflict: 'owner_id' });

    if (upsertError) throw new Error(upsertError.message);

    if (attempt.project_id) {
      const patch: Record<string, string> = {
        discourse_api_key_ciphertext: encryptedKey,
        updated_at: now,
      };
      if (username) patch.discourse_username = username;

      const { error: projectError } = await getSupabaseAdmin()
        .from(PROJECTS_TABLE)
        .update(patch)
        .eq('id', attempt.project_id)
        .eq('owner_id', attempt.owner_id);
      if (projectError) throw new Error(projectError.message);
    }

    await deleteAttempt(attempt.id);
    redirectWithStatus(req, res, returnTo, 'connected');
  } catch (err) {
    if (attemptId) await deleteAttempt(attemptId).catch(() => undefined);
    redirectWithStatus(req, res, returnTo, 'error', err instanceof Error ? err.message : 'Authorization failed.');
  }
});

export default router;
