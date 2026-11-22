// Staff case types and queue decisions. Codex (GPT-6) added family callbacks and state-specific next actions.
import type { Service } from '../services'
export { serviceLabels, type Service } from '../services'
export type NeedStatus = 'open' | 'fulfilled' | 'unmet'
export type Action = 'assign' | 'direct' | 'refer' | 'decline' | 'follow_up' | 'fulfill' | 'unmet' | 'partner_contact' | 'check_in'

export interface Need {
  id: string
  service: Service
  status: NeedStatus
  assigned_staff_id: string | null
  assignment_required?: boolean
  owner: string | null
  follow_up: string | null
  provider: string | null
  fulfilled_at: string | null
  unmet_reason: string | null
  partner_contact: string | null
  referrals: { id: string; partner: string; sent_at: string; declined_at: string | null }[]
  history: {
    at: string
    action: string
    detail: string
    source: string | null
    actor_name: string | null
    actor_role: 'administrator' | 'caseworker' | null
  }[]
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
  family_support: { support: string; safe_contact: string; agency?: string; agency_reference?: string } | null
  needs: Need[]
}

export const statusLabels: Record<NeedStatus, string> = { open: 'Open', fulfilled: 'Fulfilled', unmet: 'Closed unmet' }
export const actionLabels: Record<Action, string> = {
  assign: 'Assign a worker', direct: 'Arrange direct help', refer: 'Send referral',
  decline: 'Record partner decline', follow_up: 'Schedule follow-up', fulfill: 'Confirm delivery', unmet: 'Close as unmet',
  partner_contact: 'Record partner contact', check_in: 'Record follow-up',
}
export const historyLabels: Record<string, string> = {
  assign: 'Worker assigned', direct: 'Direct help arranged', refer: 'Referral sent', decline: 'Partner declined',
  follow_up: 'Follow-up scheduled', fulfill: 'Delivery confirmed', unmet: 'Closed unmet',
  partner_contact: 'Partner contacted', check_in: 'Follow-up completed',
}
const chicagoDate = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric',
  minute: '2-digit', timeZone: 'America/Chicago', timeZoneName: 'short',
})
export function dated(iso: string) { return chicagoDate.format(new Date(iso)) }
export function isOverdue(need: Need, now: number) {
  return need.status === 'open' && !!need.follow_up && Date.parse(need.follow_up) < now
}
export function partner(need: Need) {
  return need.partner_contact || need.referrals.find(attempt => !attempt.declined_at)?.partner
}
export function needsAssignment(need: Need) {
  return need.assignment_required ?? !need.owner
}
export function nextAction(need: Need): Action | null {
  if (need.status !== 'open') return null
  if (needsAssignment(need)) return 'assign'
  if (need.follow_up) return 'check_in'
  if (need.service === 'family_support') return 'follow_up'
  const latest = need.history.find(event => ['direct', 'refer', 'decline'].includes(event.action))
  if (latest?.action === 'direct') return 'fulfill'
  if (need.referrals.some(attempt => !attempt.declined_at)) return 'follow_up'
  if (need.service === 'food') return 'direct'
  return 'refer'
}
export function actionLabel(action: Action, need: Need) {
  if (action === 'follow_up' && need.service === 'family_support') return 'Schedule family check-in'
  if (action === 'fulfill' && need.service === 'family_support') return 'Confirm support delivered'
  return actionLabels[action]
}
export function outcome(need: Need) {
  return need.status === 'fulfilled' ? `Delivered by ${need.provider}` : need.unmet_reason || statusLabels[need.status]
}
