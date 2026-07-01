const BASE = '/api';

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

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
};
