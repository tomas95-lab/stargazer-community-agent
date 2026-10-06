import { readDataJSON } from './data-store';
import { getProjectContext, isLegacyProjectId } from './project-context';
import { DEFAULT_PROJECT_LINKS, ProjectLinks } from './templates';

export function normalizeOptionalProjectLink(value: unknown): string {
  const link = typeof value === 'string' ? value.trim() : '';
  if (/^(?:n\/?a|none|null|not applicable|no (?:war room|support room|live support))$/i.test(link)) return '';
  return link;
}

export async function loadProjectLinks(): Promise<ProjectLinks> {
  const context = getProjectContext();
  const runtimeLinks = context.projectLinks;
  const defaults = isLegacyProjectId(context.projectId) ? DEFAULT_PROJECT_LINKS : {};

  try {
    const links = await readDataJSON<Partial<ProjectLinks>>('data/links.json');
    const merged = { ...defaults, ...links, ...runtimeLinks } as ProjectLinks;
    return { ...merged, warRoom: normalizeOptionalProjectLink(merged.warRoom) };
  } catch {
    const merged = { ...defaults, ...runtimeLinks } as ProjectLinks;
    return { ...merged, warRoom: normalizeOptionalProjectLink(merged.warRoom) };
  }
}
