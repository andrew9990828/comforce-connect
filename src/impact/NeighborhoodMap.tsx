import { formatNumber, t } from '../languages/language'
// Milwaukee neighborhood atlas. Codex (GPT-6) composed the City boundaries with locally simplified Census TIGER/Line water geometry.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import geography from './milwaukee.json'
import water from './water.json'

const levels = [
  { label: '0', color: 'var(--surface)' },
  { label: '1', color: 'var(--line)' },
  { label: '2–3', color: 'var(--mid)' },
  { label: '4+', color: 'var(--ink)' },
]
type Area = keyof typeof geography.areas
// Labels sit on either side of the city, with leaders ending inside the named neighborhood.
const labels: Record<Area, [number, number, 'start' | 'end']> = {
  'Lincoln Park': [109, 126, 'end'], 'Riverwest': [243, 180, 'start'],
  'Harambee': [122, 210, 'end'], "Walker's Point": [236, 258, 'start'],
  'Silver City': [92, 302, 'end'], 'Bay View': [259, 341, 'start'],
}
const areas = Object.keys(labels) as Area[]

interface MapProps {
  markerPreview?: ReactNode
  markers?: ReactNode
  overlay?: ReactNode
  legend?: ReactNode
  selected: string
  periodLabel: string
  counts: Record<string, number> | null
  readout: string
  legendLabel: string
  includeUnknown?: boolean
  allLabel?: string
  choose: (name: string) => void
}

export default function NeighborhoodMap({ selected, periodLabel, counts, readout, legendLabel, includeUnknown = true, allLabel = t("Citywide"), overlay, markers, markerPreview, legend, choose }: MapProps) {
  const frame = useRef<HTMLDivElement>(null)
  const [span, setSpan] = useState(620)
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (height > 0) setSpan(width / height * 487)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const xMin = 151 - span / 2
  return <figure className="atlas-map">
    <div className="atlas-map-frame" ref={frame}>
      <svg className="atlas-cartography" viewBox={`${xMin} -16 ${span} 487`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
        <defs>
          <pattern id="atlas-field" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M28 0H0V28" fill="none" stroke="var(--line)" strokeWidth=".55" opacity=".46" />
          </pattern>
          <pattern id="atlas-waves" width="22" height="14" patternUnits="userSpaceOnUse">
            <path d="M0 6Q5.5 2.5 11 6T22 6" fill="none" stroke="var(--line)" strokeWidth=".6" opacity=".43" />
          </pattern>
          <clipPath id="atlas-shore"><path d={water.lake} /></clipPath>
        </defs>
        <rect x={xMin - 20} y="-30" width={span + 40} height="530" fill="var(--wash)" />
        <rect x={xMin - 20} y="-30" width={span + 40} height="530" fill="url(#atlas-field)" />
        <path d={water.lake} fill="var(--muted)" stroke="var(--line)" strokeWidth="2.4" />
        <g clipPath="url(#atlas-shore)">
          <rect x={xMin} y="-20" width={span} height="510" fill="url(#atlas-waves)" />
        </g>
        <path d={geography.context} className="atlas-context-areas" />
        {areas.map(name => {
          const count = counts?.[name] ?? 0
          const level = count >= 4 ? 3 : count >= 2 ? 2 : count
          return <path key={name} d={geography.areas[name].d} fill={counts ? levels[level].color : 'var(--wash)'}
            className={'atlas-area' + (selected === name ? ' selected' : '')} onClick={() => choose(name)} />
        })}
        <path d={water.rivers} className="atlas-rivers" />
        {areas.includes(selected as Area) && <path d={geography.areas[selected as Area].d} className="atlas-area-outline" />}
        {overlay}
        <text x="291" y="100" textAnchor="middle" className="atlas-lake-name" transform="rotate(-9 291 100)">{t("Lake Michigan")}</text>
        {areas.map(name => {
          const {x, y} = geography.areas[name]
          const [tx, ty, anchor] = labels[name]
          const left = anchor === 'end'
          const width = name.length * 7.4 + 14
          return <g key={name} onClick={() => choose(name)} className={'atlas-map-label' + (selected === name ? ' selected' : '')}>
            <path d={`M${x},${y}L${tx + (left ? 9 : -9)},${ty}H${tx}`} />
            {!overlay && <circle cx={x} cy={y} r={selected === name ? 4.3 : 2.6} />}
            <rect className="atlas-label-target" x={left ? tx - width : tx} y={ty - 19} width={width} height="38" rx="3" />
            <text x={tx + (left ? -4 : 4)} y={ty + 4} textAnchor={anchor}>{name}</text>
          </g>
        })}
        <g className="atlas-scale" transform={`translate(${xMin + 19} 449)`}>
          <path d="M0 -3v4h48.1v-4" /><text y="-6">{t("2 mi")}</text>
        </g>
        {markers}
      </svg>
      <div className="atlas-readout">
        <span>{periodLabel}</span>
        <select aria-label={t("Neighborhood")} value={selected} onChange={event => choose(event.target.value)}>
          <option value="">{allLabel}</option>{(includeUnknown ? [...areas, 'Unknown'] : areas).map(name =>
            <option key={name} value={name}>{name === 'Unknown' ? t('Unknown neighborhood') : name}</option>)}
        </select>
        <span aria-live="polite">{readout}</span>
      </div>
      <div className="atlas-north" aria-hidden="true"><span>{t("N")}</span><i /></div>
      {markerPreview}
    </div>
    <figcaption className="atlas-legend">
      <strong>{legendLabel}</strong>
      {legend ?? <ul>{levels.map(level => <li key={level.label}><i style={{ backgroundColor: level.color }} />{level.label}</li>)}
        <li><i className="atlas-context-swatch" />{t("Outside demo")}</li></ul>}
    </figcaption>
  </figure>
}
