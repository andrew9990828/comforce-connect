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
  if (!draft.services.length) errors.services = 'Choose at least one service.'
  const family = draft.services.includes('family_support')
  const maxDescription = family ? 500 : 800
  if (!draft.description.trim()) errors.description = family ? 'Tell us what support your family wants.' : 'Describe the help needed in a sentence or two.'
  else if (draft.description.trim().length > maxDescription) errors.description = `Keep the description to ${maxDescription} characters or fewer.`
  if (family && (!draft.safeContact?.trim() || draft.safeContact.trim().length > 300)) errors.safeContact = 'Give a safe time or way to follow up, in 300 characters or fewer.'
  if (family && (draft.agency?.trim().length ?? 0) > 120) errors.agency = 'Keep the partner or agency name to 120 characters or fewer.'
  if (family && (draft.agencyReference?.trim().length ?? 0) > 80) errors.agencyReference = 'Keep the reference to 80 characters or fewer.'
  if (!draft.neighborhood) errors.neighborhood = 'Choose a neighborhood or select Unknown.'
  if (!['phone', 'text', 'email'].includes(draft.method)) {
    errors.method = 'Choose how you want to be contacted first.'
  } else {
    const error = contactError(draft.method, draft.contact.trim())
    if (error) errors.contact = error
  }
  if (draft.secondMethod) {
    if (draft.secondMethod === draft.method || !['phone', 'text', 'email'].includes(draft.secondMethod)) {
      errors.secondMethod = 'Choose a different second contact method.'
    } else {
      const error = contactError(draft.secondMethod, draft.secondContact?.trim() || '')
      if (error) errors.secondContact = error
    }
  }
  return errors
}

function contactError(method: ContactMethod | '', contact: string) {
  if (method === 'email') {
    if (contact.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return 'Enter an email address such as resident@example.com.'
  } else if (contact.length > 35 || !/^[+\d(). -]+$/.test(contact) || !/^\d{7,15}$/.test(contact.replace(/\D/g, ''))) {
    return 'Enter a phone number, including the area code.'
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
