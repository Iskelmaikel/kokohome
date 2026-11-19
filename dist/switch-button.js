/**
 * Kokonut Switch Button → Lovelace.
 * The sun/moon theme switch, driven by any on/off entity (a night-mode
 * input_boolean, a light, a switch). Off = sun, on = moon: the rays retract one
 * after another, the disc swells and a shadow bites it into a crescent.
 *
 *   type: custom:kokonut-switch-button
 *   entity: input_boolean.night_mode
 *   name: Night mode            # shown beside the button (card mode)
 *   off_label: Day              # button labels
 *   on_label: Night
 *   size: sm | default | lg
 *   show_label: true
 *   invert: false               # true: on = sun, off = moon
 */
import { KokoCard, register, escapeHtml, friendlyName, formatState, toggleEntity, haptic, reducedMotion, isUnavailable } from './core.js'

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'
const EASE_IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)'
const RAYS = [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
  const rad = (deg * Math.PI) / 180
  const at = (r) => [+(12 + r * Math.cos(rad)).toFixed(2), +(12 + r * Math.sin(rad)).toFixed(2)]
  return { from: at(7.5), to: at(10) }
})
const SIZES = { sm: [32, 14, 13, 10], default: [36, 16, 14, 12], lg: [40, 18, 15, 14] }
let uid = 0

class SwitchButton extends KokoCard {
  static tag = 'kokonut-switch-button'
  static cardName = 'Kokonut Switch Button'
  static description = 'Sun-to-moon morphing switch for night mode, lights or any on/off entity.'
  static defaults() { return { size: 'default', show_label: true, on_label: 'Night', off_label: 'Day' } }
  static getStubConfig(hass) {
    const e = Object.keys(hass.states).find((x) => x.startsWith('input_boolean.')) || Object.keys(hass.states).find((x) => x.startsWith('light.'))
    return { entity: e || 'input_boolean.night_mode' }
  }
  validate(c) { if (!c.entity) throw new Error('kokonut-switch-button: "entity" is required') }

  css() {
    const [h, ic, fs, px] = SIZES[this.config.size] || SIZES.default
    return `
.k-card { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 12px 12px 16px; }
:host([plain]) .k-card { padding: 0; display: inline-flex; }
.meta { min-width: 0; display: grid; gap: 2px; }
:host([plain]) .meta { display: none; }
@container koko (max-width: 300px) { .meta { display: none; } .k-card { justify-content: center; padding: 12px; } }
button.sw {
  position: relative; display: inline-flex; flex: none; align-items: center; justify-content: center; gap: 8px;
  height: ${h}px; padding: 0 ${px}px; font-size: ${fs}px; font-weight: 500; border-radius: 8px; cursor: pointer;
  border: 1px solid #e4e4e7; background: #fff; color: #18181b; box-shadow: 0 1px 2px rgb(0 0 0/.05);
  transition: background-color .15s ease-out, border-color .15s ease-out; user-select: none; outline: none;
}
button.sw:hover { border-color: #d4d4d8; background: #fafafa; }
button.sw:active { background: #f4f4f5; }
:host([dark]) button.sw { border-color: #27272a; background: #18181b; color: #f4f4f5; }
:host([dark]) button.sw:hover { border-color: #3f3f46; background: #27272ab3; }
:host([dark]) button.sw:active { background: #27272a; }
button.sw:focus-visible { box-shadow: 0 0 0 2px var(--k-bg), 0 0 0 4px #a1a1aa; }
button.sw.square { width: ${h}px; padding: 0; }
button.sw:disabled { opacity: .5; pointer-events: none; }
svg.icon { width: ${ic}px; height: ${ic}px; overflow: visible; pointer-events: none; flex: none; }
[data-part] { transform-box: view-box; }
.disc, .ray { transform-origin: 12px 12px; }
.bite { transform: translate(10px, -10px); }
.disc { transform: scale(1); }
.ray { transform: scale(1); opacity: 1; }
:host([moon]) .bite { transform: translate(0, 0); }
:host([moon]) .disc { transform: scale(1.8); }
:host([moon]) .ray { transform: scale(.5); opacity: 0; }
.labels { display: grid; line-height: 1; }
.labels > span { grid-area: 1/1; white-space: nowrap; }
.l-off { opacity: 1; filter: none; } .l-on { opacity: 0; filter: blur(3px); }
:host([moon]) .l-off { opacity: 0; filter: blur(3px); } :host([moon]) .l-on { opacity: 1; filter: none; }
`
  }

  render() {
    const id = `kmoon-${++uid}`
    const showLabel = this.config.show_label !== false
    return `<div class="k-card">
      <div class="meta"><div class="k-title"></div><div class="k-sub"></div></div>
      <button class="sw${showLabel ? '' : ' square'}" type="button">
        <svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <mask id="${id}"><rect fill="white" x="-4" y="-4" width="32" height="32"/><circle class="bite" data-part="bite" cx="17" cy="7" r="7.5" fill="black"/></mask>
          <g mask="url(#${id})"><circle class="disc" data-part="disc" cx="12" cy="12" r="4.75" fill="currentColor"/></g>
          <g stroke="currentColor" stroke-linecap="round" stroke-width="2">
            ${RAYS.map((r, i) => `<line class="ray" data-part="ray" data-index="${i}" x1="${r.from[0]}" y1="${r.from[1]}" x2="${r.to[0]}" y2="${r.to[1]}"/>`).join('')}
          </g>
        </svg>
        ${showLabel ? `<span class="labels" aria-hidden="true"><span class="l-off" data-part="label">${escapeHtml(this.config.off_label)}</span><span class="l-on" data-part="label">${escapeHtml(this.config.on_label)}</span></span>` : ''}
      </button>
    </div>`
  }

  build() {
    this.btn = this.$('button.sw')
    this.parts = this.$$('[data-part]')
    this.btn.addEventListener('click', () => {
      if (!this.hass) return
      haptic('light')
      // Morph immediately (optimistic); HA's state update confirms it.
      this.setMoon(!this.moon, true)
      this._pending = Date.now()
      toggleEntity(this.hass, this.config.entity)
    })
  }

  timing(el, toMoon) {
    const part = el.dataset.part, i = Number(el.dataset.index || 0)
    if (part === 'ray') return [toMoon ? i * 18 : 140 + i * 22, 260, EASE_OUT]
    if (part === 'bite') return [toMoon ? 60 : 0, 380, EASE_IN_OUT]
    if (part === 'disc') return [toMoon ? 40 : 0, 380, EASE_OUT]
    return [0, 240, EASE_OUT]
  }

  setMoon(moon, animate) {
    if (moon === this.moon) return
    const first = this.moon === undefined
    this.moon = moon
    for (const el of this.parts) {
      if (!animate || first || reducedMotion()) { el.style.transition = 'none'; continue }
      const [delay, dur, easing] = this.timing(el, moon)
      el.style.transition = `transform ${dur}ms ${easing} ${delay}ms, opacity ${dur}ms ${easing} ${delay}ms, filter ${dur}ms ${easing} ${delay}ms`
    }
    this.toggleAttribute('moon', moon)
    this.btn.setAttribute('aria-pressed', String(moon))
  }

  update() {
    const s = this.stateObj
    this.$('.k-title').textContent = this.config.name || friendlyName(s, this.config.entity)
    this.$('.k-sub').textContent = s ? formatState(this.hass, s) : 'Not found'
    this.btn.disabled = isUnavailable(s)
    this.btn.setAttribute('aria-label', this.config.name || friendlyName(s, this.config.entity))
    const on = !!s && ['on', 'open', 'unlocked', 'home', 'playing'].includes(s.state)
    const moon = this.config.invert ? !on : on
    // Ignore a stale state for a moment after an optimistic flip.
    if (this._pending && Date.now() - this._pending < 1500 && moon !== this.moon) return
    this._pending = 0
    this.setMoon(moon, true)
  }

  getCardSize() { return 1 }
  getGridOptions() { return { columns: 6, rows: 1, min_columns: 4 } }
}

register(SwitchButton)
