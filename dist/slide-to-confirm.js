/**
 * Kokonut Slide to Confirm → Lovelace.
 * Drag the thumb across to confirm. The ink wipes in behind the thumb, past the
 * end it rubber-bands, a fast flick from halfway commits, and on release the
 * track floods while the action runs, then turns green.
 *
 *   type: custom:kokonut-slide-to-confirm
 *   entity: lock.front_door          # labels adapt to lock/cover/alarm/script
 *   label: Slide to unlock           # optional overrides
 *   confirming_label: Unlocking
 *   done_label: Unlocked
 *   reset_after: 2600                # ms; null keeps it done
 *   confirm_action: { action: perform-action, perform_action: ..., ... }
 */
import { KokoCard, register, MotionValue, rollSwap, lucide, escapeHtml, friendlyName, domainOf, haptic, ease, wait, reducedMotion, isUnavailable, runAction } from './core.js'

const HEIGHT = 56, INSET = 4, THUMB = HEIGHT - INSET * 2
const COMMIT_AT = 0.9, FLICK_SPEED = 900, FLICK_FROM = 0.45, OVERDRAG = 8, TAP_SLOP = 4

function band(raw, max) {
  if (raw > max) return max + OVERDRAG * (1 - Math.exp(-(raw - max) / 40))
  if (raw < 0) return -OVERDRAG * (1 - Math.exp(raw / 40))
  return raw
}

function autoLabels(stateObj) {
  if (!stateObj) return ['Slide to confirm', 'Working', 'Done']
  const d = domainOf(stateObj.entity_id), name = friendlyName(stateObj), s = stateObj.state
  if (d === 'lock') return s === 'locked' ? ['Slide to unlock', 'Unlocking', 'Unlocked'] : ['Slide to lock', 'Locking', 'Locked']
  if (d === 'cover') return s === 'closed' ? [`Slide to open ${name}`, 'Opening', 'Opened'] : [`Slide to close ${name}`, 'Closing', 'Closed']
  if (d === 'alarm_control_panel') return s === 'disarmed' ? ['Slide to arm', 'Arming', 'Armed'] : ['Slide to disarm', 'Disarming', 'Disarmed']
  if (d === 'script' || d === 'scene' || d === 'button') return [`Slide to run ${name}`, 'Running', 'Done']
  return s === 'on' ? [`Slide to turn off ${name}`, 'Turning off', 'Off'] : [`Slide to turn on ${name}`, 'Turning on', 'On']
}

function defaultAction(hass, stateObj) {
  const id = stateObj.entity_id, d = domainOf(id), s = stateObj.state
  if (d === 'alarm_control_panel') return { action: 'perform-action', perform_action: s === 'disarmed' ? 'alarm_control_panel.alarm_arm_away' : 'alarm_control_panel.alarm_disarm', target: { entity_id: id } }
  return { action: 'toggle', entity: id }
}

class SlideToConfirm extends KokoCard {
  static tag = 'kokonut-slide-to-confirm'
  static cardName = 'Kokonut Slide to Confirm'
  static description = 'Slide to lock/unlock, open the garage, or run anything that needs a deliberate gesture.'
  static defaults() { return { reset_after: 2600 } }
  static getStubConfig(hass) {
    const l = Object.keys(hass.states).find((e) => e.startsWith('lock.'))
    return { entity: l || 'lock.front_door' }
  }

  css() {
    return `
.k-card { padding: 12px; }
:host([plain]) .k-card { padding: 0; }
.wrap { position: relative; width: 100%; user-select: none; -webkit-user-select: none; }
.track { position: relative; overflow: hidden; height: ${HEIGHT}px; border-radius: 999px; border: 1px solid #e4e4e7; background: #f4f4f5; }
:host([dark]) .track { border-color: #27272a; background: #18181b; }
.wrap[data-disabled] .track { opacity: .5; }
.label { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; white-space: nowrap; padding-left: 24px; font-weight: 500; font-size: 14px; color: #71717a; }
:host([dark]) .label { color: #a1a1aa; }
.ink { position: absolute; inset: 0; background: #18181b; opacity: 0; transition: background-color .3s ease-out; }
:host([dark]) .ink { background: #f4f4f5; }
.ink[data-done] { background: #059669; }
:host([dark]) .ink[data-done] { background: #10b981; }
.inklabel { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-weight: 500; font-size: 14px; color: #fff; overflow: hidden; }
:host([dark]) .inklabel { color: #18181b; }
:host([dark]) .ink[data-done] .inklabel { color: #022c22; }
.inklabel .roll { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.inklabel.l .roll { padding-left: 24px; } .inklabel.r .roll { padding-right: 24px; }
.label, .inklabel .roll { overflow: hidden; }
/* Narrow: the label lives in the free space right of the thumb. */
@container koko (max-width: 300px) {
  .label, .inklabel.l .roll { padding: 0 12px 0 ${THUMB + INSET * 2}px; font-size: 13px; }
  .inklabel.r .roll { padding: 0 ${THUMB + INSET * 2}px 0 12px; font-size: 13px; }
}
.thumb {
  position: absolute; left: ${INSET - 1}px; top: ${INSET - 1}px; width: ${THUMB}px; height: ${THUMB}px; border-radius: 999px; border: 0;
  display: flex; align-items: center; justify-content: center; touch-action: none; outline: none; padding: 0;
  background: #fff; color: #18181b; box-shadow: 0 1px 2px rgb(0 0 0/.12), 0 0 0 1px rgb(0 0 0/.06); cursor: grab; will-change: transform;
}
:host([dark]) .thumb { background: #27272a; color: #f4f4f5; box-shadow: 0 1px 2px rgb(0 0 0/.5), 0 0 0 1px rgb(255 255 255/.08); }
.wrap[data-phase=dragging] .thumb { cursor: grabbing; }
.thumb:focus-visible { box-shadow: 0 0 0 2px #f4f4f5, 0 0 0 4px #a1a1aa; }
.glyph { position: relative; width: 20px; height: 20px; }
.glyph > * { position: absolute; inset: 0; transition: opacity .2s ease-out, transform .2s ease-out, filter .2s ease-out; }
.arrow[data-armed] { transform: translateX(2px); }
.arrow[data-gone] { transform: translateX(6px); opacity: 0; filter: blur(2px); }
.check { color: #059669; transform: scale(.5); opacity: 0; filter: blur(2px); }
:host([dark]) .check { color: #34d399; }
.check[data-on] { transform: scale(1); opacity: 1; filter: none; }
.spin { inset: -2px; width: 24px; height: 24px; opacity: 0; animation: spin .7s linear infinite paused; }
.spin[data-on] { opacity: 1; animation-play-state: running; transition-delay: .1s; }
.spin .bg { stroke: #e4e4e7; } :host([dark]) .spin .bg { stroke: #3f3f46; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .glyph > *, .ink { transition: none; } }
`
  }

  render() {
    return `<div class="k-card"><div class="wrap" data-phase="idle">
      <div class="track">
        <span class="label" aria-hidden="true"></span>
        <div class="ink" aria-hidden="true"><div class="inklabel l"></div></div>
        <button class="thumb" type="button">
          <span class="glyph">
            ${lucide('arrow-right', { size: 20, cls: 'arrow' })}
            ${lucide('check', { size: 20, stroke: 2.5, cls: 'check' })}
            <svg class="spin" viewBox="0 0 24 24" aria-hidden="true"><circle class="bg" cx="12" cy="12" r="9" fill="none" stroke-width="2.5"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-dasharray="14 43" stroke-linecap="round" stroke-width="2.5"/></svg>
          </span>
        </button>
      </div>
      <span class="sr" aria-live="polite"></span>
    </div></div>`
  }

  build() {
    this.wrap = this.$('.wrap'); this.track = this.$('.track'); this.thumb = this.$('.thumb')
    this.labelEl = this.$('.label'); this.ink = this.$('.ink'); this.inkLabel = this.$('.inklabel')
    this.arrow = this.$('.arrow'); this.checkEl = this.$('.check'); this.spinEl = this.$('.spin'); this.live = this.$('.sr')
    this.phase = 'idle'; this.armed = false; this.run = 0
    this.x = new MotionValue(0); this.width = new MotionValue(0); this.cover = new MotionValue(0)
    this.max = () => Math.max(0, this.width.get() - THUMB - INSET * 2)

    const paint = () => {
      const x = this.x.get(), total = this.width.get(), covered = this.cover.get()
      this.thumb.style.transform = `translateX(${x}px)`
      const right = (1 - covered) * Math.max(0, total - x - INSET - THUMB / 2)
      this.ink.style.clipPath = `inset(0px ${right}px 0px 0px round ${HEIGHT}px)`
      this.ink.style.opacity = String(Math.min(1, Math.max(0, x / 20)))
      const progress = x / Math.max(1, total - THUMB - INSET * 2)
      this.labelEl.style.opacity = String(Math.max(0, 1 - progress * 0.55))
    }
    for (const mv of [this.x, this.width, this.cover]) mv.on(paint)

    this.ro = new ResizeObserver(() => {
      const before = this.width.get()
      this.width.jump(this.track.offsetWidth)
      if (before > 0 && this.x.get() >= before - THUMB - INSET * 2) this.x.jump(this.track.offsetWidth - THUMB - INSET * 2)
    })
    this.ro.observe(this.track)

    const t = this.thumb
    this.drag = { pointer: 0, from: 0, moved: false }
    t.addEventListener('pointerdown', (e) => {
      if (this.disabled || this.phase !== 'idle' || e.button !== 0) return
      t.setPointerCapture(e.pointerId)
      this.x.stop()
      this.drag = { pointer: e.clientX, from: this.x.get(), moved: false }
      this.setPhase('dragging')
    })
    t.addEventListener('pointermove', (e) => {
      if (this.phase !== 'dragging') return
      const delta = e.clientX - this.drag.pointer
      if (Math.abs(delta) > TAP_SLOP) this.drag.moved = true
      const raw = this.drag.from + delta
      this.x.set(band(raw, this.max()))
      const armed = raw >= this.max() * COMMIT_AT
      if (armed !== this.armed) { this.setArmed(armed); if (armed) haptic('light') }
    })
    const up = () => {
      if (this.phase !== 'dragging') return
      if (!this.drag.moved) { this.setPhase('idle'); return }
      const v = this.x.getVelocity(), progress = this.x.get() / Math.max(1, this.max())
      if (progress >= COMMIT_AT || (v > FLICK_SPEED && progress > FLICK_FROM)) this.commit(v)
      else this.settleBack(v)
    }
    t.addEventListener('pointerup', up); t.addEventListener('pointercancel', up)
    t.addEventListener('click', async (e) => {
      if (this.disabled || this.phase !== 'idle') return
      if (e.detail === 0) { this.commit(0, true); return } // keyboard
      if (this.drag.moved || reducedMotion()) return
      // A tap shows which way to go: a short nudge that springs back.
      await this.x.tween(28, { duration: 0.18, ease: ease.out })
      if (this.phase === 'idle') this.x.spring(0, this.springOpts())
    })
    this.renderStage(true)
  }

  springOpts(velocity = 0) { return { stiffness: 520, damping: 42, velocity } }

  labels() {
    const [l, c, d] = autoLabels(this.stateObj)
    return { label: this.config.label || l, confirming: this.config.confirming_label || c, done: this.config.done_label || d }
  }

  setPhase(p) { this.phase = p; this.wrap.dataset.phase = p; this.renderStage() }
  setArmed(a) { this.armed = a; this.renderGlyph() }

  renderGlyph() {
    const busy = this.phase === 'confirming', done = this.phase === 'done'
    this.arrow.toggleAttribute('data-armed', this.armed && !busy && !done)
    this.arrow.toggleAttribute('data-gone', busy || done)
    this.checkEl.toggleAttribute('data-on', done)
    this.spinEl.toggleAttribute('data-on', busy)
    this.ink.toggleAttribute('data-done', done)
  }

  renderStage(force) {
    const { label, confirming, done } = this.frozen || this.labels()
    const stage = this.phase === 'confirming' ? 'busy' : this.phase === 'done' ? 'done' : 'slide'
    const text = stage === 'busy' ? `${confirming}…` : stage === 'done' ? done : label
    this.labelEl.textContent = (this.frozen || this.labels()).label
    this.thumb.setAttribute('aria-label', `${label}. Press Enter to confirm.`)
    const key = stage + '|' + text
    if (force || key !== this._stageKey) {
      this._stageKey = key
      this.inkLabel.className = 'inklabel ' + (stage === 'slide' ? 'l' : 'r')
      rollSwap(this.inkLabel, escapeHtml(text), { dy: 8, duration: 260 })
    }
    this.renderGlyph()
  }

  settleBack(velocity = 0) {
    this.setArmed(false); this.frozen = null; this.setPhase('idle')
    this.cover.tween(0, { duration: reducedMotion() ? 0 : 0.3, ease: ease.out })
    this.x.spring(0, this.springOpts(velocity))
  }

  rewind() {
    this.setArmed(false); this.frozen = null; this.setPhase('idle')
    const d = reducedMotion() ? 0 : 0.6
    this.cover.tween(0, { duration: d * 0.6, ease: ease.out })
    this.x.tween(0, { duration: d, ease: ease.inOut })
  }

  async commit(velocity, glide = false) {
    const run = ++this.run
    const alive = () => this.run === run
    // Freeze the labels: the entity's state flips mid-way and would otherwise
    // rewrite "Unlocking…" into "Slide to lock".
    this.frozen = this.labels()
    this.setPhase('confirming'); this.setArmed(true)
    haptic('medium')
    this.live.textContent = `${this.frozen.confirming}…`
    const landing = glide && !reducedMotion() ? this.x.tween(this.max(), { duration: 0.42, ease: ease.inOut }) : this.x.spring(this.max(), this.springOpts(velocity))
    const flooding = this.cover.tween(1, { duration: reducedMotion() ? 0 : 0.36, ease: ease.out })
    try {
      const action = this.config.confirm_action || (this.stateObj ? defaultAction(this.hass, this.stateObj) : null)
      await Promise.all([runAction(this, this.hass, action, this.config.entity), wait(800), landing, flooding])
    } catch (e) {
      console.error('[kokohome] slide action failed', e)
      if (alive()) { this.live.textContent = ''; this.settleBack() }
      return
    }
    if (!alive()) return
    this.setPhase('done'); haptic('success')
    this.live.textContent = this.frozen.done
    if (this.config.reset_after == null) return
    await wait(this.config.reset_after)
    if (alive()) { this.live.textContent = ''; this.rewind() }
  }

  update() {
    this.disabled = !!this.config.entity && isUnavailable(this.stateObj)
    this.wrap.toggleAttribute('data-disabled', this.disabled)
    this.thumb.setAttribute('aria-disabled', String(this.disabled || this.phase !== 'idle'))
    if (this.phase === 'idle' || this.phase === 'dragging') this.renderStage()
  }

  disconnected() { this.run++; this.x.stop(); this.cover.stop() }
  getCardSize() { return 1 }
  getGridOptions() { return { columns: 12, rows: 2, min_columns: 6 } }
}

register(SlideToConfirm)
