/**
 * Kokonut Liquid Gauge — a vertical 0–100 liquid brightness slider for Home Assistant.
 * Drag up/down (or tap a level) on the gauge to set a light's brightness; the liquid
 * fills to match with an animated wavy surface. No build step: deps import from a CDN.
 *
 * Usage:
 *   type: custom:kokonut-liquid-gauge
 *   entity: light.living_room
 *   name: Living Room        # optional
 */
import React from 'https://esm.sh/react@18.3.1'
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client?deps=react@18.3.1'
import { motion } from 'https://esm.sh/motion@11.11.17/react?deps=react@18.3.1'
import htm from 'https://esm.sh/htm@3.1.1'

const VERSION = '0.1.0'
const { useState, useRef, useEffect } = React
const html = htm.bind(React.createElement)

const COLOR_MODES_WITH_BRIGHTNESS = ['brightness', 'color_temp', 'hs', 'xy', 'rgb', 'rgbw', 'rgbww', 'white']

const CSS = `
:host { display: block; }
.klg-card {
  position: relative; border-radius: 24px; padding: 16px 16px 18px;
  color: #f5f7fb; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background:
    radial-gradient(120% 120% at 15% 0%, rgba(255,255,255,0.08), rgba(255,255,255,0) 45%),
    linear-gradient(160deg, #1b2030 0%, #12151f 100%);
  box-shadow: 0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06);
  display: flex; flex-direction: column; align-items: center; gap: 12px;
}
.klg-name { align-self: stretch; font-size: 16px; font-weight: 600; letter-spacing: .2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.klg-gauge {
  position: relative; width: 104px; height: 188px; border-radius: 26px; overflow: hidden;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
  cursor: ns-resize; touch-action: none; user-select: none;
  box-shadow: inset 0 2px 8px rgba(0,0,0,0.35);
}
.klg-fill { position: absolute; left: 0; right: 0; bottom: 0; }
.klg-fill.klg-anim { transition: height .22s ease; }
.klg-body { position: absolute; left: 0; right: 0; top: 14px; bottom: 0; }
.klg-wave { position: absolute; left: 0; top: -1px; width: 200%; height: 16px; display: block; animation: klg-wave 2.6s linear infinite; }
.klg-wave.klg-slow { opacity: .5; height: 18px; animation-duration: 4.2s; animation-direction: reverse; }
@keyframes klg-wave { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.klg-readout { position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; pointer-events: none; }
.klg-pct { font-variant-numeric: tabular-nums; font-size: 30px; font-weight: 700;
  text-shadow: 0 1px 6px rgba(0,0,0,0.45); }
.klg-pct small { font-size: 15px; font-weight: 600; opacity: .8; margin-left: 1px; }
.klg-off { font-size: 15px; font-weight: 600; opacity: .7; letter-spacing: .4px; }
.klg-unavailable { font-size: 13px; color: rgba(245,247,251,0.55); }
`

function waveSvg(extra) {
  return html`
    <svg className=${'klg-wave' + (extra || '')} viewBox="0 0 200 16" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 8 Q 25 0 50 8 T 100 8 T 150 8 T 200 8 V16 H0 Z" fill="currentColor" />
    </svg>`
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

  const ref = useRef(null)
  const [pct, setPct] = useState(haPct)
  const [dragging, setDragging] = useState(false)
  useEffect(() => { if (!dragging) setPct(haPct) }, [haPct, dragging])

  const call = (service, data) =>
    hass && hass.callService && hass.callService('light', service, { entity_id: entityId, ...data })
  const apply = (p) => { if (p <= 0) call('turn_off', {}); else call('turn_on', { brightness_pct: p }) }

  const pctFromY = (clientY) => {
    const el = ref.current
    if (!el) return pct
    const r = el.getBoundingClientRect()
    const p = Math.round((1 - (clientY - r.top) / r.height) * 100)
    return Math.max(0, Math.min(100, p))
  }
  const onDown = (e) => {
    if (!supportsBrightness) { call(isOn ? 'turn_off' : 'turn_on', {}); return }
    e.preventDefault()
    setDragging(true)
    try { ref.current.setPointerCapture(e.pointerId) } catch (_) {}
    setPct(pctFromY(e.clientY))
  }
  const onMove = (e) => { if (dragging) setPct(pctFromY(e.clientY)) }
  const onUp = (e) => {
    if (!dragging) return
    const p = pctFromY(e.clientY)
    setPct(p); setDragging(false); apply(p)
  }

  const fillColor = isOn || dragging || pct > 0 ? accent : 'rgb(120,130,150)'

  return html`
    <div className="klg-card">
      <div className="klg-name">${name}</div>
      <div className="klg-gauge" ref=${ref}
        role="slider" aria-label=${name} aria-valuemin=${0} aria-valuemax=${100} aria-valuenow=${pct}
        tabIndex=${0}
        onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onUp} onPointerCancel=${onUp}
        onKeyDown=${(e) => {
          if (!supportsBrightness) return
          let np = pct
          if (e.key === 'ArrowUp') np = Math.min(100, pct + 5)
          else if (e.key === 'ArrowDown') np = Math.max(0, pct - 5)
          else return
          e.preventDefault(); setPct(np); apply(np)
        }}>
        <${motion.div}
          className=${'klg-fill' + (dragging ? '' : ' klg-anim')}
          style=${{ height: pct + '%' }}
          animate=${{ backgroundColor: fillColor }}
          transition=${{ duration: 0.4 }}>
          <div className="klg-body" style=${{ background: fillColor }} />
          <div style=${{ color: fillColor, position: 'absolute', left: 0, top: 0, width: '100%' }}>
            ${waveSvg('')}
            ${waveSvg(' klg-slow')}
          </div>
        <//>
        <div className="klg-readout">
          ${!available
            ? html`<span className="klg-unavailable">Unavailable</span>`
            : !supportsBrightness
              ? html`<span className="klg-off">${isOn ? 'On' : 'Off'}</span>`
              : pct > 0
                ? html`<span className="klg-pct">${pct}<small>%</small></span>`
                : html`<span className="klg-off">Off</span>`}
        </div>
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
  getCardSize() { return 3 }
  static getStubConfig() { return { entity: 'light.example' } }
}

if (!customElements.get('kokonut-liquid-gauge')) {
  customElements.define('kokonut-liquid-gauge', KokonutLiquidGauge)
}
window.customCards = window.customCards || []
window.customCards.push({
  type: 'kokonut-liquid-gauge',
  name: 'Kokonut Liquid Gauge',
  description: 'Vertical 0–100 liquid brightness slider for a light.',
  preview: true,
})
console.info(`%c KOKONUT-LIQUID-GAUGE %c v${VERSION} `,
  'background:#1b2030;color:#ffc58f;border-radius:4px 0 0 4px;padding:2px 4px',
  'background:#ffc58f;color:#1b2030;border-radius:0 4px 4px 0;padding:2px 4px')
