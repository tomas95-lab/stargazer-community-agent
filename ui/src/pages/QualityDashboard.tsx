import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Activity, ArrowRight, Bot, CircleAlert, MessageSquareReply, RefreshCw, ShieldCheck } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { api, type QualityMetrics } from "@/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

const chartConfig = {
  messages: { label: "Messages", color: "var(--chart-1)" },
  replies: { label: "Replies", color: "var(--chart-2)" },
  escalations: { label: "Escalations", color: "var(--chart-4)" },
} satisfies ChartConfig

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Activity }) {
  return (
    <div className="sg-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <p className="mt-3 text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

export default function QualityDashboard() {
  const [days, setDays] = useState(14)
  const [metrics, setMetrics] = useState<QualityMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      setMetrics(await api.getQualityMetrics(days))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { void load() }, [load])

  const dateLabel = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`))

  return (
    <div className="space-y-6 px-4 lg:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><Activity className="size-5" /><h2 className="text-2xl font-semibold">Quality dashboard</h2></div>
          <p className="mt-2 text-sm text-muted-foreground">Measure agent coverage, escalations, human resolution, and automation reliability.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border bg-muted/30 p-0.5" aria-label="Quality window">
            {[14, 30, 60].map((value) => <Button key={value} size="sm" variant={days === value ? "secondary" : "ghost"} className="h-7 px-2.5" onClick={() => setDays(value)}>{value}d</Button>)}
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} />Refresh</Button>
        </div>
      </div>

      {error ? <div className="sg-status-danger rounded-lg border p-4 text-sm">{error}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Messages analyzed" value={metrics ? metrics.totals.messages.toLocaleString() : "-"} detail={`${metrics?.totals.runs || 0} agent runs, ${metrics?.totals.candidates || 0} candidates`} icon={Activity} />
        <Metric label="Response rate" value={metrics ? `${metrics.rates.responseRate}%` : "-"} detail={`${metrics?.totals.replies || 0} automatic replies`} icon={MessageSquareReply} />
        <Metric label="Escalation rate" value={metrics ? `${metrics.rates.escalationRate}%` : "-"} detail={`${metrics?.totals.escalations || 0} sent to a QM`} icon={CircleAlert} />
        <Metric label="Human resolution" value={metrics ? `${metrics.rates.resolutionRate}%` : "-"} detail={`${metrics?.totals.humanResolved || 0} resolved items`} icon={ShieldCheck} />
        <Metric label="Run error rate" value={metrics ? `${metrics.rates.errorRate}%` : "-"} detail={`${metrics?.totals.errors || 0} errors in this window`} icon={Bot} />
      </div>

      <section className="sg-panel overflow-hidden p-0">
        <div className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="font-semibold">Message handling trend</h3><p className="mt-1 text-sm text-muted-foreground">Messages checked, replies posted, and escalations by day.</p></div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[var(--chart-1)]" />Messages</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[var(--chart-2)]" />Replies</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[var(--chart-4)]" />Escalations</span>
            <Badge variant="outline">{metrics?.totals.reactions || 0} reactions</Badge>
          </div>
        </div>
        <div className="p-4 sm:p-6">
          {!loading && metrics?.totals.runs === 0 ? (
            <div className="mb-4 rounded-md border border-dashed bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              No Community or DM agent runs were recorded for this project in the selected window.
            </div>
          ) : null}
          <ChartContainer config={chartConfig} className="h-[300px] w-full aspect-auto">
            <LineChart accessibilityLayer data={metrics?.daily || []} margin={{ left: 4, right: 16, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={10} tickFormatter={dateLabel} minTickGap={24} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => dateLabel(String(value))} />} />
              <Line dataKey="messages" type="monotone" stroke="var(--color-messages)" strokeWidth={2} dot={false} />
              <Line dataKey="replies" type="monotone" stroke="var(--color-replies)" strokeWidth={2} dot={false} />
              <Line dataKey="escalations" type="monotone" stroke="var(--color-escalations)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        </div>
      </section>

      <section className="sg-panel overflow-hidden p-0">
        <div className="border-b px-5 py-4"><h3 className="font-semibold">Recommended next actions</h3><p className="mt-1 text-sm text-muted-foreground">Suggestions derived from this project's recent activity.</p></div>
        <div className="divide-y">
          {(metrics?.recommendations || ["Loading quality signals..."]).map((recommendation) => (
            <div key={recommendation} className="flex items-start gap-3 px-5 py-4"><ArrowRight className="mt-0.5 size-4 shrink-0 text-primary" /><p className="text-sm leading-6">{recommendation}</p></div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 border-t bg-muted/30 px-5 py-4">
          <Button asChild variant="outline" size="sm"><Link to="/review">Open review queue<ArrowRight /></Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/guidelines">Review guidelines history<ArrowRight /></Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/runs">Inspect runs<ArrowRight /></Link></Button>
        </div>
      </section>
    </div>
  )
}
