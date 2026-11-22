// Verified staff entry. Codex (GPT-6) implemented the optional OTP flow and retained the pending step on reload.
import { useState, type FormEvent } from 'react'
import { preview, route } from '../preview/location'
import { supabase } from '../supabase'

const pendingKey = 'comforce.pending-staff-email'
export default function TeamLogin() {
  const [sentTo, setSentTo] = useState(() => !preview && sessionStorage.getItem(pendingKey) || '')
  const [email, setEmail] = useState(sentTo)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function signIn(event: FormEvent) {
    event.preventDefault()
    if (preview) {
      if (sentTo) location.assign(route('/team'))
      else setSentTo(email)
      return
    }
    if (busy) return
    setError('')
    setBusy(true)
    try {
      const address = email.trim().toLowerCase()
      const result = sentTo
        ? await supabase.auth.verifyOtp({ email: sentTo, token: code.trim(), type: 'email' })
        : await supabase.auth.signInWithOtp({ email: address })
      if (result.error) throw result.error
      if (sentTo) sessionStorage.removeItem(pendingKey)
      else {
        sessionStorage.setItem(pendingKey, address)
        setSentTo(address)
      }
    } catch {
      setError(sentTo ? 'Check the newest code in your inbox or request another code.' : 'Could not send the code. Check the email address and try again.')
    } finally { setBusy(false) }
  }
  function restart() {
    if (!preview) sessionStorage.removeItem(pendingKey)
    setSentTo('')
    setCode('')
    setError('')
  }
  return <main className="team-page"><section className="team-login">
    <h1>Staff sign-in</h1>
    <p>{preview ? 'Preview sign-in with a fictional email and any six-digit code.' : 'Use your approved staff email. Administrators manage assignments. Caseworkers see only cases assigned to them.'}</p>
    <form onSubmit={signIn}>
      {sentTo ? <><p role="status">{preview ? 'Enter any six-digit preview code for ' : 'Enter the six-digit code sent to '}<strong>{sentTo}</strong>.</p>
        <label>Six-digit sign-in code<input value={code} onChange={e => setCode(e.target.value)}
          inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus /></label></>
        : <label>Staff email<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label>}
      {error && <p role="alert" className="team-error">{error}</p>}
      <div className="case-buttons">
        <button type="submit" disabled={busy} className="team-primary">{busy ? 'Please wait…' : sentTo ? 'Open workspace' : 'Send sign-in code'}</button>
        {sentTo && <button type="button" className="team-secondary" disabled={busy} onClick={restart}>Request another code</button>}
      </div>
    </form>
    <a href={route('/team')}>Open fictional team demo</a>
  </section></main>
}
