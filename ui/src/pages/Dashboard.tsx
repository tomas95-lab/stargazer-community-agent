import { useEffect, useState } from "react"
import type { ComponentType } from "react"
import { useNavigate } from "react-router-dom"
import {
  AlertTriangle,
  Bot,
  FileText,
  Link2,
  Loader2,
  MessageSquareText,
  PencilLine,
  Target,
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
import { cn } from "@/lib/utils"

function NextWebinarCard({ webinar }: { webinar: Webinar }) {
  const dt = new Date(`${webinar.date}T${webinar.timeUtc}:00Z`)
  const diffMs = dt.getTime() - Date.now()
  const diffH = Math.floor(diffMs / 1000 / 60 / 60)
  const diffD = Math.floor(diffH / 24)
  const timeLeft = diffD > 0 ? `in ${diffD}d ${diffH % 24}h` : diffH > 0 ? `in ${diffH}h` : "soon"

  return (
    <div className="px-4 lg:px-6">
      <Card className="border-primary/30 bg-primary/10 shadow-xs">
        <CardContent className="space-y-2 p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase text-primary">Next Session</p>
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading project...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex items-center justify-between px-4 lg:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Project Comms</h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="hidden sm:flex"
          onClick={() => navigate("/agent")}
        >
          <Bot className="size-4" />
          Agent scheduled
        </Button>
      </div>

      <SectionCards
        stats={{
          todayStatus: topic ? "Ready" : "Missing",
          todayDate: date,
          upcomingTopics,
          sessions: webinars.length,
          agentStatus: "Ready",
        }}
      />

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
