import { useEffect, useMemo, useRef, useState } from "react"
import type { ChangeEvent, DragEvent, FormEvent, ReactNode } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Check as IconCheck, ExternalLink as IconExternalLink, FileText as IconFileText, FileUp as IconFileTypePdf, LoaderCircle as IconLoader2, RefreshCw as IconRefresh, Search as IconSearch, ShieldCheck as IconShieldCheck, Upload as IconUpload, X as IconX } from "lucide-react"

import { api, projectSelection, type DiscourseAuthStatus, type QmProjectInput } from "@/api"
import { useAuth } from "@/auth"
import { usePlatform } from "@/platform"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface ProjectFormState {
  ownerName: string
  projectKey: string
  projectName: string
  communityBaseUrl: string
  categoryId: string
  categorySlug: string
  channelId: string
  discourseUsername: string
  discourseApiClientId: string
  discourseApiKey: string
  anthropicApiKey: string
  anthropicModel: string
  aiDailyTokenLimit: string
  aiDailyCallLimit: string
  projectGuidelines: string
  warRoomLink: string
  agentMode: "draft" | "supervised" | "auto"
  autoReplyEnabled: boolean
  minConfidence: string
}

type PersistedProjectFormState = Omit<ProjectFormState, "discourseApiKey" | "anthropicApiKey">

interface GuidelinesFileStatus {
  name: string
  size: number
  pages: number
  characters: number
  tables: number
  chunks: number
  warnings: string[]
}

interface ProjectSetupDraft {
  version: 1
  form: PersistedProjectFormState
  savedAt: string
}

const DEFAULT_FORM: ProjectFormState = {
  ownerName: "",
  projectKey: "",
  projectName: "",
  communityBaseUrl: "https://community.outlier.ai",
  categoryId: "",
  categorySlug: "",
  channelId: "",
  discourseUsername: "",
  discourseApiClientId: "daily-thread-bot",
  discourseApiKey: "",
  anthropicApiKey: "",
  anthropicModel: "claude-haiku-4-5",
  aiDailyTokenLimit: "50000",
  aiDailyCallLimit: "100",
  projectGuidelines: "",
  warRoomLink: "",
  agentMode: "supervised",
  autoReplyEnabled: false,
  minConfidence: "0.50",
}

function projectToForm(project: NonNullable<ReturnType<typeof usePlatform>["currentProject"]>): ProjectFormState {
  return {
    ownerName: project.ownerName,
    projectKey: project.projectKey,
    projectName: project.projectName,
    communityBaseUrl: project.communityBaseUrl,
    categoryId: project.categoryId,
    categorySlug: project.categorySlug,
    channelId: project.channelId,
    discourseUsername: project.discourseUsername,
    discourseApiClientId: project.discourseApiClientId,
    discourseApiKey: "",
    anthropicApiKey: "",
    anthropicModel: project.anthropicModel || "claude-haiku-4-5",
    aiDailyTokenLimit: project.aiDailyTokenLimit ? String(project.aiDailyTokenLimit) : "",
    aiDailyCallLimit: project.aiDailyCallLimit ? String(project.aiDailyCallLimit) : "",
    projectGuidelines: project.projectGuidelines,
    warRoomLink: project.warRoomLink,
    agentMode: project.agentMode,
    autoReplyEnabled: project.autoReplyEnabled,
    minConfidence: String(project.minConfidence),
  }
}

function draftKey(userId: string, projectId?: string): string {
  return `qm_project_setup_draft:${userId}:${projectId || "new"}`
}

function persistedForm(form: ProjectFormState): PersistedProjectFormState {
  const { discourseApiKey: _discourseApiKey, anthropicApiKey: _anthropicApiKey, ...rest } = form
  return rest
}

function readDraft(key: string, fallback: ProjectFormState): ProjectFormState {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<ProjectSetupDraft>
    if (parsed.version !== 1 || !parsed.form) return fallback
    return {
      ...fallback,
      ...parsed.form,
      discourseApiKey: "",
      anthropicApiKey: "",
    }
  } catch {
    return fallback
  }
}

function writeDraft(key: string, form: ProjectFormState): void {
  if (typeof window === "undefined") return
  try {
    const draft: ProjectSetupDraft = {
      version: 1,
      form: persistedForm(form),
      savedAt: new Date().toISOString(),
    }
    window.localStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // Ignore quota/private-mode failures; the form still works in memory.
  }
}

function clearDraft(key: string): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(key)
}

function GuideItem({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-background">
        {icon}
      </div>
      <div className="grid gap-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  )
}

function SetupSection({ number, title, description, className = "" }: { number: number; title: string; description: string; className?: string }) {
  return (
    <div className={`flex items-start gap-3 border-t pt-6 ${className}`}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-foreground text-xs font-semibold text-background">{number}</span>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

function OnboardingGuide({ completed }: { completed: boolean[] }) {
  const progress = completed.filter(Boolean).length
  return (
    <Card className="rounded-lg shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Setup guide</CardTitle>
          <Badge variant={progress === completed.length ? "secondary" : "outline"}>{progress} of {completed.length}</Badge>
        </div>
        <CardDescription>Find each value and verify the project before enabling automation.</CardDescription>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${(progress / completed.length) * 100}%` }} />
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <GuideItem icon={<IconCheck className="size-4" />} title="Project ID and name">
          Use the shared Project ID from your team. Every QM on the same project should enter the exact same ID.
        </GuideItem>
        <GuideItem icon={<IconExternalLink className="size-4" />} title="Category ID and slug">
          Open the category in Outlier Community. URLs usually look like /c/category-slug/123: 123 is the ID and category-slug is the slug.
        </GuideItem>
        <GuideItem icon={<IconExternalLink className="size-4" />} title="Community channel ID">
          Open the project chat or channel and copy its numeric channel ID from the URL or channel settings.
        </GuideItem>
        <GuideItem icon={<IconShieldCheck className="size-4" />} title="Discourse username">
          Use your Outlier Community username from your profile or one of your posts, without the @ symbol.
        </GuideItem>
        <GuideItem icon={<IconShieldCheck className="size-4" />} title="API keys">
          Connect Discourse in the new tab or paste a User API Key manually. Claude uses your own QM Anthropic key.
        </GuideItem>
        <GuideItem icon={<IconFileText className="size-4" />} title="Project guidelines">
          Upload the project PDF or paste the current instructions, examples, policies and escalation rules.
        </GuideItem>
      </CardContent>
    </Card>
  )
}

export default function ProjectSetup({ forceNew = false }: { forceNew?: boolean }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, signOut } = useAuth()
  const { currentProject, refreshProjects } = usePlatform()
  const activeProject = forceNew ? null : currentProject
  const [form, setForm] = useState<ProjectFormState>(DEFAULT_FORM)
  const [pending, setPending] = useState(false)
  const [connectingDiscourse, setConnectingDiscourse] = useState(false)
  const [extractingGuidelines, setExtractingGuidelines] = useState(false)
  const [guidelinesFile, setGuidelinesFile] = useState<GuidelinesFileStatus | null>(null)
  const [draggingGuidelines, setDraggingGuidelines] = useState(false)
  const [lookingUpProject, setLookingUpProject] = useState(false)
  const [discourseStatus, setDiscourseStatus] = useState<DiscourseAuthStatus | null>(null)
  const [activeDraftKey, setActiveDraftKey] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const guidelinesInputRef = useRef<HTMLInputElement>(null)
  const consumedGuidelineSuggestion = useRef("")

  const editing = Boolean(activeProject)

  useEffect(() => {
    if (!user) return

    const key = draftKey(user.id, activeProject?.id)
    const fallback = activeProject
      ? projectToForm(activeProject)
      : {
        ...DEFAULT_FORM,
        ownerName: user.user_metadata?.name || user.email?.split("@")[0] || "",
      }
    const draft = readDraft(key, fallback)

    setForm(draft)
    setActiveDraftKey(key)
  }, [activeProject, user])

  useEffect(() => {
    if (!activeDraftKey) return
    writeDraft(activeDraftKey, form)
  }, [activeDraftKey, form])

  useEffect(() => {
    if (!activeDraftKey) return
    const state = location.state as { guidelineSuggestion?: string } | null
    const suggestion = state?.guidelineSuggestion?.trim() || ""
    if (!suggestion || consumedGuidelineSuggestion.current === suggestion) return
    consumedGuidelineSuggestion.current = suggestion
    setForm((current) => ({
      ...current,
      projectGuidelines: [current.projectGuidelines.trim(), suggestion].filter(Boolean).join("\n\n"),
    }))
    setMessage("Knowledge gap draft added. Complete the verified policy before saving.")
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
  }, [activeDraftKey, location.pathname, location.search, location.state, navigate])

  useEffect(() => {
    if (!user) return

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
  }, [location.search, user])

  const title = editing ? "Project settings" : "Set up your project"
  const description = editing
    ? "Update the active project configuration used by the agent."
    : "Connect your Outlier community project before using the agent."

  const apiKeyLabel = useMemo(() => {
    if (!editing && discourseStatus?.connected) return "Discourse User API key (connected, no manual key needed)"
    if (!editing) return "Discourse User API key"
    return activeProject?.discourseApiKeyConfigured
      ? "Discourse User API key (leave blank to keep current key)"
      : "Discourse User API key"
  }, [editing, activeProject, discourseStatus])

  const anthropicApiKeyLabel = useMemo(() => {
    if (!editing) return "Your Anthropic API key"
    return activeProject?.anthropicApiKeyConfigured
      ? "Your Anthropic API key (leave blank to keep current key)"
      : "Your Anthropic API key"
  }, [editing, activeProject])

  const setupChecks = useMemo(() => [
    Boolean(form.ownerName.trim() && form.projectName.trim() && form.projectKey.trim()),
    Boolean(form.categoryId.trim() && form.channelId.trim() && form.discourseUsername.trim()),
    Boolean((discourseStatus?.connected || activeProject?.discourseApiKeyConfigured || form.discourseApiKey.trim())
      && (activeProject?.anthropicApiKeyConfigured || form.anthropicApiKey.trim())),
    form.projectGuidelines.trim().length >= 100,
    Boolean(form.agentMode && Number.isFinite(Number(form.minConfidence))),
  ], [activeProject, discourseStatus, form])

  const setupProgress = setupChecks.filter(Boolean).length

  function update<K extends keyof ProjectFormState>(key: K, value: ProjectFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function lookupSharedProject() {
    const projectKey = form.projectKey.trim()
    if (!projectKey || editing) return
    setLookingUpProject(true)
    setError("")
    setMessage("")
    try {
      const { project } = await api.findSharedProject(projectKey)
      if (!project) {
        setMessage("This is a new Project ID. Complete the project configuration below.")
        return
      }
      setForm((current) => ({
        ...current,
        projectKey: project.projectKey,
        projectName: project.projectName,
        communityBaseUrl: project.communityBaseUrl,
        categoryId: project.categoryId,
        categorySlug: project.categorySlug,
        channelId: project.channelId,
        projectGuidelines: project.projectGuidelines,
        warRoomLink: project.warRoomLink,
        agentMode: project.agentMode,
        autoReplyEnabled: project.autoReplyEnabled,
        minConfidence: String(project.minConfidence),
      }))
      setMessage(`Existing project found: ${project.projectName}. Shared configuration loaded.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLookingUpProject(false)
    }
  }

  async function fileToBase64(file: File): Promise<string> {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ""
    const chunkSize = 0x8000
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
    }
    return window.btoa(binary)
  }

  async function processGuidelinesPdf(file: File) {
    setError("")
    setMessage("")
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    if (!isPdf) {
      setError("Project guidelines must be uploaded as a PDF.")
      return
    }
    if (file.size > 12 * 1024 * 1024) {
      setError("The PDF is too large. Upload a PDF up to 12 MB.")
      return
    }
    setExtractingGuidelines(true)

    try {
      const result = await api.extractGuidelinesFromPdf({
        fileName: file.name,
        mimeType: file.type || "application/pdf",
        base64: await fileToBase64(file),
      })
      update("projectGuidelines", result.text)
      setGuidelinesFile({
        name: file.name,
        size: file.size,
        pages: result.pages,
        characters: result.characters,
        tables: result.tables,
        chunks: result.chunks,
        warnings: result.warnings,
      })
      setMessage(`Project guidelines extracted from ${file.name}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setExtractingGuidelines(false)
    }
  }

  async function readGuidelinesFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) await processGuidelinesPdf(file)
    event.currentTarget.value = ""
  }

  function dropGuidelinesFile(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDraggingGuidelines(false)
    if (extractingGuidelines) return
    const file = event.dataTransfer.files?.[0]
    if (file) void processGuidelinesPdf(file)
  }

  function clearGuidelinesFile() {
    setGuidelinesFile(null)
    update("projectGuidelines", "")
    setMessage("Project guidelines removed.")
  }

  function formatFileSize(bytes: number): string {
    return bytes >= 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`
  }

  async function connectDiscourse() {
    const authWindow = window.open("about:blank", "_blank")
    if (authWindow) {
      try {
        authWindow.document.title = "Connecting Discourse"
      } catch {
        // Some browsers restrict access immediately; navigation still works.
      }
    }

    setConnectingDiscourse(true)
    setError("")
    setMessage("")
    try {
      const result = await api.startDiscourseAuth({
        projectId: activeProject?.id,
        returnTo: location.pathname,
      })
      setMessage("Authorization opened in a new tab. If it does not connect automatically, paste your User API Key below.")
      if (authWindow) {
        authWindow.location.href = result.authorizationUrl
      } else {
        window.open(result.authorizationUrl, "_blank", "noopener,noreferrer")
      }
    } catch (err) {
      authWindow?.close()
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setConnectingDiscourse(false)
    }
  }

  function optionalNumber(value: string): number | null {
    const trimmed = value.trim()
    return trimmed ? Number(trimmed) : null
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError("")
    setMessage("")

    const payload: QmProjectInput = {
      ownerName: form.ownerName,
      projectKey: form.projectKey,
      projectName: form.projectName,
      communityBaseUrl: form.communityBaseUrl,
      categoryId: form.categoryId,
      categorySlug: form.categorySlug,
      channelId: form.channelId,
      discourseUsername: form.discourseUsername,
      discourseApiClientId: form.discourseApiClientId,
      discourseApiKey: form.discourseApiKey || undefined,
      anthropicApiKey: form.anthropicApiKey || undefined,
      anthropicModel: form.anthropicModel,
      aiDailyTokenLimit: optionalNumber(form.aiDailyTokenLimit),
      aiDailyCallLimit: optionalNumber(form.aiDailyCallLimit),
      projectGuidelines: form.projectGuidelines,
      guidelinesSourceName: guidelinesFile?.name,
      guidelinesChangeSummary: guidelinesFile ? `Uploaded ${guidelinesFile.name}.` : 'Updated guidelines in the editor.',
      warRoomLink: form.warRoomLink,
      agentMode: form.agentMode,
      autoReplyEnabled: form.autoReplyEnabled,
      minConfidence: Number(form.minConfidence),
    }

    try {
      const result = activeProject
        ? await api.updateProject(activeProject.id, payload)
        : await api.createProject(payload)
      if (activeDraftKey) clearDraft(activeDraftKey)
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
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={setupProgress === setupChecks.length ? "secondary" : "outline"}>{setupProgress} of {setupChecks.length} ready</Badge>
            {!editing ? <Button type="button" variant="outline" onClick={() => void signOut()}>Sign out</Button> : null}
          </div>
        </div>

        <div className={editing ? "grid gap-6" : "grid gap-6 lg:grid-cols-[minmax(0,1fr)_480px]"}>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Project configuration</CardTitle>
            <CardDescription>
              Complete the five sections below. Drafts are saved locally as you work, but API keys are never stored in the browser draft.
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
                      {discourseStatus?.connected || activeProject?.discourseApiKeyConfigured
                        ? "Discourse is connected"
                        : "Connect Discourse"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {discourseStatus?.username
                        ? `Authorized as ${discourseStatus.username}. The raw User API Key is stored server-side only.`
                        : "Authorize DailyThreadBot in Outlier Community, or paste your User API Key manually below."}
                    </p>
                  </div>
                </div>
                <Button type="button" variant="outline" onClick={connectDiscourse} disabled={connectingDiscourse}>
                  {connectingDiscourse ? <IconLoader2 className="size-4 animate-spin" /> : <IconExternalLink className="size-4" />}
                  Connect Discourse
                </Button>
              </div>

              <SetupSection number={1} title="Project identity" description="Name the project and use the exact shared Project ID used by the other QMs." />

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
                  <Label htmlFor="projectKey">Project ID</Label>
                  <div className="flex gap-2">
                    <Input
                      id="projectKey"
                      value={form.projectKey}
                      onChange={(event) => update("projectKey", event.target.value)}
                      placeholder="project-id-from-your-team"
                      required
                    />
                    {!editing ? (
                      <Button type="button" variant="outline" onClick={() => void lookupSharedProject()} disabled={lookingUpProject || !form.projectKey.trim()}>
                        {lookingUpProject ? <IconLoader2 className="animate-spin" /> : <IconSearch />}
                        Find
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use the same ID as the other QMs to load and share that project.
                  </p>
                </div>
                <SetupSection className="md:col-span-2" number={2} title="Community target" description="Identify the category and chat channel this project owns in Outlier Community." />
                <div className="grid gap-2">
                  <Label htmlFor="communityBaseUrl">Community base URL</Label>
                  <Input
                    id="communityBaseUrl"
                    value={form.communityBaseUrl}
                    onChange={(event) => update("communityBaseUrl", event.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Keep the default unless your project uses a different Community host.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="categoryId">Category ID</Label>
                  <Input
                    id="categoryId"
                    value={form.categoryId}
                    onChange={(event) => update("categoryId", event.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    From the category URL, usually the final number after /c/category-slug/.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="categorySlug">Category slug</Label>
                  <Input
                    id="categorySlug"
                    value={form.categorySlug}
                    onChange={(event) => update("categorySlug", event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    From the same category URL, usually the text after /c/.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="channelId">Community channel ID</Label>
                  <Input
                    id="channelId"
                    value={form.channelId}
                    onChange={(event) => update("channelId", event.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Open the project chat or channel and copy the numeric ID from the URL or settings.
                  </p>
                </div>
                <SetupSection className="md:col-span-2" number={3} title="Personal connections" description="Connect your own Community and Claude credentials. These are private to your QM account." />
                <div className="grid gap-2">
                  <Label htmlFor="discourseUsername">Discourse username</Label>
                  <Input
                    id="discourseUsername"
                    value={form.discourseUsername}
                    onChange={(event) => update("discourseUsername", event.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Your Outlier Community username, without the @ symbol.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="discourseApiClientId">Discourse API client ID</Label>
                  <Input
                    id="discourseApiClientId"
                    value={form.discourseApiClientId}
                    onChange={(event) => update("discourseApiClientId", event.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Usually daily-thread-bot unless your team configured a different client ID.
                  </p>
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
                  <p className="text-xs text-muted-foreground">
                    Only needed if Connect Discourse is not already connected. Stored encrypted server-side.
                  </p>
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="anthropicApiKey">{anthropicApiKeyLabel}</Label>
                  <Input
                    id="anthropicApiKey"
                    type="password"
                    value={form.anthropicApiKey}
                    onChange={(event) => update("anthropicApiKey", event.target.value)}
                    placeholder="sk-ant-..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Stored encrypted. Claude features use your QM key across your projects, never another QM&apos;s key.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="anthropicModel">Claude model</Label>
                  <Input
                    id="anthropicModel"
                    value={form.anthropicModel}
                    onChange={(event) => update("anthropicModel", event.target.value)}
                    placeholder="claude-haiku-4-5"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="aiDailyTokenLimit">Daily token limit</Label>
                  <Input
                    id="aiDailyTokenLimit"
                    type="number"
                    min="1"
                    step="1000"
                    value={form.aiDailyTokenLimit}
                    onChange={(event) => update("aiDailyTokenLimit", event.target.value)}
                    placeholder="50000"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="aiDailyCallLimit">Daily call limit</Label>
                  <Input
                    id="aiDailyCallLimit"
                    type="number"
                    min="1"
                    step="1"
                    value={form.aiDailyCallLimit}
                    onChange={(event) => update("aiDailyCallLimit", event.target.value)}
                    placeholder="100"
                  />
                </div>
                <SetupSection className="md:col-span-2" number={4} title="Project context" description="Add the trusted links and source material the agent should use when answering." />
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
                <div className="grid gap-1">
                  <Label htmlFor="projectGuidelinesPdf">Project guidelines</Label>
                  <p className="text-sm text-muted-foreground">The agent uses the extracted PDF text as project context.</p>
                </div>

                <div
                  className={`flex min-h-36 flex-col items-center justify-center gap-3 rounded-md border border-dashed px-6 py-5 text-center transition-colors ${draggingGuidelines ? "border-primary bg-primary/5" : "border-border bg-muted/20"}`}
                  onDragEnter={(event) => { event.preventDefault(); setDraggingGuidelines(true) }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingGuidelines(false) }}
                  onDrop={dropGuidelinesFile}
                >
                  {extractingGuidelines ? <IconLoader2 className="size-8 animate-spin text-primary" /> : <IconFileTypePdf className="size-8 text-primary" />}
                  <div>
                    <p className="text-sm font-medium text-foreground">{extractingGuidelines ? "Extracting PDF text" : "Drop the guidelines PDF here"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">PDF with selectable text, up to 12 MB</p>
                  </div>
                  <Button type="button" variant="outline" onClick={() => guidelinesInputRef.current?.click()} disabled={extractingGuidelines}>
                    <IconUpload />
                    {guidelinesFile ? "Replace PDF" : "Choose PDF"}
                  </Button>
                  <input
                    ref={guidelinesInputRef}
                    id="projectGuidelinesPdf"
                    className="sr-only"
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={readGuidelinesFile}
                    disabled={extractingGuidelines}
                  />
                </div>

                {guidelinesFile ? (
                  <div className="flex min-w-0 items-center gap-3 rounded-md border bg-background px-3 py-2.5">
                    <IconFileTypePdf className="size-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{guidelinesFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(guidelinesFile.size)}, {guidelinesFile.pages} pages, {guidelinesFile.tables} tables, {guidelinesFile.chunks} context sections
                      </p>
                      {guidelinesFile.warnings.length ? <p className="mt-1 text-xs text-warning">{guidelinesFile.warnings[0]}</p> : null}
                    </div>
                    <Button type="button" size="icon" variant="ghost" onClick={clearGuidelinesFile} title="Remove guidelines">
                      <IconX />
                    </Button>
                  </div>
                ) : null}

                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="projectGuidelines">Extracted agent context</Label>
                  {form.projectGuidelines && !guidelinesFile ? (
                    <span className="text-xs text-muted-foreground">{form.projectGuidelines.length.toLocaleString()} characters</span>
                  ) : null}
                </div>
                <Textarea
                  id="projectGuidelines"
                  className="min-h-64 font-mono text-sm"
                  value={form.projectGuidelines}
                  onChange={(event) => update("projectGuidelines", event.target.value)}
                  placeholder="Extracted PDF content appears here. You can also paste or edit project context directly."
                />
              </div>

              <SetupSection number={5} title="Automation policy" description="Choose how much autonomy the agent has and the minimum confidence required." />
              <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="agentMode">Agent mode</Label>
                  <Select value={form.agentMode} onValueChange={(value) => update("agentMode", value as ProjectFormState["agentMode"])}>
                    <SelectTrigger id="agentMode"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="supervised">Supervised</SelectItem>
                      <SelectItem value="draft">Draft only</SelectItem>
                      <SelectItem value="auto">Automatic replies</SelectItem>
                    </SelectContent>
                  </Select>
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
        {!editing ? (
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <OnboardingGuide completed={setupChecks} />
          </aside>
        ) : null}
        </div>
      </div>
    </div>
  )
}
