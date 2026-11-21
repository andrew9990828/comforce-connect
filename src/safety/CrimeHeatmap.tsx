import { useEffect, useState } from 'react'
import geography from '../impact/milwaukee.json'
import water from '../impact/water.json'
import { monthlyIncidents, neighborhoodNames, type Neighborhood } from './crimeData'

const frameMilliseconds = 3000
const colors = [
  { label: '0–24', color: '#f6e9c9' },
  { label: '25–49', color: '#add9be' },
  { label: '50–74', color: '#64b58e' },
  { label: '75–99', color: '#248069' },
  { label: '100+', color: '#084f46' },
]
const labels: Record<Neighborhood, [number, number, 'start' | 'end']> = {
  'Lincoln Park': [109, 126, 'end'], Riverwest: [243, 180, 'start'],
  Harambee: [122, 210, 'end'], "Walker's Point": [236, 258, 'start'],
  'Silver City': [92, 302, 'end'], 'Bay View': [259, 341, 'start'],
}
const shortMonth = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })

function level(value: number) {
  if (value >= 100) return 4
  if (value >= 75) return 3
  if (value >= 50) return 2
  if (value >= 25) return 1
  return 0
}

export default function CrimeHeatmap() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(!reduceMotion)
  const current = monthlyIncidents[frame]
  const total = Object.values(current.counts).reduce((sum, value) => sum + value, 0)

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => setFrame(value => (value + 1) % monthlyIncidents.length), frameMilliseconds)
    return () => window.clearInterval(timer)
  }, [playing])

  function selectFrame(value: number) {
    setFrame(value)
    setPlaying(false)
  }

  return <section className="crime-player" aria-labelledby="crime-player-title">
    <header className="crime-player-heading">
      <div>
        <p className="safety-kicker">January–October 2026</p>
        <h2 id="crime-player-title">Reported incidents over time</h2>
      </div>
      <button type="button" className="crime-play" aria-pressed={playing} onClick={() => setPlaying(value => !value)}>
        <span aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span>{playing ? 'Pause' : 'Play'}
      </button>
    </header>
    <p className="crime-player-copy">The map advances every three seconds and repeats after 30 seconds. Darker color means more reported incidents, not a safety rating.</p>
    <figure className="crime-map">
      <div className="crime-map-frame">
        <svg viewBox="0 -16 330 487" role="img" aria-labelledby="crime-map-title crime-map-description">
          <title id="crime-map-title">{current.label} reported-incident heatmap</title>
          <desc id="crime-map-description">Six Milwaukee neighborhoods shaded by the number of unique MPD NIBRS incidents reported during {current.label}.</desc>
          <defs>
            <pattern id="crime-field" width="28" height="28" patternUnits="userSpaceOnUse">
              <path d="M28 0H0V28" fill="none" stroke="#9bafa1" strokeWidth=".55" opacity=".46" />
            </pattern>
            <pattern id="crime-waves" width="22" height="14" patternUnits="userSpaceOnUse">
              <path d="M0 6Q5.5 2.5 11 6T22 6" fill="none" stroke="#92c7c8" strokeWidth=".6" opacity=".43" />
            </pattern>
            <clipPath id="crime-shore"><path d={water.lake} /></clipPath>
          </defs>
          <rect x="-15" y="-30" width="375" height="530" fill="#e4e8d9" />
          <rect x="-15" y="-30" width="375" height="530" fill="url(#crime-field)" />
          <path d={water.lake} className="crime-lake" />
          <g clipPath="url(#crime-shore)"><rect x="0" y="-20" width="350" height="510" fill="url(#crime-waves)" /></g>
          <path d={geography.context} className="crime-context" />
          {neighborhoodNames.map(name => <path key={name} d={geography.areas[name].d}
            fill={colors[level(current.counts[name])].color} className="crime-area" />)}
          <path d={water.rivers} className="crime-rivers" />
          <text x="291" y="100" textAnchor="middle" className="crime-lake-name" transform="rotate(-9 291 100)">Lake Michigan</text>
          {neighborhoodNames.map(name => {
            const { x, y } = geography.areas[name]
            const [tx, ty, anchor] = labels[name]
            const left = anchor === 'end'
            return <g key={name} className="crime-label">
              <path d={`M${x},${y}L${tx + (left ? 9 : -9)},${ty}H${tx}`} />
              <circle cx={x} cy={y} r="2.8" />
              <text x={tx + (left ? -4 : 4)} y={ty + 4} textAnchor={anchor}>{name} · {current.counts[name]}</text>
            </g>
          })}
          <g className="crime-scale" transform="translate(19 449)"><path d="M0 -3v4h48.1v-4" /><text y="-6">2 mi</text></g>
        </svg>
        <div className="crime-readout" aria-live="polite">
          <span>{current.label}</span><strong>{total}</strong><span>incidents across six areas</span>
        </div>
      </div>
      <figcaption className="crime-legend"><strong>Monthly incidents</strong>
        <ul>{colors.map(item => <li key={item.label}><i style={{ backgroundColor: item.color }} />{item.label}</li>)}
          <li><i className="crime-context-swatch" />Other areas</li></ul>
      </figcaption>
    </figure>
    <div className="crime-timeline" aria-label="Choose month">
      <div className="crime-progress" aria-hidden="true"><i style={{ width: `${(frame + 1) / monthlyIncidents.length * 100}%` }} /></div>
      <ol>{monthlyIncidents.map((item, index) => <li key={item.month}>
        <button type="button" aria-current={index === frame ? 'true' : undefined} onClick={() => selectFrame(index)}>
          {shortMonth.format(new Date(`${item.month}-01T12:00:00Z`))}
        </button>
      </li>)}</ol>
    </div>
  </section>
}
