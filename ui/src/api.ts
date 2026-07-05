const BASE = '/api';
const ADMIN_TOKEN_KEY = 'stargazer_admin_token';

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

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getStoredAdminToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['X-Admin-Token'] = token;

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

export interface CommunityAgentItem {
  id: string;
  source: CommunityAgentSource;
  username: string;
  message: string;
  createdAt: string;
  chatMessageId?: number;
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
    argentinaDate: string;
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

export const api = {
  getTopics: () => request<Topic[]>('/topics'),
  getToday: () => request<{ date: string; topic: Topic | null }>('/topics/today'),
  createTopic: (t: Topic) => request<Topic>('/topics', { method: 'POST', body: JSON.stringify(t) }),
  updateTopic: (date: string, t: Partial<Topic>) => request<Topic>(`/topics/${date}`, { method: 'PUT', body: JSON.stringify(t) }),
  deleteTopic: (date: string) => request<{ ok: boolean }>(`/topics/${date}`, { method: 'DELETE' }),
  getPreview: (date: string) => request<PreviewData>(`/preview/${date}`),
  getHistory: () => request<HistoryFile[]>('/history'),
  getHistoryFile: (name: string) => request<{ name: string; content: string }>(`/history/${name}`),
  getConfig: () => request<Record<string, string>>('/config'),
  updateConfig: (cfg: Record<string, string>) => request<Record<string, string>>('/config', { method: 'PUT', body: JSON.stringify(cfg) }),
  getCommsTemplates: (category?: string) =>
    request<CommsTemplate[]>(`/comms/templates${category ? `?category=${category}` : ''}`),
  getCommsTemplate: (id: string) => request<CommsTemplate>(`/comms/templates/${id}`),
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
};
