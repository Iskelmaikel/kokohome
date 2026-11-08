/**
 * Kokonut Pull Cord — a physics pull-chain lamp toggle for Home Assistant (Lovelace).
 * The cord is a Verlet-integrated rope: grab it, pull down past the threshold and
 * release — it toggles the light (with a haptic tick) and swings back to rest.
 * Click / Enter / Space also toggle. Respects prefers-reduced-motion.
 * No build step: deps import from a pinned ESM CDN at load time.
 *
 * Usage:
 *   type: custom:kokonut-pull-cord
 *   entity: light.bedside_lamp
 *   name: Bedside            # optional
 */
import React from 'https://esm.sh/react@18.3.1'
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client?deps=react@18.3.1'
import htm from 'https://esm.sh/htm@3.1.1'

const VERSION = '0.2.0'
const { useRef, useEffect, useState } = React
const html = htm.bind(React.createElement)

// Rope + layout constants (pixel space of the SVG).
const N = 14            // chain points
const SEG = 8           // link length
const GRAV = 0.7
const FRICTION = 0.985
const ITER = 8
const ANCHOR_Y = 74
const SVG_H = 200
const THRESHOLD = 26    // extra pull past rest that fires the toggle
const GRAB_R2 = 46 * 46

const CSS = `
:host { display: block; }
.kpc-card {
  position: relative; overflow: hidden; border-radius: 24px; padding: 14px 16px 12px;
  color: #f5f7fb; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background:
    radial-gradient(120% 120% at 15% 0%, rgba(255,255,255,0.08), rgba(255,255,255,0) 45%),
    linear-gradient(160deg, #1b2030 0%, #12151f 100%);
  box-shadow: 0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06);
  isolation: isolate; -webkit-tap-highlight-color: transparent;
}
.kpc-glow { position: absolute; left: 50%; top: -30%; width: 90%; height: 90%; transform: translateX(-50%);
  z-index: 0; filter: blur(46px); pointer-events: none; transition: opacity .45s ease, background .45s ease; }
.kpc-head { position: relative; z-index: 1; display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.kpc-name { font-size: 16px; font-weight: 600; letter-spacing: .2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kpc-sub { font-size: 12px; color: rgba(245,247,251,0.5); white-space: nowrap; }
.kpc-svg { position: relative; z-index: 1; display: block; width: 100%; height: ${SVG_H}px; touch-action: none; }
.kpc-cordpath { fill: none; stroke: rgba(230,235,245,0.75); stroke-width: 2.4; stroke-linecap: round; }
.kpc-bead { stroke: rgba(0,0,0,0.25); stroke-width: 1; cursor: grab; }
.kpc-bead:active { cursor: grabbing; }
.kpc-a11y { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
`

function PullCord({ hass, config }) {
  const entityId = config.entity
  const stateObj = hass && hass.states ? hass.states[entityId] : undefined
  const attrs = (stateObj && stateObj.attributes) || {}
  const available = !!stateObj && stateObj.state !== 'unavailable' && stateObj.state !== 'unknown'
  const isOn = !!stateObj && stateObj.state === 'on'
  const name = config.name || attrs.friendly_name || entityId
  const rgb = attrs.rgb_color
  const accent = rgb ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : 'rgb(255,197,143)'
  const glassFill = isOn ? accent : '#39404f'

  const svgRef = useRef(null)
  const pathRef = useRef(null)
  const beadRef = useRef(null)
  const [w, setW] = useState(320)
  const stateRef = useRef({})
  stateRef.current = {
    toggle: () => available && hass && hass.callService &&
      hass.callService('light', isOn ? 'turn_off' : 'turn_on', { entity_id: entityId }),
  }

  // Physics runs once, imperatively — independent of React re-renders from hass updates.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let width = svg.clientWidth || 320
    let anchorX = width / 2 + 18
    const pts = []
    for (let i = 0; i < N; i++) {
      const y = ANCHOR_Y + i * SEG
      pts.push({ x: anchorX, y, px: anchorX, py: y })
    }
    const restBeadY = ANCHOR_Y + (N - 1) * SEG
    let grab = -1, mx = 0, my = 0, armed = true, raf = 0

    const draw = () => {
      let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
      for (let i = 1; i < N; i++) d += ` L ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`
      if (pathRef.current) pathRef.current.setAttribute('d', d)
      const b = pts[N - 1]
      if (beadRef.current) {
        beadRef.current.setAttribute('cx', b.x.toFixed(1))
        beadRef.current.setAttribute('cy', b.y.toFixed(1))
      }
    }
    const solve = () => {
      for (let k = 0; k < ITER; k++) {
        pts[0].x = anchorX; pts[0].y = ANCHOR_Y
        for (let i = 0; i < N - 1; i++) {
          const a = pts[i], b = pts[i + 1]
          let dx = b.x - a.x, dy = b.y - a.y
          const dist = Math.hypot(dx, dy) || 0.0001
          const diff = ((SEG - dist) / dist) * 0.5
          const ox = dx * diff, oy = dy * diff
          if (i !== 0) { a.x -= ox; a.y -= oy }
          b.x += ox; b.y += oy
        }
        if (grab >= 0) { pts[grab].x = mx; pts[grab].y = my }
      }
    }
    const step = () => {
      for (let i = 1; i < N; i++) {
        const p = pts[i]
        const vx = (p.x - p.px) * FRICTION, vy = (p.y - p.py) * FRICTION
        p.px = p.x; p.py = p.y
        p.x += vx; p.y += vy + GRAV
      }
      solve()
      const bead = pts[N - 1]
      if (grab >= 0 && armed && bead.y - restBeadY > THRESHOLD) {
        armed = false
        stateRef.current.toggle()
        if (navigator.vibrate) { try { navigator.vibrate(15) } catch (_) {} }
      }
      draw()
      let moving = grab >= 0
      if (!moving) {
        for (let i = 1; i < N; i++) {
          if (Math.abs(pts[i].x - pts[i].px) + Math.abs(pts[i].y - pts[i].py) > 0.25) { moving = true; break }
        }
      }
      raf = moving ? requestAnimationFrame(step) : 0
    }
    const ensureRaf = () => { if (!raf) raf = requestAnimationFrame(step) }

    const settle = () => { for (let k = 0; k < 60; k++) solve(); draw() }

    const localPoint = (e) => {
      const r = svg.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const onDown = (e) => {
      width = svg.clientWidth || width; anchorX = width / 2 + 18
      const p = localPoint(e)
      let best = -1, bd = GRAB_R2
      for (let i = 1; i < N; i++) {
        const dd = (pts[i].x - p.x) ** 2 + (pts[i].y - p.y) ** 2
        if (dd < bd) { bd = dd; best = i }
      }
      if (best < 0) return
      grab = best; mx = p.x; my = p.y; armed = true
      e.preventDefault()
      try { svg.setPointerCapture(e.pointerId) } catch (_) {}
      if (reduce) { pts[grab].x = mx; pts[grab].y = my; solve(); draw() } else ensureRaf()
    }
    const onMove = (e) => {
      if (grab < 0) return
      const p = localPoint(e)
      const dx = p.x - anchorX, dy = p.y - ANCHOR_Y
      const dist = Math.hypot(dx, dy)
      const maxR = (N - 1) * SEG + 46
      if (dist > maxR) { const s = maxR / dist; mx = anchorX + dx * s; my = ANCHOR_Y + dy * s }
      else { mx = p.x; my = p.y }
      if (reduce) {
        pts[grab].x = mx; pts[grab].y = my; solve()
        const bead = pts[N - 1]
        if (armed && bead.y - restBeadY > THRESHOLD) { armed = false; stateRef.current.toggle() }
        draw()
      } else ensureRaf()
    }
    const onUp = () => {
      if (grab < 0) return
      grab = -1; armed = true
      if (reduce) settle(); else ensureRaf()
    }

    svg.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          width = svg.clientWidth || width; anchorX = width / 2 + 18
          if (grab < 0) { if (reduce) settle(); else ensureRaf() }
        })
      : null
    if (ro) ro.observe(svg)

    settle()
    if (!reduce) ensureRaf()

    return () => {
      if (raf) cancelAnimationFrame(raf)
      if (ro) ro.disconnect()
      svg.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])

  // ResizeObserver also updates React-side bulb centering.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setW(svg.clientWidth || 320))
    ro.observe(svg)
    setW(svg.clientWidth || 320)
    return () => ro.disconnect()
  }, [])

  const cx = w / 2

  return html`
    <div className="kpc-card">
      <div className="kpc-glow"
        style=${{ opacity: isOn ? 0.8 : 0, background: `radial-gradient(circle at 50% 40%, ${accent}, rgba(0,0,0,0) 70%)` }} />
      <div className="kpc-head">
        <div className="kpc-name">${name}</div>
        <div className="kpc-sub">${available ? (isOn ? 'On · pull to toggle' : 'Off · pull to toggle') : 'Unavailable'}</div>
      </div>
      <svg className="kpc-svg" ref=${svgRef} aria-hidden="true">
        <defs>
          <radialGradient id="kpc-bulb-grad" cx="50%" cy="38%" r="62%">
            <stop offset="0%" stop-color=${isOn ? '#fff8ec' : '#4a5160'} />
            <stop offset="100%" stop-color=${glassFill} />
          </radialGradient>
        </defs>
        <rect x=${cx - 9} y="30" width="18" height="8" rx="2" fill="rgba(255,255,255,0.18)" />
        <path d=${`M ${cx - 16} 54 a 16 16 0 1 1 32 0 c 0 8 -5 11 -6 16 l -20 0 c -1 -5 -6 -8 -6 -16 Z`}
          fill="url(#kpc-bulb-grad)" stroke="rgba(0,0,0,0.25)" stroke-width="1" />
        <rect x=${cx - 7} y="70" width="14" height="9" rx="2" fill="#2b303c" />
        <path className="kpc-cordpath" ref=${pathRef} d="" />
        <circle className="kpc-bead" ref=${beadRef} r="7" fill="#e9edf5" cx=${cx + 18} cy=${ANCHOR_Y + (N - 1) * SEG} />
      </svg>
      <button className="kpc-a11y" onClick=${() => stateRef.current.toggle()}
        aria-label=${(isOn ? 'Turn off ' : 'Turn on ') + name}>toggle</button>
    </div>`
}

class KokonutPullCord extends HTMLElement {
  setConfig(config) {
    if (!config || !config.entity) throw new Error('kokonut-pull-cord: you must define an "entity"')
    if (config.entity.split('.')[0] !== 'light') throw new Error('kokonut-pull-cord: "entity" must be a light.* entity')
    this._config = config
    this._render()
  }
  set hass(hass) { this._hass = hass; this._render() }
  connectedCallback() { this._render() }
  disconnectedCallback() {
    const root = this._root; this._root = null; this._mount = null
    if (root) queueMicrotask(() => root.unmount())
  }
  _ensure() {
    if (this._root) return
    const shadow = this.shadowRoot || this.attachShadow({ mode: 'open' })
    try {
      const sheet = new CSSStyleSheet(); sheet.replaceSync(CSS); shadow.adoptedStyleSheets = [sheet]
    } catch (e) {
      const s = document.createElement('style'); s.textContent = CSS; shadow.appendChild(s)
    }
    this._mount = document.createElement('div'); shadow.appendChild(this._mount)
    this._root = createRoot(this._mount)
  }
  _render() {
    if (!this._config) return
    this._ensure()
    this._root.render(html`<${PullCord} hass=${this._hass} config=${this._config} />`)
  }
  getCardSize() { return 3 }
  static getStubConfig() { return { entity: 'light.example' } }
}

if (!customElements.get('kokonut-pull-cord')) {
  customElements.define('kokonut-pull-cord', KokonutPullCord)
}
window.customCards = window.customCards || []
window.customCards.push({
  type: 'kokonut-pull-cord',
  name: 'Kokonut Pull Cord',
  description: 'Physics pull-chain lamp toggle — tug the cord to switch a light.',
  preview: true,
})
console.info(`%c KOKONUT-PULL-CORD %c v${VERSION} `,
  'background:#1b2030;color:#ffc58f;border-radius:4px 0 0 4px;padding:2px 4px',
  'background:#ffc58f;color:#1b2030;border-radius:0 4px 4px 0;padding:2px 4px')
