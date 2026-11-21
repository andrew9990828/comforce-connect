// Scroll-aware chapter navigation. Codex (GPT-6) synchronized the active pill with the reading position.
import { useEffect, useRef, useState } from 'react'
import { chapters } from './guide'

const navigationChapters = chapters.filter(chapter => chapter.id !== 'families')

export default function ChapterIndex() {
  const [active, setActive] = useState('')
  const nav = useRef<HTMLElement>(null)
  useEffect(() => {
    const target = document.getElementById(location.hash.slice(1))
    target?.scrollIntoView()
    let frame = 0
    const anchors = navigationChapters.map(item => document.getElementById(item.anchor))
    function update() {
      frame = 0
      const line = Math.max((nav.current?.offsetHeight || 0) + 24, window.innerHeight * .26)
      let index = -1
      anchors.forEach((el, i) => { if (el && el.getBoundingClientRect().top <= line) index = i })
      const bottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
      setActive(navigationChapters[bottom ? navigationChapters.length - 1 : index]?.id || '')
    }
    function queue() { if (!frame) frame = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', queue, { passive: true })
    window.addEventListener('resize', queue)
    const resize = new ResizeObserver(queue)
    resize.observe(document.body)
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      window.removeEventListener('scroll', queue)
      window.removeEventListener('resize', queue)
    }
  }, [])
  useEffect(() => {
    const el = nav.current
    const pill = el?.querySelector<HTMLElement>('[aria-current="location"]')
    if (!el || !pill || el.scrollWidth <= el.clientWidth) return
    el.scrollTo({ left: el.scrollLeft + pill.getBoundingClientRect().left - el.getBoundingClientRect().left
      - (el.clientWidth - pill.offsetWidth) / 2, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }, [active])
  return <nav ref={nav} className="chapter-index" aria-label="Guide chapters">{navigationChapters.map(item =>
    <a key={item.id} aria-current={active === item.id ? 'location' : undefined}
      href={'#' + item.anchor}>{item.title}</a>
  )}</nav>
}
