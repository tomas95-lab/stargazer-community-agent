import { NextFunction, Router, Request, Response } from 'express';
import { AuthenticatedRequest, requirePlatformUser } from '../auth';
import {
  createUserProject,
  deleteUserProject,
  getActiveUserProject,
  getSharedProjectSummary,
  getGuidelineVersion,
  getUserAiKey,
  getUserProject,
  getSupabaseAdmin,
  isPlatformConfigured,
  listUserProjects,
  listProjectMembers,
  listGuidelineVersions,
  QmProjectInput,
  projectBotConfigForRow,
  saveUserAiKey,
  restoreUserProject,
  restoreGuidelineVersion,
  setProjectAutomationPaused,
  setProjectLifecycleStatus,
  toPublicProject,
  updateUserProject,
  updateProjectMemberRole,
} from '../platform-store';
import {
  base64ToBuffer,
  extractTextFromPdfBuffer,
  MAX_GUIDELINE_PDF_BYTES,
} from '../../src/guideline-file-extractor';

const router = Router();

router.use((req: Request, res: Response, next: NextFunction) => {
  const user = (req as AuthenticatedRequest).authUser;
  if (user?.isDemo && !['GET', 'HEAD'].includes(req.method.toUpperCase())) {
    res.status(403).json({ error: 'Demo accounts cannot change platform or project configuration.' });
    return;
  }
  next();
});

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
    guidelinesSourceName: typeof raw.guidelinesSourceName === 'string' ? raw.guidelinesSourceName : undefined,
    guidelinesChangeSummary: typeof raw.guidelinesChangeSummary === 'string' ? raw.guidelinesChangeSummary : undefined,
    warRoomLink: typeof raw.warRoomLink === 'string' ? raw.warRoomLink : undefined,
    agentMode: raw.agentMode === 'auto' || raw.agentMode === 'supervised' || raw.agentMode === 'draft'
      ? raw.agentMode
      : undefined,
    autoReplyEnabled: typeof raw.autoReplyEnabled === 'boolean' ? raw.autoReplyEnabled : undefined,
    minConfidence: typeof raw.minConfidence === 'number' || typeof raw.minConfidence === 'string'
      ? Number(raw.minConfidence)
      : undefined,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : undefined,
    status: raw.status === 'setup' || raw.status === 'active' || raw.status === 'paused' || raw.status === 'completed' || raw.status === 'archived'
      ? raw.status
      : undefined,
    settings: raw.settings && typeof raw.settings === 'object' ? raw.settings as Record<string, unknown> : undefined,
  };
}

router.get('/status', async (_req: Request, res: Response) => {
  let schemaReady = false;
  let schemaMessage = '';
  if (isPlatformConfigured()) {
    try {
      const [projects, locks, events, dataFiles, guidelineVersions, pushSubscriptions] = await Promise.all([
        getSupabaseAdmin().from('qm_projects').select('role,status,settings').limit(1),
        getSupabaseAdmin().from('automation_run_locks').select('job', { head: true, count: 'exact' }),
        getSupabaseAdmin().from('automation_events').select('id', { head: true, count: 'exact' }),
        getSupabaseAdmin().from('project_data_files').select('file_path').limit(1),
        getSupabaseAdmin().from('project_guideline_versions').select('id').limit(1),
        getSupabaseAdmin().from('push_subscriptions').select('id').limit(1),
      ]);
      const error = projects.error || locks.error || events.error || dataFiles.error || guidelineVersions.error || pushSubscriptions.error;
      schemaReady = !error;
      schemaMessage = error?.message || '';
    } catch (err) {
      schemaMessage = err instanceof Error ? err.message : String(err);
    }
  }
  res.json({
    configured: isPlatformConfigured(),
    supabaseUrlConfigured: Boolean(process.env.SUPABASE_URL),
    secretConfigured: Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
    encryptionConfigured: Boolean(process.env.PLATFORM_ENCRYPTION_KEY || process.env.SUPABASE_JWT_SECRET),
    schemaReady,
    schemaMessage,
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

router.get('/projects/shared/:projectKey', requirePlatformUser, async (req: Request, res: Response) => {
  try {
    if ((req as AuthenticatedRequest).authUser?.isDemo) {
      res.json({ project: null });
      return;
    }
    const project = await getSharedProjectSummary(routeParam(req.params.projectKey));
    res.json({ project });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/projects/:id/health', requirePlatformUser, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const project = await getUserProject(authReq.authUser!.id, routeParam(req.params.id));
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    const aiKey = await getUserAiKey(authReq.authUser!.id);
    const config = await projectBotConfigForRow(project);
    if (project.settings?.demoMode === true) {
      const checks = [
        { id: 'demo', label: 'Demo isolation', ok: true, detail: 'Synthetic Community data, external writes blocked' },
        { id: 'category', label: 'Simulated category', ok: true, detail: config.communityCategoryId },
        { id: 'channel', label: 'Simulated channel', ok: true, detail: config.communityChatChannelId },
        { id: 'username', label: 'Demo identity', ok: true, detail: project.discourse_username },
        { id: 'guidelines', label: 'Project guidelines', ok: project.project_guidelines.trim().length >= 100, detail: `${project.project_guidelines.length} characters` },
        { id: 'claude', label: 'Claude API key', ok: Boolean(aiKey?.anthropic_api_key_ciphertext), detail: aiKey?.anthropic_api_key_ciphertext ? `${aiKey.anthropic_model}, daily limits enforced` : 'Not configured' },
        { id: 'automation', label: 'External automation', ok: true, detail: 'Disabled for Demo Mode' },
      ];
      res.json({ projectId: project.id, generatedAt: new Date().toISOString(), healthy: checks.every((check) => check.ok), checks });
      return;
    }
    let discourseReachable = false;
    let discourseIdentity = '';
    let discourseError = '';
    let channelReachable = false;
    let channelError = '';
    try {
      const response = await fetch(`${config.communityBaseUrl}/session/current.json`, {
        headers: { 'User-Api-Key': config.discourseApiKey, 'User-Api-Client-Id': config.discourseApiClientId },
        signal: AbortSignal.timeout(6_000),
      });
      discourseReachable = response.ok;
      if (response.ok) {
        const body = await response.json() as { current_user?: { username?: string } };
        discourseIdentity = body.current_user?.username || '';
      } else if (response.status === 403) {
        discourseError = 'The saved Discourse key is invalid or no longer authorized. Reconnect Discourse.';
      } else discourseError = `Discourse returned ${response.status}.`;
    } catch (err) {
      discourseError = err instanceof Error ? err.message : String(err);
    }

    if (discourseReachable && config.communityChatChannelId) {
      try {
        const response = await fetch(
          `${config.communityBaseUrl}/chat/api/channels/${encodeURIComponent(config.communityChatChannelId)}/messages.json?page_size=1`,
          {
            headers: { 'User-Api-Key': config.discourseApiKey, 'User-Api-Client-Id': config.discourseApiClientId },
            signal: AbortSignal.timeout(6_000),
          },
        );
        channelReachable = response.ok;
        if (!response.ok) channelError = response.status === 403
          ? 'Your Discourse user cannot access this channel.'
          : `Channel returned ${response.status}.`;
      } catch (err) {
        channelError = err instanceof Error ? err.message : String(err);
      }
    } else if (!config.communityChatChannelId) channelError = 'Missing channel ID';
    else channelError = 'Reconnect Discourse before checking the channel.';

    const categoryIdValid = /^\d+$/.test(config.communityCategoryId);
    const identityMatches = Boolean(discourseIdentity)
      && discourseIdentity.toLowerCase() === project.discourse_username.toLowerCase();

    const checks = [
      { id: 'discourse', label: 'Discourse connection', ok: discourseReachable, detail: discourseIdentity || discourseError || 'Not connected' },
      { id: 'category', label: 'Community category', ok: categoryIdValid, detail: categoryIdValid ? config.communityCategoryId : 'Category ID must be numeric.' },
      { id: 'channel', label: 'Community channel', ok: channelReachable, detail: channelReachable ? config.communityChatChannelId : channelError },
      { id: 'username', label: 'Discourse identity', ok: identityMatches, detail: identityMatches ? discourseIdentity : discourseIdentity ? `Connected as ${discourseIdentity}; expected ${project.discourse_username}.` : project.discourse_username || 'Missing username' },
      { id: 'guidelines', label: 'Project guidelines', ok: project.project_guidelines.trim().length >= 100, detail: `${project.project_guidelines.length} characters` },
      { id: 'claude', label: 'Claude API key', ok: Boolean(aiKey?.anthropic_api_key_ciphertext), detail: aiKey?.anthropic_api_key_ciphertext ? aiKey.anthropic_model : 'Not configured' },
      { id: 'automation', label: 'Project automation', ok: project.enabled && project.status !== 'archived', detail: project.status || (project.enabled ? 'active' : 'paused') },
    ];
    res.json({ projectId: project.id, generatedAt: new Date().toISOString(), healthy: checks.every((check) => check.ok), checks });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/projects/:id/export', requirePlatformUser, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const project = await getUserProject(authReq.authUser!.id, routeParam(req.params.id));
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }
    res.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      project: {
        projectKey: project.project_key,
        projectName: project.project_name,
        communityBaseUrl: project.community_base_url,
        categoryId: project.community_category_id,
        categorySlug: project.community_category_slug,
        channelId: project.community_chat_channel_id,
        discourseApiClientId: project.discourse_api_client_id,
        projectGuidelines: project.project_guidelines,
        warRoomLink: project.war_room_link,
        agentMode: project.agent_mode,
        autoReplyEnabled: project.auto_reply_enabled,
        minConfidence: project.min_confidence,
        settings: project.settings || {},
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/projects/:id/guidelines/versions', requirePlatformUser, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const versions = await listGuidelineVersions(authReq.authUser!.id, routeParam(req.params.id), Number(req.query.limit || 30));
    res.json({ versions });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const migrationRequired = /pending Supabase database migration/i.test(message);
    res.status(migrationRequired ? 503 : 400).json({
      error: message,
      ...(migrationRequired ? { code: 'database_migration_required' } : {}),
    });
  }
});

router.get('/projects/:id/guidelines/versions/:versionId', requirePlatformUser, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const version = await getGuidelineVersion(authReq.authUser!.id, routeParam(req.params.id), routeParam(req.params.versionId));
    res.json({ version });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const migrationRequired = /pending Supabase database migration/i.test(message);
    res.status(migrationRequired ? 503 : 400).json({
      error: message,
      ...(migrationRequired ? { code: 'database_migration_required' } : {}),
    });
  }
});

router.post('/projects/:id/guidelines/versions/:versionId/restore', requirePlatformUser, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const project = await restoreGuidelineVersion(authReq.authUser!, routeParam(req.params.id), routeParam(req.params.versionId));
    const aiKey = await getUserAiKey(authReq.authUser!.id);
    res.json({ project: toPublicProject(project, aiKey) });
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

router.post('/projects/:id/pause', requirePlatformUser, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const paused = req.body?.paused !== false;
    const project = await setProjectAutomationPaused(authReq.authUser!.id, routeParam(req.params.id), paused);
    const aiKey = await getUserAiKey(authReq.authUser!.id);
    res.json({ project: toPublicProject(project, aiKey) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post('/projects/:id/status', requirePlatformUser, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const status = req.body?.status;
    if (!['setup', 'active', 'paused', 'completed', 'archived'].includes(status)) {
      res.status(400).json({ error: 'Invalid project status.' });
      return;
    }
    const project = await setProjectLifecycleStatus(authReq.authUser!.id, routeParam(req.params.id), status);
    const aiKey = await getUserAiKey(authReq.authUser!.id);
    res.json({ project: toPublicProject(project, aiKey) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post('/projects/:id/restore', requirePlatformUser, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const project = await restoreUserProject(authReq.authUser!.id, routeParam(req.params.id));
    const aiKey = await getUserAiKey(authReq.authUser!.id);
    res.json({ project: toPublicProject(project, aiKey) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/projects/:id/members', requirePlatformUser, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    res.json({ members: await listProjectMembers(authReq.authUser!.id, routeParam(req.params.id)) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.patch('/projects/:id/members/:memberId', requirePlatformUser, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const role = req.body?.role;
    if (!['owner', 'admin', 'qm', 'viewer'].includes(role)) {
      res.status(400).json({ error: 'Invalid project role.' });
      return;
    }
    await updateProjectMemberRole(authReq.authUser!.id, routeParam(req.params.id), routeParam(req.params.memberId), role);
    res.json({ ok: true });
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
