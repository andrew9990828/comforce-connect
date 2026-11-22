// Session-scoped polling for the Lend a Hand boards. Contributor: asherjaenchen. AI assistance: Claude Opus 5.5.
// Mirrors the queue: poll every few seconds and on focus, online and visibility changes, one request at a time.
// Every response is tagged with the session that asked for it, so a sign-out, identity change or access denial
// clears the rows and late answers from the earlier session are dropped instead of being shown again.

export const deniedCodes = ['42501', 'PGRST301', 'PGRST303']

export type FeedState<T> = { session: string | null; data: T | null; error: unknown; denied: boolean }
export type Fetcher<T> = (session: string, signal: AbortSignal) => Promise<T>
export interface FeedHost {
  hidden(): boolean
  listen(handler: () => void): () => void
  setTimeout(handler: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

export const browserHost: FeedHost = {
  hidden: () => document.hidden,
  listen(handler) {
    window.addEventListener('focus', handler)
    window.addEventListener('online', handler)
    document.addEventListener('visibilitychange', handler)
    return () => {
      window.removeEventListener('focus', handler)
      window.removeEventListener('online', handler)
      document.removeEventListener('visibilitychange', handler)
    }
  },
  setTimeout: (handler, ms) => window.setTimeout(handler, ms),
  clearTimeout: handle => window.clearTimeout(handle as number),
}

export function createFeed<T>(fetcher: Fetcher<T>, { host = browserHost, interval = 3000, timeout = 8000 } = {}) {
  let state: FeedState<T> = { session: null, data: null, error: null, denied: false }
  let generation = 0
  let pending: AbortController | undefined
  let timer: unknown
  let again = false
  let unlisten: (() => void) | undefined
  const listeners = new Set<() => void>()
  const publish = (next: Partial<FeedState<T>>) => { state = { ...state, ...next }; listeners.forEach(l => l()) }

  async function pull() {
    host.clearTimeout(timer)
    const session = state.session
    if (session === null || host.hidden()) return
    // A refresh asked for mid-request (for example right after a save) runs once that request settles.
    if (pending) { again = true; return }
    again = false
    const ticket = generation
    const controller = new AbortController()
    pending = controller
    const abort = host.setTimeout(() => controller.abort(), timeout)
    try {
      const data = await fetcher(session, controller.signal)
      if (ticket === generation) publish({ data, error: null, denied: false })
    } catch (error) {
      if (ticket !== generation) return
      const denied = deniedCodes.includes((error as { code?: string } | null)?.code ?? '')
      publish(denied ? { data: null, error, denied } : { error })
    } finally {
      host.clearTimeout(abort)
      if (pending === controller) pending = undefined
      if (ticket === generation && state.session !== null && !host.hidden()) {
        if (again) void pull()
        else timer = host.setTimeout(pull, interval)
      }
    }
  }

  return {
    get: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    // A new session (including signing out, null) discards everything the previous one loaded or was loading.
    setSession(session: string | null) {
      if (session === state.session) return
      generation++
      pending?.abort()
      pending = undefined
      again = false
      host.clearTimeout(timer)
      publish({ session, data: null, error: null, denied: false })
      if (session !== null) void pull()
    },
    refresh: () => pull(),
    start() { unlisten ??= host.listen(() => void pull()); void pull() },
    stop() {
      generation++
      pending?.abort()
      pending = undefined
      host.clearTimeout(timer)
      unlisten?.()
      unlisten = undefined
    },
  }
}
export type Feed<T> = ReturnType<typeof createFeed<T>>
