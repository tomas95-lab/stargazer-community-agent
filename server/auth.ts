import { Request, Response, NextFunction } from 'express';
import { defaultProjectId, PROJECT_ID_HEADER, runWithProjectContext } from '../src/project-context';
import {
  adminTokenMatches,
  AuthenticatedUser,
  getActiveUserProject,
  getSharedProjectConnection,
  getUserFromAccessToken,
  isPlatformConfigured,
  projectRuntimeContextForRow,
  QmProjectRow,
} from './platform-store';

export interface AuthenticatedRequest extends Request {
  authUser?: AuthenticatedUser;
  platformProject?: QmProjectRow | null;
}

function headerValue(req: Request, name: string): string {
  const value = req.header(name);
  return typeof value === 'string' ? value.trim() : '';
}

function bearerToken(req: Request): string {
  const authorization = headerValue(req, 'authorization');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function adminToken(req: Request): string {
  return headerValue(req, 'x-admin-token') || bearerToken(req);
}

function requestedProjectId(req: Request): string {
  const header = headerValue(req, PROJECT_ID_HEADER) || headerValue(req, 'x-tenant-id');
  const query = typeof req.query.project === 'string'
    ? req.query.project
    : typeof req.query.tenant === 'string'
      ? req.query.tenant
      : '';
  return (header || query).trim();
}

export function isAdminAuthConfigured(): boolean {
  return Boolean(process.env.ADMIN_TOKEN || isPlatformConfigured());
}

export async function getRequestUser(req: Request): Promise<AuthenticatedUser | null> {
  const cached = (req as AuthenticatedRequest).authUser;
  if (cached) return cached;

  const token = bearerToken(req);
  if (!token || adminTokenMatches(token) || !isPlatformConfigured()) return null;

  const user = await getUserFromAccessToken(token);
  (req as AuthenticatedRequest).authUser = user;
  return user;
}

export async function attachProjectContext(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.originalUrl.startsWith('/api/cron')) {
      runWithProjectContext({
        projectId: defaultProjectId(),
        source: 'default' as const,
      }, () => next());
      return;
    }

    const user = await getRequestUser(req);
    let project: QmProjectRow | null = null;
    const projectId = requestedProjectId(req);

    if (user) {
      project = await getActiveUserProject(user.id, projectId || undefined);
      if (projectId && !project) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }
      (req as AuthenticatedRequest).platformProject = project;
    } else if (projectId && adminTokenMatches(adminToken(req))) {
      project = await getSharedProjectConnection(projectId);
      if (!project) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }
      (req as AuthenticatedRequest).platformProject = project;
    }

    const context = project
      ? await projectRuntimeContextForRow(project)
      : {
          projectId: defaultProjectId(),
          source: 'default' as const,
        };

    runWithProjectContext(context, () => next());
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

export async function requireAdminToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = adminToken(req);
    if (adminTokenMatches(token)) {
      next();
      return;
    }

    const user = await getRequestUser(req);
    if (user) {
      const authReq = req as AuthenticatedRequest;
      if (
        isPlatformConfigured() &&
        req.originalUrl.startsWith('/api/') &&
        !req.originalUrl.startsWith('/api/platform') &&
        !authReq.platformProject
      ) {
        res.status(403).json({ error: 'Create a project before using the agent workspace.' });
        return;
      }
      next();
      return;
    }

    if (!isAdminAuthConfigured()) {
      next();
      return;
    }

    res.status(401).json({ error: 'Authentication required.' });
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

export async function requirePlatformUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    next();
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
