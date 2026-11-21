// Interactive demo atlas. Codex (GPT-6) implemented scoped aggregate reads, month comparisons, map selection and trend controls.
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { impactToken } from '../workspace'
import { neighborhoods } from './neighborhoods'
import NeighborhoodMap from './NeighborhoodMap'

type Totals = {
  requests_helped: number; needs_fulfilled: number; referrals_made: number; food_fulfilled: number; family_followups: number
}
type ImpactRow = Totals & { month: string; neighborhood: string | null }
const zero: Totals = { requests_helped: 0, needs_fulfilled: 0, referrals_made: 0, food_fulfilled: 0, family_followups: 0 }
const metrics = [
  ['requests_helped', 'Requests helped'], ['needs_fulfilled', 'Needs fulfilled'],
  ['referrals_made', 'Referrals sent'], ['family_followups', 'Family check-ins completed'],
] as const
const months = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const shortMonths = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })
function label(month: string, short = false) {
  return (short ? shortMonths : months).format(new Date(month + '-01T12:00:00Z'))
}
function offset(month: string, steps: number) {
  const [year, number] = month.split('-').map(Number)
  return new Date(Date.UTC(year, number - 1 + steps, 1)).toISOString().slice(0, 7)
}
function chicagoMonth() {
  const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', timeZone: 'America/Chicago' }).formatToParts(new Date())
  return parts.find(p => p.type === 'year')!.value + '-' + parts.find(p => p.type === 'month')!.value
}
function comparison(month: string, current: string, count: number | null, prior: number | null) {
  const previous = label(offset(month, -1))
  if (month === current) return `${label(month)} is still in progress.`
  if (count === null) return 'No recorded outcomes for this month.'
  if (prior === null) return `No recorded outcomes for ${previous} to compare.`
  if (count === prior) return `The same number of needs were fulfilled as in ${previous}.`
  if (!prior) return `${count} ${count === 1 ? 'need was' : 'needs were'} fulfilled, after zero in ${previous}.`
  const delta = Math.abs(count - prior)
  return `${delta} ${count > prior ? 'more' : 'fewer'} ${delta === 1 ? 'need' : 'needs'} fulfilled than in ${previous}.`
}

export default function Atlas() {
  const [rows, setRows] = useState<ImpactRow[] | null>(null)
  const [month, setMonth] = useState('')
  const [selected, setSelected] = useState('')
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let disposed = false
    let pending: AbortController | null = null
    async function refresh() {
      if (disposed || pending || document.hidden) return
      const controller = new AbortController()
      pending = controller
      const timeout = window.setTimeout(() => controller.abort(), 8000)
      try {
        const token = impactToken()
        const result = await supabase.rpc('public_impact', { p_token: token }).abortSignal(controller.signal)
        if (result.error) throw result.error
        if (!disposed) {
          const fresh = (result.data ?? []) as ImpactRow[]
          setRows(fresh)
          setMonth(chosen => chosen || fresh.map(row => row.month).sort().at(-1) || chicagoMonth())
          setFailed(false)
        }
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
  const cityMonths = (rows ?? []).filter(row => row.neighborhood === null).map(row => row.month).sort()
  const start = [period, cityMonths[0] || current].sort()[0]
  const end = [current, period, cityMonths.at(-1) || current].sort().at(-1)!
  const periods: string[] = []
  for (let m = start; m <= end; m = offset(m, 1)) periods.push(m)
  const monthly = (rows ?? []).filter(row => row.month === period)
  const totals = monthly.find(row => row.neighborhood === (selected || null)) ?? zero
  const counts = rows && Object.fromEntries(monthly.filter(row => row.neighborhood).map(row => [row.neighborhood!, row.needs_fulfilled]))
  const scope = selected === 'Unknown' ? 'Unknown neighborhood' : selected || 'All neighborhoods'
  const series = Array.from({ length: 6 }, (_, i) => {
    const m = offset(period, i - 5)
    const value = cityMonths.includes(m)
      ? (rows?.find(row => row.month === m && row.neighborhood === (selected || null))?.needs_fulfilled ?? 0)
      : null
    return { m, value }
  })
  const max = Math.max(1, ...(rows ?? []).filter(row => row.neighborhood === (selected || null)).map(row => row.needs_fulfilled))
  const index = periods.indexOf(period)
  const hasActivity = totals.needs_fulfilled + totals.referrals_made + totals.family_followups > 0
  const areas = [...neighborhoods, 'Unknown']
  return <section className="atlas-board" aria-labelledby="atlas-title">
    <header className="atlas-heading"><div>
      <p className="impact-kicker">Interactive demo activity</p>
      <h2 id="atlas-title">Neighborhood atlas</h2>
    </div>
      <div className="atlas-month">
        <button type="button" aria-label="Previous month" disabled={index <= 0} onClick={() => setMonth(periods[index - 1])}>‹</button>
        <select aria-label="Reporting month" value={period} onChange={event => setMonth(event.target.value)}>
          {periods.map(value => <option key={value} value={value}>{label(value)}</option>)}
        </select>
        <button type="button" aria-label="Next month" disabled={index < 0 || index >= periods.length - 1} onClick={() => setMonth(periods[index + 1])}>›</button>
      </div>
    </header>
    <p className="atlas-instruction">Explore fictional outcomes across six Milwaukee neighborhoods. Tap a name to see local totals.</p>
    {failed && <div role="alert" className="atlas-error">
      {rows ? 'Refresh failed. The last available totals are shown.' : 'Demo outcomes are unavailable. Check your connection.'}
      <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button>
    </div>}
    <NeighborhoodMap selected={selected} periodLabel={label(period)} counts={counts} total={rows ? totals.needs_fulfilled : null} choose={setSelected} />
    <div className="atlas-outcomes">
      <div className="atlas-scope">
        <h3>{selected === 'Unknown' ? 'Unknown neighborhood' : selected || 'Citywide'} outcomes</h3>
        <span>{label(period)}</span>
      </div>
      <dl className="atlas-metrics">{metrics.map(([key, title]) => <div key={key}>
        <dt>{title}</dt><dd data-testid={key}>{rows ? totals[key].toLocaleString('en-US') : '—'}</dd>
      </div>)}</dl>
      <p className="atlas-food"><strong data-testid="food_fulfilled">{rows ? totals.food_fulfilled : '—'}</strong> food {totals.food_fulfilled === 1 ? 'need' : 'needs'} fulfilled in this selection.</p>
      {rows && !hasActivity && <p className="atlas-empty" role="status">No recorded outcomes in this selection. Choose another month or neighborhood.</p>}
    </div>
    <div className="atlas-trend">
      <div><p className="impact-kicker">Six-month history</p><h3>Needs fulfilled</h3>
        <p>{scope} · {label(series[0].m, true)}–{label(period)}</p>
        <p className="atlas-comparison">{rows ? comparison(period, current, series[5].value, series[4].value) : 'Awaiting demo data.'}</p>
        {rows && series.some(point => point.value === null) && <p className="atlas-gap">— No citywide outcomes recorded.</p>}
      </div>
      <ol aria-label={`Monthly fulfilled needs for ${scope}`}>{series.map(({m, value}) => <li key={m} className={m === period ? 'current' : ''}>
        <span className="trend-amount">{value ?? '—'}</span>
        <span className="trend-track"><i aria-hidden="true" style={{height: value ? `${value / max * 100}%` : '0'}} /></span>
        <span aria-label={label(m)}>{label(m, true)}</span>
      </li>)}</ol>
    </div>
    <details className="atlas-table"><summary>Neighborhood totals and map sources</summary>
      <div className="atlas-table-body"><p>Confirmed needs fulfilled in {label(period)}. Select a neighborhood to update the atlas.</p>
        <ul>{areas.map(name => <li key={name}><button type="button" aria-pressed={selected === name} onClick={() => setSelected(name)}>
          {name === 'Unknown' ? 'Unknown neighborhood' : name}<b>{rows ? counts?.[name] ?? 0 : '—'}</b>
        </button></li>)}</ul>
        <p>Requests helped counts each request with a confirmed fulfillment once in the selected month. A referral counts when sent. A family check-in counts when recorded as completed. Gaps in the history indicate months with no recorded citywide outcomes.</p>
        <p>Neighborhood boundaries from the <a href="https://milwaukeemaps.milwaukee.gov/arcgis/rest/services/AGO/neighborhoods/MapServer/0">City of Milwaukee</a>.
          Water features from the 2025 U.S. Census TIGER/Line files for <a href="https://www2.census.gov/geo/tiger/TIGER2025/AREAWATER/tl_2025_55079_areawater.zip">Milwaukee</a> and <a href="https://www2.census.gov/geo/tiger/TIGER2025/AREAWATER/tl_2025_55089_areawater.zip">Ozaukee</a> counties.</p>
      </div>
    </details>
  </section>
}
