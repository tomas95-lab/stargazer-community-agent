import { readDataJSON } from './data-store';
import { getProjectContext } from './project-context';
import { DEFAULT_PROJECT_LINKS, ProjectLinks } from './templates';

export async function loadProjectLinks(): Promise<ProjectLinks> {
  const runtimeLinks = getProjectContext().projectLinks;

  try {
    const links = await readDataJSON<Partial<ProjectLinks>>('data/links.json');
    return { ...DEFAULT_PROJECT_LINKS, ...links, ...runtimeLinks };
  } catch {
    return { ...DEFAULT_PROJECT_LINKS, ...runtimeLinks };
  }
}
