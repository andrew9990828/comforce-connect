// App entry and route navigation. Codex (GPT-6) built the public and team layouts and route loading.
import { lazy, Suspense, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/dm-sans/wght.css'
import './base.css'
import './appearance.css'
import './glass.css'
import { GlassOptics } from './GlassOptics'
import { preview, route } from './preview/location'
import { guideRoute } from './impact/guide'
import { configured } from './supabase'
import { acceptResidentLink, isStaffMode } from './workspace'

let path = (preview ? location.pathname.slice(8) : location.pathname).replace(/\/+$/, '') || '/'
const legacyGuide = guideRoute(path)
if (legacyGuide) {
  history.replaceState(history.state, '', legacyGuide)
  path = '/impact'
}
if (!preview && (path === '/request' || path === '/' || path === '/impact')) acceptResidentLink()
const source = new URLSearchParams(location.search).get('source')
const staffIntake = path === '/request' && (source === 'call' || source === 'text')
const staff = path === '/team' || staffIntake
const queue = route('/team') + (isStaffMode() ? '?mode=staff' : '')
const log = route('/request?source=call') + (isStaffMode() ? '&mode=staff' : '')
const Page = path === '/' ? lazy(() => import('./Home'))
  : path === '/impact' ? lazy(() => import('./impact/Impact'))
  : path === '/request' ? lazy(() => import('./intake/Intake'))
  : path === '/team' ? lazy(() => import('./team/Team')) : undefined
document.title = 'ComForce Connect · ' + (staff ? 'Team workspace' : path === '/' ? 'Home' : path === '/impact' ? 'Community impact' : path === '/request' ? 'Request help' : 'Page unavailable')

const hoverControls = 'button:not(:disabled), summary, .home-choices a, .home-neighborhoods a, .site-nav a, .chapter-index a, .story-intro a, .guide-action, .service-directory a, .story-actions a, .intake-next'

function App() {
  useEffect(() => {
    let lit: HTMLElement | null = null
    function clear() {
      lit?.removeAttribute('data-lit')
      lit = null
    }
    function track(event: PointerEvent) {
      const target = event.pointerType !== 'touch' && event.target instanceof Element
        ? event.target.closest<HTMLElement>(hoverControls) : null
      if (lit !== target) {
        clear()
        if (target) {
          const style = getComputedStyle(target)
          const outlined = ['top', 'right', 'bottom', 'left'].every(side => {
            const border = 'border-' + side
            const color = style.getPropertyValue(border + '-color')
            return parseFloat(style.getPropertyValue(border + '-width')) > 0
              && color !== 'transparent' && !/(?:^rgba\([^)]*,|\/)\s*0%?\s*\)$/.test(color)
          })
          if (outlined) lit = target
        }
      }
      if (!target || !lit) return
      const box = target.getBoundingClientRect()
      target.style.setProperty('--light-x', (event.clientX - box.left) + 'px')
      target.style.setProperty('--light-y', (event.clientY - box.top) + 'px')
      target.dataset.lit = ''
    }
    function leave(event: PointerEvent) {
      if (!(event.relatedTarget instanceof Node) || !lit?.contains(event.relatedTarget)) clear()
    }
    document.addEventListener('pointermove', track)
    document.addEventListener('pointerout', leave)
    window.addEventListener('blur', clear)
    return () => {
      clear()
      document.removeEventListener('pointermove', track)
      document.removeEventListener('pointerout', leave)
      window.removeEventListener('blur', clear)
    }
  }, [])
  return <>
    <GlassOptics/>
    <a className="skip-link" href="#content">Skip to content</a>
    <header className={'site-header' + (staff ? ' staff-header' : '')}>
      <div className="site-bar">
        <a className="brand" href={staff ? queue : route('/')} aria-label={staff ? 'ComForce Connect team home' : 'ComForce Connect home'}>
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>ComForce <b>Connect</b></span>
        </a>
        {staff ? <>
          <span className="staff-wordmark">Team workspace</span>
          <nav className="site-nav" aria-label="Team navigation">
            <a className="public-crosslink" href={route(isStaffMode() ? '/' : '/#my-workspace')}>View public site</a>
            <a className="staff-log" href={log} aria-current={staffIntake ? 'page' : undefined}>Log a request</a>
          </nav>
        </> : <nav className="site-nav" aria-label="Public navigation">
          {path !== '/' && <a href={route('/')}>Home</a>}
          <a href={queue}>Team workspace</a>
        </nav>}
      </div>
    </header>
    <div id="content" tabIndex={-1}>
      {!configured && !preview && Page && path !== '/' && <aside className="setup-notice">Local setup needed. Set the public Supabase key in .env.local and restart Vite to connect the demo.</aside>}
      {Page ? <Suspense fallback={<main className="missing-page" role="status">Loading…</main>}><Page /></Suspense>
        : <main className="missing-page"><h1>Page unavailable</h1><a href={route('/')}>Return home</a></main>}
    </div>
    <footer className="site-footer"><span>Community Task Force MKE</span></footer>
  </>
}

createRoot(document.getElementById('root')!).render(<App />)
