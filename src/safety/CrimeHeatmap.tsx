// Monthly MPD incident heatmap. Claude (Opus 5.5) moved it onto the shared neighborhood map so both map pages match.
import { t, monthLabel, formatNumber } from '../languages/language'
import { useEffect, useState } from 'react'
import NeighborhoodMap from '../impact/NeighborhoodMap'
import { monthlyIncidents } from './crimeData'

const frameMilliseconds = 3000
const reducedMotionQuery = '(prefers-reduced-motion: reduce)'
// Same green ramp as the atlas, with one extra step for the wider incident range.
const colors = [
  { label: '0–24', color: 'var(--surface)' },
  { label: '25–49', color: 'var(--line)' },
  { label: '50–74', color: 'var(--mid)' },
  { label: '75–99', color: 'var(--teal)' },
  { label: '100+', color: 'var(--ink)' },
]

function level(value: number) {
  if (value >= 100) return 4
  if (value >= 75) return 3
  if (value >= 50) return 2
  if (value >= 25) return 1
  return 0
}

export default function CrimeHeatmap() {
  const [frame, setFrame] = useState(0)
  const [selected, setSelected] = useState('')
  const [playing, setPlaying] = useState(() => !window.matchMedia(reducedMotionQuery).matches)
  const current = monthlyIncidents[frame]
  const counts = current.counts as Record<string, number>
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
  const shown = selected ? counts[selected] ?? 0 : total

  useEffect(() => {
    const preference = window.matchMedia(reducedMotionQuery)
    const update = (event: MediaQueryListEvent) => {
      if (event.matches) setPlaying(false)
    }
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => setFrame(value => (value + 1) % monthlyIncidents.length), frameMilliseconds)
    return () => window.clearInterval(timer)
  }, [playing])

  function selectFrame(value: number) {
    setFrame(value)
    setPlaying(false)
  }

  return <section className="atlas-board crime-player" aria-labelledby="crime-player-title">
    <header className="atlas-heading">
      <div>
        <p className="impact-kicker">{t("January–October 2026")}</p>
        <h2 id="crime-player-title">{t("Reported incidents over time")}</h2>
      </div>
      <button type="button" className="crime-play" aria-pressed={playing} onClick={() => setPlaying(value => !value)}>
        <span aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span>{playing ? t('Pause') : t('Play')}
      </button>
    </header>
    <p className="atlas-instruction">{t("The map advances every three seconds and repeats after 30 seconds. Darker color means more reported incidents, not a safety rating.")} <strong>{t("If someone is in immediate danger, call 911.")}</strong></p>
    <NeighborhoodMap selected={selected} periodLabel={monthLabel(current.month)} counts={counts}
      fill={name => colors[level(counts[name] ?? 0)].color}
      labelValue={name => formatNumber(counts[name] ?? 0)}
      includeUnknown={false} allLabel={t("All six neighborhoods")}
      readout={t('{count} incidents', { count: formatNumber(shown) })}
      legendLabel={t("Monthly incidents")}
      legend={<ul>{colors.map(item => <li key={item.label}><i style={{ backgroundColor: item.color }} />{item.label}</li>)}
        <li><i className="atlas-context-swatch" />{t("Other areas")}</li></ul>}
      choose={name => setSelected(current => current === name ? '' : name)} />
    <div className="crime-timeline" aria-label={t("Choose month")}>
      <div className="crime-progress" aria-hidden="true"><i style={{ width: `${(frame + 1) / monthlyIncidents.length * 100}%` }} /></div>
      <ol>{monthlyIncidents.map((item, index) => <li key={item.month}>
        <button type="button" aria-label={monthLabel(item.month)} aria-current={index === frame ? 'true' : undefined} onClick={() => selectFrame(index)}>
          {monthLabel(item.month, true)}
        </button>
      </li>)}</ol>
    </div>
  </section>
}

