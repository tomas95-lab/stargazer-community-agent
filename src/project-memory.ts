import { readDataJSON, writeDataJSON } from './data-store';
import { getProjectContext, LEGACY_PROJECT_ID } from './project-context';

const FILE = 'data/project-memory.json';

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

const DEFAULT_MEMORY: ProjectMemory = {
  updatedAt: '2026-07-07T00:00:00.000Z',
  facts: [
    {
      id: 'language',
      title: 'Support language',
      body: 'All user-facing community and DM replies must be written in English.',
      source: 'manager preference',
    },
    {
      id: 'style',
      title: 'Writing style',
      body: 'Do not use the em dash character. Use commas, parentheses, or a regular hyphen instead.',
      source: 'manager preference',
    },
    {
      id: 'war-room-hours',
      title: 'War Room hours',
      body: 'The War Room is open Monday through Friday from 11:15 AM to 7:00 PM ARG. It is closed Saturdays and Sundays.',
      source: 'project operations',
    },
    {
      id: 'war-room-breakout',
      title: 'War Room breakout room',
      body: 'Once users enter the War Room, they must join the breakout room called Stargazer - Team.',
      source: 'project operations',
    },
    {
      id: 'step-zero-cursor',
      title: 'Step 0 Cursor access',
      body: 'Contributors who passed the courses and are now EQ or see the project as ineligible should come to the War Room to request Cursor access. This is step 0 of the project guideline.',
      source: 'project guideline',
    },
  ],
};

function defaultMemoryForCurrentProject(): ProjectMemory {
  const context = getProjectContext();
  if (context.projectId === LEGACY_PROJECT_ID) return DEFAULT_MEMORY;

  return {
    updatedAt: new Date().toISOString(),
    facts: [
      {
        id: 'language',
        title: 'Support language',
        body: 'All user-facing community and DM replies must be written in English.',
        source: 'platform default',
      },
      {
        id: 'style',
        title: 'Writing style',
        body: 'Do not use the em dash character. Use commas, parentheses, or a regular hyphen instead.',
        source: 'platform default',
      },
      {
        id: 'war-room-hours',
        title: 'War Room hours',
        body: 'The War Room is open Monday through Friday from 11:15 AM to 7:00 PM ARG. It is closed Saturdays and Sundays.',
        source: 'platform default',
      },
    ],
  };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeId(value: unknown, fallback: string): string {
  const normalized = text(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized || fallback;
}

export function normalizeProjectMemory(input: unknown): ProjectMemory {
  const record = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const rawFacts = Array.isArray(record.facts) ? record.facts : [];
  const facts = rawFacts
    .map((item, index) => {
      const raw = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const title = text(raw.title);
      const body = text(raw.body);
      if (!title || !body) return null;
      const fact: ProjectMemoryFact = {
        id: safeId(raw.id, `fact-${index + 1}`),
        title: title.slice(0, 120),
        body: body.slice(0, 1200),
      };
      const source = text(raw.source);
      if (source) fact.source = source.slice(0, 120);
      return fact;
    })
    .filter((item): item is ProjectMemoryFact => Boolean(item))
    .slice(0, 50);

  return {
    updatedAt: text(record.updatedAt) || new Date().toISOString(),
    facts: facts.length > 0 ? facts : defaultMemoryForCurrentProject().facts,
  };
}

export async function loadProjectMemory(): Promise<ProjectMemory> {
  const runtimeFacts = getProjectContext().projectMemoryFacts;
  if (runtimeFacts) {
    return normalizeProjectMemory({
      updatedAt: new Date().toISOString(),
      facts: runtimeFacts,
    });
  }

  try {
    return normalizeProjectMemory(await readDataJSON<ProjectMemory>(FILE));
  } catch {
    return defaultMemoryForCurrentProject();
  }
}

export async function saveProjectMemory(input: unknown): Promise<ProjectMemory> {
  const next = normalizeProjectMemory({
    ...(input && typeof input === 'object' ? input as Record<string, unknown> : {}),
    updatedAt: new Date().toISOString(),
  });
  await writeDataJSON(FILE, next, 'update project memory');
  return next;
}

export async function projectMemoryText(limit = 10): Promise<string> {
  const memory = await loadProjectMemory();
  return memory.facts
    .slice(0, Math.max(1, Math.min(50, limit)))
    .map((fact) => `- ${fact.title}: ${fact.body}`)
    .join('\n');
}

export async function projectMemoryStatus(): Promise<{ available: boolean; facts: number; updatedAt: string }> {
  const memory = await loadProjectMemory();
  return {
    available: memory.facts.length > 0,
    facts: memory.facts.length,
    updatedAt: memory.updatedAt,
  };
}
