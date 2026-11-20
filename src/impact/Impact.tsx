// Public impact view. Codex (GPT-6) implemented aggregate polling, geographic selection and monthly comparisons.
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { neighborhoods } from './neighborhoods'
import NeighborhoodMap from './NeighborhoodMap'
import './impact.css'

type Totals = { requests_helped: number; needs_fulfilled: number; referrals_made: number; food_fulfilled: number }
type ImpactRow = Totals & { month: string; neighborhood: string | null }
const zero: Totals = { requests_helped: 0, needs_fulfilled: 0, referrals_made: 0, food_fulfilled: 0 }
const metrics = [
  ['requests_helped', 'Requests helped', 'Requests with at least one confirmed delivery.'],
  ['needs_fulfilled', 'Needs fulfilled', 'Individual needs with help confirmed.'],
  ['referrals_made', 'Referrals made', 'Referrals sent to a partner.'],
] as const
const monthFormat = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
function monthLabel(month: string) {
  return monthFormat.format(new Date(month + '-01T12:00:00Z'))
}
function precedingMonths(month: string, count: number) {
  const [year, index] = month.split('-').map(Number)
  return Array.from({ length: count }, (_, i) => new Date(Date.UTC(year, index - count + i, 1)).toISOString().slice(0, 7))
}
function chicagoMonth() {
  const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', timeZone: 'America/Chicago' }).formatToParts(new Date())
  return parts.find(p => p.type === 'year')!.value + '-' + parts.find(p => p.type === 'month')!.value
}

export default function Impact() {
  const [rows, setRows] = useState<ImpactRow[] | null>(null)
  const [month, setMonth] = useState('')
  const [selected, setSelected] = useState('')
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let disposed = false
    let pending: AbortController | null = null
    async function refresh() {
      if (pending || document.visibilityState === 'hidden') return
      pending = new AbortController()
      const timeout = window.setTimeout(() => pending?.abort(), 8000)
      try {
        const result = await supabase.rpc('public_impact').abortSignal(pending.signal)
        if (disposed) return
        if (result.error) throw result.error
        const fresh = (result.data ?? []) as ImpactRow[]
        setRows(fresh)
        setMonth(chosen => chosen || fresh.map(row => row.month).sort().at(-1) || chicagoMonth())
        setFailed(false)
      } catch {
        if (!disposed) setFailed(true)
      } finally {
        window.clearTimeout(timeout)
        pending = null
      }
    }
    void refresh()
    const timer = window.setInterval(refresh, 3000)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      disposed = true
      pending?.abort()
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [retry])

  const current = chicagoMonth()
  const period = month || current
  const periods = [...new Set([...precedingMonths(current, 6), ...precedingMonths(period, 3),
    ...(rows ?? []).flatMap(row => precedingMonths(row.month, 3))])].sort().reverse()
  const monthly = (rows ?? []).filter(row => row.month === period)
  const totals = monthly.find(row => row.neighborhood === (selected || null)) ?? zero
  const counts = rows && Object.fromEntries(monthly.filter(row => row.neighborhood).map(row => [row.neighborhood!, row.needs_fulfilled]))
  const series = precedingMonths(period, 3).map(value => ({
    month: value,
    value: (rows ?? []).find(row => row.month === value && row.neighborhood === (selected || null))?.needs_fulfilled ?? 0,
  }))
  const maximum = Math.max(1, ...series.map(item => item.value))
  const scope = selected === 'Unknown' ? 'Neighborhood unknown' : selected || 'All neighborhoods'
  const areas = [...neighborhoods, 'Unknown'].sort((a, b) => (counts?.[b] ?? 0) - (counts?.[a] ?? 0) || a.localeCompare(b))

  return <main className="impact-page">
    <header className="impact-intro"><div>
      <h1>Community impact</h1>
      <p>Community Task Force MKE connects Milwaukee neighbors with practical help, from groceries to a ride.</p>
    </div><a className="impact-cta" href="/request">Request help</a></header>
    <section className="impact-atlas" aria-labelledby="impact-map-heading">
      <div className="impact-atlas-header"><div>
        <h2 id="impact-map-heading">Help by neighborhood</h2><p>Confirmed deliveries in {monthLabel(period)}</p>
      </div><div className="impact-filters">
        <label>Reporting month<select value={period} onChange={e => setMonth(e.target.value)}>
          {periods.map(value => <option key={value} value={value}>{monthLabel(value)}</option>)}
        </select></label>
        <label>Neighborhood<select value={selected} onChange={e => setSelected(e.target.value)}>
          <option value="">All neighborhoods</option>{[...neighborhoods, 'Unknown'].map(name =>
            <option key={name} value={name}>{name === 'Unknown' ? 'Neighborhood unknown' : name}</option>)}
        </select></label>
      </div></div>
      {failed && <div className="impact-error" role="alert"><span>{rows ? 'Showing the last available totals. The latest refresh failed.' : 'Totals are unavailable. Check the local database connection.'}</span>
        <button type="button" onClick={() => setRetry(v => v + 1)}>Retry</button></div>}
      {!failed && !rows && <p role="status">Loading neighborhood totals…</p>}
      <div className="impact-map-layout"><NeighborhoodMap selected={selected} counts={counts} choose={setSelected} />
        <section className="impact-summary" aria-labelledby="impact-overview">
          <h3 id="impact-overview">Monthly outcomes</h3><p>{scope} · Fictional activity</p>
          <dl className="impact-metrics">{metrics.map(([key, title, description]) =>
            <div key={key}><dt>{title}</dt><dd data-testid={key}>{rows ? totals[key] : '—'}</dd><dd className="impact-definition">{description}</dd></div>
          )}</dl>
          {rows && !totals.needs_fulfilled && !totals.referrals_made &&
            <p className="impact-empty">No outcomes recorded for this selection. Choose another neighborhood or reporting month to explore activity.</p>}
        </section>
      </div>
      <p className="impact-credit">Boundaries from the City of Milwaukee Neighborhood Identification Project. Activity is fictional.</p>
    </section>
    <div className="impact-details">
      <section className="impact-breakdown" aria-label="Neighborhood totals">
        <h2>Neighborhood totals</h2>
        <div className="impact-table-head"><span>Neighborhood</span><span>Fulfilled</span></div>
        <ul>{areas.map(name => <li key={name}>
          <button onClick={() => setSelected(name)} aria-pressed={selected === name}>
            <span>{name === 'Unknown' ? 'Neighborhood unknown' : name}</span><b>{rows ? counts?.[name] ?? 0 : '—'}</b>
          </button>
        </li>)}</ul>
        {selected && <button className="impact-reset" onClick={() => setSelected('')}>Show all neighborhoods</button>}
      </section>
      <section className="impact-trends" aria-labelledby="impact-trend-heading">
      <div><h2 id="impact-trend-heading">Delivery trend</h2><p>{scope} · Three months ending {monthLabel(period)}</p>
        <p className="impact-food"><strong data-testid="food_fulfilled">{rows ? totals.food_fulfilled : '—'}</strong> food {totals.food_fulfilled === 1 ? 'need' : 'needs'} fulfilled in {monthLabel(period)}</p>
      </div>
      <ul aria-label="Needs fulfilled by month">{series.map(({month: value, value: amount}) =>
        <li key={value} className={value === period ? 'current' : ''}>
          <span>{monthLabel(value)}</span><div className="impact-track" aria-hidden="true"><i style={{ width: (rows ? amount / maximum * 100 : 0) + '%' }} /></div>
          <b>{rows ? amount : '—'}</b>
        </li>)}</ul>
      </section>
    </div>
  </main>
}
