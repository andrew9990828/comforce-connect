// Staff workspace. Codex (GPT-6) built the authenticated, automatically refreshed needs queue.
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import CaseDetail from './CaseDetail'
import TeamLogin from './TeamLogin'
import { dated, isOverdue, nextStep, serviceLabels, statusLabels, type NeedStatus, type Service, type TeamRequest } from './queue'
import './team.css'

type Attention = 'all' | 'overdue' | 'unassigned'

function Workspace() {
  const [requests, setRequests] = useState<TeamRequest[] | null>(null)
  const [error, setError] = useState('')
  const [authError, setAuthError] = useState('')
  const [refreshNumber, setRefreshNumber] = useState(0)
  const [search, setSearch] = useState('')
  const [service, setService] = useState('')
  const [owner, setOwner] = useState('')
  const [status, setStatus] = useState<NeedStatus | 'all'>('open')
  const [attention, setAttention] = useState<Attention>('all')
  const [selectedId, selectNeed] = useState('')

  function refresh() { setRefreshNumber(number => number + 1) }

  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout>
    let pending: AbortController | undefined
    async function pull() {
      clearTimeout(timer)
      if (!live || pending || document.hidden) return
      const controller = new AbortController()
      pending = controller
      const timeout = setTimeout(() => controller.abort(), 8000)
      try {
        const { data, error } = await supabase.rpc('team_queue').abortSignal(controller.signal)
        if (!live) return
        if (error) {
          // Expired or revoked staff access also clears the last successful read.
          if (['42501', 'PGRST301', 'PGRST303'].includes(error.code)) setRequests(null)
          throw error
        }
        setRequests(data as TeamRequest[])
        setError('')
      } catch {
        if (live) setError('Could not refresh the queue. Check the local connection and your staff session.')
      } finally {
        clearTimeout(timeout)
        pending = undefined
        if (live && !document.hidden) timer = setTimeout(pull, 2500)
      }
    }
    void pull()
    window.addEventListener('focus', pull)
    window.addEventListener('online', pull)
    document.addEventListener('visibilitychange', pull)
    return () => {
      live = false
      clearTimeout(timer)
      pending?.abort()
      window.removeEventListener('focus', pull)
      window.removeEventListener('online', pull)
      document.removeEventListener('visibilitychange', pull)
    }
  }, [refreshNumber])

  const now = Date.now()
  const rows = (requests || []).flatMap(request => request.needs.map(need => ({ request, need })))
  const opened = rows.filter(row => row.need.status === 'open')
  const overdue = opened.filter(row => isOverdue(row.need, now))
  const unassigned = opened.filter(row => !row.need.owner)
  const owners = Array.from(new Set(rows.flatMap(row => row.need.owner ? [row.need.owner] : []))).sort()
  const partners = Array.from(new Set(rows.flatMap(row => row.need.referrals.map(ref => ref.partner)))).sort()
  const query = search.trim().toLowerCase()
  const visible = rows.filter(({ request, need }) =>
    (!service || need.service === service) && (!owner || need.owner === owner) &&
    (status === 'all' || need.status === status) &&
    (attention !== 'overdue' || isOverdue(need, now)) &&
    (attention !== 'unassigned' || (need.status === 'open' && !need.owner)) &&
    (!query || [request.reference, request.neighborhood, request.description, serviceLabels[need.service], need.owner]
      .some(field => field?.toLowerCase().includes(query))))
    .sort((a, b) => Number(isOverdue(b.need, now)) - Number(isOverdue(a.need, now))
      || Number(!b.need.owner) - Number(!a.need.owner)
      || Date.parse(b.request.created_at) - Date.parse(a.request.created_at))
  const selected = rows.find(row => row.need.id === selectedId)

  function focusAttention(value: Attention) {
    setAttention(value)
    setSearch('')
    setService('')
    setOwner('')
    setStatus('open')
  }
  function clearFilters() { focusAttention('all'); setStatus('all') }
  const filtered = !!search || !!service || !!owner || attention !== 'all' || status !== 'all'
  const metricButtons: [Attention, string, number][] = [
    ['all', 'Open needs', opened.length], ['overdue', 'Overdue follow-ups', overdue.length],
    ['unassigned', 'Unassigned needs', unassigned.length],
  ]

  return <main className="team-page">
    <header className="team-intro">
      <h1>Team workspace</h1>
      <a className="team-primary" href="/request?source=call"><span aria-hidden="true">+</span> New request</a>
    </header>
    {error && <div className="team-error" role="alert">{error} <button type="button" onClick={refresh}>Retry</button></div>}
    {requests === null ? (!error && <p role="status">Loading the staff queue…</p>) : <>
      <div className="team-attention" role="group" aria-label="Filter needs requiring attention">
        {metricButtons.map(([key, label, count]) => <button key={key}
          aria-pressed={attention === key && status === 'open' && !service && !owner && !search}
          onClick={() => focusAttention(key)}>
          <strong>{count}</strong><span>{label}</span>
        </button>)}
      </div>
      <section className="team-queue" aria-labelledby="queue-heading">
        <div className="team-queue-heading"><h2 id="queue-heading">Needs queue</h2>
          <span aria-live="polite">{visible.length} {visible.length === 1 ? 'need' : 'needs'} shown</span></div>
        <div className="team-filters">
          <label className="team-search">Search
            <input type="search" placeholder="Reference, neighborhood, or need" value={search} onChange={e => setSearch(e.target.value)}/>
          </label>
          <label>Service<select value={service} onChange={e => setService(e.target.value)}>
            <option value="">All services</option>{(Object.keys(serviceLabels) as Service[]).map(s => <option key={s} value={s}>{serviceLabels[s]}</option>)}
          </select></label>
          <label>Owner<select value={owner} onChange={e => setOwner(e.target.value)}>
            <option value="">All owners</option>{owners.map(name => <option key={name} value={name}>{name}</option>)}
          </select></label>
          <label>Status<select value={status} onChange={e => { setStatus(e.target.value as typeof status); setAttention('all') }}>
            <option value="all">All statuses</option>{(Object.keys(statusLabels) as NeedStatus[]).map(s =>
              <option key={s} value={s}>{statusLabels[s]}</option>)}
          </select></label>
        </div>
        {attention !== 'all' && <p className="team-applied">{attention === 'overdue' ? 'Overdue follow-ups' : 'Unassigned needs'} only <button onClick={() => setAttention('all')}>Remove</button></p>}
        {!visible.length ? <div className="team-empty"><h3>No matching needs</h3>
          <p>{rows.length ? 'Try a different search or filter.' : 'New requests will appear here automatically.'}</p>
          {rows.length > 0 && filtered && <button className="team-secondary" onClick={clearFilters}>Clear filters</button>}
        </div> : <>
          <div aria-hidden="true" className="team-columns"><span>Need / request</span><span>Owner</span><span>Next step / outcome</span><span>Follow-up</span><span/></div>
          <ul className="team-rows">{visible.map(({ request, need }) => <li key={need.id}>
            <button className="team-row" onClick={() => selectNeed(need.id)}>
              <span className="team-identity"><strong>{serviceLabels[need.service]}</strong>
                <small>{request.reference} · {request.neighborhood}</small></span>
              <span className="team-row-owner"><span className="team-mobile-label">Owner</span>
                <span className={!need.owner && need.status === 'open' ? 'team-flag' : undefined}>{need.owner || 'Unassigned'}</span></span>
              <span className="team-row-step"><span className="team-mobile-label">Next step / outcome</span>{nextStep(need)}</span>
              <span className="team-row-due"><span className="team-mobile-label">Follow-up</span>
                {isOverdue(need, now) && <span className="team-flag">Overdue</span>}
                {need.status !== 'open' ? statusLabels[need.status] : need.follow_up ? dated(need.follow_up) : 'Unscheduled'}</span>
              <span className="team-chevron" aria-hidden="true">›</span>
            </button>
          </li>)}</ul>
        </>}
      </section>
    </>}
    <footer className="team-footer"><span>Local staff session</span><button onClick={async () => {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) setAuthError('Could not sign out. Try again.')
    }}>Sign out</button>{authError && <span role="alert">{authError}</span>}</footer>
    {selected && <CaseDetail {...selected} onSelect={selectNeed} onClose={() => selectNeed('')}
      owners={owners} partners={partners} onSaved={refresh}/>}
  </main>
}

export default function Team() {
  const [account, setAccount] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setAccount(session?.user.email ?? null))
    return () => data.subscription.unsubscribe()
  }, [])
  if (account === undefined) return <main className="team-page"><h1>Team workspace</h1><p role="status">Checking staff session…</p></main>
  return account === 'von@comforce.example' ? <Workspace/> : <TeamLogin/>
}
