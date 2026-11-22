// Fictional report points in local atlas coordinates. Codex (GPT-6) rendered their combined density and locations.
import { useRef, useState } from 'react'
import NeighborhoodMap from '../impact/NeighborhoodMap'
import type geography from '../impact/milwaukee.json'
import '../impact/impact.css'

type Point = { id: string; update: string; neighborhood: keyof typeof geography.areas; x: number; y: number }
const reports: Point[] = [
  { id: 'MKE-101', update: 'Family check-in scheduled.', neighborhood: 'Bay View', x: 209, y: 332 },
  { id: 'MKE-102', update: 'Coordinator reviewing the initial report.', neighborhood: 'Harambee', x: 186, y: 201 },
  { id: 'MKE-103', update: 'Family requested a follow-up call.', neighborhood: 'Harambee', x: 191, y: 196 },
  { id: 'MKE-104', update: 'Partner outreach in progress.', neighborhood: 'Harambee', x: 196, y: 202 },
  { id: 'MKE-105', update: 'Awaiting an update from the reporting contact.', neighborhood: 'Harambee', x: 193, y: 209 },
  { id: 'MKE-106', update: 'Family liaison assigned.', neighborhood: 'Lincoln Park', x: 160, y: 141 },
  { id: 'MKE-107', update: 'Follow-up with the outreach team scheduled.', neighborhood: 'Lincoln Park', x: 166, y: 148 },
  { id: 'MKE-108', update: 'Initial report received.', neighborhood: 'Riverwest', x: 206, y: 200 },
  { id: 'MKE-109', update: 'Partner check-in scheduled.', neighborhood: 'Riverwest', x: 211, y: 205 },
  { id: 'MKE-110', update: 'Coordinator gathering additional details.', neighborhood: 'Riverwest', x: 208, y: 213 },
  { id: 'MKE-111', update: 'Family support referral sent.', neighborhood: "Walker's Point", x: 182, y: 286 },
]

// Each point adds a soft kernel. Map the accumulated opacity to a single heat ramp
// before drawing the individual dots, so adjacent points form one continuous hotspot.
function ReportLayer({ points }: { points: Point[] }) {
  return <g pointerEvents="none">
    <defs>
      <radialGradient id="report-kernel">
        <stop stopOpacity=".48"/><stop offset=".5" stopOpacity=".24"/><stop offset="1" stopOpacity="0"/>
      </radialGradient>
      <filter id="report-density" colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values="0 0 0 1 0  0 0 0 1 0  0 0 0 1 0  0 0 0 1 0"/>
        <feComponentTransfer>
          <feFuncR type="table" tableValues="1 1 1 .91 .68"/>
          <feFuncG type="table" tableValues=".85 .70 .45 .18 .04"/>
          <feFuncB type="table" tableValues=".84 .66 .39 .17 .12"/>
          <feFuncA type="table" tableValues="0 .5 .78 .9 .95"/>
        </feComponentTransfer>
      </filter>
    </defs>
    {points.length > 0 && <g filter="url(#report-density)">
      {points.map(p => <circle key={p.x} cx={p.x} cy={p.y} r="16" fill="url(#report-kernel)"/>)}
    </g>}

  </g>
}

export default function MissingPersonsMap() {
  const [selected, setSelected] = useState('')
  const [activeCase, setActiveCase] = useState<Point | null>(null)
  const [preview, setPreview] = useState<{ report: Point; left: number; top: number } | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  function openCase(report: Point) {
    setPreview(null)
    setActiveCase(report)
    dialog.current?.showModal()
  }
  const visible = selected ? reports.filter(p => p.neighborhood === selected) : reports
  return <section className="team-report-map" aria-labelledby="missing-persons-map">
    <header><h2 id="missing-persons-map">Missing persons heat map</h2>
      <p>Hover over a red dot to preview a fictional case, or select it for details. Deeper red shows where cases cluster.</p>
    </header>
    <NeighborhoodMap selected={selected} counts={null} choose={name => { setPreview(null); setSelected(name) }}
      periodLabel="Demo data" legendLabel="Report density" includeUnknown={false} allLabel="All six neighborhoods"
      overlay={<ReportLayer points={visible}/>}
      markers={<g className="report-points">{visible.map(report =>
        <g key={report.id} transform={`translate(${report.x} ${report.y})`}
          onPointerEnter={event => {
            if (event.pointerType === 'touch') return
            const marker = event.currentTarget.getBoundingClientRect()
            const frame = event.currentTarget.ownerSVGElement!.getBoundingClientRect()
            setPreview({ report, left: (marker.x + marker.width / 2 - frame.x) / frame.width * 100,
              top: (marker.y - frame.y) / frame.height * 100 })
          }}
          onPointerLeave={() => setPreview(null)} onClick={() => openCase(report)}>
          <circle r="4.5" fill="transparent"/>
          <circle className="report-dot" r="2.9" fill="#b5092e" stroke="white" strokeWidth="1"/>
        </g>)}</g>}
      markerPreview={preview && <div className="report-preview" role="tooltip"
        style={{ left: `clamp(min(7.5rem, 50%), ${preview.left}%, max(calc(100% - 7.5rem), 50%))`, top: `${preview.top}%` }}>
        <strong>{preview.report.id} · {preview.report.neighborhood}</strong>
        <span>{preview.report.update}</span>
      </div>}
      legend={<span className="report-density-key">Lower <i aria-hidden="true"/> Higher</span>}
      readout={`${visible.length} sample ${visible.length === 1 ? 'report' : 'reports'}`}/>
    {visible.length > 0 && <label className="report-picker">Open a case
      <select value="" onChange={event => {
        const report = visible.find(item => item.id === event.target.value)
        if (report) openCase(report)
      }}>
        <option value="" disabled>Select a case</option>
        {visible.map(report => <option key={report.id} value={report.id}>{report.id} · {report.neighborhood}</option>)}
      </select>
    </label>}
    <dialog ref={dialog} className="team-dialog report-dialog" aria-labelledby="report-title" onClose={event => { if (!event.currentTarget.open) setActiveCase(null) }}>
      <span>Fictional missing-person case</span>
      <h2 id="report-title">{activeCase?.id}</h2>
      <p>{activeCase?.neighborhood}</p>
      <strong>Latest update</strong>
      <p>{activeCase?.update}</p>
      <form method="dialog"><button className="team-secondary" autoFocus>Close</button></form>
    </dialog>
  </section>
}
