import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowRight,
  AlertTriangle,
  Bot,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  FileText,
  MessagesSquare,
  Settings,
} from "lucide-react"

import { api, type DailySummaryResult, type PreviewData, type Topic, type Webinar } from "@/api"
import Preview from "@/components/Preview"
import PublishButton from "@/components/PublishButton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { usePlatform } from "@/platform"

function NextWebinarCard({ webinar }: { webinar: Webinar }) {
  const dt = new Date(`${webinar.date}T${webinar.timeUtc}:00Z`)
  const diffMs = dt.getTime() - Date.now()
  const diffH = Math.floor(diffMs / 1000 / 60 / 60)
  const diffD = Math.floor(diffH / 24)
  const timeLeft = diffD > 0 ? `in ${diffD}d ${diffH % 24}h` : diffH > 0 ? `in ${diffH}h` : "soon"

  return (
    <Card className="py-0 shadow-xs">
      <CardContent className="space-y-2 p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Next session</p>
          <Badge variant="secondary">{timeLeft}</Badge>
        </div>
        <p className="font-semibold text-foreground">{webinar.title}</p>
        <p className="text-sm text-muted-foreground">{webinar.date} · {webinar.timeLabel}</p>
        <a href={webinar.link} target="_blank" rel="noopener" className="block truncate text-xs text-primary hover:underline">
          Open session link
        </a>
      </CardContent>
    </Card>
  )
}

function OperationMetric({
  icon: Icon,
  label,
  value,
  detail,
  onClick,
}: {
  icon: typeof FileText
  label: string
  value: string | number
  detail: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 items-start gap-3 p-4 text-left transition-colors hover:bg-muted/50"
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-background">
        <Icon className="size-4 text-primary" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-muted-foreground">{label}</span>
        <span className="mt-0.5 block truncate text-lg font-semibold text-foreground">{value}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
    </button>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { currentProject } = usePlatform()
  const [date, setDate] = useState("")
  const [topic, setTopic] = useState<Topic | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [allTopics, setAllTopics] = useState<Topic[]>([])
  const [webinars, setWebinars] = useState<Webinar[]>([])
  const [summary, setSummary] = useState<DailySummaryResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<"thread" | "announcement">("thread")

  useEffect(() => {
    Promise.all([
      api.getToday(),
      api.getWebinars().catch(() => []),
      api.getTopics().catch(() => []),
      api.getDailySummary().catch(() => null),
    ]).then(([today, wbns, topics, dailySummary]) => {
      setDate(today.date)
      setTopic(today.topic)
      setWebinars(wbns)
      setAllTopics(topics)
      setSummary(dailySummary)
      if (today.topic) {
        api.getPreview(today.date).then(setPreview).catch(() => {})
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const nextWebinar = webinars
    .filter((w) => new Date(`${w.date}T${w.timeUtc}:00Z`) > new Date())
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  const upcomingTopics = allTopics.filter((item) => item.date >= date).length
  const needsAttention = (summary?.totals.communityNeedsHuman || 0) + (summary?.totals.dmNeedsHuman || 0)
  const repliesToday = (summary?.totals.communityRepliesPosted || 0) + (summary?.totals.dmAutoReplies || 0)

  const readiness = [
    { label: "Community target", ready: Boolean(currentProject?.categoryId && currentProject.channelId) },
    { label: "Discourse", ready: Boolean(currentProject?.discourseApiKeyConfigured) },
    { label: "Platform AI", ready: Boolean(currentProject?.aiProviderConfigured) },
    { label: "Guidelines", ready: Boolean(currentProject?.projectGuidelinesCharacters) },
  ]
  const readyCount = readiness.filter((item) => item.ready).length

  if (loading) {
    return (
      <div className="space-y-5 px-4 lg:px-6" aria-label="Loading dashboard">
        <div className="space-y-2"><Skeleton className="h-7 w-44" /><Skeleton className="h-4 w-64" /></div>
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold text-foreground">Today</h2>
            <Badge variant={currentProject?.enabled ? "secondary" : "outline"}>
              {currentProject?.status || (currentProject?.enabled ? "active" : "paused")}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <Button type="button" onClick={() => navigate("/agent")}>
          <Bot className="size-4" />
          Open inbox
        </Button>
      </div>

      <div className="px-4 lg:px-6">
        <section className="grid overflow-hidden rounded-lg border bg-card shadow-xs sm:grid-cols-2 lg:grid-cols-4 sm:[&>*:nth-child(even)]:border-l lg:[&>*]:border-l lg:[&>*:first-child]:border-l-0 [&>*:nth-child(n+3)]:border-t lg:[&>*]:border-t-0">
          <OperationMetric
            icon={FileText}
            label="Today's thread"
            value={topic ? "Ready" : "Missing"}
            detail={date || "Calendar not loaded"}
            onClick={() => navigate("/topics")}
          />
          <OperationMetric
            icon={CalendarDays}
            label="Content queue"
            value={upcomingTopics}
            detail="upcoming topics"
            onClick={() => navigate("/topics")}
          />
          <OperationMetric
            icon={MessagesSquare}
            label="Needs attention"
            value={needsAttention}
            detail="Community and DMs"
            onClick={() => navigate("/review")}
          />
          <OperationMetric
            icon={CheckCircle2}
            label="Replies today"
            value={repliesToday}
            detail={`${summary?.totals.runs || 0} automation runs`}
            onClick={() => navigate("/summary")}
          />
        </section>
      </div>

      {readyCount < readiness.length ? (
        <div className="px-4 lg:px-6">
          <div className="flex flex-col gap-4 rounded-lg border border-amber-200 bg-amber-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-semibold">{readiness.length - readyCount} setup item{readiness.length - readyCount === 1 ? "" : "s"} need attention</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {readiness.filter((item) => !item.ready).map((item) => (
                  <span key={item.label} className="text-xs text-amber-800">
                    Missing: {item.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/project")} className="bg-background">
              <Settings className="size-4" />
              Complete setup
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-4 px-4 lg:px-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          {topic ? (
            <Card className="shadow-xs">
              <CardContent className="p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Today's thread</p>
                    <h2 className="text-xl font-semibold text-foreground">{preview?.title || topic.title}</h2>
                    <p className="text-sm leading-6 text-muted-foreground">{topic.topic}</p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {(topic.tags || []).map((tag) => (
                        <Badge key={tag} variant="secondary">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <PublishButton date={date} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Alert variant="warning" className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" />
              <div>
                <AlertTitle>No topic for today ({date})</AlertTitle>
                <AlertDescription>The publisher will use the next available topic as fallback.</AlertDescription>
                <Button onClick={() => navigate("/topics")} variant="link" className="mt-2 h-auto p-0">Create today's topic</Button>
              </div>
            </Alert>
          )}

          <aside className="space-y-4">
            <Card className="py-0 shadow-xs">
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Today's activity</p>
                  <Badge variant={summary?.status === "attention" ? "destructive" : "secondary"}>
                    {summary?.status || "quiet"}
                  </Badge>
                </div>
                <p className="mt-3 text-sm font-medium text-foreground">{summary?.headline || "No activity recorded yet."}</p>
                {summary?.highlights.length ? (
                  <div className="mt-3 space-y-2">
                    {summary.highlights.slice(0, 3).map((highlight) => (
                      <p key={highlight} className="text-xs leading-5 text-muted-foreground">{highlight}</p>
                    ))}
                  </div>
                ) : null}
                <Button variant="link" className="mt-3 h-auto p-0" onClick={() => navigate("/summary")}>
                  View daily summary
                  <ArrowRight />
                </Button>
              </CardContent>
            </Card>
            {nextWebinar ? <NextWebinarCard webinar={nextWebinar} /> : null}
          </aside>
        </div>

        {topic && preview ? (
          <Tabs value={tab} onValueChange={(value) => setTab(value as "thread" | "announcement")} className="gap-3">
            <TabsList>
              <TabsTrigger value="thread">Thread preview</TabsTrigger>
              <TabsTrigger value="announcement">Announcement</TabsTrigger>
            </TabsList>
            <TabsContent value="thread" className={cn(tab !== "thread" && "hidden")}>
              <Preview content={preview.thread} label="Daily thread" />
            </TabsContent>
            <TabsContent value="announcement" className={cn(tab !== "announcement" && "hidden")}>
              <Preview content={preview.announcement} label="Chat announcement" />
            </TabsContent>
          </Tabs>
        ) : null}
      </div>
    </div>
  )
}
