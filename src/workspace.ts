// Browser demo membership and resident pairing. Codex (GPT-6) implemented role-specific capability handling.

const ownerKey = 'comforce.demo.owner.v1'
const pairingKey = 'comforce.demo.resident.v1'
const validToken = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const validExpiry = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) > Date.now()
type Demo = { staff_token: string; resident_token: string; expires_at: string }
export type StaffRole = 'administrator' | 'caseworker'
export type StaffMember = { user_id: string; display_name: string; role: StaffRole }
export type StaffContext = {
  token: string | null
  residentToken: string | null
  role: StaffRole
  userId: string | null
  displayName: string
  canAssign: boolean
  staff: StaffMember[]
  legacyApi: boolean
}
let creating: Promise<Demo> | undefined

async function storedDemo(): Promise<Demo | undefined> {
  const raw = localStorage.getItem(ownerKey)
  if (!raw) return
  let demo
  try { demo = JSON.parse(raw) } catch { return }
  if (!validToken(demo?.staff_token) || !validToken(demo?.resident_token)) return
  if (validExpiry(demo.expires_at)) return demo
  if (demo.expires_at != null) return
  const { supabase } = await import('./supabase')
  const { data, error } = await supabase.rpc('demo_workspace_expiry', {
    p_staff: demo.staff_token, p_resident: demo.resident_token,
  })
  if (error) throw error
  if (raw !== localStorage.getItem(ownerKey)) return storedDemo()
  if (!validExpiry(data)) {
    localStorage.removeItem(ownerKey)
    return
  }
  const recovered = { ...demo, expires_at: data }
  localStorage.setItem(ownerKey, JSON.stringify(recovered))
  return recovered
}

async function ownDemo(): Promise<Demo> {
  if (!creating) {
    const initialize = async () => {
      const shared = await storedDemo()
      if (shared) return shared
      const { supabase } = await import('./supabase')
      const result = await supabase.rpc('create_demo_workspace')
      if (result.error || !validToken(result.data?.staff_token) || !validToken(result.data?.resident_token)
        || !validExpiry(result.data?.expires_at)) {
        throw new Error('The demo workspace could not be opened. Please try again.')
      }
      const demo = await storedDemo() ?? {
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

export async function demoStaffToken() {
  return (await ownDemo()).staff_token
}

export function isStaffMode() {
  return new URLSearchParams(location.search).get('mode') === 'staff'
}

export async function staffContext(): Promise<StaffContext> {
  const demo = isStaffMode() ? null : await ownDemo()
  const token = demo?.staff_token ?? null
  const { supabase } = await import('./supabase')
  const result = await supabase.rpc('staff_context', { p_token: token })
  if (result.error) {
    const message = result.error.message || ''
    const missing = result.error.code === 'PGRST202'
      || (result.error.code === '42883' && message.includes('staff_context'))
    if (!missing) throw result.error
    return {
      token,
      residentToken: demo?.resident_token ?? null,
      role: 'administrator',
      userId: null,
      displayName: demo ? 'Demo administrator' : 'Staff',
      canAssign: true,
      staff: [],
      legacyApi: true,
    }
  }
  return {
    token,
    residentToken: demo?.resident_token ?? null,
    role: result.data.role,
    userId: result.data.user_id,
    displayName: result.data.display_name,
    canAssign: result.data.can_assign,
    staff: result.data.staff,
    legacyApi: false,
  }
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

const expired = 'expired'
export class ExpiredPairing extends Error {}
export function pairingRejected(token: string | null, status: number, code: string) {
  if (!token || (status !== 401 && status !== 403 && code !== '42501')) return false
  if (localStorage.getItem(pairingKey) !== token) return false
  localStorage.setItem(pairingKey, expired)
  return true
}

export function replacePairing(link: string) {
  let url: URL
  try { url = new URL(link.trim()) } catch { return false }
  const token = new URLSearchParams(url.hash.slice(1)).get('join')
  if (url.origin !== location.origin || url.pathname !== '/request' || !validToken(token)) return false
  localStorage.setItem(pairingKey, token)
  return true
}

export async function residentToken(): Promise<string> {
  const paired = localStorage.getItem(pairingKey)
  if (paired === expired) throw new ExpiredPairing()
  return validToken(paired) ? paired : (await ownDemo()).resident_token
}

// The public atlas can use the shared fictional template until this browser joins or owns a writable demo.
export async function impactToken(): Promise<string | null> {
  const paired = localStorage.getItem(pairingKey)
  if (paired === expired) throw new ExpiredPairing()
  if (validToken(paired)) return paired
  return (await storedDemo())?.resident_token ?? null
}

export function residentLink(token: string, origin = location.origin) {
  if (!validToken(token)) throw new Error('Resident link is unavailable.')
  const url = new URL('/request', origin)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use a valid site address.')
  url.hash = new URLSearchParams({ join: token }).toString()
  return url.href
}
