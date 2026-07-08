import { Request, Response, NextFunction } from 'express';
import { PlatformAuthUser, verifySupabaseAccessToken } from '../src/supabase-platform';

declare global {
  namespace Express {
    interface Request {
      platformUser?: PlatformAuthUser;
    }
  }
}

export function isAdminAuthConfigured(): boolean {
  return Boolean(process.env.ADMIN_TOKEN || process.env.SUPABASE_URL);
}

function bearerToken(req: Request): string {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

export async function requireAdminToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const adminToken = process.env.ADMIN_TOKEN || '';
  const providedAdminToken = String(req.headers['x-admin-token'] || '').trim();
  if (adminToken && providedAdminToken && providedAdminToken === adminToken) {
    next();
    return;
  }

  const token = bearerToken(req);
  if (token) {
    try {
      req.platformUser = await verifySupabaseAccessToken(token);
      next();
      return;
    } catch {
      res.status(401).json({ error: 'Invalid or expired session.' });
      return;
    }
  }

  if (!adminToken && !process.env.SUPABASE_URL) {
    next();
    return;
  }

  res.status(401).json({ error: 'Login required.' });
}
