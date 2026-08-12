import { useEffect, useMemo, useRef, useState } from "react"
import type { ChangeEvent, DragEvent, FormEvent } from "react"
import type { LucideIcon } from "lucide-react"
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CircleAlert,
  FileText,
  KeyRound,
  LoaderCircle,
  LogOut,
  MessageCircle,
  ShieldCheck,
  Users,
} from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"

import {
  api,
  projectSelection,
  type DiscourseAccessCheckResult,
  type DiscourseAuthStatus,
  type DiscoursePublicChannel,
  type QmProjectInput,
} from "@/api"
import { useAuth } from "@/auth"
import { usePlatform } from "@/platform"
import { AutomationStep } from "@/components/project-setup/AutomationStep"
import { CommunityStep } from "@/components/project-setup/CommunityStep"
import { ConnectionsStep } from "@/components/project-setup/ConnectionsStep"
import { IdentityStep } from "@/components/project-setup/IdentityStep"
import { KnowledgeStep } from "@/components/project-setup/KnowledgeStep"
import type {
  ChannelGuidelineForm,
  GuidelinesFileStatus,
  PersistedProjectFormState,
  ProjectFormState,
} from "@/components/project-setup/types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { extractGuidelinesPdf } from "@/lib/pdf-guidelines"

interface ProjectSetupDraft {
  version: 1
  form: PersistedProjectFormState
  savedAt: string
}

interface PendingDiscourseAuthorization {
  nonce: string
  expiresAt: string
}

interface SetupStep {
  id: string
  label: string
  eyebrow: string
  title: string
  description: string
  icon: LucideIcon
}

const SETUP_STEPS: SetupStep[] = [
  {
    id: "identity",
    label: "Project",
    eyebrow: "Project identity",
    title: "Start with the project",
    description: "Use the shared Project ID so every QM works from the same configuration.",
    icon: Users,
  },
  {
    id: "community",
    label: "Community",
    eyebrow: "Community target",
    title: "Point the agent to the right place",
    description: "Add the category, chat channel, and your Community username.",
    icon: MessageCircle,
  },
  {
    id: "connections",
    label: "Connections",
    eyebrow: "Personal connections",
    title: "Connect your accounts",
    description: "Authorize Community. Gemini is already included and managed by the platform.",
    icon: KeyRound,
  },
  {
    id: "knowledge",
    label: "Guidelines",
    eyebrow: "Project knowledge",
    title: "Give the agent reliable context",
    description: "Upload the current PDF and add the support link used by your project.",
    icon: FileText,
  },
  {
    id: "automation",
    label: "Automation",
    eyebrow: "Automation policy",
    title: "Choose how the agent should work",
    description: "Start cautiously and increase autonomy when the answers look right.",
    icon: Bot,
  },
]

const CSM_SETUP_STEPS: SetupStep[] = SETUP_STEPS.map((step) => {
  if (step.id === "identity") return { ...step, label: "Workspace", eyebrow: "CSM workspace", title: "Name your operations workspace", description: "Use one workspace for the Community channels managed by the same CSM team." }
  if (step.id === "community") return { ...step, label: "Channels", eyebrow: "Channel coverage", title: "Add the channels you manage", description: "Connect up to 30 Community channels with one personal Discourse authorization." }
  if (step.id === "knowledge") return { ...step, label: "Instructions", eyebrow: "Operational knowledge", title: "Import the source of truth", description: "Load instructions from an Outlier Community post or upload a supporting PDF." }
  return step
})

const DEFAULT_FORM: ProjectFormState = {
  ownerName: "",
  projectKey: "",
  projectName: "",
  communityBaseUrl: "https://community.outlier.ai",
  categoryId: "",
  categorySlug: "",
  channelId: "",
  managedChannelIds: [],
  discourseUsername: "",
  discourseApiClientId: "daily-thread-bot",
  discourseApiKey: "",
  projectGuidelines: "",
  guidelinesSourceUrl: "",
  channelGuidelines: [],
  warRoomLink: "",
  agentMode: "supervised",
  autoReplyEnabled: false,
  minConfidence: "0.50",
}

function channelGuidelinesFromSettings(value: unknown, channelIds: string[]): ChannelGuidelineForm[] {
  if (!Array.isArray(value)) return []
  const allowed = new Set(channelIds)
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const raw = item as Record<string, unknown>
    const channelId = typeof raw.channelId === "string" ? raw.channelId : ""
    if (!/^\d+$/.test(channelId) || !allowed.has(channelId)) return []
    const text = typeof raw.text === "string" ? raw.text : ""
    return [{
      channelId,
      channelTitle: typeof raw.channelTitle === "string" ? raw.channelTitle : "",
      sourceUrl: typeof raw.sourceUrl === "string" ? raw.sourceUrl : "",
      sourceTitle: typeof raw.sourceTitle === "string" ? raw.sourceTitle : "",
      sourceAuthor: typeof raw.sourceAuthor === "string" ? raw.sourceAuthor : "",
      text,
      characters: text.length,
      syncedAt: typeof raw.syncedAt === "string" ? raw.syncedAt : "",
    }]
  })
}

function projectToForm(project: NonNullable<ReturnType<typeof usePlatform>["currentProject"]>): ProjectFormState {
  const managedChannelIds = Array.isArray(project.settings?.managedChannelIds)
    ? project.settings.managedChannelIds.map(String).filter(Boolean)
    : [project.channelId].filter(Boolean)
  return {
    ownerName: project.ownerName,
    projectKey: project.projectKey,
    projectName: project.projectName,
    communityBaseUrl: project.communityBaseUrl,
    categoryId: project.categoryId,
    categorySlug: project.categorySlug,
    channelId: project.channelId,
    managedChannelIds,
    discourseUsername: project.discourseUsername,
    discourseApiClientId: project.discourseApiClientId,
    discourseApiKey: "",
    projectGuidelines: project.projectGuidelines,
    guidelinesSourceUrl: typeof project.settings?.guidelinesSourceUrl === "string" ? project.settings.guidelinesSourceUrl : "",
    channelGuidelines: channelGuidelinesFromSettings(project.settings?.channelGuidelines, managedChannelIds),
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
  const { discourseApiKey: _discourseApiKey, ...rest } = form
  return rest
}

function readDraft(key: string, fallback: ProjectFormState): ProjectFormState {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<ProjectSetupDraft>
    if (parsed.version !== 1 || !parsed.form) return fallback
    return { ...fallback, ...parsed.form, discourseApiKey: "" }
  } catch {
    return fallback
  }
}

function readDraftStep(key: string): number {
  if (typeof window === "undefined") return 0
  const stored = Number(window.localStorage.getItem(`${key}:step`))
  return Number.isInteger(stored) && stored >= 0 && stored < SETUP_STEPS.length ? stored : 0
}

function writeDraft(key: string, form: ProjectFormState, step: number): void {
  if (typeof window === "undefined") return
  try {
    const draft: ProjectSetupDraft = {
      version: 1,
      form: persistedForm(form),
      savedAt: new Date().toISOString(),
    }
    window.localStorage.setItem(key, JSON.stringify(draft))
    window.localStorage.setItem(`${key}:step`, String(step))
  } catch {
    // The setup still works in memory when storage is unavailable.
  }
}

function clearDraft(key: string): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(key)
  window.localStorage.removeItem(`${key}:step`)
}

function discourseAttemptKey(userId: string): string {
  return `qm_discourse_authorization:${userId}`
}

function readDiscourseAttempt(userId: string): PendingDiscourseAuthorization | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(discourseAttemptKey(userId))
    if (!raw) return null
    const attempt = JSON.parse(raw) as PendingDiscourseAuthorization
    if (!attempt.nonce || new Date(attempt.expiresAt).getTime() <= Date.now()) {
      window.localStorage.removeItem(discourseAttemptKey(userId))
      return null
    }
    return attempt
  } catch {
    return null
  }
}

function writeDiscourseAttempt(userId: string, attempt: PendingDiscourseAuthorization | null): void {
  if (typeof window === "undefined") return
  const key = discourseAttemptKey(userId)
  if (attempt) window.localStorage.setItem(key, JSON.stringify(attempt))
  else window.localStorage.removeItem(key)
}

export default function ProjectSetup({ forceNew = false }: { forceNew?: boolean }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, signOut } = useAuth()
  const { currentProject, accountRole, refreshProjects } = usePlatform()
  const activeProject = forceNew ? null : currentProject
  const editing = Boolean(activeProject)
  const isCsm = accountRole === "csm" || activeProject?.settings?.workspaceType === "csm"
  const setupSteps = isCsm ? CSM_SETUP_STEPS : SETUP_STEPS

  const [form, setForm] = useState<ProjectFormState>(DEFAULT_FORM)
  const [currentStep, setCurrentStep] = useState(0)
  const [stepDirection, setStepDirection] = useState<"forward" | "back">("forward")
  const [pending, setPending] = useState(false)
  const [connectingDiscourse, setConnectingDiscourse] = useState(false)
  const [platformGeminiReady, setPlatformGeminiReady] = useState(false)
  const [geminiModel, setGeminiModel] = useState("Gemini Flash-Lite")
  const [extractingGuidelines, setExtractingGuidelines] = useState(false)
  const [importingCommunityGuidelines, setImportingCommunityGuidelines] = useState(false)
  const [syncingChannelGuideline, setSyncingChannelGuideline] = useState("")
  const [syncingAllChannelGuidelines, setSyncingAllChannelGuidelines] = useState(false)
  const [guidelinesFile, setGuidelinesFile] = useState<GuidelinesFileStatus | null>(null)
  const [draggingGuidelines, setDraggingGuidelines] = useState(false)
  const [lookingUpProject, setLookingUpProject] = useState(false)
  const [discourseStatus, setDiscourseStatus] = useState<DiscourseAuthStatus | null>(null)
  const [pendingDiscourseAuthorization, setPendingDiscourseAuthorization] = useState<PendingDiscourseAuthorization | null>(null)
  const [authorizationCode, setAuthorizationCode] = useState("")
  const [verifyingAuthorization, setVerifyingAuthorization] = useState(false)
  const [discourseAccess, setDiscourseAccess] = useState<DiscourseAccessCheckResult | null>(null)
  const [availableChannels, setAvailableChannels] = useState<DiscoursePublicChannel[]>([])
  const [discoveringChannels, setDiscoveringChannels] = useState(false)
  const [activeDraftKey, setActiveDraftKey] = useState("")
  const [categoryUrl, setCategoryUrl] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const guidelinesInputRef = useRef<HTMLInputElement>(null)
  const stepHeadingRef = useRef<HTMLHeadingElement>(null)
  const consumedGuidelineSuggestion = useRef("")

  useEffect(() => {
    if (!user) return

    setPendingDiscourseAuthorization(readDiscourseAttempt(user.id))

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
    setCurrentStep(readDraftStep(key))
    setCategoryUrl(
      draft.categoryId && draft.categorySlug
        ? `${draft.communityBaseUrl.replace(/\/$/, "")}/c/${draft.categorySlug}/${draft.categoryId}`
        : "",
    )
  }, [activeProject, user])

  useEffect(() => {
    if (!activeDraftKey) return
    writeDraft(activeDraftKey, form, currentStep)
  }, [activeDraftKey, currentStep, form])

  useEffect(() => {
    stepHeadingRef.current?.focus()
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [currentStep])

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
    setCurrentStep(3)
    setMessage("Knowledge gap draft added. Complete the verified policy before saving.")
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
  }, [activeDraftKey, location.pathname, location.search, location.state, navigate])

  useEffect(() => {
    if (!user) return

    const params = new URLSearchParams(location.search)
    const discourse = params.get("discourse")
    const callbackMessage = params.get("message")
    if (discourse === "connected") {
      setCurrentStep(2)
      setMessage("Discourse connected successfully.")
    }
    if (discourse === "error") {
      setCurrentStep(2)
      setError(callbackMessage || "Discourse authorization failed. Please try again.")
    }

    api.getDiscourseAuthStatus()
      .then((status) => {
        setDiscourseStatus(status)
        if (status.username) {
          setForm((current) => current.discourseUsername
            ? current
            : { ...current, discourseUsername: status.username })
        }
      })
      .catch(() => undefined)
    api.getConfig()
      .then((config) => {
        setPlatformGeminiReady(config.PLATFORM_GEMINI_CONFIGURED === "true")
        setGeminiModel(config.GEMINI_MODEL || "Gemini Flash-Lite")
      })
      .catch(() => undefined)
  }, [location.search, user])

  const discourseConnected = discourseStatus
    ? discourseStatus.connected
    : Boolean(activeProject?.discourseApiKeyConfigured)

  const connectionReady = Boolean(
    form.discourseApiKey.trim()
    || (discourseConnected && (editing || discourseAccess)),
  )

  const managedChannelOptions = useMemo(() => {
    const savedChannels = Array.isArray(activeProject?.settings?.managedChannels)
      ? activeProject.settings.managedChannels
      : []
    return form.managedChannelIds.map((id) => {
      const discovered = availableChannels.find((channel) => channel.id === id)
      const saved = savedChannels.find((channel) => {
        if (!channel || typeof channel !== "object") return false
        return String((channel as Record<string, unknown>).id || "") === id
      }) as Record<string, unknown> | undefined
      const guideline = form.channelGuidelines.find((item) => item.channelId === id)
      return {
        id,
        title: discovered?.title
          || (typeof saved?.title === "string" ? saved.title : "")
          || guideline?.channelTitle
          || `Channel ${id}`,
      }
    })
  }, [activeProject, availableChannels, form.channelGuidelines, form.managedChannelIds])
  const knowledgeReady = form.projectGuidelines.trim().length >= 100
    || (isCsm && form.channelGuidelines.some((item) => item.text.trim().length >= 100))

  const completedSteps = useMemo(() => [
    Boolean(form.ownerName.trim() && form.projectName.trim() && form.projectKey.trim()),
    Boolean(
      form.communityBaseUrl.trim()
      && (isCsm || form.categoryId.trim())
      && (isCsm ? form.managedChannelIds.length > 0 : form.channelId.trim())
      && form.discourseUsername.trim(),
    ),
    connectionReady,
    knowledgeReady,
    Boolean(form.agentMode)
      && Number.isFinite(Number(form.minConfidence))
      && Number(form.minConfidence) >= 0
      && Number(form.minConfidence) <= 1,
  ], [connectionReady, form, isCsm, knowledgeReady])

  const completedCount = completedSteps.filter(Boolean).length
  const progress = ((currentStep + 1) / setupSteps.length) * 100
  const step = setupSteps[currentStep]

  function update<K extends keyof ProjectFormState>(key: K, value: ProjectFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    if (["communityBaseUrl", "categoryId", "channelId", "discourseApiClientId"].includes(String(key))) {
      setDiscourseAccess(null)
    }
  }

  function validationMessage(stepIndex: number): string {
    if (stepIndex === 0) {
      if (!form.ownerName.trim()) return `Add your ${isCsm ? "CSM" : "QM"} name.`
      if (!form.projectKey.trim()) return "Add the shared Project ID."
      if (!form.projectName.trim()) return "Add the project name."
    }
    if (stepIndex === 1) {
      if (!form.communityBaseUrl.trim()) return "Add the Community base URL."
      try {
        new URL(form.communityBaseUrl)
      } catch {
        return "Enter a valid Community base URL."
      }
      if (!isCsm && !form.categoryId.trim()) return "Add the Community category ID."
      const channelIds = isCsm ? form.managedChannelIds : [form.channelId]
      if (!channelIds.length || channelIds.some((value) => !value.trim())) return "Add at least one Community channel ID."
      if (channelIds.length > 30) return "A CSM workspace can manage up to 30 channels."
      if (channelIds.some((value) => !/^\d+$/.test(value))) return "Every Community channel ID must be numeric."
      if (!form.discourseUsername.trim()) return "Add your Discourse username."
    }
    if (stepIndex === 2) {
      if (!discourseConnected && !form.discourseApiKey.trim()) {
        return "Connect Discourse or use the manual User API Key fallback."
      }
      if (!editing && discourseConnected && !discourseAccess) {
        return "Check category and channel access before continuing."
      }
    }
    if (stepIndex === 3 && !knowledgeReady) {
      return isCsm
        ? "Sync at least one channel guideline or add enough global context for the agent."
        : "Upload or paste enough project context for the agent to answer safely."
    }
    if (stepIndex === 4) {
      const confidence = Number(form.minConfidence)
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        return "Choose a confidence value between 0 and 1."
      }
    }
    return ""
  }

  function goToStep(nextStep: number) {
    const bounded = Math.max(0, Math.min(setupSteps.length - 1, nextStep))
    setStepDirection(bounded >= currentStep ? "forward" : "back")
    setCurrentStep(bounded)
    setError("")
    setMessage("")
  }

  function continueSetup() {
    const problem = validationMessage(currentStep)
    if (problem) {
      setError(problem)
      return
    }
    goToStep(currentStep + 1)
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
        setMessage("New Project ID. You will create its shared configuration.")
        return
      }
      const sharedManagedChannelIds = Array.isArray(project.settings?.managedChannelIds)
        ? project.settings.managedChannelIds.map(String).filter(Boolean)
        : [project.channelId].filter(Boolean)
      setForm((current) => ({
        ...current,
        projectKey: project.projectKey,
        projectName: project.projectName,
        communityBaseUrl: project.communityBaseUrl,
        categoryId: project.categoryId,
        categorySlug: project.categorySlug,
        channelId: project.channelId,
        managedChannelIds: sharedManagedChannelIds,
        projectGuidelines: project.projectGuidelines,
        guidelinesSourceUrl: typeof project.settings?.guidelinesSourceUrl === "string"
          ? project.settings.guidelinesSourceUrl
          : "",
        channelGuidelines: channelGuidelinesFromSettings(project.settings?.channelGuidelines, sharedManagedChannelIds),
        warRoomLink: project.warRoomLink,
        agentMode: project.agentMode,
        autoReplyEnabled: project.autoReplyEnabled,
        minConfidence: String(project.minConfidence),
      }))
      setCategoryUrl(
        project.categoryId && project.categorySlug
          ? `${project.communityBaseUrl.replace(/\/$/, "")}/c/${project.categorySlug}/${project.categoryId}`
          : "",
      )
      setMessage(`Found ${project.projectName}. Shared project information is already filled in.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLookingUpProject(false)
    }
  }

  function extractCategoryUrl() {
    setError("")
    try {
      const parsed = new URL(categoryUrl.trim())
      const match = parsed.pathname.match(/\/c\/([^/]+)\/(\d+)(?:\/|$)/)
      if (!match) throw new Error("Category URL not recognized.")
      setForm((current) => ({
        ...current,
        communityBaseUrl: parsed.origin,
        categorySlug: decodeURIComponent(match[1]),
        categoryId: match[2],
      }))
      setMessage("Category ID and slug extracted from the URL.")
    } catch {
      setError("Paste a category URL like https://community.outlier.ai/c/category-name/123.")
    }
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
      const result = await extractGuidelinesPdf(file)
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
      setMessage(`Guidelines extracted from ${file.name}.`)
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

  async function connectDiscourse() {
    const authWindow = window.open("about:blank", "_blank")
    if (authWindow) {
      try {
        authWindow.document.title = "Connecting Discourse"
      } catch {
        // Navigation still works when the browser restricts access to the new tab.
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
      const attempt = { nonce: result.nonce, expiresAt: result.expiresAt }
      setPendingDiscourseAuthorization(attempt)
      setAuthorizationCode("")
      setDiscourseAccess(null)
      if (user) writeDiscourseAttempt(user.id, attempt)
      setMessage("Authorization opened in a new tab. Authorize the app, then paste the code shown by Community below.")
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

  async function checkDiscourseAccess() {
    setVerifyingAuthorization(true)
    setError("")
    setMessage("")
    try {
      const result = await api.checkDiscourseAccess({
        projectId: activeProject?.id,
        communityBaseUrl: form.communityBaseUrl,
        discourseApiClientId: form.discourseApiClientId,
        categoryId: form.categoryId,
        channelId: form.channelId,
        channelIds: isCsm ? form.managedChannelIds : undefined,
        workspaceType: isCsm ? "csm" : "project",
      })
      setDiscourseAccess(result)
      setDiscourseStatus((current) => ({
        connected: true,
        username: result.username,
        apiVersion: current?.apiVersion || "",
        createdAt: current?.createdAt || "",
        updatedAt: new Date().toISOString(),
      }))
      update("discourseUsername", result.username)
      setMessage(`Connected as ${result.username}. Category and channel access verified.`)
    } catch (err) {
      setDiscourseAccess(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setVerifyingAuthorization(false)
    }
  }

  async function discoverChannels() {
    setDiscoveringChannels(true)
    setError("")
    setMessage("")
    try {
      const result = await api.getDiscourseChannels(activeProject?.id)
      setAvailableChannels(result.channels)
      setMessage(`Found ${result.channels.length} accessible Community channels. Select up to 30.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDiscoveringChannels(false)
    }
  }

  async function importCommunityGuidelines() {
    if (!form.guidelinesSourceUrl.trim()) {
      setError("Paste the Community post URL that contains the instructions.")
      return
    }
    setImportingCommunityGuidelines(true)
    setError("")
    setMessage("")
    try {
      const result = await api.importGuidelinesFromCommunity({
        url: form.guidelinesSourceUrl,
        projectId: activeProject?.id,
        discourseApiClientId: form.discourseApiClientId,
      })
      update("projectGuidelines", result.text)
      setGuidelinesFile(null)
      setMessage(`Imported ${result.characters.toLocaleString()} characters from ${result.title}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setImportingCommunityGuidelines(false)
    }
  }

  async function syncChannelGuideline(channelId: string) {
    const channel = managedChannelOptions.find((item) => item.id === channelId)
    const guideline = form.channelGuidelines.find((item) => item.channelId === channelId)
    if (!guideline?.sourceUrl.trim()) {
      setError(`Add the Community instructions URL for ${channel?.title || channelId}.`)
      return
    }
    setSyncingChannelGuideline(channelId)
    setError("")
    setMessage("")
    try {
      const result = await api.importGuidelinesFromCommunity({
        url: guideline.sourceUrl,
        projectId: activeProject?.id,
        discourseApiClientId: form.discourseApiClientId,
      })
      setForm((current) => ({
        ...current,
        channelGuidelines: current.channelGuidelines.map((item) => item.channelId === channelId ? {
          ...item,
          channelTitle: channel?.title || item.channelTitle,
          sourceUrl: result.sourceUrl,
          sourceTitle: result.title,
          sourceAuthor: result.author,
          text: result.text,
          characters: result.characters,
          syncedAt: new Date().toISOString(),
        } : item),
      }))
      setMessage(`Synced instructions for ${channel?.title || channelId}. Save the project to apply them.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSyncingChannelGuideline("")
    }
  }

  async function syncAllChannelGuidelines() {
    const configured = form.channelGuidelines.filter((item) => item.sourceUrl.trim())
    if (!configured.length) {
      setError("Add at least one Community instructions URL before syncing.")
      return
    }
    setSyncingAllChannelGuidelines(true)
    setError("")
    setMessage("")
    const updates = new Map<string, ChannelGuidelineForm>()
    const failures: string[] = []
    for (const guideline of configured) {
      const channel = managedChannelOptions.find((item) => item.id === guideline.channelId)
      setSyncingChannelGuideline(guideline.channelId)
      try {
        const result = await api.importGuidelinesFromCommunity({
          url: guideline.sourceUrl,
          projectId: activeProject?.id,
          discourseApiClientId: form.discourseApiClientId,
        })
        updates.set(guideline.channelId, {
          ...guideline,
          channelTitle: channel?.title || guideline.channelTitle,
          sourceUrl: result.sourceUrl,
          sourceTitle: result.title,
          sourceAuthor: result.author,
          text: result.text,
          characters: result.characters,
          syncedAt: new Date().toISOString(),
        })
      } catch {
        failures.push(channel?.title || guideline.channelId)
      }
    }
    setForm((current) => ({
      ...current,
      channelGuidelines: current.channelGuidelines.map((item) => updates.get(item.channelId) || item),
    }))
    setSyncingChannelGuideline("")
    setSyncingAllChannelGuidelines(false)
    if (failures.length) setError(`Could not sync: ${failures.join(", ")}. The successful channels are ready to save.`)
    else setMessage(`Synced ${updates.size} channel guidelines. Save the project to apply them.`)
  }

  async function verifyDiscourseAuthorization() {
    if (!pendingDiscourseAuthorization) {
      setError("Authorization expired. Open Community and authorize the app again.")
      return
    }
    setVerifyingAuthorization(true)
    setError("")
    setMessage("")
    try {
      const result = await api.completeDiscourseAuth({
        nonce: pendingDiscourseAuthorization.nonce,
        payload: authorizationCode.trim(),
      })
      setDiscourseStatus({
        connected: true,
        username: result.username,
        apiVersion: result.apiVersion,
        createdAt: "",
        updatedAt: new Date().toISOString(),
      })
      update("discourseUsername", result.username)
      setPendingDiscourseAuthorization(null)
      setAuthorizationCode("")
      if (user) writeDiscourseAttempt(user.id, null)

      const access = await api.checkDiscourseAccess({
        projectId: activeProject?.id,
        communityBaseUrl: form.communityBaseUrl,
        discourseApiClientId: form.discourseApiClientId,
        categoryId: form.categoryId,
        channelId: form.channelId,
        channelIds: isCsm ? form.managedChannelIds : undefined,
        workspaceType: isCsm ? "csm" : "project",
      })
      setDiscourseAccess(access)
      setMessage(`Connected as ${access.username}. Category and channel access verified.`)
    } catch (err) {
      setDiscourseAccess(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setVerifyingAuthorization(false)
    }
  }

  async function submit() {
    const firstInvalidStep = setupSteps.findIndex((_, index) => Boolean(validationMessage(index)))
    if (firstInvalidStep >= 0) {
      goToStep(firstInvalidStep)
      setError(validationMessage(firstInvalidStep))
      return
    }

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
      projectGuidelines: form.projectGuidelines,
      guidelinesSourceName: guidelinesFile?.name,
      guidelinesChangeSummary: guidelinesFile
        ? `Uploaded ${guidelinesFile.name}.`
        : "Updated guidelines in the editor.",
      warRoomLink: form.warRoomLink,
      agentMode: form.agentMode,
      autoReplyEnabled: form.autoReplyEnabled,
      minConfidence: Number(form.minConfidence),
      settings: {
        ...(activeProject?.settings || {}),
        workspaceType: isCsm ? "csm" : "project",
        ...(isCsm ? {
          managedChannelIds: form.managedChannelIds,
          managedChannels: managedChannelOptions.map((channel) => ({ id: channel.id, title: channel.title })),
          guidelinesSourceUrl: form.guidelinesSourceUrl.trim(),
          channelGuidelines: form.channelGuidelines.filter((item) => form.managedChannelIds.includes(item.channelId)),
          dailyThreadEnabled: false,
        } : {}),
      },
    }

    try {
      const result = activeProject
        ? await api.updateProject(activeProject.id, payload)
        : await api.createProject(payload)
      if (activeDraftKey) clearDraft(activeDraftKey)
      projectSelection.setProjectId(result.project.id)
      await refreshProjects()
      navigate("/", { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (currentStep < setupSteps.length - 1) {
      continueSetup()
      return
    }
    void submit()
  }

  let stepContent
  if (currentStep === 0) {
    stepContent = (
      <IdentityStep
        form={form}
        update={update}
        editing={editing}
        lookingUpProject={lookingUpProject}
        onLookupProject={() => void lookupSharedProject()}
        isCsm={isCsm}
      />
    )
  } else if (currentStep === 1) {
    stepContent = (
      <CommunityStep
        form={form}
        update={update}
        categoryUrl={categoryUrl}
        onCategoryUrlChange={setCategoryUrl}
        onExtractCategory={extractCategoryUrl}
        isCsm={isCsm}
        availableChannels={availableChannels}
        discoveringChannels={discoveringChannels}
        onDiscoverChannels={() => void discoverChannels()}
      />
    )
  } else if (currentStep === 2) {
    stepContent = (
      <ConnectionsStep
        form={form}
        update={update}
        discourseConnected={discourseConnected}
        discourseStatus={discourseStatus}
        connectingDiscourse={connectingDiscourse}
        onConnectDiscourse={() => void connectDiscourse()}
        authorizationPending={Boolean(pendingDiscourseAuthorization)}
        authorizationCode={authorizationCode}
        onAuthorizationCodeChange={setAuthorizationCode}
        onVerifyAuthorization={() => void verifyDiscourseAuthorization()}
        verifyingAuthorization={verifyingAuthorization}
        accessVerified={Boolean(discourseAccess)}
        onCheckAccess={() => void checkDiscourseAccess()}
        platformGeminiReady={platformGeminiReady || Boolean(activeProject?.aiProviderConfigured)}
        geminiModel={geminiModel || activeProject?.aiModel || ""}
      />
    )
  } else if (currentStep === 3) {
    stepContent = (
      <KnowledgeStep
        form={form}
        update={update}
        guidelinesFile={guidelinesFile}
        extractingGuidelines={extractingGuidelines}
        draggingGuidelines={draggingGuidelines}
        guidelinesInputRef={guidelinesInputRef}
        onDraggingChange={setDraggingGuidelines}
        onDropFile={dropGuidelinesFile}
        onReadFile={readGuidelinesFile}
        onClearFile={clearGuidelinesFile}
        isCsm={isCsm}
        importingCommunityGuidelines={importingCommunityGuidelines}
        onImportCommunityGuidelines={() => void importCommunityGuidelines()}
        managedChannels={managedChannelOptions}
        syncingChannelId={syncingChannelGuideline}
        syncingAllChannels={syncingAllChannelGuidelines}
        onSyncChannel={(channelId) => void syncChannelGuideline(channelId)}
        onSyncAllChannels={() => void syncAllChannelGuidelines()}
      />
    )
  } else {
    stepContent = (
      <AutomationStep
        form={form}
        update={update}
        completedCount={completedCount}
        totalSteps={setupSteps.length}
        discourseConnected={discourseConnected}
      />
    )
  }

  return (
    <div className={cn(
      "bg-background px-4 pb-24 md:px-6 sm:pb-0",
      editing ? "" : "min-h-screen py-5 sm:py-8",
    )}>
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-6 flex items-center justify-between gap-4 border-b pb-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Community Agent</p>
              <p className="truncate text-xs text-muted-foreground">
                {editing ? `Settings for ${activeProject?.projectName}` : "Project setup"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <Check className="size-3.5 text-success" />
              Draft saved automatically
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => editing || forceNew ? navigate(-1) : void signOut()}
            >
              {editing || forceNew ? <ArrowLeft /> : <LogOut />}
              {editing || forceNew ? "Exit setup" : "Sign out"}
            </Button>
          </div>
        </header>

        <div className="mb-5 lg:hidden">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium">Step {currentStep + 1} of {setupSteps.length}</span>
            <span className="text-muted-foreground">{step.label}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav className="sticky top-6 hidden lg:grid lg:gap-1" aria-label="Project setup steps">
            {setupSteps.map((item, index) => {
              const Icon = item.icon
              const active = index === currentStep
              return (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                    active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  onClick={() => goToStep(index)}
                  aria-current={active ? "step" : undefined}
                >
                  <span className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-md border text-xs font-semibold",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : completedSteps[index]
                        ? "border-success/30 bg-success/10 text-success"
                        : "bg-background",
                  )}>
                    {completedSteps[index] && !active ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
                  </span>
                  <span className="truncate">{item.label}</span>
                </button>
              )
            })}
            <div className="mt-4 border-t px-3 pt-4">
              <p className="text-xs text-muted-foreground">{completedCount} of {setupSteps.length} sections ready</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-success transition-all duration-300"
                  style={{ width: `${(completedCount / setupSteps.length) * 100}%` }}
                />
              </div>
            </div>
          </nav>

          <form onSubmit={handleFormSubmit}>
            <Card className="min-h-[600px] py-0">
              <CardHeader className="border-b bg-muted/25 px-5 py-5 sm:px-8 sm:py-7">
                <div className="flex items-start gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-background text-primary shadow-xs">
                    <step.icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-muted-foreground">{step.eyebrow}</p>
                    <CardTitle
                      ref={stepHeadingRef}
                      tabIndex={-1}
                      className="mt-1 text-xl leading-tight outline-none sm:text-2xl"
                    >
                      {step.title}
                    </CardTitle>
                    <CardDescription className="mt-2 max-w-2xl leading-6">
                      {step.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="flex-1 px-5 py-6 sm:px-8 sm:py-8">
                {error ? (
                  <Alert className="mb-5" variant="destructive">
                    <CircleAlert className="absolute left-4 top-3.5 size-4" />
                    <div className="pl-6">
                      <AlertTitle>Check this section</AlertTitle>
                      <AlertDescription>{error}</AlertDescription>
                    </div>
                  </Alert>
                ) : null}
                {message ? (
                  <Alert className="mb-5 border-success/30 bg-success/5 text-foreground">
                    <Check className="absolute left-4 top-3.5 size-4 text-success" />
                    <div className="pl-6">
                      <AlertTitle>Done</AlertTitle>
                      <AlertDescription>{message}</AlertDescription>
                    </div>
                  </Alert>
                ) : null}

                <div
                  key={`${currentStep}-${stepDirection}`}
                  className={cn(
                    "onboarding-step-enter",
                    stepDirection === "back" && "onboarding-step-enter-back",
                  )}
                >
                  {stepContent}
                </div>
              </CardContent>

              <CardFooter className="fixed inset-x-0 bottom-0 z-50 justify-between gap-3 border-t bg-background px-5 py-4 shadow-[0_-4px_12px_hsl(222_47%_11%/0.06)] sm:sticky sm:inset-x-auto sm:rounded-b-lg sm:px-8">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => goToStep(currentStep - 1)}
                  disabled={currentStep === 0 || pending}
                >
                  <ArrowLeft />
                  Back
                </Button>
                {currentStep < setupSteps.length - 1 ? (
                  <Button type="submit">
                    Continue
                    <ArrowRight />
                  </Button>
                ) : (
                  <Button type="submit" disabled={pending}>
                    {pending ? <LoaderCircle className="animate-spin" /> : <Check />}
                    {editing ? "Save changes" : "Create project"}
                  </Button>
                )}
              </CardFooter>
            </Card>
          </form>
        </div>
      </div>
    </div>
  )
}
