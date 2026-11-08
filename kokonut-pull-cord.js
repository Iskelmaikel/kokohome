/**
 * Kokonut Pull Cord — a pull-cord lamp toggle card for Home Assistant (Lovelace).
 * Tug the cord down and release to toggle the light (click/Enter also works).
 * No build step: dependencies import from a pinned ESM CDN at load time.
 *
 * Usage:
 *   type: custom:kokonut-pull-cord
 *   entity: light.bedside_lamp
 *   name: Bedside            # optional
 */
import React from 'https://esm.sh/react@18.3.1'
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client?deps=react@18.3.1'
import { motion, useMotionValue, useTransform } from 'https://esm.sh/motion@11.11.17/react?deps=react@18.3.1'
import htm from 'https://esm.sh/htm@3.1.1'

const VERSION = '0.1.0'
const { useState } = React
const html = htm.bind(React.createElement)

const CORD_BASE = 34   // resting cord length (px)
const PULL_MAX = 66    // how far the handle can travel
const TRIGGER = 40     // pull distance that counts as a tug

const CSS = `
:host { display: block; }
.kpc-card {
  position: relative; overflow: hidden; border-radius: 24px; padding: 16px 18px 18px;
  color: #f5f7fb; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background:
    radial-gradient(120% 120% at 15% 0%, rgba(255,255,255,0.08), rgba(255,255,255,0) 45%),
    linear-gradient(160deg, #1b2030 0%, #12151f 100%);
  box-shadow: 0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06);
  isolation: isolate; -webkit-tap-highlight-color: transparent;
  display: flex; align-items: center; gap: 14px; min-height: 128px;
}
.kpc-glow { position: absolute; inset: -40% -20% auto -20%; height: 90%; z-index: 0; filter: blur(44px); pointer-events: none; }
.kpc-info { position: relative; z-index: 1; flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 14px; }
.kpc-iconwrap { flex: 0 0 auto; width: 56px; height: 56px; border-radius: 16px; display: grid; place-items: center;
  border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); backdrop-filter: blur(6px); }
.kpc-iconwrap svg { width: 28px; height: 28px; display: block; }
.kpc-text { min-width: 0; }
.kpc-name { font-size: 16px; font-weight: 600; letter-spacing: .2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kpc-sub { margin-top: 2px; font-size: 13px; color: rgba(245,247,251,0.6); }

.kpc-cordzone {
  position: relative; z-index: 1; flex: 0 0 auto; width: 48px; align-self: stretch;
  touch-action: none; user-select: none;
}
.kpc-mount { position: absolute; top: 0; left: 50%; transform: translateX(-50%);
  width: 26px; height: 5px; border-radius: 0 0 6px 6px; background: rgba(255,255,255,0.22); }
.kpc-cord { position: absolute; top: 5px; left: 50%; transform: translateX(-50%); width: 2px;
  background: linear-gradient(rgba(255,255,255,0.5), rgba(255,255,255,0.2)); border-radius: 2px; }
.kpc-handle {
  position: absolute; left: 50%; top: 5px; margin-left: -11px; width: 22px; height: 30px;
  border-radius: 11px; cursor: grab;
  background: radial-gradient(120% 80% at 50% 25%, #ffffff 0%, #cfd6e6 55%, #9aa3bb 100%);
  box-shadow: 0 4px 10px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.8);
}
.kpc-handle:active { cursor: grabbing; }
.kpc-hint { position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); white-space: nowrap;
  font-size: 10px; letter-spacing: .5px; text-transform: uppercase; color: rgba(245,247,251,0.35); }
.kpc-unavailable { color: rgba(245,247,251,0.55); font-size: 13px; margin-top: 2px; }
`

function BulbIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 18h6" /><path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-4 10.5c.5.5 1 1.2 1 2V16h6v-.5c0-.8.5-1.5 1-2A6 6 0 0 0 12 3Z" />
    </svg>`
}

function PullCord({ hass, config }) {
  const entityId = config.entity
  const stateObj = hass && hass.states ? hass.states[entityId] : undefined
  const available = !!stateObj && stateObj.state !== 'unavailable' && stateObj.state !== 'unknown'
  const isOn = !!stateObj && stateObj.state === 'on'
  const name = config.name || (stateObj && stateObj.attributes && stateObj.attributes.friendly_name) || entityId
  const rgb = stateObj && stateObj.attributes && stateObj.attributes.rgb_color
  const accent = !isOn ? 'rgb(120,130,150)' : rgb ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : 'rgb(255,197,143)'

  const y = useMotionValue(0)
  const cordHeight = useTransform(y, (v) => CORD_BASE + v)
  const [tugging, setTugging] = useState(false)

  const toggle = () => hass && hass.callService &&
    hass.callService('light', isOn ? 'turn_off' : 'turn_on', { entity_id: entityId })

  const onDragEnd = (_e, info) => {
    setTugging(false)
    if (info.offset.y > TRIGGER) toggle()
  }

  return html`
    <div className="kpc-card">
      <${motion.div} className="kpc-glow"
        animate=${{ opacity: isOn ? 0.75 : 0, background: `radial-gradient(60% 100% at 70% 0%, ${accent}, rgba(0,0,0,0) 70%)` }}
        transition=${{ duration: 0.45, ease: 'easeOut' }} />

      <div className="kpc-info">
        <${motion.div} className="kpc-iconwrap"
          animate=${{ color: isOn ? accent : 'rgba(245,247,251,0.75)', boxShadow: isOn ? `0 0 22px -4px ${accent}` : '0 0 0 rgba(0,0,0,0)' }}
          transition=${{ duration: 0.35 }}>
          <${BulbIcon} />
        <//>
        <div className="kpc-text">
          <div className="kpc-name">${name}</div>
          ${available
            ? html`<div className="kpc-sub">${isOn ? 'On' : 'Off'}</div>`
            : html`<div className="kpc-unavailable">Unavailable</div>`}
        </div>
      </div>

      ${available && html`
        <div className="kpc-cordzone"
          role="button" tabIndex=${0} aria-label=${isOn ? 'Turn off' : 'Turn on'}
          onKeyDown=${(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}>
          <div className="kpc-mount" />
          <${motion.div} className="kpc-cord" style=${{ height: cordHeight }} />
          <${motion.div} className="kpc-handle"
            drag="y" dragConstraints=${{ top: 0, bottom: PULL_MAX }} dragElastic=${0.12}
            dragSnapToOrigin=${true} style=${{ y }}
            onDragStart=${() => setTugging(true)} onDragEnd=${onDragEnd}
            onClick=${toggle}
            whileTap=${{ scale: 0.96 }}
            transition=${{ type: 'spring', stiffness: 700, damping: 30 }} />
          <div className="kpc-hint">${tugging ? 'Release' : 'Pull'}</div>
        </div>`}
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
  getCardSize() { return 2 }
  static getStubConfig() { return { entity: 'light.example' } }
}

if (!customElements.get('kokonut-pull-cord')) {
  customElements.define('kokonut-pull-cord', KokonutPullCord)
}
window.customCards = window.customCards || []
window.customCards.push({
  type: 'kokonut-pull-cord',
  name: 'Kokonut Pull Cord',
  description: 'Pull-cord lamp toggle — tug the cord to switch a light.',
  preview: true,
})
console.info(`%c KOKONUT-PULL-CORD %c v${VERSION} `,
  'background:#1b2030;color:#ffc58f;border-radius:4px 0 0 4px;padding:2px 4px',
  'background:#ffc58f;color:#1b2030;border-radius:0 4px 4px 0;padding:2px 4px')
