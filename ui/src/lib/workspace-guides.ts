import type { LucideIcon } from "lucide-react"
import {
  Activity,
  Bot,
  CalendarDays,
  CircleHelp,
  ClipboardCheck,
  Database,
  FileText,
  FolderKanban,
  History,
  Inbox,
  LayoutDashboard,
  Link2,
  MessageSquareText,
  PenLine,
  ScrollText,
  Settings,
  SlidersHorizontal,
  TestTube2,
  Users,
  ChartNoAxesCombined,
} from "lucide-react"

export interface WorkspaceGuide {
  path: string
  title: string
  shortTitle: string
  description: string
  group: "Overview" | "Inbox" | "Content" | "Project" | "System"
  icon: LucideIcon
  steps: string[]
  tips: string[]
}

export const workspaceGuides: WorkspaceGuide[] = [
  {
    path: "/",
    title: "Project dashboard",
    shortTitle: "Dashboard",
    description: "See today's publishing status, project readiness, and the next actions that need attention.",
    group: "Overview",
    icon: LayoutDashboard,
    steps: ["Confirm today's topic is ready.", "Review project and agent status.", "Open the inbox or publish the prepared thread."],
    tips: ["A missing topic blocks a predictable daily thread.", "Use Project Health when a connection is not ready."],
  },
  {
    path: "/agent",
    title: "Community inbox",
    shortTitle: "Community",
    description: "Review channel messages, generated replies, confidence, and items that need a QM.",
    group: "Inbox",
    icon: Bot,
    steps: ["Run a scan or open the latest result.", "Review each thread and its proposed action.", "Send safe replies or move uncertain items to review."],
    tips: ["Answered means the thread already contains a reply.", "Ignored items include announcements and messages that do not need support."],
  },
  {
    path: "/dms",
    title: "Direct messages",
    shortTitle: "Direct messages",
    description: "Review today's private conversations with the same response policy used by the Community agent.",
    group: "Inbox",
    icon: Inbox,
    steps: ["Scan the current day.", "Open the full conversation before replying.", "Escalate sensitive or unsupported requests."],
    tips: ["The scan is limited to recent DM channels to control API usage.", "Private information should always stay in human review."],
  },
  {
    path: "/review",
    title: "Human review queue",
    shortTitle: "Review queue",
    description: "Resolve low-confidence, sensitive, or context-limited messages without losing track of them.",
    group: "Inbox",
    icon: ClipboardCheck,
    steps: ["Start with high-priority items.", "Review the source message and proposed answer.", "Resolve, dismiss, or add the missing project context."],
    tips: ["Repeated escalations often reveal a gap in project guidelines.", "A resolved item remains available in history."],
  },
  {
    path: "/summary",
    title: "Daily summary",
    shortTitle: "Daily summary",
    description: "Review what the automations checked, answered, skipped, and escalated during the selected day.",
    group: "Inbox",
    icon: Activity,
    steps: ["Choose the date.", "Review Community and DM totals.", "Follow up on pending or escalated items."],
    tips: ["Use this view at the end of the shift.", "Run History contains the technical details behind each total."],
  },
  {
    path: "/topics",
    title: "Daily thread topics",
    shortTitle: "Topics",
    description: "Maintain the dated topic calendar used to generate and publish daily threads.",
    group: "Content",
    icon: FileText,
    steps: ["Add or import dated topics.", "Preview the final thread text.", "Publish manually only when needed."],
    tips: ["Use the JSON example before importing a large calendar.", "Duplicate dates are validated before saving."],
  },
  {
    path: "/comms",
    title: "Project communications",
    shortTitle: "Comms",
    description: "Create reusable project messages and schedule or publish them with preserved formatting.",
    group: "Content",
    icon: MessageSquareText,
    steps: ["Choose a template or create a custom comm.", "Complete its variables and review the preview.", "Send now or schedule for later."],
    tips: ["Custom templates are shared by Project ID.", "Line breaks in the editor are preserved when publishing."],
  },
  {
    path: "/composer",
    title: "Message composer",
    shortTitle: "Composer",
    description: "Generate a polished one-off message from an objective, audience, tone, and channel.",
    group: "Content",
    icon: PenLine,
    steps: ["Describe the message objective.", "Select tone, audience, and length.", "Generate, edit, then publish or copy the result."],
    tips: ["Include exact facts the model must preserve.", "Review dates, links, and policy claims before sending."],
  },
  {
    path: "/webinars",
    title: "Sessions",
    shortTitle: "Sessions",
    description: "Schedule webinars, war rooms, and project sessions with their links and invitees.",
    group: "Content",
    icon: CalendarDays,
    steps: ["Add the session date and time.", "Attach the meeting link and invitees.", "Review upcoming sessions on the dashboard."],
    tips: ["Times are displayed in the workspace timezone.", "Remove expired sessions to keep the schedule focused."],
  },
  {
    path: "/projects",
    title: "Projects",
    shortTitle: "Projects",
    description: "Switch, pause, archive, restore, import, or export the projects connected to your QM account.",
    group: "Project",
    icon: FolderKanban,
    steps: ["Select the project you want to operate.", "Check its credentials and status.", "Pause or archive it when automation must stop."],
    tips: ["QMs using the same Project ID share project content.", "Discourse access remains private to each QM. Gemini is provided by the platform."],
  },
  {
    path: "/project",
    title: "Project setup",
    shortTitle: "Project setup",
    description: "Manage Community identifiers, personal Discourse access, and the project's knowledge source.",
    group: "Project",
    icon: SlidersHorizontal,
    steps: ["Connect your own Discourse account.", "Verify category, channel, and username.", "Upload current guidelines and choose an agent policy."],
    tips: ["Use the same Project ID as your teammates.", "Connect only Discourse. Gemini is included automatically and does not require a personal key."],
  },
  {
    path: "/memory",
    title: "Project memory",
    shortTitle: "Project memory",
    description: "Maintain concise facts and decisions that help the agent answer recurring project questions.",
    group: "Project",
    icon: Database,
    steps: ["Review existing facts.", "Add verified project decisions or policies.", "Remove stale information after a project change."],
    tips: ["Keep each fact atomic and explicit.", "Use guidelines for long-form source documents."],
  },
  {
    path: "/guidelines",
    title: "Guidelines history",
    shortTitle: "Guidelines history",
    description: "Compare project guideline versions, see who changed them, and restore a trusted previous version.",
    group: "Project",
    icon: ScrollText,
    steps: ["Select a saved version.", "Compare it with the current project guidelines.", "Restore only after reviewing the removed and added content."],
    tips: ["Every saved guidelines change creates a version automatically.", "Restoring a version creates a new audit entry instead of deleting history."],
  },
  {
    path: "/links",
    title: "Project links",
    shortTitle: "Links",
    description: "Maintain the trusted URLs available to templates, daily threads, and agent responses.",
    group: "Project",
    icon: Link2,
    steps: ["Add a descriptive label.", "Paste the canonical URL.", "Remove links that are no longer valid."],
    tips: ["Only trusted project links should be available to the agent.", "Use clear labels such as War Room or Project Guide."],
  },
  {
    path: "/quality",
    title: "Quality dashboard",
    shortTitle: "Quality",
    description: "Measure response coverage, escalations, human resolution, errors, and AI usage for the active project.",
    group: "System",
    icon: ChartNoAxesCombined,
    steps: ["Choose a reporting window.", "Compare replies and escalations over time.", "Follow the recommended next actions."],
    tips: ["A high escalation rate often points to missing project context.", "Use Run Details to diagnose recurring errors."],
  },
  {
    path: "/settings",
    title: "Settings and health",
    shortTitle: "Settings",
    description: "Control project automation policy and diagnose credentials, schedules, usage, and cron execution.",
    group: "System",
    icon: Settings,
    steps: ["Check Project Health first.", "Review the automation schedule and permissions.", "Inspect cron status and AI usage."],
    tips: ["A paused or completed project cannot run automations.", "Warnings explain configuration gaps; they are not always failed runs."],
  },
  {
    path: "/history",
    title: "Publishing history",
    shortTitle: "History",
    description: "Review previously generated and published daily threads and announcements.",
    group: "System",
    icon: History,
    steps: ["Find the relevant date.", "Open its published content.", "Use Run Details for technical execution data."],
    tips: ["History is scoped to the active project.", "Switch projects from the header before searching."],
  },
  {
    path: "/runs",
    title: "Automation runs",
    shortTitle: "Run details",
    description: "Inspect scheduler checks, application outcomes, counts, and errors for each automated job.",
    group: "System",
    icon: ScrollText,
    steps: ["Filter by status or job.", "Compare scheduler and app outcomes.", "Open errors to identify the failing dependency."],
    tips: ["Skipped can be an expected result, such as an already-published thread.", "The last successful app operation is more useful than scheduler status alone."],
  },
  {
    path: "/sandbox",
    title: "Testing sandbox",
    shortTitle: "Sandbox",
    description: "Test how the agent classifies and answers a message without posting it to Community.",
    group: "System",
    icon: TestTube2,
    steps: ["Paste a realistic message.", "Run the model with the current project context.", "Review action, confidence, answer, and evidence."],
    tips: ["Use this before enabling automatic replies.", "Test policy-sensitive and ambiguous examples, not only easy questions."],
  },
  {
    path: "/help",
    title: "Help center",
    shortTitle: "Help",
    description: "Follow task-based guides for setup, daily operations, automation, and troubleshooting.",
    group: "System",
    icon: CircleHelp,
    steps: ["Choose the task you are trying to complete.", "Follow the linked workflow.", "Use Project Health when a workflow is blocked."],
    tips: ["The Guide button in every page opens instructions for that specific module.", "Project setup explains where to find each Community identifier."],
  },
]

export function guideForPath(pathname: string): WorkspaceGuide {
  if (pathname === "/projects/new") {
    return {
      ...workspaceGuides.find((guide) => guide.path === "/project")!,
      path: pathname,
      title: "Add project",
      shortTitle: "Add project",
      description: "Connect a new project or join an existing shared Project ID.",
    }
  }
  return workspaceGuides.find((guide) => guide.path === pathname)
    || workspaceGuides.find((guide) => guide.path === "/")!
}

export const navigationGroups = ["Overview", "Inbox", "Content", "Project", "System"] as const

export function guidesForGroup(group: WorkspaceGuide["group"]): WorkspaceGuide[] {
  return workspaceGuides.filter((guide) => guide.group === group && guide.path !== "/help")
}

export const onboardingChecklist = [
  { label: "Project identity", description: "Project ID, name, category and channel", icon: FolderKanban },
  { label: "Community connection", description: "Private Discourse access and managed Gemini", icon: Users },
  { label: "Project knowledge", description: "Guidelines, links and key facts", icon: FileText },
  { label: "Automation policy", description: "Mode, confidence and response rules", icon: Bot },
]
