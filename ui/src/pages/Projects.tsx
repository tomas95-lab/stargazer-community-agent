import { Link } from 'react-router-dom';
import {
  IconCircleCheck,
  IconExternalLink,
  IconFolder,
  IconPlus,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
import { api, projectSelection, type QmProject } from '@/api';
import { usePlatform } from '@/platform';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function formatUtc(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function ProjectRow({
  project,
  active,
  deleting,
  onSelect,
  onDelete,
}: {
  project: QmProject;
  active: boolean;
  deleting: boolean;
  onSelect: (project: QmProject) => void;
  onDelete: (project: QmProject) => void;
}) {
  return (
    <div className="border-b border-border p-5 last:border-0">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <IconFolder className="size-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">{project.projectName}</h2>
            {active && <Badge variant="secondary">active</Badge>}
            <Badge variant={project.enabled ? 'outline' : 'secondary'}>{project.enabled ? 'enabled' : 'disabled'}</Badge>
          </div>
          <p className="mt-2 font-mono text-xs text-muted-foreground">{project.projectKey}</p>
          <div className="mt-3 grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
            <p>Category: {project.categoryId || '-'}</p>
            <p>Channel: {project.channelId || '-'}</p>
            <p>Discourse: {project.discourseUsername || '-'}</p>
            <p>Updated: {formatUtc(project.updatedAt)} UTC</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant={project.discourseApiKeyConfigured ? 'secondary' : 'outline'}>
              {project.discourseApiKeyConfigured ? 'Discourse connected' : 'Discourse missing'}
            </Badge>
            <Badge variant={project.anthropicApiKeyConfigured ? 'secondary' : 'outline'}>
              {project.anthropicApiKeyConfigured ? 'Claude key connected' : 'Claude key missing'}
            </Badge>
            <Badge variant="outline">{project.projectGuidelinesCharacters.toLocaleString()} guideline chars</Badge>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {!active && (
            <Button onClick={() => onSelect(project)} variant="outline" size="sm">
              <IconCircleCheck />
              Set active
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link to="/project" onClick={() => onSelect(project)}>
              <IconExternalLink />
              Settings
            </Link>
          </Button>
          <Button onClick={() => onDelete(project)} disabled={deleting} variant="destructive" size="sm">
            <IconTrash />
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Projects() {
  const { projects, currentProject, refreshProjects, selectProject, loading } = usePlatform();
  const [deletingId, setDeletingId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const select = (project: QmProject) => {
    selectProject(project.id);
    setMessage(`${project.projectName} is now active.`);
  };

  const deleteProject = async (project: QmProject) => {
    const confirmed = window.confirm(
      `Delete ${project.projectName}? This removes this project connection and deletes project files when no other QM is using the same Project ID.`
    );
    if (!confirmed) return;

    setDeletingId(project.id);
    setError('');
    setMessage('');

    try {
      const result = await api.deleteProject(project.id);
      if (currentProject?.id === project.id) {
        projectSelection.clearProjectId();
      }
      await refreshProjects();
      setMessage(
        result.removedProjectData
          ? `${project.projectName} was deleted and its project data was removed.`
          : `${project.projectName} was deleted. Shared project data is still in use or belongs to the legacy workspace.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId('');
    }
  };

  return (
    <div className="space-y-6 px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <IconFolder className="size-5 text-primary" />
            <h1 className="text-2xl font-semibold text-foreground">Projects</h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Manage the projects connected to this QM workspace.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void refreshProjects()} disabled={loading} variant="outline">
            <IconRefresh />
            Refresh
          </Button>
          <Button asChild>
            <Link to="/projects/new">
              <IconPlus />
              Add project
            </Link>
          </Button>
        </div>
      </div>

      {error && <div className="sg-status-danger rounded-lg border p-4 text-sm">{error}</div>}
      {message && <div className="sg-status-success rounded-lg border p-4 text-sm">{message}</div>}

      <div className="grid gap-3 md:grid-cols-4">
        <div className="sg-panel p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Projects</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{projects.length}</p>
        </div>
        <div className="sg-panel p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Active</p>
          <p className="mt-2 truncate text-2xl font-semibold text-foreground">{currentProject?.projectName || '-'}</p>
        </div>
        <div className="sg-panel p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Discourse Ready</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {projects.filter((project) => project.discourseApiKeyConfigured).length}
          </p>
        </div>
        <div className="sg-panel p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Claude Ready</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {projects.filter((project) => project.anthropicApiKeyConfigured).length}
          </p>
        </div>
      </div>

      <section className="sg-panel overflow-hidden p-0">
        {loading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading projects...</p>
        ) : projects.length ? (
          projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              active={currentProject?.id === project.id}
              deleting={deletingId === project.id}
              onSelect={select}
              onDelete={deleteProject}
            />
          ))
        ) : (
          <div className="p-5">
            <p className="text-sm text-muted-foreground">No projects connected yet.</p>
            <Button asChild className="mt-4">
              <Link to="/projects/new">
                <IconPlus />
                Add project
              </Link>
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
