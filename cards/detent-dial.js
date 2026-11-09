/**
 * Kokonut Detent Dial → Lovelace.
 * A 270° rotary knob that clicks from notch to notch: it's pulled toward the
 * nearest step while turning, winds a little past either end with resistance,
 * coasts after a flick, and a swell of ticks follows the indicator round the
 * ring. Digits roll individually.
 *
 *   type: custom:kokonut-detent-dial
 *   entity: climate.living_room_ac   # climate / input_number / number / light /
 *                                    # media_player (volume) / cover / fan / valve
 *   name: Living room
 *   label: Target                    # shown inside the knob
 *   min: 16  max: 30  step: 0.5      # optional overrides
 *   size: 240                        # max diameter; shrinks to fit the card
 *   accent: '#ea580c'                # colour of the current tick
 */
import { KokoCard, register, MotionValue, clamp, numericAdapter, friendlyName, formatState, debounce, reducedMotion, isUnavailable, escapeHtml } from './core.js'

const SWEEP = 270, START_ANGLE = -135, MAX_OVERSHOOT = 16, DETENT_PULL = 0.65, MAX_TICKS = 56
const WAVE_HEIGHT = 9, WAVE_WIDTH = 12, DEAD_ZONE = 14, FLICK_THRESHOLD = 0.4, VELOCITY_WINDOW_MS = 80, COAST = 0.3
const SETTLE = { stiffness: 322, damping: 29 } // ≈ motion's { duration: .35, bounce: .2 }
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'

const damp = (d, max) => max * (1 - Math.exp(-d / max))
const snap = (v, min, step) => Number((Math.round((v - min) / step) * step + min).toFixed(10))
function polar(cx, cy, r, angle) {
  const rad = (angle * Math.PI) / 180
  return { x: Math.round((cx + r * Math.sin(rad)) * 100) / 100, y: Math.round((cy - r * Math.cos(rad)) * 100) / 100 }
}

class DetentDial extends KokoCard {
  static tag = 'kokonut-detent-dial'
  static cardName = 'Kokonut Detent Dial'
  static description = 'Rotary knob with detents for AC temperature, volume, brightness or any number.'
  static defaults() { return { size: 240 } }
  static getStubConfig(hass) {
    const e = Object.keys(hass.states).find((x) => x.startsWith('climate.')) || Object.keys(hass.states).find((x) => x.startsWith('input_number.'))
    return { entity: e || 'climate.living_room' }
  }
  validate(c) { if (!c.entity) throw new Error('kokonut-detent-dial: "entity" is required') }

  css() {
    return `
.k-card { padding: 14px 16px 18px; }
.k-head { margin-bottom: 6px; }
.stage { display: flex; justify-content: center; }
.dial { position: relative; user-select: none; -webkit-user-select: none; }
.dial[data-disabled] { opacity: .5; }
svg.ticks { position: absolute; inset: 0; overflow: visible; }
svg.ticks line { stroke: #d4d4d8; transition: stroke .15s; }
:host([dark]) svg.ticks line { stroke: #3f3f46; }
svg.ticks line.lit { stroke: #18181b; } :host([dark]) svg.ticks line.lit { stroke: #f4f4f5; }
svg.ticks line.cur { stroke: var(--dial-accent, #ea580c); } :host([dark]) svg.ticks line.cur { stroke: var(--dial-accent, #fb923c); }
.end { position: absolute; transform: translateX(-50%); font-size: 11px; color: #a1a1aa; font-variant-numeric: tabular-nums; white-space: nowrap; }
.knob {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); border-radius: 999px; outline: none; touch-action: none; cursor: grab;
  border: 1px solid #e4e4e7; background: #fff; box-shadow: 0 1px 2px rgb(0 0 0/.06), 0 12px 32px -12px rgb(0 0 0/.25); transition: border-color .15s;
}
:host([dark]) .knob { border-color: #27272a; background: #18181b; box-shadow: 0 1px 2px rgb(0 0 0/.4), 0 12px 32px -12px rgb(0 0 0/.8); }
.knob[data-grabbing] { cursor: grabbing; border-color: #d4d4d8; } :host([dark]) .knob[data-grabbing] { border-color: #3f3f46; }
.knob:focus-visible { box-shadow: 0 0 0 4px var(--k-bg), 0 0 0 6px #a1a1aa; }
.dial[data-disabled] .knob { cursor: not-allowed; }
.rot { position: absolute; inset: 0; will-change: transform; }
.ind { position: absolute; top: 10px; left: 50%; height: 12px; width: 3px; transform: translateX(-50%); border-radius: 999px; background: #18181b; }
:host([dark]) .ind { background: #f4f4f5; }
.read { pointer-events: none; position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.lbl { font-size: 12px; color: #71717a; } :host([dark]) .lbl { color: #a1a1aa; }
.val { position: relative; display: flex; font-weight: 500; font-variant-numeric: tabular-nums; letter-spacing: -.025em; color: #18181b; line-height: 1.2; }
:host([dark]) .val { color: #f4f4f5; }
.slot { position: relative; display: inline-flex; overflow: hidden; }
.slot > span { display: inline-block; }
.slot > span.out { position: absolute; left: 0; top: 0; }
`
  }

  render() {
    return `<div class="k-card">
      <div class="k-head"><div class="k-title"></div><div class="k-sub"></div></div>
      <div class="stage"><div class="dial">
        <svg class="ticks" aria-hidden="true"></svg>
        <span class="end min" aria-hidden="true"></span><span class="end max" aria-hidden="true"></span>
        <div class="knob" role="slider" tabindex="0">
          <div class="rot" aria-hidden="true"><span class="ind"></span></div>
          <div class="read"><span class="lbl"></span><span class="val" aria-hidden="true"></span></div>
        </div>
      </div></div>
    </div>`
  }

  build() {
    if (this.config.accent) this.style.setProperty('--dial-accent', this.config.accent)
    this.dial = this.$('.dial'); this.svg = this.$('svg.ticks'); this.knob = this.$('.knob')
    this.rot = this.$('.rot'); this.valEl = this.$('.val'); this.stage = this.$('.stage')
    this.raw = new MotionValue(0)
    this.committed = null
    this.size = 0
    this.drag = null
    this.pointerType = 'mouse'
    this.commit = debounce((v) => {
      // Never send while the knob is still held or coasting; try again shortly.
      if (this.drag || this.raw.anim) { this.commit(this.committed); return }
      if (this.adapter && !this.adapter.readOnly && v !== this.adapter.value) { this._sentAt = Date.now(); this.adapter.set(v) }
    }, 600)

    this.raw.on((r) => this.onRaw(r))

    this.ro = new ResizeObserver(() => {
      const w = this.stage.clientWidth
      const size = Math.max(150, Math.min(this.config.size, w))
      if (Math.abs(size - this.size) > 1) { this.size = size; this.layout() }
    })
    this.ro.observe(this.stage)

    const k = this.knob
    k.addEventListener('pointerdown', (e) => this.down(e))
    k.addEventListener('pointermove', (e) => this.move(e))
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) k.addEventListener(ev, (e) => this.up(e))
    k.addEventListener('dblclick', () => { if (!this.disabled && this.config.default_value != null) this.settleTo(this.config.default_value) })
    k.addEventListener('keydown', (e) => this.key(e))
    let acc = 0
    k.addEventListener('wheel', (e) => {
      if (this.disabled || this.shadowRoot.activeElement !== k) return
      e.preventDefault()
      acc += e.deltaY
      while (Math.abs(acc) >= 40) { const s = Math.sign(acc); acc -= s * 40; this.stepBy(-s * this.a.step) }
    }, { passive: false })
  }

  get a() { return this.adapter || { min: 0, max: 100, step: 1, format: (v) => String(v) } }

  rotationFor(r) {
    const { min, max, step } = this.a
    const range = max - min
    const dpu = range === 0 ? 0 : SWEEP / range
    if (r < min) return START_ANGLE - damp((min - r) * dpu, MAX_OVERSHOOT)
    if (r > max) return START_ANGLE + SWEEP + damp((r - max) * dpu, MAX_OVERSHOOT)
    const notch = snap(r, min, step)
    const pulled = notch + (r - notch) * (1 - DETENT_PULL)
    return START_ANGLE + (pulled - min) * dpu
  }

  layout() {
    const size = this.size
    if (!size || !this.adapter) return
    const { min, max, step } = this.a
    const range = max - min
    this.tickCount = Math.max(1, Math.min(Math.round(range / step), MAX_TICKS))
    this.center = size / 2
    this.outer = size / 2 - 6
    this.dial.style.width = `${size}px`; this.dial.style.height = `${size}px`
    const knob = size * 0.64
    this.knob.style.width = `${knob}px`; this.knob.style.height = `${knob}px`
    this.valEl.style.fontSize = `${Math.round(Math.max(20, Math.min(30, size * 0.125)))}px`
    this.svg.setAttribute('viewBox', `0 0 ${size} ${size}`)
    this.svg.setAttribute('width', size); this.svg.setAttribute('height', size)
    this.svg.innerHTML = ''
    this.lines = []; this.lengths = []
    const ns = 'http://www.w3.org/2000/svg'
    for (let i = 0; i <= this.tickCount; i++) {
      const l = document.createElementNS(ns, 'line')
      l.setAttribute('stroke-linecap', 'round')
      this.svg.append(l); this.lines.push(l)
    }
    const ml = polar(this.center, this.center, this.outer + 2, START_ANGLE - 12)
    const xl = polar(this.center, this.center, this.outer + 2, START_ANGLE + SWEEP + 12)
    Object.assign(this.$('.end.min').style, { left: `${ml.x}px`, top: `${ml.y}px` })
    Object.assign(this.$('.end.max').style, { left: `${xl.x}px`, top: `${xl.y}px` })
    this.$('.end.min').textContent = this.a.format(min)
    this.$('.end.max').textContent = this.a.format(max)
    this.drawTicks(this.rotationFor(this.raw.get()), true)
    this.paintLit()
  }

  tickLength(i, ind) {
    const angle = START_ANGLE + (i / this.tickCount) * SWEEP
    const anchor = i === 0 || i === this.tickCount || i * 2 === this.tickCount
    const base = anchor ? 14 : i % 5 === 0 ? 10 : 6
    const d = (angle - ind) / WAVE_WIDTH
    return Math.round((base + WAVE_HEIGHT * Math.exp(-d * d)) * 10) / 10
  }

  drawTicks(ind, all) {
    if (!this.lines) return
    for (let i = 0; i <= this.tickCount; i++) {
      const len = this.tickLength(i, ind)
      if (!all && this.lengths[i] === len) continue
      this.lengths[i] = len
      const angle = START_ANGLE + (i / this.tickCount) * SWEEP
      const a = polar(this.center, this.center, this.outer - len, angle)
      const b = polar(this.center, this.center, this.outer, angle)
      const l = this.lines[i]
      l.setAttribute('x1', a.x); l.setAttribute('y1', a.y)
      if (all) { l.setAttribute('x2', b.x); l.setAttribute('y2', b.y) }
    }
  }

  paintLit() {
    if (!this.lines || this.committed == null) return
    const { min, max } = this.a
    const frac = max === min ? 0 : (this.committed - min) / (max - min)
    const active = Math.round(frac * this.tickCount)
    this.lines.forEach((l, i) => {
      l.setAttribute('class', i === active ? 'cur' : i <= active ? 'lit' : '')
      l.setAttribute('stroke-width', i === active ? 2 : 1.5)
    })
  }

  onRaw(r) {
    const ind = this.rotationFor(r)
    this.rot.style.transform = `rotate(${ind}deg)`
    this.drawTicks(ind, false)
    const { min, max, step } = this.a
    const next = clamp(snap(r, min, step), min, max)
    if (next === this.committed) return
    const dir = this.committed == null || next > this.committed ? 1 : -1
    this.committed = next
    this.renderValue(dir)
    this.paintLit()
    if (this._fromUser) {
      this.commit(next)
      if (this.pointerType === 'touch' && navigator.vibrate) { try { navigator.vibrate(1) } catch (_) { /* noop */ } }
    }
  }

  renderValue(direction) {
    const text = this.a.format(this.committed)
    this.knob.setAttribute('aria-valuenow', this.committed)
    this.knob.setAttribute('aria-valuetext', text)
    const offset = reducedMotion() ? 0 : direction * 10
    const slots = [...this.valEl.children]
    // Each character rolls on its own; position is identity.
    while (slots.length < text.length) { const s = document.createElement('span'); s.className = 'slot'; this.valEl.append(s); slots.push(s) }
    while (slots.length > text.length) slots.pop().remove()
    text.split('').forEach((ch, i) => {
      const slot = slots[i]
      const cur = slot.querySelector('span:not(.out)')
      if (cur && cur.textContent === ch) return
      const n = document.createElement('span')
      n.textContent = ch
      if (cur && offset) {
        cur.classList.add('out')
        cur.animate([{ opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }, { opacity: 0, transform: `translateY(${-offset}px)`, filter: 'blur(2px)' }], { duration: 160, easing: EASE_OUT, fill: 'forwards' }).onfinish = () => cur.remove()
        slot.append(n)
        n.animate([{ opacity: 0, transform: `translateY(${offset}px)`, filter: 'blur(2px)' }, { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }], { duration: 160, easing: EASE_OUT })
      } else { slot.replaceChildren(n) }
    })
  }

  settleTo(target) {
    this._fromUser = true
    this.raw.spring(clamp(snap(target, this.a.min, this.a.step), this.a.min, this.a.max), { ...SETTLE, velocity: 0 })
  }

  stepBy(delta) {
    this._fromUser = true
    this.pointerType = 'keyboard'
    const t = clamp(snap(this.committed + delta, this.a.min, this.a.step), this.a.min, this.a.max)
    this.raw.jump(t); this.onRaw(t)
  }

  key(e) {
    if (this.disabled) return
    const { min, max, step } = this.a
    const big = Math.max(step, snap((max - min) / 10, 0, step))
    const map = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: big, PageDown: -big, Home: min - this.committed, End: max - this.committed }
    if (!(e.key in map)) return
    e.preventDefault()
    this.stepBy(map[e.key])
  }

  angleOf(e, rect) {
    const dx = e.clientX - (rect.left + rect.width / 2), dy = e.clientY - (rect.top + rect.height / 2)
    return { angle: (Math.atan2(dx, -dy) * 180) / Math.PI, distance: Math.hypot(dx, dy) }
  }

  down(e) {
    if (this.disabled || this.drag || (e.pointerType === 'mouse' && e.button !== 0)) return
    const rect = this.knob.getBoundingClientRect()
    this.raw.stop()
    this.pointerType = e.pointerType
    this._fromUser = true
    this.knob.setPointerCapture(e.pointerId)
    this.drag = { id: e.pointerId, rect, last: this.angleOf(e, rect).angle, samples: [{ t: e.timeStamp, v: this.raw.get() }] }
    this.knob.toggleAttribute('data-grabbing', true)
  }

  move(e) {
    const d = this.drag
    if (!d || d.id !== e.pointerId) return
    const { angle, distance } = this.angleOf(e, d.rect)
    if (distance < DEAD_ZONE) { d.last = angle; return }
    let delta = angle - d.last
    if (delta > 180) delta -= 360; else if (delta < -180) delta += 360
    d.last = angle
    const range = this.a.max - this.a.min
    const next = this.raw.get() + (delta / SWEEP) * range
    this.raw.set(next)
    d.samples.push({ t: e.timeStamp, v: next })
    while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > VELOCITY_WINDOW_MS) d.samples.shift()
  }

  up(e) {
    const d = this.drag
    if (!d || d.id !== e.pointerId) return
    this.drag = null
    this.knob.toggleAttribute('data-grabbing', false)
    const { min, max, step } = this.a
    const range = max - min
    const first = d.samples[0], last = d.samples[d.samples.length - 1] || first
    const elapsed = (last.t - first.t) / 1000
    const paused = e.timeStamp - last.t > VELOCITY_WINDOW_MS
    const velocity = elapsed > 0 && !paused ? (last.v - first.v) / elapsed : 0
    const pos = this.raw.get()
    if (reducedMotion() || pos < min || pos > max || Math.abs(velocity) < range * FLICK_THRESHOLD) {
      this.raw.spring(clamp(snap(pos, min, step), min, max), { ...SETTLE, velocity: 0 })
      return
    }
    // A flick coasts and lands on a notch; past an end it bounces back.
    const target = clamp(snap(pos + velocity * COAST, min, step), min, max)
    this.raw.spring(target, { velocity, stiffness: 140, damping: 24, restDelta: 0.005 })
  }

  update() {
    const s = this.stateObj
    const prev = this.adapter
    this.adapter = numericAdapter(this.hass, s, this.config)
    this.disabled = !!(isUnavailable(s) || !this.adapter || this.adapter.readOnly)
    this.dial.toggleAttribute('data-disabled', this.disabled)
    this.knob.tabIndex = this.disabled ? -1 : 0
    this.$('.k-title').textContent = this.config.name || friendlyName(s, this.config.entity)
    let sub = s ? formatState(this.hass, s) : 'Not found'
    if (s && s.entity_id.startsWith('climate.') && s.attributes.current_temperature != null) sub = `${formatState(this.hass, s)} · now ${s.attributes.current_temperature}°`
    this.$('.k-sub').textContent = sub
    this.$('.lbl').textContent = this.config.label || (s && s.entity_id.startsWith('climate.') ? 'Target' : s && s.entity_id.startsWith('media_player.') ? 'Volume' : 'Value')
    this.knob.setAttribute('aria-label', this.config.name || friendlyName(s, this.config.entity))
    if (!this.adapter) return
    const geomChanged = !prev || prev.min !== this.adapter.min || prev.max !== this.adapter.max || prev.step !== this.adapter.step
    if (geomChanged) this.layout()
    // Follow HA, unless the user is turning or a command is in flight.
    const busy = this.drag || this.raw.anim || (this._sentAt && Date.now() - this._sentAt < 2500)
    const v = clamp(this.adapter.value, this.adapter.min, this.adapter.max)
    if (this.committed == null || (!busy && v !== this.committed)) {
      this._fromUser = false
      this.raw.jump(v)
      this.onRaw(v)
    }
  }

  disconnected() { this.raw.stop(); this.commit.cancel && this.commit.cancel() }
  getCardSize() { return 5 }
  getGridOptions() { return { columns: 6, rows: 5, min_columns: 4 } }
}

register(DetentDial)
