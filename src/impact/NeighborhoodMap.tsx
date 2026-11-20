// Neighborhood choropleth. Codex (GPT-6) linked simplified municipal boundaries to confirmed demo deliveries.
import geography from './milwaukee.json'

const levels = [
  { label: '0', color: '#e0e9dc' }, { label: '1', color: '#9bcdbc' },
  { label: '2–3', color: '#479c88' }, { label: '4+', color: '#106957' },
]
// Labels are offset from polygon centroids to make adjacent neighborhoods readable.
const labels = {
  'Bay View': [249, 351], Harambee: [151, 208], 'Lincoln Park': [127, 128],
  Riverwest: [250, 193], 'Silver City': [104, 305], "Walker's Point": [231, 275],
}
type Area = keyof typeof geography.areas

interface MapProps {
  selected: string
  counts: Record<string, number> | null
  choose: (name: string) => void
}

export default function NeighborhoodMap({ selected, counts, choose }: MapProps) {
  return <figure className="impact-map">
    <div className="impact-canvas">
      <svg viewBox="-55 -18 433 494" aria-hidden="true" focusable="false">
        <path d={geography.context} className="impact-context" />
        {(Object.keys(geography.areas) as Area[]).map(name => {
          const { d } = geography.areas[name]
          const count = counts?.[name] ?? 0
          const level = count >= 4 ? 3 : count >= 2 ? 2 : count
          return <path key={name} d={d} fill={counts ? levels[level].color : '#e6e9df'}
            className={'impact-area' + (name === selected ? ' is-selected' : '')}
            onClick={() => choose(name)}>
            <title>{name}{counts ? ` · ${count} fulfilled` : ''}</title>
          </path>
        })}
        {(Object.keys(labels) as Area[]).map(name => {
          const area = geography.areas[name]
          const [x, y] = labels[name]
          const alignRight = x < area.x
          return <g key={name} className={'impact-map-label' + (selected === name ? ' is-selected' : '')}
            onClick={() => choose(name)}>
            <path d={`M${area.x},${area.y} L${x},${y}`} />
            <circle cx={area.x} cy={area.y} r={2} />
            <text x={x + (alignRight ? -3 : 3)} y={y + 3} textAnchor={alignRight ? 'end' : 'start'}>{name}</text>
          </g>
        })}
      </svg>
      <span className="impact-north" aria-hidden="true"><i />N</span>
    </div>
    <figcaption className="impact-legend">
      <strong>Needs fulfilled</strong>
      <ul>{levels.map(level => <li key={level.label}><i style={{ background: level.color }} />{level.label}</li>)}
        <li><i className="context-swatch" />Outside demo</li></ul>
    </figcaption>
  </figure>
}
