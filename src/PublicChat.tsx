import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

const dockKey = 'comforce-chat-docked'

export default function PublicChat({ open, toggle }: { open: boolean; toggle: (open: boolean) => void }) {
  const [docked, setDocked] = useState(() => sessionStorage.getItem(dockKey) === 'yes')
  const trigger = useRef<HTMLButtonElement>(null)
  const start = useRef<{ id: number; x: number; y: number; offset: number; animate: boolean } | null>(null)
  const swiped = useRef(false)

  const launcher = useRef<HTMLDivElement>(null)
  const motion = useRef<Animation | null>(null)
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

  const frame = useRef(0)

  function settle(changeLayout?: () => void) {
    cancelAnimationFrame(frame.current)
    frame.current = 0
    const el = launcher.current
    if (!el) return
    const from = el.getBoundingClientRect()
    motion.current?.cancel()
    el.style.removeProperty('transform')
    if (changeLayout) flushSync(changeLayout)
    if (reducedMotion()) return
    const to = el.getBoundingClientRect()
    const x = from.left - to.left
    const y = from.top - to.top
    if (!x && !y && from.width === to.width) return
    motion.current = el.animate([
      { transform: `translate(${x}px, ${y}px) scale(${from.width / to.width})` },
      { transform: 'none' },
    ], { duration: changeLayout ? 340 : 170, easing: 'cubic-bezier(.22,.78,.18,1)' })
  }

  function cancelDrag() {
    const drag = start.current
    if (!drag) return
    start.current = null
    if (trigger.current?.hasPointerCapture(drag.id)) trigger.current.releasePointerCapture(drag.id)
    settle()
  }

  useEffect(() => {
    window.addEventListener('blur', cancelDrag)
    return () => {
      window.removeEventListener('blur', cancelDrag)
      cancelAnimationFrame(frame.current)
    }
  }, [])

  function dock() {
    toggle(false)
    settle(() => setDocked(true))
    sessionStorage.setItem(dockKey, 'yes')
    trigger.current?.focus({ preventScroll: true })
  }

  return <div ref={launcher} className={'public-chat ' + (docked ? 'docked' : 'floating')}>
    <button ref={trigger} className="chat-trigger" type="button" aria-label={docked ? 'Restore floating chat' : 'Chat'}
      aria-expanded={open} aria-controls={open ? 'assistant-community' : undefined}
      onPointerDown={event => {
        swiped.current = false
        if (docked || !event.isPrimary || event.button !== 0) return
        start.current = { id: event.pointerId, x: event.clientX, y: event.clientY, offset: 0, animate: !reducedMotion() }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={event => {
        const drag = start.current
        if (!drag || event.pointerId !== drag.id) return
        if (!(event.buttons & 1)) {
          cancelDrag()
          return
        }
        const dx = event.clientX - drag.x
        const dy = event.clientY - drag.y
        if (!swiped.current && Math.abs(dx) <= Math.max(3, Math.abs(dy))) return
        swiped.current = true
        drag.offset = 90 * Math.tanh(dx / 90)
        if (!drag.animate || frame.current) return
        frame.current = requestAnimationFrame(() => {
          frame.current = 0
          if (start.current !== drag || !launcher.current) return
          launcher.current.style.transform = `translate3d(${drag.offset}px, 0, 0)`
        })
      }}
      onPointerCancel={event => { if (start.current?.id === event.pointerId) cancelDrag() }}
      onLostPointerCapture={event => { if (start.current?.id === event.pointerId) cancelDrag() }}
      onPointerUp={event => {
        if (start.current?.id !== event.pointerId) return
        const dx = Math.abs(event.clientX - start.current.x)
        const dy = Math.abs(event.clientY - start.current.y)
        start.current = null
        if (dx >= 28 && dx > dy) {
          swiped.current = true
          dock()
        } else settle()
      }}
      onClick={event => {
        if (swiped.current && event.detail > 0) {
          event.preventDefault()
          swiped.current = false
        } else if (docked) {
          event.preventDefault()
          sessionStorage.removeItem(dockKey)
          settle(() => setDocked(false))
          toggle(true)
        } else toggle(!open)
      }}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.5 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.4 0-2.8-.3-4-.9L3.5 21l1.2-4.8a8.5 8.5 0 1 1 15.8-4.7Z"/>
        <path d="M8 10h8m-8 4h5"/>
      </svg>
    </button>
    {!docked && <button className="chat-dismiss" type="button" aria-label="Move chat to header" onClick={dock}>×</button>}
  </div>
}
