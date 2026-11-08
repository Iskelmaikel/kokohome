/**
 * Kokonut Liquid Gauge — a liquid-filled vertical brightness gauge for Home Assistant.
 * A spring-simulated liquid that sloshes, ripples and bubbles; drag up/down to set a
 * light's brightness (0–100). The big % reads light above the waterline and dark inside
 * the liquid (dual masked text). Keyboard + reduced-motion supported. No build step.
 *
 * Usage:
 *   type: custom:kokonut-liquid-gauge
 *   entity: light.living_room
 *   name: Living Room        # optional
 */
import React from 'https://esm.sh/react@18.3.1'
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client?deps=react@18.3.1'
import htm from 'https://esm.sh/htm@3.1.1'

const VERSION = '0.2.0'
const { useRef, useEffect, useState } = React
const html = htm.bind(React.createElement)

const COLS = 24
const BUBBLES = 8
const GH = 320              // gauge height (px)
const STEP = 1 / 120
const LEVEL_STIFFNESS = 90
const LEVEL_DAMPING = 14
const SPREAD = 500
const RESTORE = 16
const SURFACE_DAMPING = 5
const MAX_WAVE = 18
const COLOR_MODES_WITH_BRIGHTNESS = ['brightness', 'color_temp', 'hs', 'xy', 'rgb', 'rgbw', 'rgbww', 'white']
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

const CSS = `
:host { display: block; }
.klg-card {
  position: relative; border-radius: 24px; padding: 16px 16px 18px; color: #f5f7fb;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background:
    radial-gradient(120% 120% at 15% 0%, rgba(255,255,255,0.08), rgba(255,255,255,0) 45%),
    linear-gradient(160deg, #1b2030 0%, #12151f 100%);
  box-shadow: 0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06);
  display: flex; flex-direction: column; align-items: center; gap: 12px;
}
.klg-name { align-self: stretch; font-size: 16px; font-weight: 600; letter-spacing: .2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.klg-gauge {
  position: relative; width: min(240px, 100%); height: ${GH}px; border-radius: 28px; overflow: hidden;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12);
  box-shadow: inset 0 2px 10px rgba(0,0,0,0.4); cursor: ns-resize; touch-action: none; user-select: none;
}
.klg-ticks { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
.klg-tick { position: absolute; right: 0; width: 8px; height: 2px; border-radius: 2px; background: rgba(255,255,255,0.18); }
.klg-tick.klg-mid { width: 14px; background: rgba(255,255,255,0.3); }
.klg-layer { position: absolute; inset: 0; z-index: 2; }
.klg-liquid { position: absolute; inset: 0; z-index: 3; will-change: clip-path;
  clip-path: polygon(0 100%, 100% 100%, 100% 100%, 0 100%); }
.klg-rim { position: absolute; left: 0; right: 0; height: 3px; z-index: 4; opacity: .7;
  transform: translateY(${GH}px); will-change: transform; pointer-events: none; }
.klg-text { position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; }
.klg-pct { font-variant-numeric: tabular-nums; font-size: 58px; font-weight: 750; line-height: 1;
  letter-spacing: -1px; }
.klg-pct small { font-size: 22px; font-weight: 650; margin-left: 2px; }
.klg-status { position: absolute; left: 16px; bottom: 16px; font-size: 12px; font-weight: 600;
  letter-spacing: .3px; opacity: .85; }
.klg-bgtext { color: #f5f7fb; }
.klg-liqtext { color: #16181f; }
.klg-bubble { position: absolute; bottom: 0; left: 0; width: 8px; height: 8px; border-radius: 50%;
  background: rgba(255,255,255,0.5); opacity: 0; will-change: transform, opacity; }
.klg-unavail { position: absolute; inset: 0; display: grid; place-items: center; z-index: 5;
  color: rgba(245,247,251,0.55); font-size: 13px; }
`

function textBlock(cls, pct, available, supportsBrightness, isOn) {
  const status = !available ? '' : !supportsBrightness ? (isOn ? 'On' : 'Off')
    : pct >= 100 ? 'Full' : pct <= 0 ? 'Off' : `${pct}% bright`
  const big = !supportsBrightness
    ? html`<span className="klg-pct">${isOn ? 'On' : 'Off'}</span>`
    : html`<span className="klg-pct">${pct}<small>%</small></span>`
  return html`
    <div className=${'klg-text ' + cls}>
      ${big}
      <div className="klg-status">${status}</div>
    </div>`
}

function LiquidGauge({ hass, config }) {
  const entityId = config.entity
  const stateObj = hass && hass.states ? hass.states[entityId] : undefined
  const attrs = (stateObj && stateObj.attributes) || {}
  const available = !!stateObj && stateObj.state !== 'unavailable' && stateObj.state !== 'unknown'
  const isOn = !!stateObj && stateObj.state === 'on'
  const modes = attrs.supported_color_modes || []
  const supportsBrightness = attrs.brightness != null || modes.some((m) => COLOR_MODES_WITH_BRIGHTNESS.includes(m))
  const haPct = attrs.brightness != null ? Math.round((attrs.brightness / 255) * 100) : (isOn ? 100 : 0)
  const name = config.name || attrs.friendly_name || entityId
  const rgb = attrs.rgb_color
  const accent = rgb ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : 'rgb(255,197,143)'
  const rimColor = rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.9)` : 'rgba(255,220,180,0.9)'

  const gaugeRef = useRef(null)
  const liquidRef = useRef(null)
  const rimRef = useRef(null)
  const bubbleEls = useRef([])
  const [pct, setPct] = useState(haPct)
  const dragRef = useRef(false)
  const targetRef = useRef(haPct / 100)
  targetRef.current = clamp(pct / 100, 0, 1)
  const callRef = useRef(() => {})
  callRef.current = (p) => {
    if (!hass || !hass.callService) return
    if (p <= 0) hass.callService('light', 'turn_off', { entity_id: entityId })
    else hass.callService('light', 'turn_on', { entity_id: entityId, brightness_pct: p })
  }

  useEffect(() => { if (!dragRef.current) setPct(haPct) }, [haPct])

  // Wave + bubble simulation (runs once; independent of hass re-renders).
  useEffect(() => {
    const gauge = gaugeRef.current
    const liquid = liquidRef.current
    if (!gauge || !liquid) return
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let W = gauge.clientWidth || 240
    let levelY = GH * (1 - targetRef.current)
    let levelVel = 0
    const h = new Array(COLS).fill(0)
    const hv = new Array(COLS).fill(0)
    const force = new Array(COLS).fill(0)
    const bubbles = []
    for (let i = 0; i < BUBBLES; i++) bubbles.push({ alive: false, x: 0, y: 0, vy: 0, r: 4 })
    let raf = 0, last = 0

    const colX = (i) => (i / (COLS - 1)) * W
    const colAt = (x) => clamp(Math.round((x / Math.max(1, W)) * (COLS - 1)), 0, COLS - 1)

    const spawnBubble = () => {
      const b = bubbles.find((q) => !q.alive)
      if (!b) return
      b.alive = true; b.x = 8 + Math.random() * (W - 16)
      b.y = GH - 6; b.vy = 30 + Math.random() * 45; b.r = 3 + Math.random() * 3
    }

    const sim = (dt) => {
      const targetY = GH * (1 - clamp(targetRef.current, 0, 1))
      const prevLevel = levelY
      const a = LEVEL_STIFFNESS * (targetY - levelY) - LEVEL_DAMPING * levelVel
      levelVel += a * dt
      levelY += levelVel * dt
      if (!isFinite(levelY)) { levelY = targetY; levelVel = 0 }
      // rising → spawn bubbles
      if (levelY < prevLevel - 0.05 && Math.random() < 0.3) spawnBubble()

      for (let i = 0; i < COLS; i++) {
        const l = h[i - 1] !== undefined ? h[i - 1] : h[i]
        const r = h[i + 1] !== undefined ? h[i + 1] : h[i]
        force[i] = SPREAD * ((l - h[i]) + (r - h[i])) - RESTORE * h[i]
      }
      for (let i = 0; i < COLS; i++) {
        hv[i] += force[i] * dt
        hv[i] *= (1 - SURFACE_DAMPING * dt)
        hv[i] = clamp(hv[i], -600, 600)
        h[i] = clamp(h[i] + hv[i] * dt, -MAX_WAVE, MAX_WAVE)
        if (!isFinite(h[i])) { h[i] = 0; hv[i] = 0 }
      }

      for (const b of bubbles) {
        if (!b.alive) continue
        b.y -= b.vy * dt
        if (b.y <= levelY + 4) { b.alive = false; const c = colAt(b.x); hv[c] -= 40 }
      }
    }

    const render = () => {
      let d = ''
      for (let i = 0; i < COLS; i++) {
        const x = colX(i)
        const y = clamp(levelY + h[i], -40, GH + 40)
        d += `${x.toFixed(1)}px ${y.toFixed(1)}px,`
      }
      d += `${W}px ${GH}px, 0px ${GH}px`
      liquid.style.clipPath = `polygon(${d})`
      if (rimRef.current) rimRef.current.style.transform = `translateY(${clamp(levelY, -4, GH).toFixed(1)}px)`
      for (let i = 0; i < BUBBLES; i++) {
        const el = bubbleEls.current[i]; const b = bubbles[i]
        if (!el) continue
        if (b.alive) {
          el.style.opacity = '0.6'
          el.style.transform = `translate(${b.x.toFixed(1)}px, ${(b.y - GH).toFixed(1)}px) scale(${(b.r / 4).toFixed(2)})`
        } else el.style.opacity = '0'
      }
    }

    const frame = (now) => {
      if (!last) last = now
      let acc = (now - last) / 1000; last = now
      if (acc > 0.1) acc = 0.1
      let n = 0
      while (acc >= STEP && n < 8) { sim(STEP); acc -= STEP; n++ }
      render()
      raf = requestAnimationFrame(frame)
    }

    const localPct = (clientY) => {
      const r = gauge.getBoundingClientRect()
      return clamp(Math.round((1 - (clientY - r.top) / r.height) * 100), 0, 100)
    }
    let lastX = 0
    const onDown = (e) => {
      if (!supportsBrightness) { callRef.current(isOn ? 0 : 100); return }
      e.preventDefault()
      dragRef.current = true
      try { gauge.setPointerCapture(e.pointerId) } catch (_) {}
      const r = gauge.getBoundingClientRect()
      const c = colAt(e.clientX - r.left); hv[c] -= 160  // splash
      lastX = e.clientX
      setPct(localPct(e.clientY))
    }
    const onMove = (e) => {
      if (!dragRef.current) return
      const r = gauge.getBoundingClientRect()
      const dx = e.clientX - lastX; lastX = e.clientX
      const c = colAt(e.clientX - r.left); hv[c] += clamp(dx * 0.6, -60, 60) // slosh
      setPct(localPct(e.clientY))
    }
    const onUp = (e) => {
      if (!dragRef.current) return
      dragRef.current = false
      const p = localPct(e.clientY)
      setPct(p); callRef.current(p)
    }
    gauge.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => { W = gauge.clientWidth || W })
      : null
    if (ro) ro.observe(gauge)

    if (reduce) {
      // snap, no waves: draw flat fill at target each hass change via a light loop
      const flat = () => {
        levelY += (GH * (1 - clamp(targetRef.current, 0, 1)) - levelY) * 0.5
        for (let i = 0; i < COLS; i++) h[i] = 0
        render()
        if (Math.abs(GH * (1 - targetRef.current) - levelY) > 0.5) raf = requestAnimationFrame(flat)
        else raf = 0
      }
      const kick = () => { if (!raf) raf = requestAnimationFrame(flat) }
      const iv = setInterval(kick, 200)
      kick()
      return () => { clearInterval(iv); if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect()
        gauge.removeEventListener('pointerdown', onDown); window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp) }
    }

    raf = requestAnimationFrame(frame)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      if (ro) ro.disconnect()
      gauge.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])

  const onKey = (e) => {
    if (!supportsBrightness) return
    let np = pct
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') np = clamp(pct + (e.shiftKey ? 10 : 1), 0, 100)
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') np = clamp(pct - (e.shiftKey ? 10 : 1), 0, 100)
    else if (e.key === 'PageUp') np = clamp(pct + 10, 0, 100)
    else if (e.key === 'PageDown') np = clamp(pct - 10, 0, 100)
    else if (e.key === 'Home') np = 0
    else if (e.key === 'End') np = 100
    else return
    e.preventDefault(); setPct(np); callRef.current(np)
  }

  const ticks = []
  for (let i = 1; i <= 9; i++) {
    ticks.push(html`<div className=${'klg-tick' + (i === 5 ? ' klg-mid' : '')} style=${{ top: (i * 10) + '%' }} />`)
  }
  const bubbleSpans = []
  for (let i = 0; i < BUBBLES; i++) {
    bubbleSpans.push(html`<span className="klg-bubble" ref=${(el) => { bubbleEls.current[i] = el }} />`)
  }

  return html`
    <div className="klg-card">
      <div className="klg-name">${name}</div>
      <div className="klg-gauge" ref=${gaugeRef}
        role="slider" aria-label=${name} aria-valuemin=${0} aria-valuemax=${100} aria-valuenow=${pct}
        tabIndex=${0} onKeyDown=${onKey}>
        <div className="klg-ticks">${ticks}</div>
        ${textBlock('klg-bgtext', pct, available, supportsBrightness, isOn)}
        <div className="klg-liquid" ref=${liquidRef} style=${{ backgroundColor: accent }}>
          ${textBlock('klg-liqtext', pct, available, supportsBrightness, isOn)}
          ${bubbleSpans}
        </div>
        <div className="klg-rim" ref=${rimRef} style=${{ backgroundColor: rimColor }} />
        ${!available && html`<div className="klg-unavail">Unavailable</div>`}
      </div>
    </div>`
}

class KokonutLiquidGauge extends HTMLElement {
  setConfig(config) {
    if (!config || !config.entity) throw new Error('kokonut-liquid-gauge: you must define an "entity"')
    if (config.entity.split('.')[0] !== 'light') throw new Error('kokonut-liquid-gauge: "entity" must be a light.* entity')
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
    this._root.render(html`<${LiquidGauge} hass=${this._hass} config=${this._config} />`)
  }
  getCardSize() { return 4 }
  static getStubConfig() { return { entity: 'light.example' } }
}

if (!customElements.get('kokonut-liquid-gauge')) {
  customElements.define('kokonut-liquid-gauge', KokonutLiquidGauge)
}
window.customCards = window.customCards || []
window.customCards.push({
  type: 'kokonut-liquid-gauge',
  name: 'Kokonut Liquid Gauge',
  description: 'Liquid-filled brightness gauge with waves and bubbles.',
  preview: true,
})
console.info(`%c KOKONUT-LIQUID-GAUGE %c v${VERSION} `,
  'background:#1b2030;color:#ffc58f;border-radius:4px 0 0 4px;padding:2px 4px',
  'background:#ffc58f;color:#1b2030;border-radius:0 4px 4px 0;padding:2px 4px')
