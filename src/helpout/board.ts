// Lend a Hand board types and offer rules. Contributor: asherjaenchen. AI assistance: Claude Opus 5.5 wrote the validation and progress math.
export type Kind = 'supply' | 'event' | 'skill'
export interface BoardItem {
  id: string; kind: Kind; title: string; detail: string; location: string | null; starts_at: string | null
  goal: number | null; collected: number; pledged: number; signed_up: number
}
export interface OfferDraft { name: string; method: 'phone' | 'text' | 'email'; contact: string; quantity: string; note: string }

export const kindLabels: Record<Kind, string> = { supply: 'Bring supplies', event: 'Join an event', skill: 'Share a skill' }

export function validateOffer(kind: Kind, draft: OfferDraft) {
  const errors: Partial<Record<keyof OfferDraft, string>> = {}
  const name = draft.name.trim()
  if (!name || name.length > 80) errors.name = 'Enter your first name, in 80 characters or fewer.'
  const contact = draft.contact.trim()
  if (draft.method === 'email') {
    if (contact.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) errors.contact = 'Enter an email address such as neighbor@example.com.'
  } else if (contact.length > 35 || !/^[+\d(). -]+$/.test(contact) || !/^\d{7,15}$/.test(contact.replace(/\D/g, ''))) {
    errors.contact = 'Enter a phone number, including the area code.'
  }
  if (kind === 'supply') {
    const qty = Number(draft.quantity)
    if (!Number.isInteger(qty) || qty < 1 || qty > 500) errors.quantity = 'Enter a number from 1 to 500.'
  }
  if (draft.note.trim().length > 300) errors.note = 'Keep the note to 300 characters or fewer.'
  return errors
}

// Supplies: received count plus offers still on their way. Events: prior sign-ups plus new ones.
export function progress(item: Pick<BoardItem, 'kind' | 'goal' | 'collected' | 'pledged' | 'signed_up'>) {
  const goal = item.goal ?? 0
  const have = item.kind === 'event' ? item.collected + item.signed_up : item.collected
  const incoming = item.kind === 'supply' ? item.pledged : 0
  return {
    have, incoming, goal,
    left: Math.max(goal - have - incoming, 0),
    percent: goal ? Math.min(Math.round((have / goal) * 100), 100) : 0,
    incomingPercent: goal ? Math.min(Math.round(((have + incoming) / goal) * 100), 100) : 0,
  }
}

export const eventDate = (iso: string) => new Date(iso).toLocaleString('en-US', {
  timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
})
