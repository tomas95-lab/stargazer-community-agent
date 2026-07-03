import { timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';

function configuredAdminToken(): string | undefined {
  return process.env.ADMIN_TOKEN || process.env.COMMUNITY_ADMIN_TOKEN;
}

function tokenFromRequest(req: Request): string {
  const headerToken = req.header('x-admin-token');
  if (headerToken) return headerToken;

  const auth = req.header('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isAdminAuthConfigured(): boolean {
  return Boolean(configuredAdminToken());
}

export function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  const expected = configuredAdminToken();
  if (!expected) {
    res.status(503).json({ error: 'ADMIN_TOKEN is not configured on the server' });
    return;
  }

  const provided = tokenFromRequest(req);
  if (!provided || !constantTimeEquals(provided, expected)) {
    res.status(401).json({ error: 'Admin token required' });
    return;
  }

  next();
}
