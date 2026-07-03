import { Request, Response, NextFunction } from 'express';

export function isAdminAuthConfigured(): boolean {
  return false;
}

export function requireAdminToken(_req: Request, _res: Response, next: NextFunction): void {
  next();
}
