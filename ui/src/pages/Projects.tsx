import { Link } from 'react-router-dom';
import {
  CircleCheck as IconCircleCheck,
  Archive as IconArchive,
  ArchiveRestore as IconRestore,
  ExternalLink as IconExternalLink,
  Folder as IconFolder,
  Download as IconDownload,
  Upload as IconUpload,
  Plus as IconPlus,
  Pause as IconPlayerPause,
  Play as IconPlayerPlay,
  RefreshCw as IconRefresh,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { api, projectSelection, type QmProject } from '@/api';
import { usePlatform } from '@/platform';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { APP_TIME_ZONE_LABEL, formatAppDateTime } from '@/lib/timezone';

function ProjectRow({
  project,
  active,
  deleting,
  changingPause,
  onSelect,
  onPause,
  onDelete,
  onRestore,
  onComplete,
}: {
  project: QmProject;
  active: boolean;
  deleting: boolean;
  changingPause: boolean;
  onSelect: (project: QmProject) => void;
  onPause: (project: QmProject) => void;
  onDelete: (project: QmProject) => void;
  onRestore: (project: QmProject) => void;
  onComplete: (project: QmProject) => void;
}) {
  const canManage = project.role === 'owner' || project.role === 'admin';
  const archived = project.status === 'archived';
  return (
    <div className="border-b border-border p-5 last:border-0">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <IconFolder className="size-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">{project.projectName}</h2>
            {active && <Badge variant="secondary">active</Badge>}
            <Badge variant={project.enabled ? 'outline' : 'secondary'}>{project.status || (project.enabled ? 'active' : 'paused')}</Badge>
            <Badge variant="outline">{project.role || 'owner'}</Badge>
          </div>
          <p className="mt-2 font-mono text-xs text-muted-foreground">{project.projectKey}</p>
          <div className="mt-3 grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
            <p>Category: {project.categoryId || '-'}</p>
            <p>Channel: {project.channelId || '-'}</p>
            <p>Discourse: {project.discourseUsername || '-'}</p>
            <p>Updated: {formatAppDateTime(project.updatedAt)} {APP_TIME_ZONE_LABEL}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant={project.discourseApiKeyConfigured ? 'secondary' : 'outline'}>
              {project.discourseApiKeyConfigured ? 'Discourse connected' : 'Discourse missing'}
            </Badge>
            <Badge variant={project.aiProviderConfigured ? 'secondary' : 'outline'}>
              {project.aiProviderConfigured ? 'Gemini included' : 'Gemini unavailable'}
            </Badge>
            <Badge variant="outline">{project.projectGuidelinesCharacters.toLocaleString()} guideline chars</Badge>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canManage && !archived && (
            <Button onClick={() => onPause(project)} disabled={changingPause} variant="outline" size="sm">
              {project.enabled ? <IconPlayerPause /> : <IconPlayerPlay />}
              {project.enabled ? 'Pause project' : 'Resume project'}
            </Button>
          )}
          {canManage && !archived && project.status !== 'completed' && (
            <Button onClick={() => onComplete(project)} disabled={changingPause} variant="outline" size="sm">
              <IconCircleCheck />
              Complete
            </Button>
          )}
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
          {canManage && (archived ? (
            <Button onClick={() => onRestore(project)} disabled={deleting} variant="outline" size="sm">
              <IconRestore />
              Restore
            </Button>
          ) : (
            <Button onClick={() => onDelete(project)} disabled={deleting} variant="destructive" size="sm">
              <IconArchive />
              Archive
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Projects() {
  const { projects, currentProject, refreshProjects, selectProject, loading } = usePlatform();
  const [deletingId, setDeletingId] = useState('');
  const [changingPauseId, setChangingPauseId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const select = (project: QmProject) => {
    selectProject(project.id);
    setMessage(`${project.projectName} is now active.`);
  };

  const deleteProject = async (project: QmProject) => {
    const confirmed = window.confirm(
      `Archive ${project.projectName}? Automations will stop and the project can be restored later.`
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
          ? `${project.projectName} was archived.`
          : `${project.projectName} was archived. Its data was preserved for recovery.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId('');
    }
  };

  const restoreProject = async (project: QmProject) => {
    setDeletingId(project.id);
    setError('');
    try {
      await api.restoreProject(project.id);
      await refreshProjects();
      setMessage(`${project.projectName} was restored in paused mode.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId('');
    }
  };

  const completeProject = async (project: QmProject) => {
    if (!window.confirm(`Mark ${project.projectName} as completed? All automations will stop.`)) return;
    setChangingPauseId(project.id);
    setError('');
    try {
      await api.setProjectStatus(project.id, 'completed');
      await refreshProjects();
      setMessage(`${project.projectName} is completed and its automations are stopped.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChangingPauseId('');
    }
  };

  const exportCurrentProject = async () => {
    if (!currentProject) return;
    try {
      const exported = await api.exportProject(currentProject.id);
      const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${currentProject.projectKey}-project.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const importProject = async (file: File) => {
    setError('');
    try {
      const parsed = JSON.parse(await file.text()) as { project?: Parameters<typeof api.createProject>[0] };
      if (!parsed.project) throw new Error('Invalid project export file.');
      const result = await api.createProject(parsed.project);
      await refreshProjects();
      selectProject(result.project.id);
      setMessage(`${result.project.projectName} was imported.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const togglePause = async (project: QmProject) => {
    const paused = project.enabled;
    const confirmed = window.confirm(
      paused
        ? `Pause ${project.projectName}? This stops its agent, daily threads, announcements, scheduled messages, and automatic DM replies for every QM connected to this Project ID.`
        : `Resume ${project.projectName}? Its automations will be allowed to run again.`
    );
    if (!confirmed) return;

    setChangingPauseId(project.id);
    setError('');
    setMessage('');
    try {
      await api.setProjectPaused(project.id, paused);
      await refreshProjects();
      setMessage(`${project.projectName} is now ${paused ? 'paused' : 'active'}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChangingPauseId('');
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
          <input ref={importRef} className="hidden" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importProject(file); event.target.value = ''; }} />
          <Button onClick={() => importRef.current?.click()} variant="outline">
            <IconUpload />
            Import
          </Button>
          {currentProject && (
            <Button onClick={() => void exportCurrentProject()} variant="outline">
              <IconDownload />
              Export
            </Button>
          )}
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
          <p className="text-xs font-semibold uppercase text-muted-foreground">AI Ready</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {projects.filter((project) => project.aiProviderConfigured).length}
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
              changingPause={changingPauseId === project.id}
              onSelect={select}
              onPause={togglePause}
              onDelete={deleteProject}
              onRestore={restoreProject}
              onComplete={completeProject}
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
