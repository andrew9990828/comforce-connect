// Edge refraction and local reflections for the web glass material. Codex (GPT-6).
import { useEffect } from 'react'
import rim from './glass-rim.png'

export function GlassOptics() {
  useEffect(() => {
    const motion = matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference) and (prefers-reduced-transparency: no-preference)')
    let surface: HTMLElement | null = null
    function move(event: PointerEvent) {
      if (!motion.matches) return
      const next = event.target instanceof Element
        ? event.target.closest<HTMLElement>('.home-choices, .chapter-index, .atlas-readout, .team-next-action, .intake-submit') : null
      if (surface !== next) surface?.style.removeProperty('--shine-x')
      surface = next
      if (surface) {
        const rect = surface.getBoundingClientRect()
        surface.style.setProperty('--shine-x', (event.clientX - rect.left) + 'px')
      }
    }
    document.addEventListener('pointermove', move, { passive: true })
    return () => { document.removeEventListener('pointermove', move); surface?.style.removeProperty('--shine-x') }
  }, [])
  return <svg className="glass-optics" aria-hidden="true" focusable="false" width="0" height="0">
    <defs><filter id="glass-refraction" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feImage href={rim} width="100%" height="100%" preserveAspectRatio="none" result="rim"/>
      <feDisplacementMap in="SourceGraphic" in2="rim" scale="16" xChannelSelector="R" yChannelSelector="G"/>
    </filter></defs>
  </svg>
}
