import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

const ENV_PATH = path.resolve(__dirname, '../../.env');
const SAFE_KEYS = [
  'HEADLESS',
  'SLOW_MO',
  'COMMUNITY_BASE_URL',
  'COMMUNITY_NEW_TOPIC_URL',
  'COMMUNITY_CATEGORY_ID',
  'COMMUNITY_CATEGORY_SLUG',
  'COMMUNITY_CHAT_URL',
  'BROWSER_PROFILE_PATH',
];

function parseEnv(): Record<string, string> {
  if (!fs.existsSync(ENV_PATH)) return {};
  const lines = fs.readFileSync(ENV_PATH, 'utf-8').split('\n');
  const env: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (SAFE_KEYS.includes(key)) {
      env[key] = val;
    }
  }
  return env;
}

function writeEnv(env: Record<string, string>): void {
  const lines = Object.entries(env)
    .filter(([k]) => SAFE_KEYS.includes(k))
    .map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf-8');
}

router.get('/', (_req: Request, res: Response) => {
  res.json(parseEnv());
});

router.put('/', (req: Request, res: Response) => {
  const current = parseEnv();
  const updated = { ...current, ...req.body };
  writeEnv(updated);
  res.json(updated);
});

export default router;
