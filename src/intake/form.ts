// Intake rules and retry identifiers. Codex (GPT-6) implemented validation and LAN-compatible UUIDs.
import type { Service } from '../services'
export type ContactMethod = 'phone' | 'text' | 'email'
export interface IntakeDraft {
  services: Service[]
  description: string
  neighborhood: string
  method: ContactMethod | ''
  contact: string
  secondMethod?: ContactMethod | ''
  secondContact?: string
  safeContact?: string
  agency?: string
  agencyReference?: string
}
export function validate(draft: IntakeDraft) {
  const errors: Partial<Record<keyof IntakeDraft, string>> = {}
  if (!draft.services.length) errors.services = 'Pick at least one thing you need.'
  const family = draft.services.includes('family_support')
  const maxDescription = family ? 500 : 800
  if (!draft.description.trim()) errors.description = family ? 'Tell us what would help your family.' : 'Tell us what you need. A sentence or two is fine.'
  else if (draft.description.trim().length > maxDescription) errors.description = `Please make this shorter (${maxDescription} letters or less).`
  if (family && (!draft.safeContact?.trim() || draft.safeContact.trim().length > 300)) errors.safeContact = 'Tell us a safe time or way to reach you.'
  if (family && (draft.agency?.trim().length ?? 0) > 120) errors.agency = 'Please make this name shorter.'
  if (family && (draft.agencyReference?.trim().length ?? 0) > 80) errors.agencyReference = 'Please make this number shorter.'
  if (!draft.neighborhood) errors.neighborhood = 'Pick your neighborhood, or choose “I’m not sure.”'
  if (!['phone', 'text', 'email'].includes(draft.method)) {
    errors.method = 'Pick how we should reach you.'
  } else {
    const error = contactError(draft.method, draft.contact.trim())
    if (error) errors.contact = error
  }
  if (draft.secondMethod) {
    if (draft.secondMethod === draft.method || !['phone', 'text', 'email'].includes(draft.secondMethod)) {
      errors.secondMethod = 'Pick a different second way to reach you.'
    } else {
      const error = contactError(draft.secondMethod, draft.secondContact?.trim() || '')
      if (error) errors.secondContact = error
    }
  }
  return errors
}

function contactError(method: ContactMethod | '', contact: string) {
  if (method === 'email') {
    if (contact.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return 'Type your email, like name@example.com.'
  } else if (contact.length > 35 || !/^[+\d(). -]+$/.test(contact) || !/^\d{7,15}$/.test(contact.replace(/\D/g, ''))) {
    return 'Type your phone number with the area code, like (414) 555-0100.'
  }
}

// getRandomValues also works on a phone visiting the development laptop over HTTP.
export function submissionKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
}
