/**
 * Kokonut Liquid Slider → Lovelace.
 * A glass you fill with your finger. The surface is a 1D wave of columns that
 * pull on their neighbours; the finger drags the surface toward it and its
 * sideways speed piles liquid up ahead. The level springs to its target, and a
 * fast pour pulls bubbles up from the floor.
 *
 *   type: custom:kokonut-liquid-slider
 *   entity: media_player.living_room_lg_tv   # volume; or light / cover / number / fan / climate…
 *   name: TV volume
 *   color: sky | amber | emerald | violet | rose | orange | '#hex'
 *   min / max / step / unit                  # optional overrides
 */
import { KokoCard, register, clamp, numericAdapter, friendlyName, debounce, reducedMotion, isUnavailable, domainOf, formatNumber } from './core.js'

const WIDTH = 280, HEIGHT = 360, LEFT = 84, RIGHT = 196
const CX = (LEFT + RIGHT) / 2, RADIUS = (RIGHT - LEFT) / 2, RY = 9, RIM_Y = 104, FLOOR_Y = 312
const EMPTY_Y = FLOOR_Y, FULL_Y = RIM_Y + 16
const COLUMNS = 34, STEP = 1 / 120, SPREAD = 2600, TENSION = 30, DAMPING = 2.4, VISCOSITY = 22, MAX_WAVE = 16
const GRAB = 900, GRAB_REACH = 2.6, GRAB_MAX = 14, STIR = 0.55
const LEVEL_STIFFNESS = 220, LEVEL_DAMPING = 26, MAX_BUBBLES = 14, REST_EPSILON = 0.02

const PALETTE = {
  sky: ['#0ea5e9', '#7dd3fc', '#38bdf8'], amber: ['#f59e0b', '#fcd34d', '#fbbf24'], emerald: ['#10b981', '#6ee7b7', '#34d399'],
  violet: ['#8b5cf6', '#c4b5fd', '#a78bfa'], rose: ['#f43f5e', '#fda4af', '#fb7185'], orange: ['#f97316', '#fdba74', '#fb923c'],
}
const AUTO_COLOR = { light: 'amber', climate: 'orange', media_player: 'violet', fan: 'sky', cover: 'emerald' }

const COLUMN_X = [], DEPTH = []
for (let i = 0; i < COLUMNS; i++) {
  const x = LEFT + (i / (COLUMNS - 1)) * (RIGHT - LEFT)
  COLUMN_X.push(Math.round(x * 100) / 100)
  const u = (x - CX) / RADIUS
  DEPTH.push(Math.round(RY * Math.sqrt(Math.max(0, 1 - u * u)) * 100) / 100)
}
const levelToY = (l) => EMPTY_Y - l * (EMPTY_Y - FULL_Y)
const f = (n) => n.toFixed(2)
function surfacePath(levelY, h) {
  let d = ''
  for (let i = 0; i < COLUMNS; i++) d += `${i ? 'L' : 'M'}${f(COLUMN_X[i])} ${f(Math.min(levelY + h[i] - DEPTH[i], FLOOR_Y))}`
  for (let i = COLUMNS - 1; i >= 0; i--) d += `L${f(COLUMN_X[i])} ${f(Math.min(levelY + h[i] + DEPTH[i], FLOOR_Y + DEPTH[i]))}`
  return `${d}Z`
}
function bodyPath(levelY, h) {
  let d = ''
  for (let i = 0; i < COLUMNS; i++) d += `${i ? 'L' : 'M'}${f(COLUMN_X[i])} ${f(Math.min(levelY + h[i] + DEPTH[i], FLOOR_Y + DEPTH[i]))}`
  return `${d}L${RIGHT} ${FLOOR_Y} A${RADIUS} ${RY} 0 0 1 ${LEFT} ${FLOOR_Y}Z`
}
function lipPath(levelY, h) {
  let d = ''
  for (let i = 1; i < COLUMNS - 1; i++) d += `${i === 1 ? 'M' : 'L'}${f(COLUMN_X[i])} ${f(Math.min(levelY + h[i] + DEPTH[i], FLOOR_Y + DEPTH[i]))}`
  return d
}
function heightAt(h, x) {
  const t = clamp((x - LEFT) / (RIGHT - LEFT), 0, 1) * (COLUMNS - 1)
  const i = Math.floor(t), j = Math.min(i + 1, COLUMNS - 1)
  return h[i] + (h[j] - h[i]) * (t - i)
}
let uid = 0

class LiquidSlider extends KokoCard {
  static tag = 'kokonut-liquid-slider'
  static cardName = 'Kokonut Liquid Slider'
  static description = 'Fill a glass with your finger to set volume, brightness, blinds or any number.'
  static getStubConfig(hass) {
    const e = Object.keys(hass.states).find((x) => x.startsWith('media_player.')) || Object.keys(hass.states).find((x) => x.startsWith('light.'))
    return { entity: e || 'input_number.example' }
  }
  validate(c) { if (!c.entity) throw new Error('kokonut-liquid-slider: "entity" is required') }

  css() {
    return `
.k-card { padding: 0; container-type: inline-size; aspect-ratio: ${WIDTH} / ${HEIGHT}; max-height: var(--ls-max-h, 420px); margin: 0 auto; outline: none; user-select: none; -webkit-user-select: none; }
.k-card:focus-visible { outline: 2px solid #a1a1aa; outline-offset: 2px; }
.k-card[data-disabled] { opacity: .5; pointer-events: none; }
.text { pointer-events: none; position: absolute; left: 0; right: 0; top: 0; padding: clamp(12px, 8.5cqw, 24px); z-index: 1; }
.lbl { margin: 0; font-size: clamp(11px, 5cqw, 14px); color: #71717a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.num { margin: 2px 0 0; font-weight: 500; font-size: clamp(17px, 8.6cqw, 24px); letter-spacing: -.025em; font-variant-numeric: tabular-nums; color: var(--k-fg); }
.num small { margin-left: 4px; font-size: .67em; color: #a1a1aa; font-weight: 400; }
svg { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: grab; }
svg[data-dragging] { cursor: grabbing; }
.back { fill: #fafafa; } :host([dark]) .back { fill: rgb(24 24 27/.6); }
.floor-back { fill: none; stroke: #e4e4e7; } :host([dark]) .floor-back { stroke: #27272a; }
.body { fill: var(--liq); } .surface { fill: var(--liq-top); } :host([dark]) .surface { fill: var(--liq-top-dark); }
.lip { fill: none; stroke: rgb(255 255 255/.6); }
.bub { fill: rgb(255 255 255/.25); stroke: rgb(255 255 255/.7); }
.grad { stroke: rgb(24 24 27/.25); } :host([dark]) .grad { stroke: rgb(255 255 255/.3); }
.gl { fill: #a1a1aa; font-size: 10px; font-variant-numeric: tabular-nums; } :host([dark]) .gl { fill: #71717a; }
.glass { fill: none; stroke: #d4d4d8; } :host([dark]) .glass { stroke: #3f3f46; }
.shine { stroke: rgb(255 255 255/.5); } :host([dark]) .shine { stroke: rgb(255 255 255/.1); }
`
  }

  render() {
    const id = `kls-${++uid}`
    const b = []
    for (let i = 0; i < MAX_BUBBLES; i++) b.push(`<circle class="bub" cx="${CX}" cy="${FLOOR_Y}" r="1" stroke-width=".75" style="opacity:0"/>`)
    return `<div class="k-card" role="slider" aria-orientation="vertical" tabindex="0">
      <div class="text"><p class="lbl"></p><p class="num"><span class="v"></span><small class="u"></small></p></div>
      <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
        <defs><clipPath id="${id}"><path d="M${LEFT} ${RIM_Y} L${RIGHT} ${RIM_Y} L${RIGHT} ${FLOOR_Y} A${RADIUS} ${RY} 0 0 1 ${LEFT} ${FLOOR_Y} Z"/></clipPath></defs>
        <path class="back" d="M${LEFT} ${RIM_Y} A${RADIUS} ${RY} 0 0 1 ${RIGHT} ${RIM_Y} L${RIGHT} ${FLOOR_Y} A${RADIUS} ${RY} 0 0 1 ${LEFT} ${FLOOR_Y} Z"/>
        <path class="floor-back" d="M${LEFT} ${FLOOR_Y} A${RADIUS} ${RY} 0 0 1 ${RIGHT} ${FLOOR_Y}"/>
        <g clip-path="url(#${id})"><path class="body"/>${b.join('')}<path class="surface"/><path class="lip" stroke-linecap="round" stroke-width="1"/></g>
        <g class="grads"></g>
        <ellipse class="glass" cx="${CX}" cy="${RIM_Y}" rx="${RADIUS}" ry="${RY}" stroke-width="1.5"/>
        <path class="glass" d="M${LEFT} ${RIM_Y} L${LEFT} ${FLOOR_Y} A${RADIUS} ${RY} 0 0 0 ${RIGHT} ${FLOOR_Y} L${RIGHT} ${RIM_Y}" stroke-width="1.5"/>
        <line class="shine" stroke-linecap="round" stroke-width="3" x1="${LEFT + 9}" x2="${LEFT + 9}" y1="${RIM_Y + 22}" y2="${FLOOR_Y - 14}"/>
      </svg>
    </div>`
  }

  build() {
    this.card = this.$('.k-card'); this.svg = this.$('svg')
    this.surfaceEl = this.$('.surface'); this.bodyEl = this.$('.body'); this.lipEl = this.$('.lip'); this.bubbleEls = this.$$('.bub')
    this.value = null
    this.s = { heights: new Float64Array(COLUMNS), speeds: new Float64Array(COLUMNS), accels: new Float64Array(COLUMNS), level: 0, levelSpeed: 0, target: 0,
      bubbles: [], raf: 0, last: 0, carry: 0, held: false, pointerId: -1, px: 0, py: 0, pvx: 0, lastPx: 0, lastT: 0, seed: 1 }
    this.send = debounce((v) => { if (this.adapter && !this.adapter.readOnly) { this.sentAt = Date.now(); this.adapter.set(v) } }, 450)
    this.svg.addEventListener('pointerdown', (e) => this.down(e))
    this.svg.addEventListener('pointermove', (e) => { if (this.s.held && this.s.pointerId === e.pointerId) this.follow(e) })
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) this.svg.addEventListener(ev, (e) => this.up(e))
    this.card.addEventListener('keydown', (e) => this.key(e))
    this._vis = () => { if (document.hidden && this.s.raf) { cancelAnimationFrame(this.s.raf); this.s.raf = 0; this.s.last = 0 } else if (!document.hidden) this.wake() }
    document.addEventListener('visibilitychange', this._vis)
    this.draw()
  }

  setColor() {
    const c = this.config.color || AUTO_COLOR[domainOf(this.config.entity)] || 'sky'
    const [body, top, topDark] = PALETTE[c] || [c, `color-mix(in srgb, ${c} 55%, white)`, `color-mix(in srgb, ${c} 75%, white)`]
    this.style.setProperty('--liq', body); this.style.setProperty('--liq-top', top); this.style.setProperty('--liq-top-dark', topDark)
  }

  rnd() { const s = this.s; s.seed = (s.seed * 16807) % 2147483647; return s.seed / 2147483647 }

  draw() {
    const s = this.s, y = levelToY(s.level)
    this.surfaceEl.setAttribute('d', surfacePath(y, s.heights))
    this.bodyEl.setAttribute('d', bodyPath(y, s.heights))
    this.lipEl.setAttribute('d', lipPath(y, s.heights))
    for (let i = 0; i < MAX_BUBBLES; i++) {
      const el = this.bubbleEls[i], b = s.bubbles[i]
      if (b) { el.setAttribute('cx', f(b.x + Math.sin(b.phase) * 1.6)); el.setAttribute('cy', f(b.y)); el.setAttribute('r', f(b.r)); el.style.opacity = '1' }
      else el.style.opacity = '0'
    }
  }

  stepLevel() {
    const s = this.s
    s.levelSpeed += ((s.target - s.level) * LEVEL_STIFFNESS - s.levelSpeed * LEVEL_DAMPING) * STEP
    s.level += s.levelSpeed * STEP
    if (s.levelSpeed > 0.5 && s.bubbles.length < MAX_BUBBLES && this.rnd() < s.levelSpeed * 0.05) {
      s.bubbles.push({ x: LEFT + 10 + this.rnd() * (RIGHT - LEFT - 20), y: FLOOR_Y + 2, r: 1.2 + this.rnd() * 2, speed: 40 + this.rnd() * 50, phase: this.rnd() * Math.PI * 2 })
    }
  }

  stepWaves() {
    const s = this.s, h = s.heights, v = s.speeds, a = s.accels, levelY = levelToY(s.level)
    for (let i = 0; i < COLUMNS; i++) {
      const l = i === 0 ? 0 : i - 1, r = i === COLUMNS - 1 ? i : i + 1
      let acc = SPREAD * (h[l] + h[r] - 2 * h[i]) + VISCOSITY * (v[l] + v[r] - 2 * v[i]) - TENSION * h[i] - DAMPING * v[i]
      if (s.held) {
        const reach = (COLUMN_X[i] - s.px) / ((RIGHT - LEFT) / COLUMNS)
        const w = Math.exp(-(reach * reach) / (GRAB_REACH * GRAB_REACH))
        acc += GRAB * clamp(s.py - (levelY + h[i]), -GRAB_MAX, GRAB_MAX) * w * 0.05
        acc -= STIR * s.pvx * ((i - (COLUMNS - 1) / 2) / COLUMNS) * 60
      }
      a[i] = acc
    }
    let mean = 0
    for (let i = 0; i < COLUMNS; i++) { v[i] += a[i] * STEP; h[i] = clamp(h[i] + v[i] * STEP, -MAX_WAVE, MAX_WAVE); mean += h[i] }
    mean /= COLUMNS
    let energy = 0
    for (let i = 0; i < COLUMNS; i++) { h[i] -= mean; energy += Math.abs(h[i]) + Math.abs(v[i]) * STEP }
    return energy / COLUMNS
  }

  stepBubbles() {
    const s = this.s, levelY = levelToY(s.level)
    for (let i = s.bubbles.length - 1; i >= 0; i--) {
      const b = s.bubbles[i]
      b.y -= b.speed * STEP; b.phase += STEP * 9
      if (b.y <= levelY + heightAt(s.heights, b.x) + 1) {
        const col = Math.round(((b.x - LEFT) / (RIGHT - LEFT)) * (COLUMNS - 1))
        s.speeds[clamp(col, 0, COLUMNS - 1)] -= 30 * b.r
        s.bubbles.splice(i, 1)
      }
    }
  }

  tick = (now) => {
    const s = this.s
    s.raf = 0
    const elapsed = s.last ? Math.min((now - s.last) / 1000, 0.05) : STEP
    s.last = now; s.carry += elapsed
    let energy = 0
    while (s.carry >= STEP) { this.stepLevel(); energy = this.stepWaves(); this.stepBubbles(); s.carry -= STEP }
    s.pvx *= 0.85
    this.draw()
    if (!s.held && energy < REST_EPSILON && Math.abs(s.target - s.level) < 0.0005 && Math.abs(s.levelSpeed) < 0.001 && !s.bubbles.length) {
      s.level = s.target; s.heights.fill(0); s.speeds.fill(0); s.last = 0; this.draw(); return
    }
    s.raf = requestAnimationFrame(this.tick)
  }

  wake() {
    const s = this.s
    if (reducedMotion()) { s.level = s.target; s.levelSpeed = 0; s.heights.fill(0); s.speeds.fill(0); s.bubbles.length = 0; this.draw(); return }
    if (!s.raf && this.isConnected) s.raf = requestAnimationFrame(this.tick)
  }

  get range() { const a = this.adapter; return a ? [a.min, a.max, a.step] : [0, 100, 1] }

  commit(next) {
    const [lo, hi, inc] = this.range
    const snapped = clamp(Number((Math.round((next - lo) / inc) * inc + lo).toFixed(10)), lo, hi)
    if (snapped === this.value) return
    const quarter = (hi - lo) / 4
    if (this.value != null && Math.floor((snapped - lo) / quarter) !== Math.floor((this.value - lo) / quarter) && navigator.vibrate) { try { navigator.vibrate(4) } catch (_) { /* noop */ } }
    this.value = snapped
    this.renderValue()
    this.send(snapped)
  }

  renderValue() {
    if (!this.adapter) return
    const a = this.adapter
    const dec = a.step >= 1 ? 0 : a.step >= 0.1 ? 1 : 2
    this.$('.v').textContent = formatNumber(this.hass, this.value, { minimumFractionDigits: dec, maximumFractionDigits: dec })
    this.$('.u').textContent = a.unit === '°' ? '°' : a.unit || ''
    this.card.setAttribute('aria-valuenow', this.value)
    this.card.setAttribute('aria-valuetext', a.format(this.value))
  }

  local(e) {
    const r = this.svg.getBoundingClientRect()
    // preserveAspectRatio meet: map into the viewBox, letterboxed.
    const scale = Math.min(r.width / WIDTH, r.height / HEIGHT)
    const ox = (r.width - WIDTH * scale) / 2, oy = (r.height - HEIGHT * scale) / 2
    return { x: (e.clientX - r.left - ox) / scale, y: (e.clientY - r.top - oy) / scale }
  }

  follow(e) {
    const s = this.s, p = this.local(e), now = e.timeStamp
    if (s.lastT && now > s.lastT) s.pvx = s.pvx * 0.6 + clamp(((p.x - s.lastPx) / (now - s.lastT)) * 1000, -900, 900) * 0.4
    s.lastPx = p.x; s.lastT = now
    s.px = clamp(p.x, LEFT, RIGHT); s.py = clamp(p.y, FULL_Y, EMPTY_Y)
    const raw = clamp((EMPTY_Y - p.y) / (EMPTY_Y - FULL_Y), 0, 1)
    s.target = raw
    const [lo, hi] = this.range
    this.commit(lo + raw * (hi - lo))
    this.wake()
  }

  down(e) {
    if (this.disabled || (e.pointerType === 'mouse' && e.button !== 0) || this.s.held) return
    e.preventDefault()
    this.card.focus({ preventScroll: true })
    this.svg.setPointerCapture(e.pointerId)
    Object.assign(this.s, { held: true, pointerId: e.pointerId, lastT: 0, pvx: 0 })
    this.svg.toggleAttribute('data-dragging', true)
    this.follow(e)
  }

  up(e) {
    const s = this.s
    if (!s.held || s.pointerId !== e.pointerId) return
    s.held = false
    this.svg.toggleAttribute('data-dragging', false)
    const [lo, hi] = this.range
    s.target = hi - lo > 0 ? (this.value - lo) / (hi - lo) : 0
    this.send.flush(this.value)
    this.wake()
  }

  key(e) {
    if (this.disabled || this.value == null) return
    const [lo, hi, inc] = this.range, v = this.value
    const big = Math.max(inc, (hi - lo) / 10)
    const moves = { ArrowUp: v + inc, ArrowRight: v + inc, ArrowDown: v - inc, ArrowLeft: v - inc, PageUp: v + big, PageDown: v - big, Home: lo, End: hi }
    if (!(e.key in moves)) return
    e.preventDefault()
    this.commit(moves[e.key])
    const s = this.s
    s.target = hi - lo > 0 ? (this.value - lo) / (hi - lo) : 0
    if (!reducedMotion()) s.speeds[Math.floor(COLUMNS / 2)] += moves[e.key] > v ? -90 : 90
    this.wake()
  }

  drawGraduations() {
    const [lo, hi] = this.range
    const a = this.adapter
    const key = `${lo}|${hi}|${a && a.unit}`
    if (key === this._gradKey) return
    this._gradKey = key
    this.$('.grads').innerHTML = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const y = Math.round(levelToY(t) + RY * 0.55)
      const v = lo + t * (hi - lo)
      return `<line class="grad" stroke-width="1" x1="${RIGHT - 14}" x2="${RIGHT - 4}" y1="${y}" y2="${y}"/><text class="gl" dominant-baseline="middle" x="${RIGHT + 8}" y="${y}">${formatNumber(this.hass, v, { maximumFractionDigits: 1 })}</text>`
    }).join('')
  }

  update() {
    const st = this.stateObj
    this.adapter = numericAdapter(this.hass, st, this.config)
    this.disabled = !!(isUnavailable(st) || !this.adapter || this.adapter.readOnly)
    this.card.toggleAttribute('data-disabled', this.disabled)
    this.$('.lbl').textContent = this.config.name || friendlyName(st, this.config.entity)
    this.card.setAttribute('aria-label', this.config.name || friendlyName(st, this.config.entity))
    this.setColor()
    if (!this.adapter) return
    const a = this.adapter
    this.card.setAttribute('aria-valuemin', a.min); this.card.setAttribute('aria-valuemax', a.max)
    this.drawGraduations()
    const s = this.s
    const recent = this.sentAt && Date.now() - this.sentAt < 2500
    if (this.value == null || (!s.held && !recent && a.value !== this.value)) {
      const first = this.value == null
      this.value = clamp(a.value, a.min, a.max)
      this.renderValue()
      s.target = a.max - a.min > 0 ? (this.value - a.min) / (a.max - a.min) : 0
      if (first) { s.level = s.target; this.draw() } else this.wake()
    }
  }

  connected() { if (this.s) this.wake() }
  disconnected() { if (this.s && this.s.raf) { cancelAnimationFrame(this.s.raf); this.s.raf = 0; this.s.last = 0 } this.send && this.send.cancel() }
  getCardSize() { return 6 }
  getGridOptions() { return { columns: 6, rows: 'auto', min_columns: 3 } }
}

register(LiquidSlider)
