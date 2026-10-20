import type { TaskAvailabilityResult } from '../api'

function waitForRetry(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted()
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, 2500)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export async function checkAvailabilityUntilComplete(
  check: () => Promise<TaskAvailabilityResult>,
  signal: AbortSignal,
  onPending: () => void,
): Promise<TaskAvailabilityResult> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted()
    const result = await check()
    signal.throwIfAborted()
    if (result.status !== 'pending' || attempt === 3) return result
    onPending()
    await waitForRetry(signal)
  }
}

export function availabilityFeedback(result: TaskAvailabilityResult): { title: string; message: string; error: boolean } {
  switch (result.status) {
    case 'available': return { title: 'Tasks available', message: 'Tasks are available in L-1/L0. No announcement was sent.', error: false }
    case 'notified': return { title: 'Batch completed', message: 'No tasks are available in L-1/L0. The batch announcement was sent to Community.', error: false }
    case 'already_notified': return result.reason === 'delivery_requires_verification'
      ? { title: 'Check announcement delivery', message: 'No tasks are available in L-1/L0. Previous delivery is uncertain; verify it in Community before retrying.', error: true }
      : { title: 'Batch still empty', message: 'No tasks are available in L-1/L0. The announcement was already sent for this batch, so no duplicate was posted.', error: false }
    case 'pending': return { title: 'Redash is still running', message: 'No announcement has been sent by this check. Check again to resume the saved query.', error: false }
    case 'error': return { title: 'Availability check failed', message: result.reason || 'Availability could not be verified. No announcement was sent.', error: true }
    case 'skipped': return { title: 'Availability not checked', message: result.reason === 'already_running'
      ? 'Another availability check is running. Try again shortly.'
      : result.reason === 'diagnostics_disabled'
        ? 'Enable the project diagnostic query in Diagnostics before checking availability.'
        : 'This project is paused or is not authorized for availability checks.', error: true }
    default: return { title: 'Unexpected response', message: 'The server did not return a valid availability result. Please try again.', error: true }
  }
}

export function availabilityAnnouncementUrl(baseUrl: string, result: TaskAvailabilityResult): string | undefined {
  if (!['notified', 'already_notified'].includes(result.status)
    || result.reason === 'delivery_requires_verification'
    || !Number.isSafeInteger(result.messageId) || result.messageId! <= 0) return
  try {
    const url = new URL(baseUrl)
    if (url.protocol !== 'https:' || url.username || url.password) return
    return new URL(`/chat/message/${result.messageId}`, url.origin).href
  } catch { return }
}
