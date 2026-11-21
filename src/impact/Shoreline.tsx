// Dimensional shoreline artwork. Codex (GPT-6) reused the app's Milwaukee cartography.
import city from './milwaukee.json'
import water from './water.json'

export default function Shoreline() {
  return <div className="shoreline" aria-hidden="true">
    <svg viewBox="0 0 440 330" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="survey-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="var(--surface)" opacity=".16" strokeWidth=".6"/></pattern>
        <linearGradient id="land" x2=".85" y2="1"><stop stopColor="var(--land-light)"/><stop offset="1" stopColor="var(--land-dark)"/></linearGradient>
      </defs>
      <rect width="440" height="330" fill="url(#survey-grid)"/>
      <g transform="translate(65 -54) rotate(-17 160 215) scale(1.04)">
        {[12,9,6,3].map(y => <path key={y} transform={`translate(0 ${y})`} d={city.context} fill="var(--map-edge)" stroke="var(--map-edge)" strokeWidth="1"/>)}
        <path d={city.context} fill="url(#land)" stroke="var(--map-edge)" strokeWidth="1.15"/>
        <path d={water.rivers} fill="var(--map-edge)"/>
        {Object.entries(city.areas).map(([name, area]) => <g key={name}><path d={area.d} fill="var(--pin)" fillOpacity=".62" stroke="var(--lake)" strokeWidth=".95"/><circle cx={area.x} cy={area.y} r="6" fill="var(--surface)" opacity=".55"/><circle cx={area.x} cy={area.y} r="3.2" fill="var(--pin)" stroke="var(--surface)"/></g>)}
      </g>
    </svg>
  </div>
}
