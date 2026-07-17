import { Router, Request, Response } from 'express';
import { AuthenticatedRequest, requirePlatformUser } from '../auth';
import {
  createUserProject,
  deleteUserProject,
  getActiveUserProject,
  getUserAiKey,
  isPlatformConfigured,
  listUserProjects,
  QmProjectInput,
  saveUserAiKey,
  toPublicProject,
  updateUserProject,
} from '../platform-store';
import {
  base64ToBuffer,
  extractTextFromPdfBuffer,
  MAX_GUIDELINE_PDF_BYTES,
} from '../../src/guideline-file-extractor';

const router = Router();

function routeParam(value: unknown): string {
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function projectInput(body: unknown): QmProjectInput {
  const raw = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  return {
    ownerName: typeof raw.ownerName === 'string' ? raw.ownerName : undefined,
    projectKey: typeof raw.projectKey === 'string' ? raw.projectKey : undefined,
    projectName: typeof raw.projectName === 'string' ? raw.projectName : undefined,
    communityBaseUrl: typeof raw.communityBaseUrl === 'string' ? raw.communityBaseUrl : undefined,
    categoryId: typeof raw.categoryId === 'string' ? raw.categoryId : undefined,
    categorySlug: typeof raw.categorySlug === 'string' ? raw.categorySlug : undefined,
    channelId: typeof raw.channelId === 'string' ? raw.channelId : undefined,
    discourseUsername: typeof raw.discourseUsername === 'string' ? raw.discourseUsername : undefined,
    discourseApiClientId: typeof raw.discourseApiClientId === 'string' ? raw.discourseApiClientId : undefined,
    discourseApiKey: typeof raw.discourseApiKey === 'string' ? raw.discourseApiKey : undefined,
    anthropicApiKey: typeof raw.anthropicApiKey === 'string' ? raw.anthropicApiKey : undefined,
    anthropicModel: typeof raw.anthropicModel === 'string' ? raw.anthropicModel : undefined,
    aiDailyTokenLimit: typeof raw.aiDailyTokenLimit === 'number' || typeof raw.aiDailyTokenLimit === 'string'
      ? Number(raw.aiDailyTokenLimit)
      : raw.aiDailyTokenLimit === null ? null : undefined,
    aiDailyCallLimit: typeof raw.aiDailyCallLimit === 'number' || typeof raw.aiDailyCallLimit === 'string'
      ? Number(raw.aiDailyCallLimit)
      : raw.aiDailyCallLimit === null ? null : undefined,
    projectGuidelines: typeof raw.projectGuidelines === 'string' ? raw.projectGuidelines : undefined,
    warRoomLink: typeof raw.warRoomLink === 'string' ? raw.warRoomLink : undefined,
    agentMode: raw.agentMode === 'auto' || raw.agentMode === 'supervised' || raw.agentMode === 'draft'
      ? raw.agentMode
      : undefined,
    autoReplyEnabled: typeof raw.autoReplyEnabled === 'boolean' ? raw.autoReplyEnabled : undefined,
    minConfidence: typeof raw.minConfidence === 'number' || typeof raw.minConfidence === 'string'
      ? Number(raw.minConfidence)
      : undefined,
  };
}

router.get('/status', (_req: Request, res: Response) => {
  res.json({
    configured: isPlatformConfigured(),
    supabaseUrlConfigured: Boolean(process.env.SUPABASE_URL),
    secretConfigured: Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
    encryptionConfigured: Boolean(process.env.PLATFORM_ENCRYPTION_KEY || process.env.SUPABASE_JWT_SECRET),
  });
});

router.get('/me', requirePlatformUser, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  res.json({ user: authReq.authUser });
});

router.get('/projects', requirePlatformUser, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const projects = await listUserProjects(authReq.authUser!.id);
    const aiKey = await getUserAiKey(authReq.authUser!.id);
    res.json({ projects: projects.map((project) => toPublicProject(project, aiKey)) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/projects/current', requirePlatformUser, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const requestedId = typeof req.query.project === 'string' ? req.query.project : undefined;
    const project = await getActiveUserProject(authReq.authUser!.id, requestedId);
    const aiKey = await getUserAiKey(authReq.authUser!.id);
    res.json({ project: project ? toPublicProject(project, aiKey) : null });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post('/guidelines/extract', requirePlatformUser, async (req: Request, res: Response) => {
  try {
    const raw = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const fileName = typeof raw.fileName === 'string' ? raw.fileName : '';
    const mimeType = typeof raw.mimeType === 'string' ? raw.mimeType : '';
    const base64 = typeof raw.base64 === 'string' ? raw.base64 : '';

    if (!base64) {
      res.status(400).json({ error: 'Upload a PDF file first.' });
      return;
    }
    if (fileName && !fileName.toLowerCase().endsWith('.pdf')) {
      res.status(400).json({ error: 'Only PDF files are supported by this extractor.' });
      return;
    }
    if (mimeType && mimeType !== 'application/pdf' && !fileName.toLowerCase().endsWith('.pdf')) {
      res.status(400).json({ error: 'Only PDF files are supported by this extractor.' });
      return;
    }
    if (base64.length > Math.ceil(MAX_GUIDELINE_PDF_BYTES * 1.4)) {
      res.status(413).json({ error: 'The PDF is too large. Upload a PDF up to 12 MB.' });
      return;
    }

    const result = await extractTextFromPdfBuffer(base64ToBuffer(base64));
    res.json({
      ...result,
      fileName,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post('/projects', requirePlatformUser, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const input = projectInput(req.body);
    const project = await createUserProject(authReq.authUser!, input);
    const aiKey = await saveUserAiKey(authReq.authUser!.id, input);
    res.status(201).json({ project: toPublicProject(project, aiKey) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.put('/projects/:id', requirePlatformUser, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const input = projectInput(req.body);
    const project = await updateUserProject(authReq.authUser!, routeParam(req.params.id), input);
    const aiKey = await saveUserAiKey(authReq.authUser!.id, input);
    res.json({ project: toPublicProject(project, aiKey) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.delete('/projects/:id', requirePlatformUser, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const result = await deleteUserProject(authReq.authUser!.id, routeParam(req.params.id));
    res.json({
      ok: true,
      deletedProject: toPublicProject(result.project),
      projectKey: result.projectKey,
      removedProjectData: result.removedProjectData,
      remainingProjectConnections: result.remainingProjectConnections,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
