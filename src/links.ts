import { readDataJSON } from './data-store';
import { DEFAULT_PROJECT_LINKS, ProjectLinks } from './templates';

export async function loadProjectLinks(): Promise<ProjectLinks> {
  try {
    const links = await readDataJSON<Partial<ProjectLinks>>('data/links.json');
    return { ...DEFAULT_PROJECT_LINKS, ...links };
  } catch {
    return DEFAULT_PROJECT_LINKS;
  }
}
