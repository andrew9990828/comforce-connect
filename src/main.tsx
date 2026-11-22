import LanguageSelect from './languages/LanguageSelect'
import { t, useLanguage } from './languages/language'
// App entry and route navigation. Codex (GPT-6) built the public and team layouts and route loading.
// asherjaenchen with Claude Opus 5.5 added the Lend a Hand routes (/help-out and /team/board).
// asherjaenchen with Claude Opus 5.5 added the /status route and its navigation link.
// Claude (Opus 5.5) added the public-site assistant.
import { lazy, Suspense, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/dm-sans/wght.css'
import './base.css'
import { configured } from './supabase'
import { acceptResidentLink, isStaffMode } from './workspace'

const path = location.pathname.replace(/\/+$/, '') || '/'
if (path === '/request' || path === '/' || path === '/help-out' || path === '/status') acceptResidentLink()
const source = new URLSearchParams(location.search).get('source')
const staffIntake = path === '/request' && (source === 'call' || source === 'text')
const staff = path === '/team' || path === '/team/board' || staffIntake
const queue = '/team' + (isStaffMode() ? '?mode=staff' : '')
const board = '/team/board' + (isStaffMode() ? '?mode=staff' : '')
const log = '/request?source=call' + (isStaffMode() ? '&mode=staff' : '')
const Page = path === '/' ? lazy(() => import('./impact/Impact'))
  : path === '/safety' ? lazy(() => import('./safety/Safety'))
  : path === '/request' ? lazy(() => import('./intake/Intake'))
  : path === '/status' ? lazy(() => import('./status/Status'))
  : path === '/help-out' ? lazy(() => import('./helpout/HelpOut'))
  : path === '/team' ? lazy(() => import('./team/Team'))
  : path === '/team/board' ? lazy(() => import('./helpout/TeamBoard')) : undefined
const CommunityAssistant = !staff && Page ? lazy(() => import('./assistant/CommunityAssistant')) : undefined
const pageTitle = (staff ? 'Team workspace' : path === '/' ? 'Community impact' : path === '/safety' ? 'Neighborhood data' : path === '/request' ? 'Request help' : path === '/help-out' ? 'Lend a hand' : path === '/status' ? 'Check a request' : 'Page unavailable')

const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')
const defaultDescription = description?.content ?? ''

function App() {
  const language = useLanguage()
  useEffect(() => {
    document.title = 'ComForce Connect · ' + t(pageTitle)
    if (description) description.content = t(defaultDescription)
  }, [language])
  return <>
    <a className="skip-link" href="#content">{t("Skip to content")}</a>
    <header className={'site-header' + (staff ? ' staff-header' : '')}>
      <div className="site-bar">
        <div className="site-identity">
          <a className="brand" href={staff ? queue : '/'} aria-label={staff ? t('ComForce Connect team home') : t('ComForce Connect home')}>
            <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
            <span>ComForce <b>Connect</b></span>
          </a>
          {staff && <span className="staff-wordmark">{t("Team workspace")}</span>}
        </div>
        <LanguageSelect />
        {staff ?
          <nav className="site-nav" aria-label={t("Team navigation")}>
            <a href={queue} aria-current={path === '/team' ? 'page' : undefined}>{t("Queue")}</a>
            <a href={board} aria-current={path === '/team/board' ? 'page' : undefined}>{t("Community board")}</a>
            <a className="public-crosslink" href={isStaffMode() ? '/' : '/#my-workspace'}>{t("View public site")}</a>
            <a className="staff-log" href={log} aria-current={staffIntake ? 'page' : undefined}>{t("Log a request")}</a>
          </nav>
        : <nav className="site-nav" aria-label={t("Public navigation")}>
          <a href="/" aria-current={path === '/' ? 'page' : undefined}>{t("Community impact")}</a>
          <a href="/safety" aria-current={path === '/safety' ? 'page' : undefined}>{t("Neighborhood data")}</a>
          <a href="/request" aria-current={path === '/request' ? 'page' : undefined}>{t("Request help")}</a>
          <a href="/help-out" aria-current={path === '/help-out' ? 'page' : undefined}>{t("Lend a hand")}</a>
          <a href="/status" aria-current={path === '/status' ? 'page' : undefined}>{t("Check a request")}</a>
        </nav>}
      </div>
    </header>
    <div id="content" tabIndex={-1}>
      {!configured && path !== '/safety' && <aside className="setup-notice">{t("Local setup needed. Set the public Supabase key in .env.local and restart Vite to connect the demo.")}</aside>}
      {Page ? <Suspense fallback={<main className="missing-page" role="status">{t("Loading…")}</main>}><Page /></Suspense>
        : <main className="missing-page"><h1>{t("Page unavailable")}</h1><a href="/">{t("Return to community impact")}</a></main>}
    </div>
    {CommunityAssistant && <Suspense fallback={null}><CommunityAssistant /></Suspense>}
    <footer className="site-footer"><span>Community Task Force MKE</span><span>Milwaukee, Wisconsin</span></footer>
  </>
}

createRoot(document.getElementById('root')!).render(<App />)
