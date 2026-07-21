import { useCallback, useEffect, useMemo, useState } from "react"
import { Bell as IconBell, BellOff as IconBellOff, BellRing as IconBellRinging } from "lucide-react"

import { api, type OperationLogEntry, type PushStatus } from "@/api"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { disableWebPush, enableWebPush, webPushSubscription, webPushSupported } from "@/lib/web-push"
import { usePlatform } from "@/platform"

const ENABLED_KEY = "community_agent_browser_notifications_enabled"
const LAST_SEEN_AT_KEY = "community_agent_browser_notifications_last_seen_at"
const POLL_MS = 60_000

type NotificationPayload = { title: string; body: string; tag: string }
type NotificationMode = "off" | "polling" | "push"

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function userList(users: string[]): string {
  const unique = Array.from(new Set(users)).slice(0, 4)
  return unique.length ? unique.join(", ") : "Project"
}

function notificationFor(entry: OperationLogEntry): NotificationPayload | null {
  const metadata = entry.metadata || {}
  if (entry.action === "dm_review") {
    const count = asNumber(metadata.newIncomingMessages)
    if (count <= 0) return null
    return { title: "New direct messages", body: `${count} new DM${count === 1 ? "" : "s"} from ${userList(asStrings(metadata.newDmSenders))}.`, tag: `dm-review:${entry.id}` }
  }
  if (entry.action === "community_agent") {
    const candidates = asNumber(metadata.candidates)
    const posted = asNumber(metadata.posted)
    const reacted = asNumber(metadata.reacted)
    const needsHuman = asNumber(metadata.needsHuman)
    if (candidates <= 0 && posted <= 0 && reacted <= 0) return null
    if (posted > 0) return { title: "Bot replied in Community", body: `${posted} ${posted === 1 ? "reply" : "replies"} posted. ${needsHuman} need human review.`, tag: `community-posted:${entry.id}` }
    if (reacted > 0) return { title: "Bot reacted in Community", body: `${reacted} useful ${reacted === 1 ? "message" : "messages"} acknowledged.`, tag: `community-reacted:${entry.id}` }
    return { title: "New Community messages", body: `${candidates} message${candidates === 1 ? "" : "s"} need review from ${userList(asStrings(metadata.candidateUsers))}.`, tag: `community-candidates:${entry.id}` }
  }
  if (entry.action === "dm_reply") return { title: "DM reply sent", body: entry.message, tag: `dm-reply:${entry.id}` }
  return null
}

function readEnabled(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(ENABLED_KEY) === "true"
}

function writeEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return
  if (enabled) window.localStorage.setItem(ENABLED_KEY, "true")
  else window.localStorage.removeItem(ENABLED_KEY)
}

function readLastSeenAt(): string {
  return typeof window === "undefined" ? "" : window.localStorage.getItem(LAST_SEEN_AT_KEY) || ""
}

function writeLastSeenAt(value: string): void {
  if (typeof window !== "undefined" && value) window.localStorage.setItem(LAST_SEEN_AT_KEY, value)
}

export function NotificationBell() {
  const { currentProject } = usePlatform()
  const [mode, setMode] = useState<NotificationMode>(readEnabled() ? "polling" : "off")
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState("")

  const refresh = useCallback(async () => {
    setChecking(true)
    try {
      const nextStatus = await api.getPushStatus()
      setStatus(nextStatus)
      const subscription = nextStatus.configured ? await webPushSubscription() : null
      if (subscription) setMode("push")
      else setMode(readEnabled() && Notification.permission === "granted" ? "polling" : "off")
    } catch {
      setMode(readEnabled() && typeof Notification !== "undefined" && Notification.permission === "granted" ? "polling" : "off")
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh, currentProject?.id])

  const poll = useCallback(async () => {
    if (mode !== "polling" || Notification.permission !== "granted") return
    const { entries } = await api.getOperations(25)
    const newestAt = entries[0]?.at
    if (!newestAt) return
    const lastSeenAt = readLastSeenAt()
    if (!lastSeenAt) return writeLastSeenAt(newestAt)
    for (const entry of entries.filter((item) => item.at > lastSeenAt).sort((a, b) => a.at.localeCompare(b.at))) {
      const payload = notificationFor(entry)
      if (payload) new Notification(payload.title, { body: payload.body, tag: payload.tag })
    }
    writeLastSeenAt(newestAt)
  }, [mode])

  useEffect(() => {
    if (mode !== "polling") return
    void poll().catch(() => undefined)
    const timer = window.setInterval(() => void poll().catch(() => undefined), POLL_MS)
    return () => window.clearInterval(timer)
  }, [mode, poll])

  async function toggle() {
    setChecking(true)
    setError("")
    try {
      if (mode === "push") {
        await disableWebPush()
        setMode("off")
        return
      }
      if (mode === "polling") {
        writeEnabled(false)
        setMode("off")
        return
      }
      if (status?.configured && webPushSupported()) {
        await enableWebPush(status)
        writeEnabled(false)
        setMode("push")
        return
      }
      if (!("Notification" in window)) throw new Error("Browser notifications are unavailable.")
      const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission
      if (permission !== "granted") throw new Error("Notifications are blocked in this browser.")
      const { entries } = await api.getOperations(1)
      writeLastSeenAt(entries[0]?.at || new Date().toISOString())
      writeEnabled(true)
      setMode("polling")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setChecking(false)
    }
  }

  const Icon = useMemo(() => checking || mode !== "off" ? IconBellRinging : error ? IconBellOff : IconBell, [checking, mode, error])
  const label = error || (mode === "push" ? "Web Push notifications are enabled" : mode === "polling" ? "In-browser notifications are enabled" : "Enable notifications")

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={() => void toggle()} aria-label={label} className={mode !== "off" ? "text-primary" : ""}>
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent><p>{label}</p></TooltipContent>
    </Tooltip>
  )
}
