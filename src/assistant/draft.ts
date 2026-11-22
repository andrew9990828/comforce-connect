// Hands an assistant-prepared draft to the request form. Claude (Opus 5.5) implemented the hand-off.
import { route } from '../preview/location'
import { neighborhoods } from '../impact/neighborhoods'
import { serviceLabels, type Service } from '../services'

export interface RequestDraft { services: Service[]; description: string; neighborhood: string }
const key = 'comforce.assistant.draft.v1'
export const draftEvent = 'comforce:assistant-draft'

export function offerDraft(draft: RequestDraft) {
  sessionStorage.setItem(key, JSON.stringify(draft))
  const onForm = location.pathname.replace(/\/+$/, '') === route('/request') && !new URLSearchParams(location.search).has('source')
  if (onForm) window.dispatchEvent(new Event(draftEvent))
  else location.assign(route('/request'))
}

// Reads and removes the waiting draft, keeping only values the form accepts.
export function takeDraft(): RequestDraft | null {
  const saved = sessionStorage.getItem(key)
  sessionStorage.removeItem(key)
  try {
    const draft = JSON.parse(saved || 'null')
    if (!draft || !Array.isArray(draft.services)) return null
    const services = draft.services.filter((s: unknown): s is Service => typeof s === 'string' && s in serviceLabels)
    if (!services.length) return null
    const neighborhood = draft.neighborhood === 'Unknown' || neighborhoods.includes(draft.neighborhood) ? draft.neighborhood : ''
    return { services, description: typeof draft.description === 'string' ? draft.description.slice(0, 800) : '', neighborhood }
  } catch { return null }
}
