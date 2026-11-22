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
import './appearance.css'
import './glass.css'
import { GlassOptics } from './GlassOptics'
import markUrl from './brand/mark.png'
import lockupUrl from './brand/lockup.png'
import { preview, route } from './preview/location'
import { guideRoute } from './impact/guide'
import { acceptResidentLink, isStaffMode } from './workspace'

const configured = Boolean(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
let path = (preview ? location.pathname.slice(8) : location.pathname).replace(/\/+$/, '') || '/'
const legacyGuide = guideRoute(path)
if (legacyGuide) {
  history.replaceState(history.state, '', legacyGuide)
  path = '/impact'
}
if (!preview && (path === '/request' || path === '/' || path === '/impact' || path === '/help-out' || path === '/status')) acceptResidentLink()
const source = new URLSearchParams(location.search).get('source')
const staffIntake = path === '/request' && (source === 'call' || source === 'text')
const staff = path === '/team' || path === '/team/board' || staffIntake
const queue = route('/team') + (isStaffMode() ? '?mode=staff' : '')
const board = route('/team/board') + (isStaffMode() ? '?mode=staff' : '')
const log = route('/request?source=call') + (isStaffMode() ? '&mode=staff' : '')
const Page = path === '/' ? lazy(() => import('./Home'))
  : path === '/safety' ? lazy(() => import('./safety/Safety'))
  : path === '/impact' ? lazy(() => import('./impact/Impact'))
  : path === '/request' ? lazy(() => import('./intake/Intake'))
  : path === '/status' ? lazy(() => import('./status/Status'))
  : path === '/help-out' ? lazy(() => import('./helpout/HelpOut'))
  : path === '/team' ? lazy(() => import('./team/Team'))
  : path === '/team/board' ? lazy(() => import('./helpout/TeamBoard')) : undefined
const CommunityAssistant = !staff && Page ? lazy(() => import('./assistant/CommunityAssistant')) : undefined
const pageTitle = path === '/team/board' ? 'Community board' : staff ? 'Team workspace'
  : path === '/' ? 'Home' : path === '/safety' ? 'Your neighborhood' : path === '/impact' ? 'How we help'
  : path === '/request' ? 'Get help' : path === '/help-out' ? 'Lend a hand'
  : path === '/status' ? 'Check my request' : 'Page unavailable'

const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')
const defaultDescription = description?.content ?? ''

function App() {
  const language = useLanguage()
  useEffect(() => {
    document.title = 'ComForce Connect · ' + t(pageTitle)
    if (description) description.content = t(defaultDescription)
  }, [language])
  return <>
    <GlassOptics/>
    <a className="skip-link" href="#content">{t("Skip to content")}</a>
    <header className={'site-header' + (staff ? ' staff-header' : '')}>
      <div className="site-bar">
        <div className="site-identity">
          <a className="brand" href={staff ? queue : route('/')} aria-label={staff ? t('ComForce Connect team home') : t('ComForce Connect home')}>
            <img className="brand-mark" src={markUrl} alt="" />
            <span className="brand-text"><span>ComForce <b>Connect</b></span><span className="brand-sub">Community Task Force MKE</span></span>
          </a>
          {staff && <span className="staff-wordmark">{t("Team workspace")}</span>}
        </div>
        <LanguageSelect />
        {staff ?
          <nav className="site-nav" aria-label={t("Team navigation")}>
            <a href={queue} aria-current={path === '/team' ? 'page' : undefined}>{t("Queue")}</a>
            <a href={board} aria-current={path === '/team/board' ? 'page' : undefined}>{t("Community board")}</a>
            <a className="public-crosslink" href={route(isStaffMode() ? '/' : '/#my-workspace')}>{t("View public site")}</a>
            <a className="staff-log" href={log} aria-current={staffIntake ? 'page' : undefined}>{t("Log a request")}</a>
          </nav>
        : <nav className="site-nav" aria-label={t("Public navigation")}>
          <a href={route('/request')} aria-current={path === '/request' ? 'page' : undefined}>{t("Get help")}</a>
          <a href={route('/status')} aria-current={path === '/status' ? 'page' : undefined}>{t("Check my request")}</a>
          <a href={route('/impact')} aria-current={path === '/impact' ? 'page' : undefined}>{t("How we help")}</a>
          <a href={route('/safety')} aria-current={path === '/safety' ? 'page' : undefined}>{t("Your neighborhood")}</a>
          <a href={route('/help-out')} aria-current={path === '/help-out' ? 'page' : undefined}>{t("Lend a hand")}</a>
          {CommunityAssistant && !isStaffMode() && <Suspense fallback={null}><CommunityAssistant/></Suspense>}
        </nav>}
      </div>
    </header>
    <div id="content" tabIndex={-1}>
      {!configured && !preview && Page && path !== '/' && path !== '/safety' && <aside className="setup-notice">{t("Local setup needed. Set the public Supabase key in .env.local and restart Vite to connect the demo.")}</aside>}
      {Page ? <Suspense fallback={<main className="missing-page" role="status">{t("Loading…")}</main>}><Page /></Suspense>
        : <main className="missing-page"><h1>{t("Page unavailable")}</h1><a href={route('/')}>{t("Return home")}</a></main>}
    </div>
    <footer className="site-footer"><img className="footer-lockup" src={lockupUrl} alt="Community Task Force MKE · ComForce MKE" />
      {!staff && <p className="footer-help">{t("Need to talk to someone?")} <a href="tel:211">{t("Call 211")}</a> · {t("In danger?")} <a href="tel:911">{t("Call 911")}</a></p>}
      {!staff && <a className="footer-team" href={queue}>{t("Team workspace")}</a>}</footer>
  </>
}

createRoot(document.getElementById('root')!).render(<App />)
