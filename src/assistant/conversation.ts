// Conversation state for the assistant panel, kept pure so the reply, reload and reset rules can be tested.
// Claude (Opus 5.5) wrote these rules after review found replies overwriting saved cards and stale turns breaking recovery.
import { submissionKey } from '../intake/form'
import { limits, maxBodyBytes, type ChatTurn, type ClientAction } from './protocol'

export type StoredAction = ClientAction & { status?: 'saved' | 'dismissed'; key?: string }
export type StoredTurn = ChatTurn & { actions?: StoredAction[] }
// `chat` identifies one conversation. A reply that arrives for a conversation the user already cleared is dropped.
export interface Stored { open: boolean; chat: string; turns: StoredTurn[] }

export const newChat = (open = false): Stored => ({ open, chat: submissionKey(), turns: [] })

// Send only complete recent pairs that fit the endpoint's UTF-8 budget, plus the current question.
export function requestBody(turns: StoredTurn[], token?: string | null) {
  const messages = turns.slice(-limits.turns).map(({ role, text }) => ({
    role, text: text.slice(0, role === 'assistant' ? limits.characters * 6 : limits.characters),
  }))
  if (messages[0]?.role === 'assistant') messages.shift()
  const encoder = new TextEncoder()
  let body = JSON.stringify({ messages, token })
  while (messages.length > 1 && encoder.encode(body).byteLength > maxBodyBytes) {
    messages.splice(0, 2)
    body = JSON.stringify({ messages, token })
  }
  return body
}

// Each proposal gets its operation key when it arrives, so every save of that card, including retries, reuses one key.
export function withKeys(actions: ClientAction[]): StoredAction[] {
  return actions.map(action => action.type === 'proposal' ? { ...action, key: submissionKey() } : action)
}

// Rebuilds a saved conversation as strict user/assistant pairs, which is what the server accepts.
// A question that never got its answer, for example because the page reloaded mid-reply, is removed and returned as `unsent`.
export function restore(saved: unknown): { state: Stored; unsent: string } {
  const value = saved as Partial<Stored> | null
  if (!value || !Array.isArray(value.turns)) return { state: newChat(), unsent: '' }
  const turns: StoredTurn[] = []
  for (const turn of value.turns as StoredTurn[]) {
    if (!turn || typeof turn.text !== 'string' || !turn.text.trim()) continue
    const expected = turns.length % 2 ? 'assistant' : 'user'
    if (turn.role === expected) turns.push(turn)
    // Two questions in a row: the earlier one was never answered, so keep only the later one.
    else if (turn.role === 'user') turns[turns.length - 1] = turn
  }
  const unsent = turns.length % 2 ? turns.pop()!.text : ''
  const chat = typeof value.chat === 'string' && value.chat ? value.chat : submissionKey()
  return { state: { open: !!value.open, chat, turns }, unsent }
}

// Appends to the latest state rather than to a snapshot taken when the question was sent,
// so changes made while waiting (a card saved, its key stored) are kept.
export function addReply(state: Stored, chat: string, reply: StoredTurn): Stored {
  if (state.chat !== chat || state.turns[state.turns.length - 1]?.role !== 'user') return state
  return { ...state, turns: [...state.turns, reply] }
}

export function dropUnanswered(state: Stored, chat: string): Stored {
  if (state.chat !== chat || state.turns[state.turns.length - 1]?.role !== 'user') return state
  return { ...state, turns: state.turns.slice(0, -1) }
}

export function updateAction(state: Stored, chat: string, turn: number, index: number, patch: Partial<StoredAction>): Stored {
  if (state.chat !== chat) return state
  return {
    ...state,
    turns: state.turns.map((item, t) => t !== turn ? item : {
      ...item, actions: item.actions?.map((action, a) => a === index ? { ...action, ...patch } as StoredAction : action),
    }),
  }
}

// Team conversations are stored per identity and workspace, and all of them are removed on sign-out.
export const teamPrefix = 'comforce.assistant.team.'
export function clearTeamChats(storage?: Pick<Storage, 'length' | 'key' | 'removeItem'>) {
  try {
    const store = storage ?? sessionStorage
    const keys: string[] = []
    for (let i = 0; i < store.length; i++) { const key = store.key(i); if (key?.startsWith(teamPrefix)) keys.push(key) }
    for (const key of keys) store.removeItem(key)
  } catch { /* Staff can still sign out when tab storage is unavailable. */ }
}
// Short, non-reversible label for a workspace token, so the token itself isn't repeated in a storage key.
export function scopeLabel(value: string) {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 0x01000193)
  return (hash >>> 0).toString(16).padStart(8, '0')
}
