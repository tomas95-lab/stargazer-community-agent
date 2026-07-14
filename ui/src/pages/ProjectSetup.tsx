import { useEffect, useMemo, useState } from "react"
import type { ChangeEvent, FormEvent } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { IconExternalLink, IconFileText, IconLoader2, IconRefresh, IconShieldCheck } from "@tabler/icons-react"

import { api, projectSelection, type DiscourseAuthStatus, type QmProjectInput } from "@/api"
import { useAuth } from "@/auth"
import { usePlatform } from "@/platform"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface ProjectFormState {
  ownerName: string
  projectName: string
  communityBaseUrl: string
  categoryId: string
  categorySlug: string
  channelId: string
  discourseUsername: string
  discourseApiClientId: string
  discourseApiKey: string
  projectGuidelines: string
  warRoomLink: string
  agentMode: "draft" | "supervised" | "auto"
  autoReplyEnabled: boolean
  minConfidence: string
}

const DEFAULT_FORM: ProjectFormState = {
  ownerName: "",
  projectName: "",
  communityBaseUrl: "https://community.outlier.ai",
  categoryId: "",
  categorySlug: "",
  channelId: "",
  discourseUsername: "",
  discourseApiClientId: "daily-thread-bot",
  discourseApiKey: "",
  projectGuidelines: "",
  warRoomLink: "",
  agentMode: "supervised",
  autoReplyEnabled: false,
  minConfidence: "0.50",
}

export default function ProjectSetup() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, signOut } = useAuth()
  const { currentProject, refreshProjects } = usePlatform()
  const [form, setForm] = useState<ProjectFormState>(DEFAULT_FORM)
  const [pending, setPending] = useState(false)
  const [connectingDiscourse, setConnectingDiscourse] = useState(false)
  const [discourseStatus, setDiscourseStatus] = useState<DiscourseAuthStatus | null>(null)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const editing = Boolean(currentProject)

  useEffect(() => {
    if (!currentProject) {
      setForm((value) => ({
        ...DEFAULT_FORM,
        ownerName: user?.user_metadata?.name || user?.email?.split("@")[0] || value.ownerName,
      }))
      return
    }

    setForm({
      ownerName: currentProject.ownerName,
      projectName: currentProject.projectName,
      communityBaseUrl: currentProject.communityBaseUrl,
      categoryId: currentProject.categoryId,
      categorySlug: currentProject.categorySlug,
      channelId: currentProject.channelId,
      discourseUsername: currentProject.discourseUsername,
      discourseApiClientId: currentProject.discourseApiClientId,
      discourseApiKey: "",
      projectGuidelines: currentProject.projectGuidelines,
      warRoomLink: currentProject.warRoomLink,
      agentMode: currentProject.agentMode,
      autoReplyEnabled: currentProject.autoReplyEnabled,
      minConfidence: String(currentProject.minConfidence),
    })
  }, [currentProject, user])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const discourse = params.get("discourse")
    const callbackMessage = params.get("message")
    if (discourse === "connected") setMessage("Discourse connected. You can save the project now.")
    if (discourse === "error") setError(callbackMessage || "Discourse authorization failed. Please try again.")

    api.getDiscourseAuthStatus()
      .then((status) => {
        setDiscourseStatus(status)
        if (status.username) {
          setForm((current) => current.discourseUsername ? current : { ...current, discourseUsername: status.username })
        }
      })
      .catch(() => undefined)
  }, [location.search])

  const title = editing ? "Project settings" : "Set up your project"
  const description = editing
    ? "Update the active project configuration used by the agent."
    : "Connect your Outlier community project before using the agent."

  const apiKeyLabel = useMemo(() => {
    if (!editing && discourseStatus?.connected) return "Discourse API key (connected, no manual key needed)"
    if (!editing) return "Discourse API key"
    return currentProject?.discourseApiKeyConfigured
      ? "Discourse API key (leave blank to keep current key)"
      : "Discourse API key"
  }, [editing, currentProject, discourseStatus])

  function update<K extends keyof ProjectFormState>(key: K, value: ProjectFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function readGuidelinesFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const text = await file.text()
    update("projectGuidelines", text)
  }

  async function connectDiscourse() {
    setConnectingDiscourse(true)
    setError("")
    setMessage("")
    try {
      const result = await api.startDiscourseAuth({
        projectId: currentProject?.id,
        returnTo: location.pathname,
      })
      window.location.assign(result.authorizationUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setConnectingDiscourse(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError("")
    setMessage("")

    const payload: QmProjectInput = {
      ownerName: form.ownerName,
      projectName: form.projectName,
      communityBaseUrl: form.communityBaseUrl,
      categoryId: form.categoryId,
      categorySlug: form.categorySlug,
      channelId: form.channelId,
      discourseUsername: form.discourseUsername,
      discourseApiClientId: form.discourseApiClientId,
      discourseApiKey: form.discourseApiKey || undefined,
      projectGuidelines: form.projectGuidelines,
      warRoomLink: form.warRoomLink,
      agentMode: form.agentMode,
      autoReplyEnabled: form.autoReplyEnabled,
      minConfidence: Number(form.minConfidence),
    }

    try {
      const result = currentProject
        ? await api.updateProject(currentProject.id, payload)
        : await api.createProject(payload)
      projectSelection.setProjectId(result.project.id)
      await refreshProjects()
      setMessage("Project saved.")
      navigate("/", { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={editing ? "bg-background px-4 md:px-6" : "min-h-screen bg-background px-4 py-8 md:px-8"}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <Button type="button" variant="outline" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Community connection</CardTitle>
            <CardDescription>
              These values define which category, channel and Discourse user the agent can access.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-6" onSubmit={submit}>
              <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border bg-background">
                    <IconShieldCheck className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {discourseStatus?.connected || currentProject?.discourseApiKeyConfigured
                        ? "Discourse is connected"
                        : "Connect Discourse"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {discourseStatus?.username
                        ? `Authorized as ${discourseStatus.username}. The raw User API Key is stored server-side only.`
                        : "Authorize DailyThreadBot in Outlier Community so the agent can use your own User API Key."}
                    </p>
                  </div>
                </div>
                <Button type="button" variant="outline" onClick={connectDiscourse} disabled={connectingDiscourse}>
                  {connectingDiscourse ? <IconLoader2 className="size-4 animate-spin" /> : <IconExternalLink className="size-4" />}
                  Connect Discourse
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="ownerName">QM name</Label>
                  <Input
                    id="ownerName"
                    value={form.ownerName}
                    onChange={(event) => update("ownerName", event.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="projectName">Project name</Label>
                  <Input
                    id="projectName"
                    value={form.projectName}
                    onChange={(event) => update("projectName", event.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="communityBaseUrl">Community base URL</Label>
                  <Input
                    id="communityBaseUrl"
                    value={form.communityBaseUrl}
                    onChange={(event) => update("communityBaseUrl", event.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="categoryId">Category ID</Label>
                  <Input
                    id="categoryId"
                    value={form.categoryId}
                    onChange={(event) => update("categoryId", event.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="categorySlug">Category slug</Label>
                  <Input
                    id="categorySlug"
                    value={form.categorySlug}
                    onChange={(event) => update("categorySlug", event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="channelId">Community channel ID</Label>
                  <Input
                    id="channelId"
                    value={form.channelId}
                    onChange={(event) => update("channelId", event.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="discourseUsername">Discourse username</Label>
                  <Input
                    id="discourseUsername"
                    value={form.discourseUsername}
                    onChange={(event) => update("discourseUsername", event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="discourseApiClientId">Discourse API client ID</Label>
                  <Input
                    id="discourseApiClientId"
                    value={form.discourseApiClientId}
                    onChange={(event) => update("discourseApiClientId", event.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="discourseApiKey">{apiKeyLabel}</Label>
                  <Input
                    id="discourseApiKey"
                    type="password"
                    value={form.discourseApiKey}
                    onChange={(event) => update("discourseApiKey", event.target.value)}
                    required={!editing && !discourseStatus?.connected}
                  />
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="warRoomLink">War Room link</Label>
                  <Input
                    id="warRoomLink"
                    value={form.warRoomLink}
                    onChange={(event) => update("warRoomLink", event.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div className="grid gap-1">
                    <Label htmlFor="projectGuidelines">Project guidelines and information</Label>
                    <p className="text-sm text-muted-foreground">
                      Paste guidelines or upload a text/markdown file for agent context.
                    </p>
                  </div>
                  <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground">
                    <IconFileText className="size-4" />
                    Upload file
                    <input
                      className="sr-only"
                      type="file"
                      accept=".txt,.md,.markdown,.csv,.json"
                      onChange={readGuidelinesFile}
                    />
                  </label>
                </div>
                <Textarea
                  id="projectGuidelines"
                  className="min-h-64 font-mono text-sm"
                  value={form.projectGuidelines}
                  onChange={(event) => update("projectGuidelines", event.target.value)}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="agentMode">Agent mode</Label>
                  <select
                    id="agentMode"
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    value={form.agentMode}
                    onChange={(event) => update("agentMode", event.target.value as ProjectFormState["agentMode"])}
                  >
                    <option value="supervised">Supervised</option>
                    <option value="draft">Draft only</option>
                    <option value="auto">Automatic replies</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="minConfidence">Minimum confidence</Label>
                  <Input
                    id="minConfidence"
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={form.minConfidence}
                    onChange={(event) => update("minConfidence", event.target.value)}
                  />
                </div>
                <label className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                  <Checkbox
                    checked={form.autoReplyEnabled}
                    onCheckedChange={(checked) => update("autoReplyEnabled", checked === true)}
                  />
                  Enable automatic replies
                </label>
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => void refreshProjects()}>
                  <IconRefresh className="size-4" />
                  Refresh
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? <IconLoader2 className="size-4 animate-spin" /> : null}
                  Save project
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
