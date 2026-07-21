import { NextFunction, Request, Response } from 'express';
import { requireAdminToken } from './auth';

interface RateBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateBucket>();
const WINDOW_MS = 60_000;

function clientId(req: Request): string {
  return (req.ip || req.socket.remoteAddress || 'unknown').slice(0, 120);
}

function requestLimit(req: Request): number {
  if (req.originalUrl.startsWith('/api/cron/')) return 120;
  if (req.method !== 'GET' && /\/(run|send|reply|generate|extract|publish)/.test(req.path)) return 20;
  if (req.method !== 'GET') return 90;
  return 300;
}

export function apiRateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const key = `${clientId(req)}:${req.method}:${req.path}`;
  const existing = buckets.get(key);
  const bucket = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: now + WINDOW_MS }
    : existing;
  bucket.count += 1;
  buckets.set(key, bucket);

  res.setHeader('RateLimit-Limit', String(requestLimit(req)));
  res.setHeader('RateLimit-Remaining', String(Math.max(0, requestLimit(req) - bucket.count)));
  res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

  if (bucket.count > requestLimit(req)) {
    res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
    res.status(429).json({ error: 'Too many requests. Please wait before trying again.' });
    return;
  }

  if (buckets.size > 10_000) {
    for (const [bucketKey, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(bucketKey);
    }
  }
  next();
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

export function protectWorkspaceApi(req: Request, res: Response, next: NextFunction): void {
  const path = req.originalUrl.split('?')[0];
  if (
    path.startsWith('/api/cron/')
    || path === '/api/platform/status'
    || path.startsWith('/api/platform/')
    || path === '/api/discourse-auth/callback'
    || path.startsWith('/api/discourse-auth/')
  ) {
    next();
    return;
  }
  void requireAdminToken(req, res, next);
}
