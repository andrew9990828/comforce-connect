// Local staff entry. Codex (GPT-6) implemented the one-time-code sign-in form.
import { useState, type FormEvent } from 'react'
import { supabase } from '../supabase'

const staffEmail = 'von@comforce.example'

export default function TeamLogin() {
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function signIn(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (sent && !/^\d{6}$/.test(code.trim())) {
      setError('Enter the six-digit code from the most recent email.')
      return
    }
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const result = sent
        ? await supabase.auth.verifyOtp({ email: staffEmail, token: code.trim(), type: 'email' })
        : await supabase.auth.signInWithOtp({ email: staffEmail })
      if (result.error) throw result.error
      if (!sent) {
        setSent(true)
        setNotice('Code sent to the local demo inbox.')
      }
    } catch {
      setError(sent ? 'Sign-in failed. Check the latest code, or request a new one.' : 'Could not send the code. Check the local connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="team-page">
    <div className="team-intro"><h1>Team workspace</h1></div>
    <section className="team-login" aria-labelledby="sign-in-heading">
      <h2 id="sign-in-heading">Staff sign-in</h2>
      <p>Sign in to manage the fictional requests in this local demo.</p>
      <form onSubmit={signIn}>
        <div className="team-account"><span>Demo account</span><strong>{staffEmail}</strong></div>
        {sent && <div>
          <label htmlFor="team-code">Six-digit sign-in code</label>
          <input id="team-code" type="text" inputMode="numeric" autoComplete="one-time-code"
            maxLength={6} value={code} onChange={e => setCode(e.target.value)} autoFocus required />
          <p className="team-hint">On the development computer, open the local Mailpit inbox at <a href="http://127.0.0.1:54324" target="_blank" rel="noreferrer">127.0.0.1:54324</a> and read the latest email.</p>
        </div>}
        <div role="status" className="team-notice">{notice}</div>
        {error && <p role="alert" className="team-error">{error}</p>}
        <div className="team-buttons">
          <button type="submit" disabled={busy} className="team-primary">
            {busy ? 'Please wait…' : sent ? 'Open workspace' : 'Send sign-in code'}
          </button>
          {sent && <button type="button" className="team-secondary" disabled={busy} onClick={() => {
            setSent(false); setCode(''); setError(''); setNotice('')
          }}>Request another code</button>}
        </div>
      </form>
    </section>
  </main>
}
