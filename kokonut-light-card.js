/**
 * Kokonut Light Card — an animated Lovelace light control card.
 * No build step: dependencies are imported from a pinned ESM CDN at load time.
 * Host this single file on GitHub and serve it via jsDelivr (or HACS), then
 * register it as a Lovelace `module` resource.
 *
 * Resource URL example:
 *   https://cdn.jsdelivr.net/gh/<user>/<repo>@v0.1.0/kokonut-light-card.js
 */
import React from 'https://esm.sh/react@18.3.1'
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client?deps=react@18.3.1'
import { motion } from 'https://esm.sh/motion@11.11.17/react?deps=react@18.3.1'
import htm from 'https://esm.sh/htm@3.1.1'

const VERSION = '0.1.0'
const { useState, useEffect } = React
const html = htm.bind(React.createElement)

const CSS = `
:host { display: block; }
.klc-card {
  position: relative; overflow: hidden; border-radius: 24px; padding: 18px 18px 20px;
  color: #f5f7fb; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background:
    radial-gradient(120% 120% at 15% 0%, rgba(255,255,255,0.08), rgba(255,255,255,0) 45%),
    linear-gradient(160deg, #1b2030 0%, #12151f 100%);
  box-shadow: 0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06);
  isolation: isolate; -webkit-tap-highlight-color: transparent;
}
.klc-glow { position: absolute; inset: -40% -20% auto -20%; height: 80%; z-index: 0; filter: blur(42px); pointer-events: none; }
.klc-content { position: relative; z-index: 1; }
.klc-top { display: flex; align-items: center; gap: 14px; }
.klc-iconbtn {
  flex: 0 0 auto; width: 54px; height: 54px; border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06);
  backdrop-filter: blur(6px); display: grid; place-items: center; cursor: pointer;
  padding: 0; color: inherit;
}
.klc-iconbtn svg { width: 26px; height: 26px; display: block; }
.klc-titles { min-width: 0; flex: 1 1 auto; }
.klc-name { font-size: 16px; font-weight: 600; letter-spacing: .2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.klc-sub { margin-top: 2px; font-size: 13px; color: rgba(245,247,251,0.6); white-space: nowrap; }
.klc-pct { flex: 0 0 auto; font-variant-numeric: tabular-nums; font-size: 22px; font-weight: 650; opacity: .95; }
.klc-sliderwrap { margin-top: 18px; }
.klc-sliderlabel { display: flex; justify-content: space-between; font-size: 11px; letter-spacing: .6px; text-transform: uppercase; color: rgba(245,247,251,0.45); margin-bottom: 7px; }
.klc-range {
  -webkit-appearance: none; appearance: none; width: 100%; height: 34px; border-radius: 12px;
  background: rgba(255,255,255,0.08); outline: none; cursor: pointer; overflow: hidden;
}
.klc-range::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; width: 6px; height: 34px; border-radius: 3px;
  background: rgba(255,255,255,0.9); box-shadow: -2000px 0 0 2000px var(--klc-fill, rgba(255,255,255,0.35)); border: none;
}
.klc-range::-moz-range-thumb { width: 6px; height: 34px; border: none; border-radius: 3px; background: rgba(255,255,255,0.9); }
.klc-range::-moz-range-progress { height: 34px; background: var(--klc-fill, rgba(255,255,255,0.35)); }
.klc-range:disabled { opacity: .5; cursor: default; }
.klc-ct .klc-range { background: linear-gradient(90deg, #ffb46b 0%, #fff6e8 50%, #bcd6ff 100%); }
.klc-ct .klc-range::-webkit-slider-thumb { box-shadow: none; }
.klc-unavailable { display: flex; align-items: center; gap: 10px; color: rgba(245,247,251,0.6); font-size: 14px; }
.klc-dot { width: 9px; height: 9px; border-radius: 50%; background: #8b93a7; }
`

const COLOR_MODES_WITH_BRIGHTNESS = ['brightness', 'color_temp', 'hs', 'xy', 'rgb', 'rgbw', 'rgbww', 'white']

function BulbIcon() {
  return html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-4 10.5c.5.5 1 1.2 1 2V16h6v-.5c0-.8.5-1.5 1-2A6 6 0 0 0 12 3Z" />
    </svg>`
}

function LightCard({ hass, config }) {
  const entityId = config.entity
  const stateObj = hass && hass.states ? hass.states[entityId] : undefined
  const attrs = (stateObj && stateObj.attributes) || {}

  const available = !!stateObj && stateObj.state !== 'unavailable' && stateObj.state !== 'unknown'
  const isOn = !!stateObj && stateObj.state === 'on'

  const brightnessPct = attrs.brightness != null
    ? Math.round((attrs.brightness / 255) * 100)
    : (isOn ? 100 : 0)

  const modes = attrs.supported_color_modes || []
  const supportsBrightness = attrs.brightness != null || modes.some((m) => COLOR_MODES_WITH_BRIGHTNESS.includes(m))
  const supportsColorTemp = modes.includes('color_temp')
  const minK = attrs.min_color_temp_kelvin || 2200
  const maxK = attrs.max_color_temp_kelvin || 6500
  const curK = attrs.color_temp_kelvin || Math.round((minK + maxK) / 2)

  const name = config.name || attrs.friendly_name || entityId
  const rgb = attrs.rgb_color
  const accent = !isOn
    ? 'rgb(120,130,150)'
    : rgb ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : 'rgb(255,197,143)'

  const [localB, setLocalB] = useState(brightnessPct)
  useEffect(() => { setLocalB(brightnessPct) }, [brightnessPct])

  const call = (service, data) =>
    hass && hass.callService && hass.callService('light', service, { entity_id: entityId, ...data })
  const toggle = () => call(isOn ? 'turn_off' : 'turn_on', {})
  const onBrightness = (v) => { setLocalB(v); if (v <= 0) call('turn_off', {}); else call('turn_on', { brightness_pct: v }) }
  const onKelvin = (v) => call('turn_on', { color_temp_kelvin: v })

  if (!available) {
    return html`
      <div className="klc-card"><div className="klc-content">
        <div className="klc-top">
          <div className="klc-iconbtn" style=${{ opacity: 0.5 }}><${BulbIcon} /></div>
          <div className="klc-titles">
            <div className="klc-name">${name}</div>
            <div className="klc-unavailable"><span className="klc-dot" />Unavailable</div>
          </div>
        </div>
      </div></div>`
  }

  const glowOpacity = isOn ? 0.25 + (localB / 100) * 0.6 : 0

  return html`
    <div className="klc-card">
      <${motion.div} className="klc-glow"
        animate=${{ opacity: glowOpacity, background: `radial-gradient(60% 100% at 50% 0%, ${accent}, rgba(0,0,0,0) 70%)` }}
        transition=${{ duration: 0.5, ease: 'easeOut' }} />
      <div className="klc-content">
        <div className="klc-top">
          <${motion.button} className="klc-iconbtn" onClick=${toggle} whileTap=${{ scale: 0.9 }}
            animate=${{ color: isOn ? accent : 'rgba(245,247,251,0.75)', boxShadow: isOn ? `0 0 22px -4px ${accent}` : '0 0 0px rgba(0,0,0,0)' }}
            transition=${{ duration: 0.35 }} aria-label=${isOn ? 'Turn off' : 'Turn on'}>
            <${BulbIcon} />
          <//>
          <div className="klc-titles">
            <div className="klc-name">${name}</div>
            <div className="klc-sub">${isOn ? (supportsBrightness ? `On · ${localB}%` : 'On') : 'Off'}</div>
          </div>
          ${supportsBrightness && isOn && html`
            <${motion.div} className="klc-pct" key=${localB}
              initial=${{ opacity: 0.4, y: -3 }} animate=${{ opacity: 1, y: 0 }} transition=${{ duration: 0.2 }}>
              ${localB}%
            <//>`}
        </div>
        ${supportsBrightness && html`
          <div className="klc-sliderwrap">
            <div className="klc-sliderlabel"><span>Brightness</span></div>
            <input className="klc-range" type="range" min="0" max="100" value=${localB}
              style=${{ '--klc-fill': accent }} onChange=${(e) => onBrightness(Number(e.target.value))} />
          </div>`}
        ${supportsColorTemp && isOn && html`
          <div className="klc-sliderwrap klc-ct">
            <div className="klc-sliderlabel"><span>Warm</span><span>Cool</span></div>
            <input className="klc-range" type="range" min=${minK} max=${maxK} step="50"
              defaultValue=${curK} onChange=${(e) => onKelvin(Number(e.target.value))} />
          </div>`}
      </div>
    </div>`
}

class KokonutLightCard extends HTMLElement {
  setConfig(config) {
    if (!config || !config.entity) throw new Error('kokonut-light-card: you must define an "entity"')
    if (config.entity.split('.')[0] !== 'light') throw new Error('kokonut-light-card: "entity" must be a light.* entity')
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
    this._root.render(html`<${LightCard} hass=${this._hass} config=${this._config} />`)
  }
  getCardSize() { return 3 }
  static getStubConfig() { return { entity: 'light.example' } }
}

if (!customElements.get('kokonut-light-card')) {
  customElements.define('kokonut-light-card', KokonutLightCard)
}
window.customCards = window.customCards || []
window.customCards.push({
  type: 'kokonut-light-card',
  name: 'Kokonut Light Card',
  description: 'An animated light control card (brightness + colour temperature).',
  preview: true,
})
console.info(`%c KOKONUT-LIGHT-CARD %c v${VERSION} `,
  'background:#1b2030;color:#ffc58f;border-radius:4px 0 0 4px;padding:2px 4px',
  'background:#ffc58f;color:#1b2030;border-radius:0 4px 4px 0;padding:2px 4px')
