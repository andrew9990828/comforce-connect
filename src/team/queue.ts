// Staff queue data and next-step labels. Codex (GPT-6) implemented the workflow rules.
import type { Service } from '../services'
export { serviceLabels, type Service } from '../services'
export type NeedStatus = 'open' | 'fulfilled' | 'unmet'
export type Action = 'assign' | 'direct' | 'refer' | 'decline' | 'follow_up' | 'fulfill' | 'unmet'

export interface Need {
  id: string
  service: Service
  status: NeedStatus
  owner: string | null
  follow_up: string | null
  provider: string | null
  fulfilled_at: string | null
  unmet_reason: string | null
  referrals: { id: string; partner: string; sent_at: string; declined_at: string | null }[]
  history: { at: string; action: string; detail: string }[]
}

export interface TeamRequest {
  id: string
  reference: string
  description: string
  neighborhood: string
  contact_method: 'phone' | 'text' | 'email'
  contact: string
  source: 'web' | 'call' | 'text'
  created_at: string
  needs: Need[]
}

export const statusLabels: Record<NeedStatus, string> = { open: 'Open', fulfilled: 'Fulfilled', unmet: 'Closed unmet' }
export const actionLabels: Record<string, string> = {
  intake: 'Request received', created: 'Request received', assign: 'Assignment', direct: 'Direct help arranged',
  refer: 'Referral sent', decline: 'Referral declined', follow_up: 'Follow-up scheduled',
  fulfill: 'Delivery confirmed', unmet: 'Closed unmet',
}

const chicagoDate = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric',
  minute: '2-digit', timeZone: 'America/Chicago', timeZoneName: 'short',
})
export function dated(iso: string) {
  return chicagoDate.format(new Date(iso))
}
export function isOverdue(need: Need, now: number) {
  return need.status === 'open' && !!need.follow_up && Date.parse(need.follow_up) < now
}
export function nextStep(need: Need) {
  if (need.status === 'fulfilled') return `Delivered by ${need.provider}`
  if (need.status === 'unmet') return need.unmet_reason || 'Closed unmet'
  const active = need.referrals.find(attempt => !attempt.declined_at)
  const latest = need.history.find(event => ['direct', 'refer', 'decline'].includes(event.action))
  if (latest?.action === 'direct') return 'Confirm direct delivery'
  if (active) return `Check with ${active.partner}`
  if (latest?.action === 'decline') return 'Find another provider'
  if (!need.owner) return 'Assign a worker'
  if (need.follow_up) return 'Contact resident'
  return 'Arrange help'
}
