import { Link } from "react-router-dom"
import {
  Bot,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileText,
  KeyRound,
  LifeBuoy,
  Link2,
  MessageSquareText,
  PencilLine,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const setupSteps = [
  {
    title: "Create or select a project",
    body: "Use the Project ID shared by the QMs working on the same community project. This links common project information like guidelines, links, topics, and templates.",
    href: "/project",
    cta: "Project Settings",
    Icon: ClipboardList,
  },
  {
    title: "Connect Discourse",
    body: "Connect your own Outlier Community account. The Discourse API key belongs to the QM, not to the project.",
    href: "/project",
    cta: "Connect Discourse",
    Icon: KeyRound,
  },
  {
    title: "Add your Claude key",
    body: "Add your own Anthropic API key and daily limits. Claude usage is isolated by QM so another user cannot spend your key.",
    href: "/project",
    cta: "AI Settings",
    Icon: ShieldCheck,
  },
  {
    title: "Upload project context",
    body: "Paste guidelines or upload files so the agent can answer with project-specific information instead of guessing.",
    href: "/memory",
    cta: "Project Memory",
    Icon: FileText,
  },
]

const modules = [
  {
    name: "Dashboard",
    path: "/",
    purpose: "Daily overview, today's thread, quick actions, and publish status.",
    Icon: ClipboardList,
  },
  {
    name: "Topics",
    path: "/topics",
    purpose: "Create, edit, or import the topic calendar used by daily threads.",
    Icon: FileText,
  },
  {
    name: "Comms",
    path: "/comms",
    purpose: "Create reusable communication templates and generate messages from structured variables.",
    Icon: MessageSquareText,
  },
  {
    name: "Composer",
    path: "/composer",
    purpose: "Generate one-off messages from a description, tone, audience, and channel.",
    Icon: PencilLine,
  },
  {
    name: "Community Agent",
    path: "/agent",
    purpose: "Review community messages, draft answers, auto-reply when confidence is high, or route to a human.",
    Icon: Bot,
  },
  {
    name: "DM Review",
    path: "/dms",
    purpose: "Scan today's direct messages for the current QM and apply the same answer policy as community messages.",
    Icon: Users,
  },
  {
    name: "Review Queue",
    path: "/review",
    purpose: "See items that need human approval, low-confidence cases, or messages the agent should not answer alone.",
    Icon: LifeBuoy,
  },
  {
    name: "Settings",
    path: "/settings",
    purpose: "Check automation health, schedules in PST, AI usage, and environment configuration.",
    Icon: Settings,
  },
]

const operatingFlow = [
  "Start in Dashboard to confirm today's topic and overall status.",
  "Use Topics when daily threads need calendar changes or JSON imports.",
  "Use Project Memory when the agent lacks context or starts routing too many items to human review.",
  "Use Community Agent and DM Review to inspect what the agent found, drafted, posted, or ignored.",
  "Use Review Queue at least once per day to clear uncertain cases.",
  "Use Settings to confirm crons are firing and to monitor Claude usage.",
]

const safetyRules = [
  "The agent answers only when the available project context supports the response.",
  "Low-confidence or policy-sensitive messages are routed to a human instead of being posted automatically.",
  "The bot must answer in English and should not invent schedules, links, eligibility rules, or project policies.",
  "Community and DM automation use the active QM's Discourse and Anthropic credentials.",
  "Project ID is shared across QMs, but API keys remain owned by each QM.",
]

const troubleshooting = [
  {
    issue: "Daily thread did not publish",
    fix: "Open Settings, check Cron Health, then confirm today's topic exists and the job was not skipped by PST date rules.",
  },
  {
    issue: "Agent is not replying",
    fix: "Check Project Settings for agent mode, Claude key, Discourse connection, confidence threshold, and auto-reply toggles.",
  },
  {
    issue: "Responses are too vague",
    fix: "Add better Project Memory and guidelines. The agent should ask for human review when context is missing.",
  },
  {
    issue: "A QM sees empty project data",
    fix: "Confirm the Project ID matches the shared project ID used by the other QMs.",
  },
]

export default function Help() {
  return (
    <div className="space-y-6 px-4 lg:px-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="max-w-3xl">
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="secondary">User Guide</Badge>
            <Badge variant="outline">QM workspace</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">How to use the Community Agent</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A practical guide for setting up a project, operating daily comms, and knowing when the agent will answer or escalate.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/project">
            <Settings className="size-4" />
            Open setup
          </Link>
        </Button>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">First-Time Setup</h2>
          <p className="text-sm text-muted-foreground">Complete these once before relying on automation.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {setupSteps.map(({ title, body, href, cta, Icon }) => (
            <Card key={title} className="shadow-xs">
              <CardHeader className="gap-2">
                <Icon className="size-5 text-primary" />
                <CardTitle className="text-base">{title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{body}</p>
                <Button asChild variant="link" className="h-auto p-0">
                  <Link to={href}>{cta}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarClock className="size-5 text-primary" />
              Daily Operating Flow
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {operatingFlow.map((item, index) => (
                <li key={item} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-muted text-xs font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="text-sm text-foreground">{item}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="size-5 text-primary" />
              Agent Safety Rules
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {safetyRules.map((rule) => (
              <div key={rule} className="flex gap-3">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="text-sm text-foreground">{rule}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Module Map</h2>
          <p className="text-sm text-muted-foreground">Use this as the fastest way to decide where to go.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {modules.map(({ name, path, purpose, Icon }) => (
            <Link
              key={name}
              to={path}
              className="rounded-lg border bg-card p-4 shadow-xs transition-colors hover:bg-muted"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">{name}</h3>
                </div>
                <Link2 className="size-4 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">{purpose}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Troubleshooting</h2>
          <p className="text-sm text-muted-foreground">Common issues and the first place to check.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {troubleshooting.map(({ issue, fix }) => (
            <Card key={issue} className="shadow-xs">
              <CardHeader>
                <CardTitle className="text-base">{issue}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{fix}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}
