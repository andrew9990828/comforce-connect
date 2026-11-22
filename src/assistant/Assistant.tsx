// Floating chat panel shared by the community and team assistants. Claude (Opus 5.5) built the conversation, storage and accessible layout.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { t, useLanguage, type Language } from '../languages/language'
import { isStaffMode } from '../workspace'
import { limits, type AgentName, type AgentReply } from './protocol'
import { addReply, dropUnanswered, newChat, requestBody, restore, updateAction, withKeys, type Stored, type StoredAction, type StoredTurn } from './conversation'
import './assistant.css'

export type { StoredAction }

// Tab-scoped, so the chat survives page links but clears when the tab closes.
function load(storageKey: string) {
  try { return restore(JSON.parse(sessionStorage.getItem(storageKey) || 'null')) }
  catch { return { state: newChat(), unsent: '' } }
}

async function ask(name: AgentName, turns: StoredTurn[], language: Language, token?: string | null): Promise<AgentReply> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-ComForce-Assistant': '1', 'X-ComForce-Language': language }
  if (name === 'team' && isStaffMode()) {
    const { supabase } = await import('../supabase')
    const { data } = await supabase.auth.getSession()
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`
  }
  const response = await fetch(`/agent/${name}`, {
    method: 'POST', headers,
    body: requestBody(turns, token),
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
  // Where the conversation is kept. The team assistant passes one key per identity and workspace.
  storageKey?: string
  hidden?: boolean
  renderAction: (action: StoredAction, update: (patch: Partial<StoredAction>) => void) => ReactNode
}

export default function Assistant({ name, title, launcher, greeting, notice, suggestions, token, storageKey = `comforce.assistant.${name}.v1`, hidden, renderAction }: Props) {
  const language = useLanguage()
  const [initial] = useState(() => load(storageKey))
  const [state, setState] = useState<Stored>(initial.state)
  const [draft, setDraft] = useState(initial.unsent)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initial.unsent ? 'Your last message wasn’t answered. Send it again.' : '')
  const chatRef = useRef(state.chat)
  const log = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const panelId = `assistant-${name}`
  chatRef.current = state.chat

  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(state)) } catch { /* Keep this conversation in memory. */ }
  }, [storageKey, state])
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }) }, [state.turns.length, busy, state.open])

  function toggle(open: boolean) {
    setState(current => ({ ...current, open }))
    if (open) requestAnimationFrame(() => input.current?.focus())
  }
  async function send(text: string) {
    const message = text.trim().slice(0, limits.characters)
    if (!message || busy) return
    const chat = state.chat
    const turns: StoredTurn[] = [...state.turns, { role: 'user', text: message }]
    setState(current => current.chat === chat ? { ...current, turns: [...current.turns, { role: 'user', text: message }] } : current)
    setDraft('')
    setError('')
    setBusy(true)
    try {
      const { reply, actions } = await ask(name, turns, language, token)
      setState(current => addReply(current, chat, { role: 'assistant', text: reply, actions: withKeys(actions) }))
    } catch (failure) {
      setState(current => dropUnanswered(current, chat))
      if (chatRef.current === chat) {
        setDraft(message)
        setError(failure instanceof Error ? failure.message : 'Something went wrong. Please try again.')
      }
    } finally {
      // A cleared chat has already released the input. Leave the new conversation alone.
      if (chatRef.current === chat) {
        setBusy(false)
        input.current?.focus()
      }
    }
  }
  function submit(event: FormEvent) { event.preventDefault(); void send(draft) }
  function clear() {
    const next = newChat(true)
    chatRef.current = next.chat
    setState(next)
    setBusy(false)
    setError('')
  }

  if (hidden) return null
  return <div className={`assistant assistant-${name}`}>
    {state.open && <section className="assistant-panel" id={panelId} aria-label={t(title)}>
      <header className="assistant-header">
        <h2>{t(title)}</h2>
        <div>
          {(state.turns.length > 0 || busy) && <button type="button" className="assistant-clear" onClick={clear}>{t('New chat')}</button>}
          <button type="button" className="assistant-close" aria-label={t('Close {title}', { title: t(title) })} onClick={() => toggle(false)}>×</button>
        </div>
      </header>
      <div className="assistant-log" ref={log} aria-live="polite" aria-busy={busy}>
        <p className="assistant-message assistant-from-bot">{t(greeting)}</p>
        {state.turns.map((turn, index) => <div key={`${state.chat}-${index}`} className={'assistant-message ' + (turn.role === 'user' ? 'assistant-from-user' : 'assistant-from-bot')}>
          <span className="assistant-visually-hidden">{t(turn.role === 'user' ? 'You said' : 'Assistant')} · </span>
          <p>{turn.text}</p>
          {!!turn.actions?.length && <div className="assistant-actions">
            {turn.actions.map((action, a) => <div key={a}>{renderAction(action, patch => setState(current => updateAction(current, state.chat, index, a, patch)))}</div>)}
          </div>}
        </div>)}
        {busy && <p className="assistant-message assistant-from-bot assistant-typing" role="status">{t('Thinking…')}</p>}
        {!state.turns.length && !busy && <div className="assistant-suggestions" role="group" aria-label={t("Suggested questions")}>
          {suggestions.map(text => <button type="button" key={text} onClick={() => void send(t(text))}>{t(text)}</button>)}
        </div>}
      </div>
      {error && <p className="assistant-error" role="alert">{t(error)}</p>}
      <form className="assistant-form" onSubmit={submit}>
        <label className="assistant-visually-hidden" htmlFor={`${panelId}-input`}>{t('Message')}</label>
        <textarea id={`${panelId}-input`} ref={input} rows={2} value={draft} maxLength={limits.characters} placeholder={t("Type a message")}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(draft) } }}/>
        <button type="submit" disabled={busy || !draft.trim()}>{t('Send')}</button>
      </form>
      <p className="assistant-notice">{t(notice)}</p>
    </section>}
    <button type="button" className="assistant-launcher" aria-expanded={state.open} aria-controls={state.open ? panelId : undefined}
      onClick={() => toggle(!state.open)}>
      <span aria-hidden="true" className="assistant-icon" />{t(state.open ? 'Close chat' : launcher)}
    </button>
  </div>
}
