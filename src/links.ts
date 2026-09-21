import { readDataJSON } from './data-store';
import { getProjectContext, isLegacyProjectId } from './project-context';
import { DEFAULT_PROJECT_LINKS, ProjectLinks } from './templates';

export async function loadProjectLinks(): Promise<ProjectLinks> {
  const context = getProjectContext();
  const runtimeLinks = context.projectLinks;
  const defaults = isLegacyProjectId(context.projectId) ? DEFAULT_PROJECT_LINKS : {};

  try {
    const links = await readDataJSON<Partial<ProjectLinks>>('data/links.json');
    return { ...defaults, ...links, ...runtimeLinks } as ProjectLinks;
  } catch {
    return { ...defaults, ...runtimeLinks } as ProjectLinks;
  }
}
