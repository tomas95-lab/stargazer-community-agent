import { useEffect, useState } from "react"
import type { ComponentType } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowRight,
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleAlert,
  FileText,
  Link2,
  MessageSquareText,
  PencilLine,
  Target,
  Settings,
} from "lucide-react"

import { api, type PreviewData, type Topic, type Webinar } from "@/api"
import Preview from "@/components/Preview"
import PublishButton from "@/components/PublishButton"
import { SectionCards } from "@/components/section-cards"
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
    <div className="px-4 lg:px-6">
      <Card className="border-blue-200 bg-blue-50/70 shadow-xs">
        <CardContent className="space-y-2 p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase text-blue-700">Next Session</p>
            <Badge variant="secondary">{timeLeft}</Badge>
          </div>
          <p className="font-semibold text-foreground">{webinar.title}</p>
          <p className="text-sm text-muted-foreground">{webinar.date} - {webinar.timeLabel}</p>
          <a href={webinar.link} target="_blank" rel="noopener" className="block truncate text-xs text-primary hover:underline">
            {webinar.link}
          </a>
          {webinar.invitees.length > 0 && (
            <p className="text-xs text-muted-foreground">{webinar.invitees.length} invitee{webinar.invitees.length > 1 ? "s" : ""}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function QuickAction({
  Icon,
  label,
  onClick,
}: {
  Icon: ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-24 flex-col items-center justify-center gap-3 rounded-lg border bg-card p-4 text-center shadow-xs transition-colors hover:bg-muted"
    >
      <Icon className="size-5 text-primary" />
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
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
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<"thread" | "announcement">("thread")

  useEffect(() => {
    Promise.all([
      api.getToday(),
      api.getTopics(),
      api.getWebinars(),
    ]).then(([today, topics, wbns]) => {
      setDate(today.date)
      setTopic(today.topic)
      setAllTopics(topics)
      setWebinars(wbns)
      if (today.topic) {
        api.getPreview(today.date).then(setPreview).catch(() => {})
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const nextWebinar = webinars
    .filter((w) => new Date(`${w.date}T${w.timeUtc}:00Z`) > new Date())
    .sort((a, b) => a.date.localeCompare(b.date))[0]

  const upcomingTopics = allTopics.filter((t) => t.date >= date).length
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

      <SectionCards
        stats={{
          todayStatus: topic ? "Ready" : "Missing",
          todayDate: date,
          upcomingTopics,
          sessions: webinars.length,
          agentStatus: currentProject?.enabled ? "Active" : "Paused",
        }}
      />

      <div className="px-4 lg:px-6">
        <div className={`flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between ${readyCount === readiness.length ? "bg-emerald-50/60" : "bg-amber-50/60"}`}>
          <div className="flex items-start gap-3">
            {readyCount === readiness.length
              ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700" />
              : <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-700" />}
            <div>
              <p className="text-sm font-semibold">{readyCount === readiness.length ? "Project is ready" : `${readiness.length - readyCount} setup item${readiness.length - readyCount === 1 ? "" : "s"} need attention`}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {readiness.map((item) => (
                  <span key={item.label} className={`text-xs ${item.ready ? "text-emerald-700" : "text-amber-800"}`}>
                    {item.ready ? "Ready" : "Missing"}: {item.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
          {readyCount < readiness.length ? (
            <Button variant="outline" size="sm" onClick={() => navigate("/project")} className="bg-background">
              <Settings className="size-4" />
              Complete setup
              <ArrowRight className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>

      {nextWebinar && <NextWebinarCard webinar={nextWebinar} />}

      <div className="px-4 lg:px-6">
        <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Quick Actions</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <QuickAction Icon={FileText} label="Manage Topics" onClick={() => navigate("/topics")} />
          <QuickAction Icon={MessageSquareText} label="Send a Comm" onClick={() => navigate("/comms")} />
          <QuickAction Icon={PencilLine} label="Compose Draft" onClick={() => navigate("/composer")} />
          <QuickAction Icon={Bot} label="Community Agent" onClick={() => navigate("/agent")} />
          <QuickAction Icon={Target} label="Schedule Session" onClick={() => navigate("/webinars")} />
          <QuickAction Icon={Link2} label="Edit Links" onClick={() => navigate("/links")} />
        </div>
      </div>

      {!topic && (
        <div className="px-4 lg:px-6">
          <Alert variant="warning" className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <div>
              <AlertTitle>No topic for today ({date})</AlertTitle>
              <AlertDescription>The daily publisher will use the first available topic as fallback if no exact date exists.</AlertDescription>
              <Button onClick={() => navigate("/topics")} variant="link" className="mt-2 h-auto p-0">
                Create today's topic
              </Button>
            </div>
          </Alert>
        </div>
      )}

      {topic && (
        <div className="space-y-4 px-4 lg:px-6">
          <Card className="shadow-xs">
            <CardContent className="p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Today's Thread</p>
                  <h2 className="text-xl font-semibold text-foreground">{preview?.title || topic.title}</h2>
                  <p className="text-sm text-muted-foreground">{topic.topic}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(topic.tags || []).map((t) => (
                      <Badge key={t} variant="secondary">{t}</Badge>
                    ))}
                  </div>
                </div>
                <div className="shrink-0">
                  <PublishButton date={date} />
                </div>
              </div>
            </CardContent>
          </Card>

          {preview && (
            <Tabs value={tab} onValueChange={(value) => setTab(value as "thread" | "announcement")} className="gap-3">
              <TabsList>
                <TabsTrigger value="thread">Thread Preview</TabsTrigger>
                <TabsTrigger value="announcement">Announcement</TabsTrigger>
              </TabsList>
              <TabsContent value="thread" className={cn(tab !== "thread" && "hidden")}>
                <Preview content={preview.thread} label="Daily Thread" />
              </TabsContent>
              <TabsContent value="announcement" className={cn(tab !== "announcement" && "hidden")}>
                <Preview content={preview.announcement} label="Chat Announcement" />
              </TabsContent>
            </Tabs>
          )}
        </div>
      )}
    </div>
  )
}
