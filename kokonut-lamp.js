/**
 * Kokonut Lamp — one card combining a pull-cord on/off toggle with a liquid-gauge
 * brightness tank, both driving a single Home Assistant light.
 *   • Pull the cord (physics rope, swings back) to toggle the light.
 *   • Drag the liquid tank up/down (or arrow keys) to set brightness 0–100.
 * No build step: deps import from a pinned ESM CDN at load time.
 *
 * Usage:
 *   type: custom:kokonut-lamp
 *   entity: light.living_room
 *   name: Living Room          # optional
 */
import React from 'https://esm.sh/react@18.3.1'
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client?deps=react@18.3.1'
import htm from 'https://esm.sh/htm@3.1.1'

const VERSION = '0.1.0'
const { useRef, useEffect, useState } = React
const html = htm.bind(React.createElement)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

const H = 300  // shared body height

// Liquid gauge constants
const COLS = 22, BUBBLES = 7, STEP = 1 / 120
const LEVEL_STIFFNESS = 90, LEVEL_DAMPING = 14
const SPREAD = 500, RESTORE = 16, SURFACE_DAMPING = 5, MAX_WAVE = 16

// Pull cord constants
const N = 14, SEG = 18, GRAV = 0.7, FRICTION = 0.985, ITER = 8
const ANCHOR_Y = 48, THRESHOLD = 28, GRAB_R2 = 46 * 46

const COLOR_MODES_WITH_BRIGHTNESS = ['brightness', 'color_temp', 'hs', 'xy', 'rgb', 'rgbw', 'rgbww', 'white']

const CSS = `
:host { display: block; }
.kl-card {
  position: relative; border-radius: 24px; padding: 16px 16px 18px; color: #f5f7fb;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background:
    radial-gradient(120% 120% at 15% 0%, rgba(255,255,255,0.08), rgba(255,255,255,0) 45%),
    linear-gradient(160deg, #1b2030 0%, #12151f 100%);
  box-shadow: 0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06);
}
.kl-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.kl-name { font-size: 16px; font-weight: 600; letter-spacing: .2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kl-sub { font-size: 12px; color: rgba(245,247,251,0.5); white-space: nowrap; }
.kl-body { display: flex; align-items: stretch; gap: 14px; height: ${H}px; }

/* Liquid gauge */
.kl-gauge { position: relative; flex: 1 1 auto; min-width: 120px; height: 100%; border-radius: 26px; overflow: hidden;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12);
  box-shadow: inset 0 2px 10px rgba(0,0,0,0.4); cursor: ns-resize; touch-action: none; user-select: none; }
.kl-ticks { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
.kl-tick { position: absolute; right: 0; width: 8px; height: 2px; border-radius: 2px; background: rgba(255,255,255,0.18); }
.kl-tick.kl-mid { width: 14px; background: rgba(255,255,255,0.3); }
.kl-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.kl-pct { font-variant-numeric: tabular-nums; font-size: 52px; font-weight: 750; line-height: 1; letter-spacing: -1px; }
.kl-pct small { font-size: 20px; font-weight: 650; margin-left: 2px; }
.kl-status { position: absolute; left: 14px; bottom: 14px; font-size: 12px; font-weight: 600; opacity: .85; }
.kl-bgtext { color: #f5f7fb; }
.kl-liqtext { color: #16181f; }
.kl-liquid { position: absolute; inset: 0; z-index: 3; will-change: clip-path;
  clip-path: polygon(0 100%, 100% 100%, 100% 100%, 0 100%); }
.kl-rim { position: absolute; left: 0; right: 0; height: 3px; z-index: 4; opacity: .7; transform: translateY(${H}px); will-change: transform; pointer-events: none; }
.kl-bubble { position: absolute; bottom: 0; left: 0; width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.5); opacity: 0; will-change: transform, opacity; }
.kl-unavail { position: absolute; inset: 0; display: grid; place-items: center; z-index: 5; color: rgba(245,247,251,0.55); font-size: 13px; }

/* Pull cord */
.kl-cord { position: relative; flex: 0 0 82px; width: 82px; height: 100%; }
.kl-svg { display: block; width: 100%; height: 100%; touch-action: none; }
.kl-cordpath { fill: none; stroke: rgba(230,235,245,0.75); stroke-width: 2.4; stroke-linecap: round; }
.kl-bead { stroke: rgba(0,0,0,0.25); stroke-width: 1; cursor: grab; }
.kl-bead:active { cursor: grabbing; }
.kl-cordhint { position: absolute; bottom: 4px; left: 0; right: 0; text-align: center; font-size: 10px;
  letter-spacing: .5px; text-transform: uppercase; color: rgba(245,247,251,0.35); }
.kl-a11y { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); border: 0; }
`

function textBlock(cls, pct, available, supportsBrightness, isOn) {
  const status = !available ? '' : !supportsBrightness ? (isOn ? 'On' : 'Off')
    : (isOn || pct > 0) ? `${pct}%` : 'Off'
  const big = !supportsBrightness
    ? html`<span className="kl-pct">${isOn ? 'On' : 'Off'}</span>`
    : html`<span className="kl-pct">${(isOn || pct > 0) ? pct : 0}<small>%</small></span>`
  return html`<div className=${'kl-text ' + cls}>${big}<div className="kl-status">${status}</div></div>`
}

function Lamp({ hass, config }) {
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

  const [pct, setPct] = useState(haPct)
  const dragRef = useRef(false)
  const targetRef = useRef(haPct / 100)
  targetRef.current = clamp(((isOn || dragRef.current) ? pct : 0) / 100, 0, 1)
  const svcRef = useRef({})
  svcRef.current = {
    setBrightness: (p) => {
      if (!hass || !hass.callService) return
      if (p <= 0) hass.callService('light', 'turn_off', { entity_id: entityId })
      else hass.callService('light', 'turn_on', { entity_id: entityId, brightness_pct: p })
    },
    toggle: () => hass && hass.callService &&
      hass.callService('light', isOn ? 'turn_off' : 'turn_on', { entity_id: entityId }),
  }
  useEffect(() => { if (!dragRef.current) setPct(haPct) }, [haPct])

  const gaugeRef = useRef(null), liquidRef = useRef(null), rimRef = useRef(null), bubbleEls = useRef([])
  const svgRef = useRef(null), pathRef = useRef(null), beadRef = useRef(null)

  /* ---- liquid gauge simulation ---- */
  useEffect(() => {
    const gauge = gaugeRef.current, liquid = liquidRef.current
    if (!gauge || !liquid) return
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let W = gauge.clientWidth || 160
    let levelY = H * (1 - targetRef.current), levelVel = 0
    const h = new Array(COLS).fill(0), hv = new Array(COLS).fill(0), force = new Array(COLS).fill(0)
    const bubbles = []; for (let i = 0; i < BUBBLES; i++) bubbles.push({ alive: false, x: 0, y: 0, vy: 0, r: 4 })
    let raf = 0, last = 0
    const colX = (i) => (i / (COLS - 1)) * W
    const colAt = (x) => clamp(Math.round((x / Math.max(1, W)) * (COLS - 1)), 0, COLS - 1)
    const spawn = () => { const b = bubbles.find((q) => !q.alive); if (!b) return
      b.alive = true; b.x = 8 + Math.random() * (W - 16); b.y = H - 6; b.vy = 30 + Math.random() * 45; b.r = 3 + Math.random() * 3 }
    const sim = (dt) => {
      const targetY = H * (1 - clamp(targetRef.current, 0, 1)), prev = levelY
      levelVel += (LEVEL_STIFFNESS * (targetY - levelY) - LEVEL_DAMPING * levelVel) * dt
      levelY += levelVel * dt
      if (!isFinite(levelY)) { levelY = targetY; levelVel = 0 }
      if (levelY < prev - 0.05 && Math.random() < 0.3) spawn()
      for (let i = 0; i < COLS; i++) {
        const l = h[i - 1] !== undefined ? h[i - 1] : h[i], r = h[i + 1] !== undefined ? h[i + 1] : h[i]
        force[i] = SPREAD * ((l - h[i]) + (r - h[i])) - RESTORE * h[i]
      }
      for (let i = 0; i < COLS; i++) {
        hv[i] += force[i] * dt; hv[i] *= (1 - SURFACE_DAMPING * dt); hv[i] = clamp(hv[i], -600, 600)
        h[i] = clamp(h[i] + hv[i] * dt, -MAX_WAVE, MAX_WAVE); if (!isFinite(h[i])) { h[i] = 0; hv[i] = 0 }
      }
      for (const b of bubbles) { if (!b.alive) continue; b.y -= b.vy * dt; if (b.y <= levelY + 4) { b.alive = false; hv[colAt(b.x)] -= 40 } }
    }
    const render = () => {
      let d = ''
      for (let i = 0; i < COLS; i++) d += `${colX(i).toFixed(1)}px ${clamp(levelY + h[i], -40, H + 40).toFixed(1)}px,`
      d += `${W}px ${H}px, 0px ${H}px`
      liquid.style.clipPath = `polygon(${d})`
      if (rimRef.current) rimRef.current.style.transform = `translateY(${clamp(levelY, -4, H).toFixed(1)}px)`
      for (let i = 0; i < BUBBLES; i++) { const el = bubbleEls.current[i], b = bubbles[i]; if (!el) continue
        if (b.alive) { el.style.opacity = '0.6'; el.style.transform = `translate(${b.x.toFixed(1)}px, ${(b.y - H).toFixed(1)}px) scale(${(b.r / 4).toFixed(2)})` } else el.style.opacity = '0' }
    }
    const frame = (now) => { if (!last) last = now; let acc = (now - last) / 1000; last = now; if (acc > 0.1) acc = 0.1
      let n = 0; while (acc >= STEP && n < 8) { sim(STEP); acc -= STEP; n++ } render(); raf = requestAnimationFrame(frame) }
    const localPct = (cy) => { const r = gauge.getBoundingClientRect(); return clamp(Math.round((1 - (cy - r.top) / r.height) * 100), 0, 100) }
    let lastX = 0
    const onDown = (e) => { if (!supportsBrightness) { svcRef.current.toggle(); return } e.preventDefault(); dragRef.current = true
      try { gauge.setPointerCapture(e.pointerId) } catch (_) {} const r = gauge.getBoundingClientRect(); hv[colAt(e.clientX - r.left)] -= 160; lastX = e.clientX; setPct(localPct(e.clientY)) }
    const onMove = (e) => { if (!dragRef.current) return; const r = gauge.getBoundingClientRect(); const dx = e.clientX - lastX; lastX = e.clientX
      hv[colAt(e.clientX - r.left)] += clamp(dx * 0.6, -60, 60); setPct(localPct(e.clientY)) }
    const onUp = (e) => { if (!dragRef.current) return; dragRef.current = false; const p = localPct(e.clientY); setPct(p); svcRef.current.setBrightness(p) }
    gauge.addEventListener('pointerdown', onDown); window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { W = gauge.clientWidth || W }) : null
    if (ro) ro.observe(gauge)
    if (reduce) { const flat = () => { levelY += (H * (1 - clamp(targetRef.current, 0, 1)) - levelY) * 0.5; for (let i = 0; i < COLS; i++) h[i] = 0; render()
        raf = Math.abs(H * (1 - targetRef.current) - levelY) > 0.5 ? requestAnimationFrame(flat) : 0 }
      const iv = setInterval(() => { if (!raf) raf = requestAnimationFrame(flat) }, 200); flat()
      return () => { clearInterval(iv); if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect()
        gauge.removeEventListener('pointerdown', onDown); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp) } }
    raf = requestAnimationFrame(frame)
    return () => { if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect()
      gauge.removeEventListener('pointerdown', onDown); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp) }
  }, [])

  /* ---- pull cord simulation ---- */
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let width = svg.clientWidth || 64, anchorX = width / 2
    const pts = []
    for (let i = 0; i < N; i++) { const y = ANCHOR_Y + i * SEG; pts.push({ x: anchorX, y, px: anchorX, py: y }) }
    const restBeadY = ANCHOR_Y + (N - 1) * SEG
    let grab = -1, mx = 0, my = 0, armed = true, raf = 0
    const draw = () => { let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
      for (let i = 1; i < N; i++) d += ` L ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`
      if (pathRef.current) pathRef.current.setAttribute('d', d)
      const b = pts[N - 1]; if (beadRef.current) { beadRef.current.setAttribute('cx', b.x.toFixed(1)); beadRef.current.setAttribute('cy', b.y.toFixed(1)) } }
    const solve = () => { for (let k = 0; k < ITER; k++) { pts[0].x = anchorX; pts[0].y = ANCHOR_Y
        for (let i = 0; i < N - 1; i++) { const a = pts[i], b = pts[i + 1]; let dx = b.x - a.x, dy = b.y - a.y; const dist = Math.hypot(dx, dy) || 0.0001
          const diff = ((SEG - dist) / dist) * 0.5, ox = dx * diff, oy = dy * diff; if (i !== 0) { a.x -= ox; a.y -= oy } b.x += ox; b.y += oy }
        if (grab >= 0) { pts[grab].x = mx; pts[grab].y = my } } }
    const step = () => { for (let i = 1; i < N; i++) { const p = pts[i]; const vx = (p.x - p.px) * FRICTION, vy = (p.y - p.py) * FRICTION
        p.px = p.x; p.py = p.y; p.x += vx; p.y += vy + GRAV }
      solve(); const bead = pts[N - 1]
      if (grab >= 0 && armed && bead.y - restBeadY > THRESHOLD) { armed = false; svcRef.current.toggle(); if (navigator.vibrate) { try { navigator.vibrate(15) } catch (_) {} } }
      draw(); let moving = grab >= 0
      if (!moving) for (let i = 1; i < N; i++) { if (Math.abs(pts[i].x - pts[i].px) + Math.abs(pts[i].y - pts[i].py) > 0.25) { moving = true; break } }
      raf = moving ? requestAnimationFrame(step) : 0 }
    const ensure = () => { if (!raf) raf = requestAnimationFrame(step) }
    const settle = () => { for (let k = 0; k < 60; k++) solve(); draw() }
    const lp = (e) => { const r = svg.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
    const onDown = (e) => { width = svg.clientWidth || width; anchorX = width / 2; const p = lp(e)
      let best = -1, bd = GRAB_R2; for (let i = 1; i < N; i++) { const dd = (pts[i].x - p.x) ** 2 + (pts[i].y - p.y) ** 2; if (dd < bd) { bd = dd; best = i } }
      if (best < 0) return; grab = best; mx = p.x; my = p.y; armed = true; e.preventDefault()
      try { svg.setPointerCapture(e.pointerId) } catch (_) {} if (reduce) { pts[grab].x = mx; pts[grab].y = my; solve(); draw() } else ensure() }
    const onMove = (e) => { if (grab < 0) return; const p = lp(e); const dx = p.x - anchorX, dy = p.y - ANCHOR_Y, dist = Math.hypot(dx, dy), maxR = (N - 1) * SEG + 46
      if (dist > maxR) { const s = maxR / dist; mx = anchorX + dx * s; my = ANCHOR_Y + dy * s } else { mx = p.x; my = p.y }
      if (reduce) { pts[grab].x = mx; pts[grab].y = my; solve(); const bead = pts[N - 1]; if (armed && bead.y - restBeadY > THRESHOLD) { armed = false; svcRef.current.toggle() } draw() } else ensure() }
    const onUp = () => { if (grab < 0) return; grab = -1; armed = true; if (reduce) settle(); else ensure() }
    svg.addEventListener('pointerdown', onDown); window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { width = svg.clientWidth || width; anchorX = width / 2; if (grab < 0) { if (reduce) settle(); else ensure() } }) : null
    if (ro) ro.observe(svg)
    settle(); if (!reduce) ensure()
    return () => { if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect()
      svg.removeEventListener('pointerdown', onDown); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp) }
  }, [])

  const onKey = (e) => { if (!supportsBrightness) return; let np = pct
    if (e.key === 'ArrowUp') np = clamp(pct + (e.shiftKey ? 10 : 1), 0, 100)
    else if (e.key === 'ArrowDown') np = clamp(pct - (e.shiftKey ? 10 : 1), 0, 100)
    else if (e.key === 'Home') np = 0; else if (e.key === 'End') np = 100; else return
    e.preventDefault(); setPct(np); svcRef.current.setBrightness(np) }

  const ticks = []
  for (let i = 1; i <= 9; i++) ticks.push(html`<div className=${'kl-tick' + (i === 5 ? ' kl-mid' : '')} style=${{ top: (i * 10) + '%' }} />`)
  const bubbleSpans = []
  for (let i = 0; i < BUBBLES; i++) bubbleSpans.push(html`<span className="kl-bubble" ref=${(el) => { bubbleEls.current[i] = el }} />`)

  const dispPct = (isOn || pct > 0) ? pct : 0

  return html`
    <div className="kl-card">
      <div className="kl-head">
        <div className="kl-name">${name}</div>
        <div className="kl-sub">${available ? (isOn ? 'On' : 'Off') : 'Unavailable'}</div>
      </div>
      <div className="kl-body">
        <div className="kl-gauge" ref=${gaugeRef}
          role="slider" aria-label=${name + ' brightness'} aria-valuemin=${0} aria-valuemax=${100} aria-valuenow=${dispPct}
          tabIndex=${0} onKeyDown=${onKey}>
          <div className="kl-ticks">${ticks}</div>
          ${textBlock('kl-bgtext', dispPct, available, supportsBrightness, isOn)}
          <div className="kl-liquid" ref=${liquidRef} style=${{ backgroundColor: accent }}>
            ${textBlock('kl-liqtext', dispPct, available, supportsBrightness, isOn)}
            ${bubbleSpans}
          </div>
          <div className="kl-rim" ref=${rimRef} style=${{ backgroundColor: rimColor }} />
          ${!available && html`<div className="kl-unavail">Unavailable</div>`}
        </div>
        <div className="kl-cord">
          <svg className="kl-svg" ref=${svgRef} aria-hidden="true">
            <defs>
              <radialGradient id="kl-bulb" cx="50%" cy="38%" r="62%">
                <stop offset="0%" stop-color=${isOn ? '#fff8ec' : '#4a5160'} />
                <stop offset="100%" stop-color=${isOn ? accent : '#39404f'} />
              </radialGradient>
              <radialGradient id="kl-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color=${accent} stop-opacity=${isOn ? 0.55 : 0} />
                <stop offset="100%" stop-color=${accent} stop-opacity="0" />
              </radialGradient>
            </defs>
            <circle cx="41" cy="32" r="32" fill="url(#kl-glow)" />
            <rect x="33" y="2" width="16" height="6" rx="2" fill="rgba(255,255,255,0.22)" />
            <line x1="41" y1="8" x2="41" y2="18" stroke="rgba(255,255,255,0.3)" stroke-width="2" />
            <path d=${'M 27 32 a 14 14 0 1 1 28 0 c 0 7 -4 10 -5 14 l -18 0 c -1 -4 -5 -7 -5 -14 Z'}
              fill="url(#kl-bulb)" stroke="rgba(0,0,0,0.25)" stroke-width="1" />
            <rect x="35" y="45" width="12" height="7" rx="2" fill="#2b303c" />
            <path className="kl-cordpath" ref=${pathRef} d="" />
            <circle className="kl-bead" ref=${beadRef} r="8" fill="#e9edf5" cx="41" cy=${ANCHOR_Y + (N - 1) * SEG} />
          </svg>
          <div className="kl-cordhint">Pull</div>
        </div>
      </div>
      <button className="kl-a11y" onClick=${() => svcRef.current.toggle()} aria-label=${(isOn ? 'Turn off ' : 'Turn on ') + name}>toggle</button>
    </div>`
}

class KokonutLamp extends HTMLElement {
  setConfig(config) {
    if (!config || !config.entity) throw new Error('kokonut-lamp: you must define an "entity"')
    if (config.entity.split('.')[0] !== 'light') throw new Error('kokonut-lamp: "entity" must be a light.* entity')
    this._config = config
    this._render()
  }
  set hass(hass) { this._hass = hass; this._render() }
  connectedCallback() { this._render() }
  disconnectedCallback() { const root = this._root; this._root = null; this._mount = null; if (root) queueMicrotask(() => root.unmount()) }
  _ensure() {
    if (this._root) return
    const shadow = this.shadowRoot || this.attachShadow({ mode: 'open' })
    try { const sheet = new CSSStyleSheet(); sheet.replaceSync(CSS); shadow.adoptedStyleSheets = [sheet] }
    catch (e) { const s = document.createElement('style'); s.textContent = CSS; shadow.appendChild(s) }
    this._mount = document.createElement('div'); shadow.appendChild(this._mount)
    this._root = createRoot(this._mount)
  }
  _render() { if (!this._config) return; this._ensure(); this._root.render(html`<${Lamp} hass=${this._hass} config=${this._config} />`) }
  getCardSize() { return 5 }
  static getStubConfig() { return { entity: 'light.example' } }
}

if (!customElements.get('kokonut-lamp')) customElements.define('kokonut-lamp', KokonutLamp)
window.customCards = window.customCards || []
window.customCards.push({ type: 'kokonut-lamp', name: 'Kokonut Lamp', description: 'Pull-cord toggle + liquid brightness gauge for one light.', preview: true })
console.info(`%c KOKONUT-LAMP %c v${VERSION} `,
  'background:#1b2030;color:#ffc58f;border-radius:4px 0 0 4px;padding:2px 4px',
  'background:#ffc58f;color:#1b2030;border-radius:0 4px 4px 0;padding:2px 4px')
