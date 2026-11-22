// Edge refraction and local reflections for the web glass material. Codex (GPT-6).
import rim from './glass-rim.png'

export function GlassOptics() {
  return <svg className="glass-optics" aria-hidden="true" focusable="false" width="0" height="0">
    <defs><filter id="glass-refraction" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feImage href={rim} width="100%" height="100%" preserveAspectRatio="none" result="rim"/>
      <feDisplacementMap in="SourceGraphic" in2="rim" scale="16" xChannelSelector="R" yChannelSelector="G"/>
    </filter></defs>
  </svg>
}
