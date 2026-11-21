// Browser demo membership and resident pairing. Codex (GPT-6) implemented role-specific capability handling.
import { supabase } from './supabase'

const ownerKey = 'comforce.demo.owner.v1'
const pairingKey = 'comforce.demo.resident.v1'
const validToken = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const validExpiry = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) > Date.now()
type Demo = { staff_token: string; resident_token: string; expires_at: string }
let creating: Promise<Demo> | undefined

function storedDemo(): Demo | undefined {
  const saved = localStorage.getItem(ownerKey)
  if (!saved) return
  try {
    const demo = JSON.parse(saved)
    if (validToken(demo?.staff_token) && validToken(demo?.resident_token) && validExpiry(demo?.expires_at)) return demo
  } catch { /* An incomplete browser record can be replaced with a new private demo. */ }
  localStorage.removeItem(ownerKey)
}

async function ownDemo(): Promise<Demo> {
  const existing = storedDemo()
  if (existing) return existing
  if (!creating) {
    const initialize = async () => {
      const shared = storedDemo()
      if (shared) return shared
      const result = await supabase.rpc('create_demo_workspace')
      if (result.error || !validToken(result.data?.staff_token) || !validToken(result.data?.resident_token)
        || !validExpiry(result.data?.expires_at)) {
        throw new Error('The demo workspace could not be opened. Please try again.')
      }
      const demo = storedDemo() ?? {
        staff_token: result.data.staff_token,
        resident_token: result.data.resident_token,
        expires_at: result.data.expires_at,
      }
      localStorage.setItem(ownerKey, JSON.stringify(demo))
      return demo
    }
    const start = async (): Promise<Demo> => navigator.locks
      ? await navigator.locks.request(ownerKey, initialize)
      : await initialize()
    creating = start().finally(() => { creating = undefined })
  }
  return creating
}

export function isStaffMode() {
  return new URLSearchParams(location.search).get('mode') === 'staff'
}

export async function staffContext() {
  if (isStaffMode()) return { token: null, residentToken: null }
  const demo = await ownDemo()
  return { token: demo.staff_token, residentToken: demo.resident_token }
}

// The fragment stays out of HTTP requests and referrers. Opening /team always selects this browser's own workspace.
export function acceptResidentLink() {
  if (location.hash === '#my-workspace') {
    localStorage.removeItem(pairingKey)
    history.replaceState(history.state, '', location.pathname + location.search)
    return
  }
  const fragment = new URLSearchParams(location.hash.slice(1))
  if (!fragment.has('join')) return
  const token = fragment.get('join')
  if (validToken(token)) {
    localStorage.setItem(pairingKey, token)
    history.replaceState(history.state, '', location.pathname + location.search)
  }
}

export async function residentToken(): Promise<string> {
  const paired = localStorage.getItem(pairingKey)
  return validToken(paired) ? paired : (await ownDemo()).resident_token
}

// The public atlas can use the shared fictional template until this browser joins or owns a writable demo.
export function impactToken(): string | null {
  const paired = localStorage.getItem(pairingKey)
  if (validToken(paired)) return paired
  return storedDemo()?.resident_token ?? null
}

export function residentLink(token: string, origin = location.origin) {
  if (!validToken(token)) throw new Error('Resident link is unavailable.')
  const url = new URL('/request', origin)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use a valid site address.')
  url.hash = new URLSearchParams({ join: token }).toString()
  return url.href
}
