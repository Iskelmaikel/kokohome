/**
 * Kokonut Bell Button → Lovelace.
 * Two coupled pendulums: the bell swings, catches its clapper with the lip and
 * flings it into the far wall, which flares sound waves. Turning notifications
 * off holds the clapper still (a dull shake) and draws the mute slash.
 *
 *   type: custom:kokonut-bell-button
 *   entity: input_boolean.doorbell_alerts   # on = notifying
 *   ring_entity: binary_sensor.doorbell     # rings whenever this turns on
 *   count_entity: sensor.unread_notifications  # optional rolling count
 *   label: Notify me
 *   subscribed_label: Notifying
 *   variant: default | compact | icon
 *   name: Doorbell alerts                   # shown beside the button (card mode)
 */
import { KokoCard, register, escapeHtml, friendlyName, formatState, toggleEntity, haptic, reducedMotion, isUnavailable } from './core.js'

const STEP = 1 / 240
const BELL_STIFFNESS = 380, BELL_DAMPING = 5, CLAPPER_STIFFNESS = 150, CLAPPER_DAMPING = 4
const LIP = 13, RESTITUTION = 0.45, RECOIL = 0.18, STRIKE_SPEED = 260
const RING_KICK = 600, NUDGE_KICK = 160, MUTE_KICK = 300, REST = 0.05
const PIVOT = { x: 12, y: 2.5 }
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'

class BellButton extends KokoCard {
  static tag = 'kokonut-bell-button'
  static cardName = 'Kokonut Bell Button'
  static description = 'Notification toggle with a physically swinging bell that rings when your doorbell fires.'
  static defaults() { return { variant: 'default', label: 'Notify me', subscribed_label: 'Notifying' } }
  static getStubConfig(hass) {
    const e = Object.keys(hass.states).find((x) => x.startsWith('input_boolean.') || x.startsWith('automation.'))
    return { entity: e || 'input_boolean.doorbell_alerts' }
  }
  watched() { return [this.config.entity, this.config.ring_entity, this.config.count_entity].filter(Boolean) }

  css() {
    return `
.k-card { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 12px 12px 16px; }
:host([plain]) .k-card { padding: 0; display: inline-flex; }
.meta { min-width: 0; display: grid; gap: 2px; }
:host([plain]) .meta { display: none; }
@container koko (max-width: 300px) { .meta { display: none; } .k-card { justify-content: center; padding: 12px; } }
button.bell {
  display: inline-flex; flex: none; height: 44px; align-items: center; gap: 10px; border-radius: 999px; font-weight: 500; font-size: 14px;
  border: 1px solid #e4e4e7; background: #fff; color: #18181b; cursor: pointer; outline: none; user-select: none;
  transition: background-color .2s ease-out, border-color .2s ease-out, color .2s ease-out; padding: 0 16px;
}
button.bell:hover { background: #fafafa; } button.bell:active { background: #f4f4f5; }
:host([dark]) button.bell { border-color: #27272a; background: #09090b; color: #f4f4f5; }
:host([dark]) button.bell:hover { background: #18181b; } :host([dark]) button.bell:active { background: #27272a; }
button.bell[aria-pressed=true] { border-color: #18181b; background: #18181b; color: #fff; }
button.bell[aria-pressed=true]:hover { background: #27272a; }
:host([dark]) button.bell[aria-pressed=true] { border-color: #f4f4f5; background: #f4f4f5; color: #18181b; }
:host([dark]) button.bell[aria-pressed=true]:hover { background: #e4e4e7; }
button.bell:focus-visible { box-shadow: 0 0 0 2px var(--k-bg), 0 0 0 4px #a1a1aa; }
button.bell:disabled { opacity: .5; pointer-events: none; }
button.bell.v-default { padding: 0 6px 0 16px; }
button.bell.v-icon { width: 44px; padding: 0; justify-content: center; }
svg.b { width: 20px; height: 20px; overflow: visible; flex: none; }
.wave { opacity: 0; }
.body { fill: transparent; transition: fill .2s ease-out; }
button.bell[aria-pressed=true] .body { fill: currentColor; }
.slash { stroke-dasharray: 26; stroke-dashoffset: 0; transition: stroke-dashoffset .3s ${EASE_OUT}; }
button.bell[aria-pressed=true] .slash { stroke-dashoffset: 26; }
.labels { position: relative; display: grid; }
.labels > span { grid-area: 1/1; white-space: nowrap; transition: opacity .2s ease-out, filter .2s ease-out; }
.l-on { opacity: 0; filter: blur(2px); }
button.bell[aria-pressed=true] .l-on { opacity: 1; filter: none; }
button.bell[aria-pressed=true] .l-off { opacity: 0; filter: blur(2px); }
.count { border-radius: 999px; padding: 4px 10px; font-size: 12px; background: #f4f4f5; color: #71717a; transition: background-color .2s ease-out, color .2s ease-out; display: inline-flex; font-variant-numeric: tabular-nums; }
:host([dark]) .count { background: #18181b; color: #a1a1aa; }
button.bell[aria-pressed=true] .count { background: rgb(255 255 255/.15); color: rgb(255 255 255/.8); }
:host([dark]) button.bell[aria-pressed=true] .count { background: rgb(24 24 27/.1); color: rgb(24 24 27/.7); }
.digit { position: relative; display: inline-block; height: 20px; overflow: hidden; }
.digit > span { display: flex; flex-direction: column; transition: transform .3s ${EASE_OUT}; }
.digit > span > span { height: 20px; line-height: 20px; }
@media (prefers-reduced-motion: reduce) { .digit > span, .slash { transition: none; } }
@container koko (max-width: 210px) { .count { display: none; } button.bell.v-default { padding: 0 16px; } }
`
  }

  render() {
    const v = this.config.variant
    return `<div class="k-card">
      <div class="meta"><div class="k-title"></div><div class="k-sub"></div></div>
      <button class="bell v-${v}" type="button" aria-pressed="false">
        <svg class="b" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" aria-hidden="true">
          <path class="wave r" d="M21.5 4.5c1.2 1.6 1.8 3.4 1.8 5.5"/>
          <path class="wave l" d="M2.5 4.5C1.3 6.1.7 7.9.7 10"/>
          <path class="clapper" d="M10.27 21a2 2 0 0 0 3.46 0"/>
          <g class="bellg">
            <path class="body" d="M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.41 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33"/>
            <path class="slash" d="M3 3l18 18"/>
          </g>
        </svg>
        ${v === 'icon' ? '' : `<span class="labels" aria-hidden="true"><span class="l-off">${escapeHtml(this.config.label)}</span><span class="l-on">${escapeHtml(this.config.subscribed_label)}</span></span>`}
        ${v === 'default' ? '<span class="count" aria-hidden="true" hidden></span>' : ''}
      </button>
    </div>`
  }

  build() {
    this.btn = this.$('button.bell')
    this.bellEl = this.$('.bellg'); this.clapperEl = this.$('.clapper')
    this.waveR = this.$('.wave.r'); this.waveL = this.$('.wave.l'); this.countEl = this.$('.count')
    this.sim = { bell: 0, bellSpeed: 0, clapper: 0, clapperSpeed: 0, muffled: true, raf: 0, last: 0, carry: 0, lastNudge: 0 }
    this.btn.addEventListener('click', () => {
      if (!this.hass) return
      const next = !this.subscribed
      this.applySubscribed(next, true)
      this._pending = Date.now()
      toggleEntity(this.hass, this.config.entity)
    })
    this.btn.addEventListener('pointerenter', (e) => {
      // A brush past the bell sets it swaying a little. Mouse only.
      const s = this.sim
      if (e.pointerType !== 'mouse' || s.muffled || e.timeStamp - s.lastNudge < 700) return
      s.lastNudge = e.timeStamp
      this.kick(s.bellSpeed >= 0 ? NUDGE_KICK : -NUDGE_KICK)
    })
  }

  draw() {
    const s = this.sim
    this.bellEl.setAttribute('transform', `rotate(${s.bell.toFixed(2)} ${PIVOT.x} ${PIVOT.y})`)
    this.clapperEl.setAttribute('transform', `rotate(${s.clapper.toFixed(2)} ${PIVOT.x} ${PIVOT.y})`)
  }

  flare(side, strength) {
    const wave = side > 0 ? this.waveR : this.waveL
    if (!wave.animate) return
    const peak = Math.min(1, 0.45 + strength * 0.55)
    wave.animate([{ opacity: peak, transform: 'translateX(0px)' }, { opacity: 0, transform: `translateX(${side * 3}px)` }], { duration: 420, easing: EASE_OUT })
  }

  step() {
    const s = this.sim
    s.bellSpeed += (-s.bell * BELL_STIFFNESS - s.bellSpeed * BELL_DAMPING) * STEP
    s.bell += s.bellSpeed * STEP
    if (s.muffled) { s.clapper = s.bell; s.clapperSpeed = s.bellSpeed; return }
    s.clapperSpeed += (-s.clapper * CLAPPER_STIFFNESS - s.clapperSpeed * CLAPPER_DAMPING) * STEP
    s.clapper += s.clapperSpeed * STEP
    const rel = s.clapper - s.bell
    if (Math.abs(rel) <= LIP) return
    const side = rel > 0 ? 1 : -1
    const impact = (s.clapperSpeed - s.bellSpeed) * side
    s.clapper = s.bell + side * LIP
    if (impact <= 0) return
    s.clapperSpeed -= side * impact * (1 + RESTITUTION)
    s.bellSpeed += side * impact * RECOIL
    if (impact > STRIKE_SPEED) { this.flare(side, impact / 1600); if (navigator.vibrate) { try { navigator.vibrate(6) } catch (_) { /* noop */ } } }
  }

  tick = (now) => {
    const s = this.sim
    s.raf = 0
    const elapsed = s.last ? Math.min((now - s.last) / 1000, 0.05) : STEP
    s.last = now
    s.carry += elapsed
    while (s.carry >= STEP) { this.step(); s.carry -= STEP }
    this.draw()
    const energy = Math.abs(s.bell) + Math.abs(s.bellSpeed) * 0.02 + Math.abs(s.clapper) + Math.abs(s.clapperSpeed) * 0.02
    if (energy < REST) { Object.assign(s, { bell: 0, bellSpeed: 0, clapper: 0, clapperSpeed: 0, last: 0 }); this.draw(); return }
    s.raf = requestAnimationFrame(this.tick)
  }

  kick(speed) {
    if (reducedMotion()) return
    this.sim.bellSpeed += speed
    if (!this.sim.raf) this.sim.raf = requestAnimationFrame(this.tick)
  }

  ring() {
    const s = this.sim
    if (s.muffled) { this.kick(-MUTE_KICK); return }
    // Swing away from the clapper so the first hit rings.
    this.kick(s.bellSpeed >= 0 ? RING_KICK : -RING_KICK)
    if (reducedMotion()) { this.flare(1, 0.6); this.flare(-1, 0.6) }
  }

  applySubscribed(on, animate) {
    if (on === this.subscribed) return
    const first = this.subscribed === undefined
    this.subscribed = on
    this.btn.setAttribute('aria-pressed', String(on))
    this.sim.muffled = !on
    if (!animate || first) return
    if (on) { this.ring(); haptic('light') } else this.kick(-MUTE_KICK)
  }

  renderCount(value) {
    if (!this.countEl) return
    if (value == null || Number.isNaN(value)) { this.countEl.hidden = true; return }
    this.countEl.hidden = false
    const text = Math.round(value).toLocaleString('en-US')
    // Keyed from the right, so the ones stay the ones when a digit is added.
    const cells = [...this.countEl.children]
    if (cells.length !== text.length) {
      this.countEl.innerHTML = text.split('').map((ch) => (ch < '0' || ch > '9')
        ? `<span>${ch}</span>`
        : `<span class="digit"><span style="transform:translateY(0%)">${'0123456789'.split('').map((d) => `<span>${d}</span>`).join('')}</span></span>`).join('')
    }
    const nodes = [...this.countEl.children]
    text.split('').forEach((ch, i) => {
      const inner = nodes[i] && nodes[i].firstElementChild
      if (inner && ch >= '0' && ch <= '9') requestAnimationFrame(() => { inner.style.transform = `translateY(${-Number(ch) * 10}%)` })
    })
  }

  update(old) {
    const s = this.stateObj
    this.$('.k-title').textContent = this.config.name || friendlyName(s, this.config.entity)
    this.$('.k-sub').textContent = this.config.ring_entity && this.hass.states[this.config.ring_entity]
      ? `${friendlyName(this.hass.states[this.config.ring_entity])}: ${formatState(this.hass, this.hass.states[this.config.ring_entity])}`
      : s ? formatState(this.hass, s) : 'Not found'
    this.btn.disabled = isUnavailable(s)
    this.btn.setAttribute('aria-label', this.config.label)
    const on = !!s && s.state === 'on'
    if (!(this._pending && Date.now() - this._pending < 1500 && on !== this.subscribed)) {
      this._pending = 0
      this.applySubscribed(on, true)
    }
    if (this.config.count_entity) {
      const c = this.hass.states[this.config.count_entity]
      this.renderCount(c ? Number(c.state) : null)
    }
    // Ring when the doorbell (or any ring_entity) switches on.
    const r = this.config.ring_entity
    if (r && old && old.states[r] && this.hass.states[r] && old.states[r].state !== 'on' && this.hass.states[r].state === 'on') this.ring()
  }

  disconnected() { cancelAnimationFrame(this.sim.raf); this.sim.raf = 0 }
  getCardSize() { return 1 }
  getGridOptions() { return { columns: 12, rows: 1, min_columns: 6 } }
}

register(BellButton)
