import { getSupabaseAccessToken } from "@/lib/supabase";

const BASE = '/api';
const ADMIN_TOKEN_KEY = 'stargazer_admin_token';
const PROJECT_ID_KEY = 'qm_active_project_id';

function getStoredAdminToken(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(ADMIN_TOKEN_KEY) || '';
}

function setStoredAdminToken(token: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = token.trim();
  if (trimmed) {
    window.localStorage.setItem(ADMIN_TOKEN_KEY, trimmed);
  } else {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
  }
}

function getStoredProjectId(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(PROJECT_ID_KEY) || '';
}

function setStoredProjectId(projectId: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = projectId.trim();
  if (trimmed) {
    window.localStorage.setItem(PROJECT_ID_KEY, trimmed);
  } else {
    window.localStorage.removeItem(PROJECT_ID_KEY);
  }
}

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getStoredAdminToken();
  const accessToken = await getSupabaseAccessToken();
  const projectId = getStoredProjectId();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['X-Admin-Token'] = token;
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (projectId) headers['X-Project-Id'] = projectId;

  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      ...headers,
      ...(opts?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

export const adminAuth = {
  getToken: getStoredAdminToken,
  setToken: setStoredAdminToken,
  clearToken: () => setStoredAdminToken(''),
  hasToken: () => Boolean(getStoredAdminToken()),
};

export const projectSelection = {
  getProjectId: getStoredProjectId,
  setProjectId: setStoredProjectId,
  clearProjectId: () => setStoredProjectId(''),
};

export interface Topic {
  date: string;
  title: string;
  topic: string;
  reminderTitle: string;
  reminderBody: string;
  goodExample: string;
  badExample: string;
  quickRule: string;
  tags?: string[];
  webinar?: {
    enabled: boolean;
    mandatory: boolean;
    timeLabel: string;
    link: string;
    invitees?: string[];
  };
}

export interface PreviewData {
  title: string;
  thread: string;
  announcement: string;
}

export interface TopicImportError {
  index: number;
  path: string;
  message: string;
}

export interface TopicImportValidation {
  ok: boolean;
  topics: Topic[];
  errors: TopicImportError[];
}

export interface TopicImportSchema {
  shape: string;
  requiredFields: string[];
  optionalFields: string[];
  example: Topic[];
}

export interface TopicImportResult {
  ok: boolean;
  mode: 'append' | 'replace';
  imported: number;
  created: number;
  updated: number;
  total: number;
  topics: Topic[];
}

export interface HistoryFile {
  name: string;
  size: number;
  modified: string;
}

export interface Webinar {
  id: string;
  type: 'webinar' | 'onboarding';
  title: string;
  date: string;
  timeUtc: string;
  timeLabel: string;
  link: string;
  invitees: string[];
}

export interface TemplateVariable {
  key: string;
  label: string;
  required: boolean;
  defaultValue?: string;
  placeholder?: string;
}

export interface CommsTemplate {
  id: string;
  category: string;
  name: string;
  description: string;
  defaultTone: string;
  supportedTones: string[];
  audience: string[];
  variables: TemplateVariable[];
  body: string;
}

export interface CommunityMessage {
  id: number;
  message: string;
  user: { username: string };
  created_at: string;
}

export interface CommunityAgentSuggestion {
  chatMessageId: number;
  username: string;
  question: string;
  reply: string;
  posted: boolean;
}

export type CommunityAgentSource = 'community';
export type CommunityAgentAction = 'reply' | 'human' | 'ignore';

export interface CommunityAgentReplyEvidence {
  id: string;
  username: string;
  message: string;
  createdAt: string;
  chatMessageId?: number;
  match: 'direct_reply' | 'mention' | 'staff_followup' | 'nearby_followup';
}

export interface CommunityAgentItem {
  id: string;
  source: CommunityAgentSource;
  username: string;
  message: string;
  createdAt: string;
  chatMessageId?: number;
  threadId?: number | null;
  replyToChatMessageId?: number;
  isStaff?: boolean;
  probableReplies?: CommunityAgentReplyEvidence[];
  ignoredReason?: string;
}

export interface CommunityAgentDecision {
  itemId: string;
  source: CommunityAgentSource;
  username: string;
  message: string;
  action: CommunityAgentAction;
  confidence: number;
  reason: string;
  reply: string;
  posted: boolean;
  needsHuman: boolean;
  guidelineSnippets: string[];
  error?: string;
}

export interface CommunityAgentResult {
  mode: 'suggestion' | 'post';
  checked: number;
  candidates: number;
  handled: number;
  posted: number;
  needsHuman: number;
  ignored: number;
  withinSchedule: boolean;
  window: {
    utcDate: string;
    argentinaDate?: string;
    startUtc: string;
    endUtc: string;
    operatingHours: string;
  };
  items: CommunityAgentItem[];
  decisions: CommunityAgentDecision[];
  errors: string[];
  suggestions?: CommunityAgentSuggestion[];
}

export interface CommunityAgentOverview {
  items: CommunityAgentItem[];
  candidates: CommunityAgentItem[];
  errors: string[];
  window: CommunityAgentResult['window'];
  guidelines: {
    available: boolean;
    characters: number;
  };
}

export interface DmReviewPeer {
  id?: number;
  username: string;
  name?: string;
}

export interface DmReviewMessage {
  channelId: number;
  channelTitle?: string | null;
  messageId: number;
  username: string;
  name?: string;
  createdAt: string;
  text: string;
  peers: DmReviewPeer[];
  incoming: boolean;
}

export interface DmReviewThreadSummary {
  channelId: number;
  channelTitle?: string | null;
  peers: DmReviewPeer[];
  totalMessages: number;
  incomingMessages: number;
  outgoingMessages: number;
  pendingIncomingMessages: number;
  needsReply: boolean;
  lastIncomingMessageId?: number;
  lastMessageAt?: string;
}

export interface DmReviewResult {
  mode: 'dm-review';
  scanMode: 'quick' | 'full';
  generatedAt: string;
  window: {
    utcDate: string;
    argentinaDate?: string;
    startUtc: string;
    endUtc: string;
  };
  totalDirectChannels: number;
  scannedChannels: number;
  skippedInactiveChannels: number;
  incomingMessages: number;
  pendingIncomingMessages: number;
  unresolvedChannels: number;
  channelsWithTodayMessages: number;
  threads: DmReviewThreadSummary[];
  messages: DmReviewMessage[];
  errors: string[];
  autoReply?: {
    enabled: boolean;
    checked: number;
    replied: number;
    needsHuman: number;
    ignored: number;
    skippedProcessed: number;
  };
}

export interface DmDraftResult {
  channelId: number;
  action: 'reply' | 'human' | 'ignore';
  confidence: number;
  reason: string;
  reply: string;
  needsHuman: boolean;
  guidelineSnippets: string[];
  lastIncomingMessageId?: number;
  pendingIncomingMessages: number;
  messages: DmReviewMessage[];
}

export interface OperationLogEntry {
  id: string;
  at: string;
  action: string;
  status: 'success' | 'error' | 'skipped';
  message: string;
  metadata?: Record<string, unknown>;
}

export interface OperationDetailResult {
  entry: OperationLogEntry;
  detail?: unknown;
  hasDetail: boolean;
}

export interface AutomationProviderJob {
  provider: 'cron-job.org';
  jobId: number;
  title: string;
  enabled: boolean;
  url: string;
  timezone?: string;
  nextExecution?: string;
  lastExecution?: string;
  lastStatus: number;
  lastStatusLabel: string;
}

export interface AutomationHealthJob {
  id: string;
  title: string;
  job: string;
  endpoint: string;
  utc: string;
  arg: string;
  purpose: string;
  action: string;
  cronJobOrgTitle: string;
  provider?: AutomationProviderJob;
  lastCronRequest?: OperationLogEntry;
  lastAppResult?: OperationLogEntry;
  health: 'ok' | 'warning' | 'error' | 'pending';
  healthReason: string;
}

export interface AutomationHealthResult {
  generatedAt: string;
  providerConfigured: boolean;
  providerError?: string;
  jobs: AutomationHealthJob[];
}

export type ComposerChannel = 'community' | 'dm' | 'daily_thread' | 'reminder' | 'announcement';
export type ComposerTone = 'friendly' | 'professional' | 'direct' | 'warm_supportive' | 'urgent' | 'short_clear';
export type ComposerObjective = 'inform' | 'remind' | 'ask_for_action' | 'de_escalate' | 'explain_guideline';

export interface ComposerVariant {
  title?: string;
  message: string;
  notes?: string;
  warnings: string[];
}

export interface ComposerResult {
  mode: 'composer';
  generatedAt: string;
  channel: ComposerChannel;
  tone: ComposerTone;
  objective: ComposerObjective;
  audience: string;
  variants: ComposerVariant[];
  guidelineSnippets: string[];
}

export interface ComposerTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
  audience: string;
  channel: ComposerChannel;
  tone: ComposerTone;
  objective: ComposerObjective;
  extraContext: string;
  includeWarRoomLink: boolean;
}

export interface ReviewQueueItem {
  id: string;
  runId: string;
  runAt: string;
  source: 'community' | 'dm';
  priority: 'high' | 'medium' | 'low';
  username: string;
  message: string;
  reason: string;
  action: 'human' | 'error' | 'pending';
  confidence?: number;
  channelId?: number;
  messageId?: number;
  createdAt?: string;
}

export interface ReviewQueueResult {
  generatedAt: string;
  items: ReviewQueueItem[];
  totals: {
    all: number;
    high: number;
    medium: number;
    low: number;
    community: number;
    dm: number;
  };
}

export interface SandboxResult {
  mode: 'sandbox';
  generatedAt: string;
  deterministic: boolean;
  input: {
    username: string;
    channel: string;
    message: string;
    nowIso: string;
    context: string;
  };
  decision: {
    action: CommunityAgentAction;
    confidence: number;
    reason: string;
    reply: string;
    guidelineSnippets: string[];
  };
}

export interface ProjectMemoryFact {
  id: string;
  title: string;
  body: string;
  source?: string;
}

export interface ProjectMemory {
  updatedAt: string;
  facts: ProjectMemoryFact[];
}

export interface AiUsageEvent {
  id: string;
  at: string;
  utcDate: string;
  argentinaDate?: string;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  status: 'success' | 'error' | 'blocked';
}

export interface AiUsageSummary {
  generatedAt: string;
  utcDate: string;
  argentinaDate?: string;
  today: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  limits: {
    dailyTokenLimit: number | null;
    dailyCallLimit: number | null;
    enforce: boolean;
  };
  remaining: {
    tokens: number | null;
    calls: number | null;
  };
  warnings: string[];
  recentEvents: AiUsageEvent[];
}

export type ProjectAgentMode = 'draft' | 'supervised' | 'auto';

export interface QmProject {
  id: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  projectKey: string;
  projectName: string;
  communityBaseUrl: string;
  categoryId: string;
  categorySlug: string;
  channelId: string;
  discourseUsername: string;
  discourseApiClientId: string;
  discourseApiKeyConfigured: boolean;
  anthropicApiKeyConfigured: boolean;
  anthropicModel: string;
  aiDailyTokenLimit: number | null;
  aiDailyCallLimit: number | null;
  projectGuidelines: string;
  projectGuidelinesCharacters: number;
  warRoomLink: string;
  agentMode: ProjectAgentMode;
  autoReplyEnabled: boolean;
  minConfidence: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QmProjectInput {
  ownerName?: string;
  projectKey?: string;
  projectName?: string;
  communityBaseUrl?: string;
  categoryId?: string;
  categorySlug?: string;
  channelId?: string;
  discourseUsername?: string;
  discourseApiClientId?: string;
  discourseApiKey?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
  aiDailyTokenLimit?: number | null;
  aiDailyCallLimit?: number | null;
  projectGuidelines?: string;
  warRoomLink?: string;
  agentMode?: ProjectAgentMode;
  autoReplyEnabled?: boolean;
  minConfidence?: number;
}

export interface PlatformStatus {
  configured: boolean;
  supabaseUrlConfigured: boolean;
  secretConfigured: boolean;
  encryptionConfigured: boolean;
}

export interface GuidelinesExtractionResult {
  text: string;
  pages: number;
  characters: number;
  fileName: string;
}

export interface DiscourseAuthStatus {
  connected: boolean;
  username: string;
  apiVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiscourseAuthStartResult {
  authorizationUrl: string;
  attemptId: string;
  nonce: string;
  expiresAt: string;
}

export interface DiscourseAuthCompleteResult {
  connected: boolean;
  username: string;
  apiVersion: string;
  expiresAt: string;
}

export const api = {
  getTopics: () => request<Topic[]>('/topics'),
  getToday: () => request<{ date: string; topic: Topic | null }>('/topics/today'),
  createTopic: (t: Topic) => request<Topic>('/topics', { method: 'POST', body: JSON.stringify(t) }),
  updateTopic: (date: string, t: Partial<Topic>) => request<Topic>(`/topics/${date}`, { method: 'PUT', body: JSON.stringify(t) }),
  deleteTopic: (date: string) => request<{ ok: boolean }>(`/topics/${date}`, { method: 'DELETE' }),
  getTopicsImportSchema: () => request<TopicImportSchema>('/topics/import-schema'),
  validateTopicsImport: (payload: unknown) =>
    request<TopicImportValidation>('/topics/import/validate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  importTopics: (payload: unknown, mode: 'append' | 'replace') =>
    request<TopicImportResult>('/topics/import', {
      method: 'POST',
      body: JSON.stringify({ payload, mode }),
    }),
  getPreview: (date: string) => request<PreviewData>(`/preview/${date}`),
  getHistory: () => request<HistoryFile[]>('/history'),
  getHistoryFile: (name: string) => request<{ name: string; content: string }>(`/history/${name}`),
  getConfig: () => request<Record<string, string>>('/config'),
  updateConfig: (cfg: Record<string, string>) => request<Record<string, string>>('/config', { method: 'PUT', body: JSON.stringify(cfg) }),
  getCommsTemplates: (category?: string) =>
    request<CommsTemplate[]>(`/comms/templates${category ? `?category=${category}` : ''}`),
  getCommsTemplate: (id: string) => request<CommsTemplate>(`/comms/templates/${id}`),
  createCommsTemplate: (template: CommsTemplate) =>
    request<CommsTemplate>('/comms/templates', {
      method: 'POST',
      body: JSON.stringify(template),
    }),
  updateCommsTemplate: (id: string, template: CommsTemplate) =>
    request<CommsTemplate>(`/comms/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(template),
    }),
  deleteCommsTemplate: (id: string) =>
    request<{ ok: boolean }>(`/comms/templates/${id}`, { method: 'DELETE' }),
  renderComms: (id: string, variables: Record<string, string>) =>
    request<{ output: string } | { errors: string[] }>('/comms/render', {
      method: 'POST',
      body: JSON.stringify({ id, variables }),
    }),
  getLinks: () => request<Record<string, string>>('/comms/links'),
  updateLinks: (links: Record<string, string>) =>
    request<Record<string, string>>('/comms/links', { method: 'PUT', body: JSON.stringify(links) }),
  sendToChat: (message: string, channelId?: string) =>
    request<{ ok: boolean; message_id: number }>('/comms/send', {
      method: 'POST',
      body: JSON.stringify({ message, channelId }),
    }),
  getWebinars: () => request<Webinar[]>('/webinars'),
  createWebinar: (w: Omit<Webinar, 'id'>) => request<Webinar>('/webinars', { method: 'POST', body: JSON.stringify(w) }),
  updateWebinar: (id: string, w: Partial<Webinar>) => request<Webinar>(`/webinars/${id}`, { method: 'PUT', body: JSON.stringify(w) }),
  deleteWebinar: (id: string) => request<{ ok: boolean }>(`/webinars/${id}`, { method: 'DELETE' }),
  syncToGitHub: () => request<{ ok: boolean; message: string }>('/sync', { method: 'POST' }),
  getCommunityMessages: (count = 20) =>
    request<{ messages: CommunityMessage[] }>(`/community-agent/messages?count=${count}`),
  getCommunityAgentOverview: (opts: { messageCount?: number; includeCommunity?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (opts.messageCount) params.set('messageCount', String(opts.messageCount));
    if (opts.includeCommunity === false) params.set('includeCommunity', 'false');
    const query = params.toString();
    return request<CommunityAgentOverview>(`/community-agent/overview${query ? `?${query}` : ''}`);
  },
  runCommunityAgent: (opts: {
    post?: boolean;
    maxAnswers?: number;
    messageCount?: number;
    includeCommunity?: boolean;
    skipProcessed?: boolean;
    markProcessed?: boolean;
  }) =>
    request<CommunityAgentResult>('/community-agent/run', {
      method: 'POST',
      body: JSON.stringify(opts),
    }),
  getDmReview: (opts: { messageCount?: number; maxChannels?: number; fullScan?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (opts.messageCount) params.set('messageCount', String(opts.messageCount));
    if (opts.maxChannels) params.set('maxChannels', String(opts.maxChannels));
    if (opts.fullScan === false) params.set('fullScan', 'false');
    const query = params.toString();
    return request<DmReviewResult>(`/dm-review${query ? `?${query}` : ''}`);
  },
  runDmReview: (opts: { messageCount?: number; maxChannels?: number; requestDelayMs?: number; autoReply?: boolean; maxAutoReplies?: number } = {}) =>
    request<DmReviewResult>('/dm-review/run', {
      method: 'POST',
      body: JSON.stringify(opts),
    }),
  sendDmReply: (channelId: number, message: string) =>
    request<{ ok: boolean; channelId: number; messageId?: number }>('/dm-review/reply', {
      method: 'POST',
      body: JSON.stringify({ channelId, message }),
    }),
  draftDmReply: (channelId: number, opts: { messageCount?: number } = {}) =>
    request<DmDraftResult>('/dm-review/draft', {
      method: 'POST',
      body: JSON.stringify({ channelId, messageCount: opts.messageCount }),
    }),
  getComposerTemplates: () => request<{ templates: ComposerTemplate[] }>('/composer/templates'),
  generateComposedMessage: (opts: {
    prompt: string;
    audience?: string;
    channel?: ComposerChannel;
    tone?: ComposerTone;
    objective?: ComposerObjective;
    extraContext?: string;
    variantCount?: number;
    includeWarRoomLink?: boolean;
  }) =>
    request<ComposerResult>('/composer/generate', {
      method: 'POST',
      body: JSON.stringify(opts),
    }),
  getAutomationHealth: () => request<AutomationHealthResult>('/automation/health'),
  getOperations: (limit = 50) => request<{ entries: OperationLogEntry[] }>(`/operations?limit=${limit}`),
  getOperationDetail: (id: string) => request<OperationDetailResult>(`/operations/${id}`),
  getReviewQueue: (limit = 150) => request<ReviewQueueResult>(`/review-queue?limit=${limit}`),
  evaluateSandboxMessage: (opts: {
    username?: string;
    channel?: string;
    message: string;
    nowIso?: string;
    context?: string;
  }) =>
    request<SandboxResult>('/sandbox/evaluate', {
      method: 'POST',
      body: JSON.stringify(opts),
    }),
  getProjectMemory: () => request<ProjectMemory>('/memory'),
  updateProjectMemory: (memory: ProjectMemory) =>
    request<ProjectMemory>('/memory', {
      method: 'PUT',
      body: JSON.stringify(memory),
    }),
  getAiUsage: () => request<AiUsageSummary>('/usage'),
  getPlatformStatus: () => request<PlatformStatus>('/platform/status'),
  getPlatformMe: () => request<{ user: { id: string; email: string; name: string } }>('/platform/me'),
  getProjects: () => request<{ projects: QmProject[] }>('/platform/projects'),
  getCurrentProject: () => request<{ project: QmProject | null }>('/platform/projects/current'),
  extractGuidelinesFromPdf: (opts: { fileName: string; mimeType: string; base64: string }) =>
    request<GuidelinesExtractionResult>('/platform/guidelines/extract', {
      method: 'POST',
      body: JSON.stringify(opts),
    }),
  createProject: (project: QmProjectInput) =>
    request<{ project: QmProject }>('/platform/projects', {
      method: 'POST',
      body: JSON.stringify(project),
    }),
  updateProject: (id: string, project: QmProjectInput) =>
    request<{ project: QmProject }>(`/platform/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(project),
    }),
  startDiscourseAuth: (opts: { projectId?: string; returnTo?: string } = {}) =>
    request<DiscourseAuthStartResult>('/discourse-auth/start', {
      method: 'POST',
      body: JSON.stringify(opts),
    }),
  completeDiscourseAuth: (opts: { nonce: string; payload: string }) =>
    request<DiscourseAuthCompleteResult>('/discourse-auth/complete', {
      method: 'POST',
      body: JSON.stringify(opts),
    }),
  getDiscourseAuthStatus: () => request<DiscourseAuthStatus>('/discourse-auth/status'),
};
