// Request status lookup rules. Contributor: asherjaenchen. AI assistance: Claude Opus 5.5 wrote the validation and stage labels.
import type { Service } from '../services'

export type Stage = 'received' | 'in_progress' | 'delivered' | 'closed'
export interface NeedStatus { service: Service; stage: Stage; provider: string | null; partner: string | null; updated_at: string }
export interface RequestStatus { reference: string; submitted_at: string; contact_method: 'phone' | 'text' | 'email'; needs: NeedStatus[] }

// Accepts "CF-1042", "cf 1042" or "1042" and returns the stored form, or null when it can't be a reference.
export function normalizeReference(value: string) {
  const compact = value.toUpperCase().replace(/\s/g, '')
  const digits = compact.replace(/^CF-?/, '')
  return /^\d{1,9}$/.test(digits) ? 'CF-' + digits : null
}

export function validateLookup(reference: string, check: string) {
  const errors: { reference?: string; check?: string } = {}
  if (!normalizeReference(reference)) errors.reference = 'Enter the reference from your confirmation, such as CF-1042.'
  const value = check.trim()
  const isEmail = value.includes('@')
  if (!value) errors.check = 'Enter the last 4 digits of your phone number, or your email address.'
  else if (!isEmail && !/^\d{4}$/.test(value.replace(/\D/g, ''))) errors.check = 'Enter exactly 4 digits, or the email address you gave us.'
  return errors
}

export const stageSteps = ['received', 'in_progress', 'delivered'] as const
export const stageLabels: Record<Stage, string> = {
  received: 'Received', in_progress: 'Someone is on it', delivered: 'Delivered', closed: 'Could not be completed',
}

export function stageMessage(need: NeedStatus) {
  if (need.stage === 'delivered') return need.provider === 'ComForce'
    ? 'ComForce delivered this help.'
    : `Delivered by ${need.provider}, coordinated by ComForce.`
  if (need.stage === 'closed') return 'We weren’t able to complete this one. A team member can talk through other options with you.'
  if (need.stage === 'in_progress') return need.partner
    ? `ComForce connected you with ${need.partner}. They or our team will reach out.`
    : 'A ComForce team member is working on this.'
  return 'We have your request. A team member will review it soon.'
}
