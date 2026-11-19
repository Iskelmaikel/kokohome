/**
 * Kokonut Hold Button → Lovelace.
 * Press and hold to confirm. The fill tracks the hold, drains back at a speed
 * matching how far it got when released early, and on completion the button
 * turns solid and the label rolls to a drawn check.
 *
 *   type: custom:kokonut-hold-button
 *   entity: script.all_off          # optional; default action toggles/runs it
 *   name: Hold to turn all off      # idle label
 *   holding_label: Keep holding
 *   complete_label: All off
 *   icon: mdi:power
 *   variant: red | green | blue | orange | grey
 *   hold_duration: 1200             # ms
 *   reset_after: 1800               # ms, 0 keeps the complete state
 *   hold_action: { action: perform-action, perform_action: script.turn_on, target: {...} }
 */
import { KokoCard, register, MotionValue, rollSwap, icon, escapeHtml, friendlyName, haptic, ease, reducedMotion, isUnavailable } from './core.js'

const DEFAULTS = {
  red: { icon: 'mdi:delete', verb: 'Hold to run', done: 'Done' },
  green: { icon: 'mdi:check-circle-outline', verb: 'Hold to run', done: 'Done' },
  blue: { icon: 'mdi:send', verb: 'Hold to run', done: 'Done' },
  orange: { icon: 'mdi:logout', verb: 'Hold to run', done: 'Done' },
  grey: { icon: 'mdi:cancel', verb: 'Hold to run', done: 'Done' },
}
const DRAIN_MS = 300
const LABEL_DELAY_MS = 150
const CHECK = `<svg aria-hidden="true" width="16" height="16" fill="none" viewBox="0 0 16 16"><path class="draw" d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" pathLength="1"/></svg>`

class HoldButton extends KokoCard {
  static tag = 'kokonut-hold-button'
  static cardName = 'Kokonut Hold Button'
  static description = 'Press and hold to run a script, scene or any action.'
  static defaults() { return { variant: 'red', hold_duration: 1200, reset_after: 1800, holding_label: 'Keep holding' } }
  static getStubConfig(hass) {
    const s = Object.keys(hass.states).find((e) => e.startsWith('script.'))
    return { entity: s || 'script.example', variant: 'red' }
  }

  css() {
    return `
.k-card { padding: 12px; }
:host([plain]) .k-card { padding: 0; }
button.hold {
  position: relative; display: flex; width: 100%; height: var(--hold-h, 44px); align-items: center; justify-content: center;
  overflow: hidden; border-radius: 10px; padding: 0 16px; font-weight: 500; font-size: 14px;
  border: 1px solid var(--b); background: var(--bg); color: var(--fg); cursor: pointer;
  touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
  transition: background-color .15s ease-out, border-color .15s ease-out, color .15s ease-out;
}
button.hold:hover { background: var(--bg-h); }
button.hold:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--k-bg), 0 0 0 4px color-mix(in srgb, var(--fg) 40%, transparent); }
button.hold[data-complete] { background: var(--solid); border-color: var(--solid); color: var(--on-solid); }
button.hold:disabled { opacity: .5; pointer-events: none; }
.fill { position: absolute; inset: 0; pointer-events: none; background: currentColor; opacity: .15; clip-path: inset(0 100% 0 0); transition: opacity .15s; }
:host([dark]) .fill { opacity: .2; }
button.hold[data-complete] .fill { opacity: 0; }
.label { position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden; height: 20px; min-width: 0; max-width: 100%; }
.label .roll { max-width: 100%; min-width: 0; }
.label .roll > span { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
@container koko (max-width: 220px) { button.hold { padding: 0 10px; font-size: 13px; } }
.draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw .3s .1s cubic-bezier(.23,1,.32,1) forwards; }
@keyframes draw { to { stroke-dashoffset: 0; } }
@media (prefers-reduced-motion: reduce) { .draw { animation: none; stroke-dashoffset: 0; } }

:host { --b: #fecaca; --bg: #fef2f2; --bg-h: #fee2e2b3; --fg: #b91c1c; --solid: #dc2626; --on-solid: #fff; }
:host([dark]) { --b: #ef444440; --bg: #ef44441a; --bg-h: #ef444426; --fg: #fca5a5; --solid: #ef4444; --on-solid: #fff; }
:host([variant=green]) { --b: #a7f3d0; --bg: #ecfdf5; --bg-h: #d1fae5b3; --fg: #047857; --solid: #059669; }
:host([variant=green][dark]) { --b: #10b98140; --bg: #10b9811a; --bg-h: #10b98126; --fg: #6ee7b7; --solid: #10b981; }
:host([variant=blue]) { --b: #bfdbfe; --bg: #eff6ff; --bg-h: #dbeafeb3; --fg: #1d4ed8; --solid: #2563eb; }
:host([variant=blue][dark]) { --b: #3b82f640; --bg: #3b82f61a; --bg-h: #3b82f626; --fg: #93c5fd; --solid: #3b82f6; }
:host([variant=orange]) { --b: #fed7aa; --bg: #fff7ed; --bg-h: #ffedd5b3; --fg: #c2410c; --solid: #ea580c; }
:host([variant=orange][dark]) { --b: #f9731640; --bg: #f973161a; --bg-h: #f9731626; --fg: #fdba74; --solid: #f97316; }
:host([variant=grey]) { --b: #e4e4e7; --bg: #fafafa; --bg-h: #f4f4f5b3; --fg: #3f3f46; --solid: #18181b; --on-solid: #fff; }
:host([variant=grey][dark]) { --b: #ffffff1a; --bg: #ffffff0d; --bg-h: #ffffff14; --fg: #d4d4d8; --solid: #f4f4f5; --on-solid: #18181b; }
`
  }

  render() {
    return `<div class="k-card"><button class="hold" type="button"><span class="fill"></span><span class="label"></span></button><span class="sr" aria-live="polite"></span></div>`
  }

  build() {
    this.setAttribute('variant', this.config.variant)
    if (this.config.height) this.style.setProperty('--hold-h', `${this.config.height}px`)
    this.btn = this.$('button.hold')
    this.fillEl = this.$('.fill')
    this.labelEl = this.$('.label')
    this.live = this.$('.sr')
    this.phase = 'idle'
    this.showHolding = false
    this.progress = new MotionValue(0)
    this.progress.on((p) => { this.fillEl.style.clipPath = `inset(0 ${(1 - p) * 100}% 0 0)` })
    this._renderLabel()

    const b = this.btn
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      // Touch pointers are captured implicitly; release so pointerleave cancels.
      if (b.hasPointerCapture(e.pointerId)) b.releasePointerCapture(e.pointerId)
      this.startHold()
    })
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) b.addEventListener(ev, () => this.endHold())
    b.addEventListener('contextmenu', (e) => e.preventDefault())
    b.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) this.startHold() }
    })
    b.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') this.endHold() })
  }

  get defaultsFor() { return DEFAULTS[this.config.variant] || DEFAULTS.red }
  idleLabel() {
    if (this.config.name) return this.config.name
    const s = this.stateObj
    return s ? `Hold to ${s.entity_id.startsWith('script.') || s.entity_id.startsWith('scene.') ? 'run' : 'toggle'} ${friendlyName(s)}` : 'Hold to confirm'
  }
  iconName() { return this.config.icon || (this.stateObj && this.stateObj.attributes.icon) || this.defaultsFor.icon }

  _renderLabel() {
    const key = this.phase === 'holding' && !this.showHolding ? 'idle' : this.phase
    let html
    if (key === 'complete') html = `${CHECK}<span>${escapeHtml(this.config.complete_label || this.defaultsFor.done)}</span>`
    else if (key === 'holding') html = `${icon(this.iconName(), 16)}<span>${escapeHtml(this.config.holding_label)}</span>`
    else html = `${icon(this.iconName(), 16)}<span>${escapeHtml(this.idleLabel())}</span>`
    if (html === this._lastHtml) return
    this._lastHtml = html
    rollSwap(this.labelEl, html, { dy: 10 })
  }

  setPhase(next) {
    this.phase = next
    clearTimeout(this._labelTimer)
    this.btn.toggleAttribute('data-complete', next === 'complete')
    this.btn.toggleAttribute('data-holding', next === 'holding')
    this.btn.setAttribute('aria-disabled', String(next === 'complete'))
    if (next === 'holding') {
      this.showHolding = false
      this._labelTimer = setTimeout(() => { this.showHolding = true; this._renderLabel() }, LABEL_DELAY_MS)
    } else this.showHolding = false
    this._renderLabel()
  }

  startHold() {
    if (this.phase !== 'idle' || this.btn.disabled) return
    this.setPhase('holding')
    haptic('light')
    const remaining = (1 - this.progress.get()) * this.config.hold_duration
    const run = this.progress.tween(1, { duration: remaining / 1000, ease: ease.linear })
    this._holdRun = run
    run.then(() => {
      if (this._holdRun === run && this.phase === 'holding' && this.progress.get() >= 0.999) this.complete()
    })
  }

  endHold() {
    if (this.phase !== 'holding') return
    this._holdRun = null
    this.setPhase('idle')
    // A near miss visibly unwinds; a short tap barely moves.
    this.progress.tween(0, { duration: reducedMotion() ? 0 : (this.progress.get() * DRAIN_MS) / 1000, ease: ease.out })
  }

  complete() {
    this.setPhase('complete')
    haptic('success')
    this.live.textContent = this.config.complete_label || this.defaultsFor.done
    const fallback = this.config.entity ? { action: 'toggle' } : undefined
    Promise.resolve(this.action('hold_action', fallback)).catch((e) => console.error('[kokohome] hold action failed', e))
    if (this.config.reset_after > 0) {
      clearTimeout(this._reset)
      this._reset = setTimeout(() => {
        this.progress.jump(0)
        this.live.textContent = ''
        this.setPhase('idle')
      }, this.config.reset_after)
    }
  }

  update() {
    this.btn.disabled = !!this.config.entity && isUnavailable(this.stateObj)
    if (this.phase === 'idle') this._renderLabel()
  }

  disconnected() { clearTimeout(this._reset); clearTimeout(this._labelTimer); this.progress.stop() }
  getCardSize() { return 1 }
  getGridOptions() { return { columns: 6, rows: 1, min_rows: 1 } }
}

register(HoldButton)
