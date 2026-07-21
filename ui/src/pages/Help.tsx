import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleHelp,
  KeyRound,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
} from "lucide-react"

import { usePlatform } from "@/platform"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { navigationGroups, onboardingChecklist, workspaceGuides } from "@/lib/workspace-guides"

const workflows = [
  {
    title: "Set up a project",
    description: "Connect Community, add your AI key, and give the agent reliable project context.",
    href: "/project",
    label: "Open project setup",
    icon: Settings,
  },
  {
    title: "Run the daily workflow",
    description: "Confirm today's topic, review messages, and clear the human review queue.",
    href: "/",
    label: "Open dashboard",
    icon: CheckCircle2,
  },
  {
    title: "Test before automating",
    description: "Use realistic messages to inspect the agent's answer, confidence, and evidence.",
    href: "/sandbox",
    label: "Open sandbox",
    icon: ShieldCheck,
  },
]

const troubleshooting = [
  {
    issue: "A daily thread did not publish",
    checks: ["Confirm the project is Active.", "Check that today's topic exists.", "Open Settings and compare scheduler status with the app operation."],
    href: "/settings",
  },
  {
    issue: "The agent did not reply",
    checks: ["Confirm Discourse and Claude are connected.", "Check the response mode and confidence threshold.", "Open Review Queue for a human-review decision."],
    href: "/review",
  },
  {
    issue: "The answer is vague or escalated",
    checks: ["Add the missing verified fact to Project Memory.", "Upload the latest guidelines PDF.", "Retest the message in Sandbox."],
    href: "/memory",
  },
  {
    issue: "A teammate sees different project data",
    checks: ["Compare the exact Project ID.", "Confirm both QMs selected the same project.", "Remember that personal API keys are intentionally separate."],
    href: "/projects",
  },
]

export default function Help() {
  const { currentProject } = usePlatform()
  const [query, setQuery] = useState("")

  const filteredGuides = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return workspaceGuides.filter((guide) => {
      if (guide.path === "/help") return false
      if (!normalized) return true
      return `${guide.title} ${guide.description} ${guide.group}`.toLowerCase().includes(normalized)
    })
  }, [query])

  const readiness = [
    Boolean(currentProject?.categoryId && currentProject.channelId),
    Boolean(currentProject?.discourseApiKeyConfigured && currentProject?.anthropicApiKeyConfigured),
    Boolean(currentProject?.projectGuidelinesCharacters),
    Boolean(currentProject?.agentMode && Number.isFinite(currentProject.minConfidence)),
  ]
  const readyCount = readiness.filter(Boolean).length

  return (
    <div className="space-y-8 px-4 lg:px-6">
      <section className="grid gap-6 border-b pb-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
        <div className="max-w-3xl">
          <div className="mb-3 flex items-center gap-2">
            <Badge variant="secondary">QM guide</Badge>
            <span className="text-xs text-muted-foreground">Project-aware instructions</span>
          </div>
          <h2 className="text-3xl font-semibold text-foreground">What do you need to do?</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Follow a workflow or search for a module. Every workspace page also has a Guide button with instructions for that specific task.
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-11 bg-background pl-9"
            placeholder="Search modules and tasks"
            aria-label="Search help"
          />
        </div>
      </section>

      {!query ? (
        <>
          <section>
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Start with a workflow</h2>
              <p className="mt-1 text-sm text-muted-foreground">Choose the outcome you are working toward.</p>
            </div>
            <div className="grid overflow-hidden rounded-lg border md:grid-cols-3">
              {workflows.map(({ title, description, href, label, icon: Icon }, index) => (
                <Link
                  key={title}
                  to={href}
                  className={`group bg-background p-5 transition-colors hover:bg-muted/60 ${index > 0 ? "border-t md:border-l md:border-t-0" : ""}`}
                >
                  <div className="flex size-9 items-center justify-center rounded-lg border bg-muted">
                    <Icon className="size-4" />
                  </div>
                  <h3 className="mt-5 text-sm font-semibold">{title}</h3>
                  <p className="mt-2 min-h-10 text-sm leading-5 text-muted-foreground">{description}</p>
                  <span className="mt-5 flex items-center gap-2 text-sm font-medium text-foreground">
                    {label}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-lg border bg-background p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">First-time checklist</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Complete these foundations before enabling automatic replies.</p>
                </div>
                <Badge variant={readyCount === readiness.length ? "secondary" : "outline"}>{readyCount} of 4 ready</Badge>
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted" aria-label={`${readyCount} of 4 setup checks complete`}>
                <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${(readyCount / readiness.length) * 100}%` }} />
              </div>
              <div className="mt-6 divide-y">
                {onboardingChecklist.map(({ label, description, icon: Icon }, index) => (
                  <div key={label} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className={`flex size-8 items-center justify-center rounded-md border ${readiness[index] ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                      {readiness[index] ? <CheckCircle2 className="size-4" /> : <Icon className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{readiness[index] ? "Ready" : "To do"}</span>
                  </div>
                ))}
              </div>
              <Button asChild className="mt-6">
                <Link to="/project">Continue setup <ArrowRight className="size-4" /></Link>
              </Button>
            </div>

            <aside className="rounded-lg border bg-muted/35 p-6">
              <Sparkles className="size-5" />
              <h2 className="mt-4 text-lg font-semibold">How the agent decides</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                It answers only when project context supports the response and the confidence policy allows it. Unsupported, sensitive, or ambiguous requests go to a QM.
              </p>
              <Separator className="my-5" />
              <div className="space-y-3 text-sm">
                <div className="flex gap-2.5"><KeyRound className="mt-0.5 size-4 shrink-0" /><span>Your API keys stay tied to your QM account.</span></div>
                <div className="flex gap-2.5"><Bot className="mt-0.5 size-4 shrink-0" /><span>Project content is shared through the Project ID.</span></div>
                <div className="flex gap-2.5"><ShieldCheck className="mt-0.5 size-4 shrink-0" /><span>Sandbox tests never publish a message.</span></div>
              </div>
            </aside>
          </section>
        </>
      ) : null}

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{query ? "Search results" : "Module directory"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Open a module to continue, then use its contextual guide when needed.</p>
          </div>
          {query ? <span className="text-xs text-muted-foreground">{filteredGuides.length} results</span> : null}
        </div>

        {filteredGuides.length ? (
          <div className="overflow-hidden rounded-lg border bg-background">
            {navigationGroups.map((group) => {
              const items = filteredGuides.filter((guide) => guide.group === group)
              if (!items.length) return null
              return (
                <div key={group} className="border-b last:border-b-0">
                  <div className="bg-muted/50 px-4 py-2 text-xs font-semibold uppercase text-muted-foreground">{group}</div>
                  <div className="divide-y">
                    {items.map((guide) => (
                      <Link key={guide.path} to={guide.path} className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-muted/50">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background"><guide.icon className="size-4" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{guide.title}</p>
                          <p className="mt-0.5 truncate text-sm text-muted-foreground">{guide.description}</p>
                        </div>
                        <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center">
            <CircleHelp className="size-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No matching guide</p>
            <p className="mt-1 text-sm text-muted-foreground">Try a module name such as Topics, DMs, or Settings.</p>
          </div>
        )}
      </section>

      {!query ? (
        <section>
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Troubleshooting</h2>
            <p className="mt-1 text-sm text-muted-foreground">Start with these checks before changing credentials or schedules.</p>
          </div>
          <div className="overflow-hidden rounded-lg border bg-background">
            {troubleshooting.map(({ issue, checks, href }, index) => (
              <details key={issue} className={index > 0 ? "border-t" : ""}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-medium hover:bg-muted/50">
                  {issue}
                  <CircleHelp className="size-4 text-muted-foreground" />
                </summary>
                <div className="border-t bg-muted/25 px-5 py-4">
                  <ol className="space-y-2">
                    {checks.map((check, checkIndex) => <li key={check} className="text-sm text-muted-foreground">{checkIndex + 1}. {check}</li>)}
                  </ol>
                  <Button asChild variant="link" className="mt-3 h-auto p-0"><Link to={href}>Open related module <ArrowRight className="size-4" /></Link></Button>
                </div>
              </details>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
