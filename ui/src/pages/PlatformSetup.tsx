import { useEffect, useMemo, useState } from 'react'
import { IconAlertCircle, IconCheck, IconDeviceFloppy, IconRefresh } from '@tabler/icons-react'

import { api, type PlatformContext, type PlatformProject } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

function FieldLabel({ children }: { children: string }) {
  return <label className="sg-label mb-1 block">{children}</label>
}

function emptyProject(): PlatformProject {
  return {
    id: '',
    name: 'Stargazer',
    category: {
      id: '',
      slug: '',
    },
    channel: {
      id: '',
    },
    projectGuidelines: '',
    discourseApiKeyConfigured: false,
    enabled: true,
  }
}

export default function PlatformSetup() {
  const [context, setContext] = useState<PlatformContext | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [projectName, setProjectName] = useState('Stargazer')
  const [categoryId, setCategoryId] = useState('')
  const [categorySlug, setCategorySlug] = useState('')
  const [channelId, setChannelId] = useState('')
  const [projectGuidelines, setProjectGuidelines] = useState('')
  const [discourseApiKey, setDiscourseApiKey] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const selectedProject = useMemo(() => {
    return context?.projects.find((project) => project.id === selectedProjectId) || null
  }, [context?.projects, selectedProjectId])

  const applyProject = (project: PlatformProject) => {
    setSelectedProjectId(project.id)
    setProjectName(project.name)
    setCategoryId(project.category.id)
    setCategorySlug(project.category.slug)
    setChannelId(project.channel.id)
    setProjectGuidelines(project.projectGuidelines)
    setDiscourseApiKey('')
    setEnabled(project.enabled)
  }

  const load = async () => {
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const next = await api.getPlatformMe()
      setContext(next)
      applyProject(next.projects[0] || emptyProject())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const save = async () => {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const next = await api.savePlatformProject({
        id: selectedProjectId || undefined,
        name: projectName,
        categoryId,
        categorySlug,
        channelId,
        projectGuidelines,
        discourseApiKey: discourseApiKey || undefined,
        enabled,
      })
      setContext(next)
      const saved = next.projects.find((project) => project.category.id === categoryId && project.channel.id === channelId) || next.projects[0]
      if (saved) applyProject(saved)
      setNotice('Project configuration saved')
      setTimeout(() => setNotice(''), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const newProject = () => {
    applyProject(emptyProject())
  }

  return (
    <div className="space-y-6 px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Platform Setup</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            {context?.profile && <Badge variant="secondary">{context.profile.email}</Badge>}
            {selectedProject?.discourseApiKeyConfigured && (
              <Badge className="border-transparent bg-success text-success-foreground">
                <IconCheck />
                Discourse key saved
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load} disabled={loading || saving}>
            <IconRefresh />
            Refresh
          </Button>
          <Button onClick={save} disabled={saving || loading}>
            <IconDeviceFloppy />
            {saving ? 'Saving...' : 'Save Project'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="sg-status-danger flex items-start gap-2 rounded-lg border p-4 text-sm">
          <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && <div className="sg-status-success rounded-lg border p-4 text-sm">{notice}</div>}

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <section className="sg-panel overflow-hidden p-0">
          <div className="sg-panel-header flex items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm font-semibold text-foreground">Projects</p>
            <Button variant="outline" size="sm" onClick={newProject}>New</Button>
          </div>
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading...</p>
          ) : context?.projects.length ? (
            <div className="divide-y divide-border">
              {context.projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => applyProject(project)}
                  className={`block w-full px-4 py-3 text-left text-sm hover:bg-muted/50 ${selectedProjectId === project.id ? 'bg-muted/60' : ''}`}
                >
                  <span className="font-medium text-foreground">{project.name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{project.category.slug || project.category.id}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">No projects configured yet.</p>
          )}
        </section>

        <section className="sg-panel space-y-5 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel>Project name</FieldLabel>
              <input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                className="sg-input px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-end">
              <label className="flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => setEnabled(event.target.checked)}
                  className="accent-primary"
                />
                Enabled
              </label>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <FieldLabel>Category ID</FieldLabel>
              <input
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="sg-input px-3 py-2 text-sm"
                placeholder="15895"
              />
            </div>
            <div>
              <FieldLabel>Category slug</FieldLabel>
              <input
                value={categorySlug}
                onChange={(event) => setCategorySlug(event.target.value)}
                className="sg-input px-3 py-2 text-sm"
                placeholder="stargazer-axiom"
              />
            </div>
            <div>
              <FieldLabel>Channel ID</FieldLabel>
              <input
                value={channelId}
                onChange={(event) => setChannelId(event.target.value)}
                className="sg-input px-3 py-2 text-sm"
                placeholder="828853"
              />
            </div>
          </div>

          <div>
            <FieldLabel>Discourse API key</FieldLabel>
            <input
              value={discourseApiKey}
              onChange={(event) => setDiscourseApiKey(event.target.value)}
              type="password"
              className="sg-input px-3 py-2 text-sm"
              placeholder={selectedProject?.discourseApiKeyConfigured ? 'Leave blank to keep current key' : 'Paste the user API key once'}
            />
            <p className="mt-2 text-xs text-muted-foreground">Stored server-side through Supabase Vault. The key is never returned to the browser.</p>
          </div>

          <div>
            <FieldLabel>Project guidelines</FieldLabel>
            <textarea
              value={projectGuidelines}
              onChange={(event) => setProjectGuidelines(event.target.value)}
              className="sg-input min-h-80 resize-y px-3 py-2 text-sm"
              placeholder="Paste the project guidelines or operating instructions for this user's community."
            />
          </div>
        </section>
      </div>
    </div>
  )
}
