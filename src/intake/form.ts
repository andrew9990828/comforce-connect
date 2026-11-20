// Intake rules and retry identifiers. Codex (GPT-6) implemented validation and LAN-compatible UUIDs.
import type { Service } from '../services'
export type ContactMethod = 'phone' | 'text' | 'email'
export interface IntakeDraft {
  services: Service[]
  description: string
  neighborhood: string
  method: ContactMethod
  contact: string
}
export function validate(draft: IntakeDraft) {
  const errors: Partial<Record<keyof IntakeDraft, string>> = {}
  if (!draft.services.length) errors.services = 'Choose at least one service.'
  if (!draft.description.trim()) errors.description = 'Describe the help needed in a sentence or two.'
  else if (draft.description.trim().length > 800) errors.description = 'Keep the description to 800 characters or fewer.'
  if (!draft.neighborhood) errors.neighborhood = 'Choose a neighborhood or select Unknown.'
  const contact = draft.contact.trim()
  if (draft.method === 'email') {
    if (contact.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) errors.contact = 'Enter an email address such as resident@example.com.'
  } else if (contact.length > 35 || !/^[+\d(). -]+$/.test(contact) || !/^\d{7,15}$/.test(contact.replace(/\D/g, ''))) {
    errors.contact = 'Enter a phone number, including the area code.'
  }
  return errors
}

// getRandomValues also works on a phone visiting the development laptop over HTTP.
export function submissionKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
}
