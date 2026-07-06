import { useCallback, useEffect, useMemo, useState } from "react"
import { IconBell, IconBellOff, IconBellRinging } from "@tabler/icons-react"

import { api, type OperationLogEntry } from "@/api"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const ENABLED_KEY = "stargazer_browser_notifications_enabled"
const LAST_SEEN_AT_KEY = "stargazer_browser_notifications_last_seen_at"
const POLL_MS = 60_000

type NotificationPayload = {
  title: string
  body: string
  tag: string
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function userList(users: string[]): string {
  const unique = Array.from(new Set(users)).slice(0, 4)
  return unique.length ? unique.join(", ") : "Stargazer"
}

function notificationFor(entry: OperationLogEntry): NotificationPayload | null {
  const metadata = entry.metadata || {}

  if (entry.action === "dm_review") {
    const count = asNumber(metadata.newIncomingMessages)
    if (count <= 0) return null
    const senders = userList(asStrings(metadata.newDmSenders))
    return {
      title: "New direct messages",
      body: `${count} new DM${count === 1 ? "" : "s"} from ${senders}.`,
      tag: `dm-review:${entry.id}`,
    }
  }

  if (entry.action === "community_agent") {
    const candidates = asNumber(metadata.candidates)
    const posted = asNumber(metadata.posted)
    const needsHuman = asNumber(metadata.needsHuman)
    if (candidates <= 0 && posted <= 0) return null

    if (posted > 0) {
      const users = userList(asStrings(metadata.postedUsers))
      return {
        title: "Bot replied in Community",
        body: `${posted} ${posted === 1 ? "reply" : "replies"} posted for ${users}. ${needsHuman} need human review.`,
        tag: `community-posted:${entry.id}`,
      }
    }

    const users = userList(asStrings(metadata.candidateUsers))
    return {
      title: "New Community messages",
      body: `${candidates} message${candidates === 1 ? "" : "s"} need review from ${users}.`,
      tag: `community-candidates:${entry.id}`,
    }
  }

  if (entry.action === "dm_reply") {
    return {
      title: "DM reply sent",
      body: entry.message,
      tag: `dm-reply:${entry.id}`,
    }
  }

  return null
}

function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported"
  }
  return Notification.permission
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
  if (typeof window === "undefined") return ""
  return window.localStorage.getItem(LAST_SEEN_AT_KEY) || ""
}

function writeLastSeenAt(value: string): void {
  if (typeof window === "undefined" || !value) return
  window.localStorage.setItem(LAST_SEEN_AT_KEY, value)
}

export function NotificationBell() {
  const [enabled, setEnabled] = useState(readEnabled)
  const [permission, setPermission] = useState(notificationPermission)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState("")

  const active = enabled && permission === "granted"

  const seedLatestOperation = useCallback(async () => {
    const { entries } = await api.getOperations(1)
    if (entries[0]?.at) writeLastSeenAt(entries[0].at)
  }, [])

  const poll = useCallback(async () => {
    if (!readEnabled() || notificationPermission() !== "granted") return

    const lastSeenAt = readLastSeenAt()
    const { entries } = await api.getOperations(25)
    const newestAt = entries[0]?.at
    if (!newestAt) return

    if (!lastSeenAt) {
      writeLastSeenAt(newestAt)
      return
    }

    const pending = entries
      .filter((entry) => entry.at > lastSeenAt)
      .sort((left, right) => left.at.localeCompare(right.at))

    for (const entry of pending) {
      const payload = notificationFor(entry)
      if (!payload) continue
      new Notification(payload.title, {
        body: payload.body,
        tag: payload.tag,
        silent: false,
      })
    }

    writeLastSeenAt(newestAt)
  }, [])

  useEffect(() => {
    if (!active) return
    void poll().catch(() => undefined)
    const timer = window.setInterval(() => {
      void poll().catch(() => undefined)
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [active, poll])

  const toggle = async () => {
    setError("")
    const currentPermission = notificationPermission()
    setPermission(currentPermission)

    if (enabled) {
      writeEnabled(false)
      setEnabled(false)
      return
    }

    if (currentPermission === "unsupported") {
      setError("Browser notifications are unavailable.")
      return
    }

    let nextPermission = currentPermission
    if (currentPermission === "default") {
      nextPermission = await Notification.requestPermission()
      setPermission(nextPermission)
    }

    if (nextPermission !== "granted") {
      setError("Notifications are blocked.")
      return
    }

    setChecking(true)
    try {
      await seedLatestOperation()
      writeEnabled(true)
      setEnabled(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setChecking(false)
    }
  }

  const Icon = useMemo(() => {
    if (checking) return IconBellRinging
    if (active) return IconBellRinging
    if (permission === "denied" || permission === "unsupported") return IconBellOff
    return IconBell
  }, [active, checking, permission])

  const label = active
    ? "Mac notifications are enabled"
    : error || (permission === "denied" ? "Mac notifications are blocked" : "Enable Mac notifications")

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void toggle()}
          aria-label={label}
          className={active ? "text-primary" : ""}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  )
}
