// Floating chat panel shared by the community and team assistants. Claude (Opus 5.5) built the conversation, storage and accessible layout.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from '../supabase'
import { isStaffMode } from '../workspace'
import { limits, type AgentName, type AgentReply, type ChatTurn, type ClientAction } from './protocol'
import './assistant.css'

export type StoredAction = ClientAction & { status?: 'saved' | 'dismissed'; key?: string }
type StoredTurn = ChatTurn & { actions?: StoredAction[] }
interface Stored { open: boolean; turns: StoredTurn[] }

// Tab-scoped, so the chat survives page links but clears when the tab closes.
function load(name: AgentName): Stored {
  try {
    const saved = JSON.parse(sessionStorage.getItem(`comforce.assistant.${name}.v1`) || 'null')
    if (saved && Array.isArray(saved.turns)) return { open: !!saved.open, turns: saved.turns }
  } catch { /* Start a new conversation. */ }
  return { open: false, turns: [] }
}

async function ask(name: AgentName, turns: StoredTurn[], token?: string | null): Promise<AgentReply> {
  let recent = turns.slice(-limits.turns)
  if (recent[0]?.role === 'assistant') recent = recent.slice(1)
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-ComForce-Assistant': '1' }
  if (name === 'team' && isStaffMode()) {
    const { data } = await supabase.auth.getSession()
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`
  }
  const response = await fetch(`/agent/${name}`, {
    method: 'POST', headers,
    body: JSON.stringify({ messages: recent.map(({ role, text }) => ({ role, text })), token }),
  })
  const body = await response.json().catch(() => null)
  // A non-JSON answer means the request never reached the assistant, for example while the dev server restarts.
  if (!body) throw new Error('The assistant server didn’t respond. Reload the page and try again.')
  if (!response.ok || typeof body?.reply !== 'string') throw new Error(body?.error || 'The assistant couldn’t answer just now. Please try again.')
  return { reply: body.reply, actions: Array.isArray(body.actions) ? body.actions : [] }
}

interface Props {
  name: AgentName
  title: string
  launcher: string
  greeting: string
  notice: string
  suggestions: string[]
  token?: string | null
  hidden?: boolean
  renderAction: (action: StoredAction, update: (patch: Partial<StoredAction>) => void) => ReactNode
}

export default function Assistant({ name, title, launcher, greeting, notice, suggestions, token, hidden, renderAction }: Props) {
  const [state, setState] = useState(() => load(name))
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const log = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const panelId = `assistant-${name}`

  useEffect(() => { sessionStorage.setItem(`comforce.assistant.${name}.v1`, JSON.stringify(state)) }, [name, state])
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }) }, [state.turns.length, busy, state.open])

  function toggle(open: boolean) {
    setState(current => ({ ...current, open }))
    if (open) requestAnimationFrame(() => input.current?.focus())
  }
  async function send(text: string) {
    const message = text.trim().slice(0, limits.characters)
    if (!message || busy) return
    const turns: StoredTurn[] = [...state.turns, { role: 'user', text: message }]
    setState(current => ({ ...current, turns }))
    setDraft('')
    setError('')
    setBusy(true)
    try {
      const { reply, actions } = await ask(name, turns, token)
      setState(current => ({ ...current, turns: [...turns, { role: 'assistant', text: reply, actions }] }))
    } catch (failure) {
      setState(current => ({ ...current, turns: turns.slice(0, -1) }))
      setDraft(message)
      setError(failure instanceof Error ? failure.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
      input.current?.focus()
    }
  }
  function submit(event: FormEvent) { event.preventDefault(); void send(draft) }
  function updateAction(turn: number, index: number, patch: Partial<StoredAction>) {
    setState(current => ({
      ...current,
      turns: current.turns.map((item, t) => t !== turn ? item : {
        ...item, actions: item.actions?.map((action, a) => a === index ? { ...action, ...patch } as StoredAction : action),
      }),
    }))
  }

  if (hidden) return null
  return <div className={`assistant assistant-${name}`}>
    {state.open && <section className="assistant-panel" id={panelId} aria-label={title}>
      <header className="assistant-header">
        <h2>{title}</h2>
        <div>
          {state.turns.length > 0 && <button type="button" className="assistant-clear" onClick={() => { setState({ open: true, turns: [] }); setError('') }}>New chat</button>}
          <button type="button" className="assistant-close" aria-label={`Close ${title}`} onClick={() => toggle(false)}>×</button>
        </div>
      </header>
      <div className="assistant-log" ref={log} aria-live="polite" aria-busy={busy}>
        <p className="assistant-message assistant-from-bot">{greeting}</p>
        {state.turns.map((turn, t) => <div key={t} className={'assistant-message ' + (turn.role === 'user' ? 'assistant-from-user' : 'assistant-from-bot')}>
          <span className="assistant-visually-hidden">{turn.role === 'user' ? 'You said: ' : 'Assistant: '}</span>
          <p>{turn.text}</p>
          {!!turn.actions?.length && <div className="assistant-actions">
            {turn.actions.map((action, a) => <div key={a}>{renderAction(action, patch => updateAction(t, a, patch))}</div>)}
          </div>}
        </div>)}
        {busy && <p className="assistant-message assistant-from-bot assistant-typing" role="status">Thinking…</p>}
        {!state.turns.length && !busy && <div className="assistant-suggestions" role="group" aria-label="Suggested questions">
          {suggestions.map(text => <button type="button" key={text} onClick={() => void send(text)}>{text}</button>)}
        </div>}
      </div>
      {error && <p className="assistant-error" role="alert">{error}</p>}
      <form className="assistant-form" onSubmit={submit}>
        <label className="assistant-visually-hidden" htmlFor={`${panelId}-input`}>Message</label>
        <textarea id={`${panelId}-input`} ref={input} rows={2} value={draft} maxLength={limits.characters} placeholder="Type a message"
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(draft) } }}/>
        <button type="submit" disabled={busy || !draft.trim()}>Send</button>
      </form>
      <p className="assistant-notice">{notice}</p>
    </section>}
    <button type="button" className="assistant-launcher" aria-expanded={state.open} aria-controls={state.open ? panelId : undefined}
      onClick={() => toggle(!state.open)}>
      <span aria-hidden="true" className="assistant-icon" />{state.open ? 'Close chat' : launcher}
    </button>
  </div>
}
