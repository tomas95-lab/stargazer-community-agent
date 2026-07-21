import { api, type PushStatus } from "@/api"

function publicKeyBytes(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index)
  return bytes
}

export function webPushSupported(): boolean {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window
}

export async function webPushSubscription(): Promise<PushSubscription | null> {
  if (!webPushSupported()) return null
  const registration = await navigator.serviceWorker.register("/sw.js")
  await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

export async function enableWebPush(status?: PushStatus): Promise<PushSubscription> {
  if (!webPushSupported()) throw new Error("Web Push is not supported by this browser.")
  const pushStatus = status || await api.getPushStatus()
  if (!pushStatus.configured || !pushStatus.publicKey) throw new Error("Web Push is not configured on the server.")

  const permission = Notification.permission === "default"
    ? await Notification.requestPermission()
    : Notification.permission
  if (permission !== "granted") throw new Error("Notifications are blocked in this browser.")

  const registration = await navigator.serviceWorker.register("/sw.js")
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: publicKeyBytes(pushStatus.publicKey),
  })
  await api.subscribePush(subscription.toJSON())
  return subscription
}

export async function disableWebPush(): Promise<void> {
  const subscription = await webPushSubscription()
  if (!subscription) return
  await api.unsubscribePush(subscription.endpoint)
  await subscription.unsubscribe()
}
