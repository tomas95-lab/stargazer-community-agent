import {
  IconCalendarEvent,
  IconCircleCheckFilled,
  IconClockHour4,
  IconFileText,
  IconRobot,
  IconTrendingUp,
} from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export type SectionCardStats = {
  todayStatus: "Ready" | "Missing"
  todayDate: string
  upcomingTopics: number
  sessions: number
  agentStatus: string
}

export function SectionCards({
  stats,
}: {
  stats: SectionCardStats
}) {
  const topicIsReady = stats.todayStatus === "Ready"

  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Today's Thread</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {stats.todayStatus}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              {topicIsReady ? <IconCircleCheckFilled /> : <IconClockHour4 />}
              {topicIsReady ? "Scheduled" : "Needs topic"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {stats.todayDate || "No date loaded"} <IconFileText className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Daily project announcement source
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Upcoming Topics</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {stats.upcomingTopics}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconTrendingUp />
              Active
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Content calendar loaded <IconFileText className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Topics waiting in the schedule
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Sessions</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {stats.sessions}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconCalendarEvent />
              Calendar
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Webinar and onboarding reminders <IconCalendarEvent className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Stored in the project data source
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Claude Agent</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {stats.agentStatus}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconRobot />
              10-19 ARG
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Reviews DMs and community messages <IconRobot className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Escalates when guidelines are not enough
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
