import { formatNumber, t } from '../languages/language'
import CrimeHeatmap from './CrimeHeatmap'
import { crimeSources, neighborhoodSummary } from './crimeData'
import './safety.css'

const signedPercent = (change: number) => formatNumber(change / 100, { style: 'percent', signDisplay: 'always', maximumFractionDigits: 1 })

export default function Safety() {
  return <main className="safety-page">
    <header className="safety-lead">
      <div>
        <p className="safety-location">{t("Milwaukee public data")}</p>
        <h1><em>{t('Neighborhood context')}</em></h1>
      </div>
      <div className="safety-intro">
        <p>{t("Explore reported MPD incidents in the six neighborhoods served by this demonstration. The animation uses aggregate public records and never displays individual addresses.")}</p>
        <p><strong>{t("If someone is in immediate danger, call 911.")}</strong></p>
        <p className="safety-period"><strong>{t("Comparison period")}</strong><span>{t("January 1–October 31 · 2025 and 2026")}</span></p>
      </div>
    </header>

    <div className="safety-spread">
      <CrimeHeatmap />
      <aside className="standouts" aria-labelledby="standouts-title">
        <p className="safety-kicker">{t("What stands out")}</p>
        <h2 id="standouts-title">{t("A closer read")}</h2>
        <article><strong>{signedPercent(-7.5)}</strong><h3>{t("Fewer incidents overall")}</h3><p>{t("The six areas recorded 3,116 incidents, compared with 3,369 during the same 2025 period.")}</p></article>
        <article><strong>{signedPercent(6.1)}</strong><h3>{t("Riverwest moved differently")}</h3><p>{t("Riverwest was the only selected neighborhood with an overall increase: 606 incidents, up from 571.")}</p></article>
        <article><strong>{t("83 and 101")}</strong><h3>{t("Vehicle theft fell sharply")}</h3><p>{t("Bay View declined from 156 to 83 incidents; Walker’s Point declined from 180 to 101.")}</p></article>
        <article><strong>{t("4 areas")}</strong><h3>{t("Assault trends need context")}</h3><p>{t("Aggravated-assault counts rose in Bay View, Harambee, Riverwest and Silver City even as overall totals fell in most areas.")}</p></article>
      </aside>
    </div>

    <section className="crime-table-section" aria-labelledby="crime-table-title">
      <div className="crime-table-heading">
        <div><p className="safety-kicker">{t("Same-period comparison")}</p><h2 id="crime-table-title">{t("Neighborhood detail")}</h2></div>
        <p>{t("Unique incidents can contain more than one offense category, so category columns should not be added together.")}</p>
      </div>
      <div className="crime-table-scroll" tabIndex={0} role="region" aria-label={t("Scrollable neighborhood incident table")}>
        <table>
          <thead><tr><th scope="col">{t("Neighborhood")}</th><th scope="col">{t("2026 incidents")}</th><th scope="col">{t("vs. 2025")}</th>
            <th scope="col">{t("Aggravated assault")}</th><th scope="col">{t("Robbery")}</th><th scope="col">{t("Burglary")}</th>
            <th scope="col">{t("Theft/larceny")}</th><th scope="col">{t("Vehicle theft")}</th></tr></thead>
          <tbody>{neighborhoodSummary.map(row => <tr key={row.name}><th scope="row">{row.name}</th>
            <td>{row.incidents2026}</td><td className={row.change > 0 ? 'change-up' : 'change-down'}>{signedPercent(row.change)}</td>
            <td>{row.aggravatedAssault}</td><td>{row.robbery}</td><td>{row.burglary}</td><td>{row.theft}</td><td>{row.vehicleTheft}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    <section className="safety-notes" aria-labelledby="safety-notes-title">
      <div><p className="safety-kicker">{t("Read with care")}</p><h2 id="safety-notes-title">{t("Reported incidents are not a safety score")}</h2></div>
      <div className="safety-note-copy">
        <p>{t("These are raw counts, not population-adjusted rates. Neighborhoods differ in size, population and land use. MPD notes that records can be revised, may reflect where an incident was reported rather than where it occurred, and do not include every call for service.")}</p>
        <p>{t("We counted each case number once per neighborhood, used the incident coordinates to join it to the City’s neighborhood polygons, and grouped selected offenses using FBI NIBRS codes. About 0.5% of applicable 2026 citywide records lacked coordinates and could not be assigned.")}</p>
        <ul>
          <li><a href={crimeSources.incidents}>{t("Milwaukee NIBRS incident data")}</a></li>
          <li><a href={crimeSources.neighborhoods}>{t("City neighborhood boundaries")}</a></li>
          <li><a href={crimeSources.codes}>{t("FBI NIBRS code definitions")}</a></li>
          <li><a href={crimeSources.disclaimer}>{t("Milwaukee crime-data disclaimer")}</a></li>
          <li><a href={crimeSources.calls}>{t("MPD calls-for-service dashboard")}</a></li>
        </ul>
      </div>
    </section>
  </main>
}
