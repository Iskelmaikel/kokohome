/**
 * Kokonut Spending Ring → Lovelace (energy by device, or any breakdown).
 * A donut of categories you can spin: drag or flick the ring and it springs so
 * the slice under the marker is selected; tap a slice or a legend row to turn
 * to it. The centre shows the selected slice's value, share and change.
 *
 *   type: custom:kokonut-spending-ring
 *   title: Energy today
 *   period: day | week | month        # for total_increasing sensors (uses statistics)
 *   price: 0.27                       # optional: show cost instead of units
 *   currency: EUR
 *   entities:
 *     - entity: sensor.ikea_plug_energy
 *       name: Desk
 *       color: sky                    # sky emerald rose amber violet zinc orange or #hex
 *     - sensor.ac_energy
 */
import { KokoCard, register, friendlyName, fetchStatistics, formatNumber, escapeHtml, reducedMotion } from './core.js'

const SIZE = 240, C = SIZE / 2, R = 90, STROKE = 22, GAP = 2.4, RATE = 11, DAMPING = 0.78, PROJECT = 0.2, TAP_SLOP = 5
const COLORS = {
  sky: ['#0ea5e9', '#38bdf8'], emerald: ['#10b981', '#34d399'], rose: ['#f43f5e', '#fb7185'], amber: ['#fbbf24', '#fcd34d'],
  violet: ['#8b5cf6', '#a78bfa'], zinc: ['#a1a1aa', '#71717a'], orange: ['#f97316', '#fb923c'], teal: ['#14b8a6', '#2dd4bf'],
}
const ORDER = ['sky', 'emerald', 'rose', 'amber', 'violet', 'zinc', 'orange', 'teal']
const wrap = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180
function polar(deg, r = R) { const rad = (deg * Math.PI) / 180; return [C + r * Math.sin(rad), C - r * Math.cos(rad)] }
function arc(from, to) {
  const [x0, y0] = polar(from), [x1, y1] = polar(to)
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${to - from > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}
function sliceAt(spans, deg) { const a = ((deg % 360) + 360) % 360; const i = spans.findIndex((s) => a >= s.from && a < s.to); return i === -1 ? 0 : i }
function springStep(st, target, dt) {
  const n = Math.ceil(dt / (1 / 240)), h = dt / n
  for (let i = 0; i < n; i++) { st.v += (-RATE * RATE * (st.a - target) - 2 * DAMPING * RATE * st.v) * h; st.a += st.v * h }
  return Math.abs(st.a - target) < 0.05 && Math.abs(st.v) < 2
}
function periodStart(period, offset = 0) {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  if (period === 'week') { const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day - 7 * offset) }
  else if (period === 'month') { d.setDate(1); d.setMonth(d.getMonth() - offset) }
  else d.setDate(d.getDate() - offset)
  return d
}

class SpendingRing extends KokoCard {
  static tag = 'kokonut-spending-ring'
  static cardName = 'Kokonut Spending Ring'
  static description = 'Spinnable donut breakdown — energy by device, costs, or any set of sensors.'
  static defaults() { return { period: 'day' } }
  static getStubConfig(hass) {
    const e = Object.keys(hass.states).filter((x) => hass.states[x].attributes.device_class === 'energy').slice(0, 4)
    return { title: 'Energy today', entities: e.length ? e : ['sensor.example_energy'] }
  }
  validate(c) { if (!Array.isArray(c.entities) || !c.entities.length) throw new Error('kokonut-spending-ring: "entities" must be a non-empty list') }
  watched() { return this.specs().map((s) => s.entity) }
  specs() { return this.config.entities.map((e, i) => ({ ...(typeof e === 'string' ? { entity: e } : e), _i: i })) }

  css() {
    return `
.k-card { padding: 20px; }
.top { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
.title { margin: 0; font-size: 14px; color: #71717a; } :host([dark]) .title { color: #a1a1aa; }
.total { margin: 0; font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; }
.ring { position: relative; margin: 12px auto 0; aspect-ratio: 1; width: 100%; max-width: 240px; touch-action: none; user-select: none; -webkit-user-select: none; border-radius: 999px; outline: none; cursor: grab; }
.ring[data-dragging] { cursor: grabbing; }
.ring:focus-visible { box-shadow: 0 0 0 4px var(--k-bg), 0 0 0 6px #a1a1aa; }
.ring svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.seg { fill: none; transition: stroke-width .2s cubic-bezier(.23,1,.32,1), opacity .2s cubic-bezier(.23,1,.32,1); stroke: var(--c); }
:host([dark]) .seg { stroke: var(--cd); }
.seg.off { opacity: .4; } :host([dark]) .seg.off { opacity: .5; }
.marker { fill: #18181b; } :host([dark]) .marker { fill: #f4f4f5; }
.mid { pointer-events: none; position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.mid > div { animation: rise .2s ease-out; }
@keyframes rise { from { transform: translateY(4px); opacity: 0; } }
.mname { margin: 0; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 12px; color: #71717a; } :host([dark]) .mname { color: #a1a1aa; }
.dot { width: 6px; height: 6px; border-radius: 99px; background: var(--c); flex: none; } :host([dark]) .dot { background: var(--cd); }
.mval { margin: 2px 0 0; font-size: clamp(17px, 10cqw, 24px); font-weight: 600; letter-spacing: -.025em; font-variant-numeric: tabular-nums; }
.mshare, .mchg { margin: 2px 0 0; font-size: 12px; color: #71717a; font-variant-numeric: tabular-nums; } :host([dark]) .mshare { color: #a1a1aa; }
.mchg.up { color: #e11d48; } :host([dark]) .mchg.up { color: #fb7185; }
.mchg.down { color: #059669; } :host([dark]) .mchg.down { color: #34d399; }
.mchg.same { color: #a1a1aa; } :host([dark]) .mchg.same { color: #71717a; }
ul { list-style: none; margin: 16px 0 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
@container koko (max-width: 260px) { ul { grid-template-columns: 1fr; } .k-card { padding: 14px; } }
li button { display: flex; width: 100%; align-items: center; gap: 8px; border-radius: 8px; padding: 6px 8px; text-align: left; font-size: 12px; border: 0; background: none; cursor: pointer; color: #71717a; transition: background-color .15s ease-out, color .15s ease-out; }
:host([dark]) li button { color: #a1a1aa; }
li button:hover { background: #fafafa; color: #18181b; } :host([dark]) li button:hover { background: rgb(24 24 27/.6); color: #f4f4f5; }
li button[aria-pressed=true] { background: #f4f4f5; color: var(--k-fg); } :host([dark]) li button[aria-pressed=true] { background: #18181b; }
li .dot { width: 8px; height: 8px; }
li .n { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
li .a { font-variant-numeric: tabular-nums; }
`
  }

  render() {
    return `<div class="k-card">
      <div class="top"><p class="title"></p><p class="total"></p></div>
      <div class="ring" role="slider" tabindex="0" aria-valuemin="1">
        <svg viewBox="0 0 ${SIZE} ${SIZE}" aria-hidden="true"><g class="rot"></g><path class="marker" d="M${C - 5} 2 L${C + 5} 2 L${C} 8 Z"/></svg>
        <div class="mid"></div>
      </div>
      <ul></ul>
    </div>`
  }

  build() {
    this.ringEl = this.$('.ring'); this.rot = this.$('.rot'); this.mid = this.$('.mid'); this.list = this.$('ul')
    this.sim = { a: 0, v: 0, target: 0, raf: 0, last: 0, coast: false, drag: null }
    this.selected = 0
    this.periodVals = {}; this.prevVals = {}
    const r = this.ringEl
    r.addEventListener('pointerdown', (e) => this.down(e))
    r.addEventListener('pointermove', (e) => this.move(e))
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) r.addEventListener(ev, (e) => this.release(e))
    r.addEventListener('keydown', (e) => this.key(e))
    this.list.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) this.turnTo(Number(b.dataset.i)) })
  }

  categories() {
    return this.specs().map((spec, i) => {
      const s = this.hass.states[spec.entity]
      const colorName = spec.color && COLORS[spec.color] ? spec.color : ORDER[i % ORDER.length]
      const [c, cd] = spec.color && !COLORS[spec.color] ? [spec.color, spec.color] : COLORS[colorName]
      const usesStats = this.usesStats(s)
      const amount = usesStats && this.periodVals[spec.entity] != null ? this.periodVals[spec.entity] : Number(s ? s.state : 0)
      const prev = this.prevVals[spec.entity]
      const change = prev ? ((amount - prev) / prev) * 100 : null
      return { name: spec.name || (s ? friendlyName(s) : spec.entity), amount: Number.isFinite(amount) ? Math.max(0, amount) : 0, change, c, cd,
        unit: this.config.unit || (s && s.attributes.unit_of_measurement) || '', entity: spec.entity }
    })
  }

  usesStats(s) { return !!s && s.attributes.state_class === 'total_increasing' && this.config.value !== 'state' }

  fmt(v, whole) {
    const c = this.config
    if (c.price != null) {
      const money = v * Number(c.price)
      // The legend rounds to whole units, but only once cents stop mattering.
      const digits = whole && money >= 100 ? 0 : 2
      return formatNumber(this.hass, money, { style: 'currency', currency: c.currency || 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits })
    }
    const unit = this.cats && this.cats[0] ? this.cats[0].unit : ''
    return `${formatNumber(this.hass, v, { maximumFractionDigits: whole ? 1 : 2, minimumFractionDigits: whole ? 0 : 2 })}${unit ? ` ${unit}` : ''}`
  }

  layout() {
    const cats = this.cats
    const total = cats.reduce((s, c) => s + c.amount, 0)
    this.total = total
    let at = 0
    this.spans = cats.map((c) => { const sweep = total ? (c.amount / total) * 360 : 360 / cats.length; const sp = { from: at, to: at + sweep, mid: at + sweep / 2 }; at += sweep; return sp })
    this.rot.innerHTML = this.spans.map((sp, i) => {
      const gap = Math.min(GAP / 2, (sp.to - sp.from) / 4)
      return `<path class="seg" data-i="${i}" style="--c:${cats[i].c};--cd:${cats[i].cd}" d="${arc(sp.from + gap, Math.max(sp.from + gap + 0.01, sp.to - gap))}" stroke-width="${STROKE}"/>`
    }).join('')
    this.list.innerHTML = cats.map((c, i) => `<li><button type="button" data-i="${i}" style="--c:${c.c};--cd:${c.cd}"><span class="dot" aria-hidden="true"></span><span class="n">${escapeHtml(c.name)}</span><span class="a">${escapeHtml(this.fmt(c.amount, true))}</span></button></li>`).join('')
    this.ringEl.setAttribute('aria-valuemax', cats.length)
    this.$('.total').textContent = this.fmt(total)
    // Keep the same slice under the marker.
    const idx = Math.max(0, Math.min(this.selected, cats.length - 1))
    const goal = -(this.spans[idx] ? this.spans[idx].mid : 0)
    if (!this.sim.drag && !this.sim.raf) { this.sim.a = goal; this.sim.target = goal; this.sim.v = 0; this.paint() }
    this.select(idx, true)
  }

  paint() { this.rot.setAttribute('transform', `rotate(${this.sim.a.toFixed(3)} ${C} ${C})`) }

  select(i, force) {
    if (i === this.selected && !force) return
    this.selected = i
    this.$$('.seg').forEach((p, j) => { p.classList.toggle('off', j !== i); p.setAttribute('stroke-width', j === i ? STROKE + 8 : STROKE) })
    this.$$('li button').forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)))
    const c = this.cats[i]
    if (!c) { this.mid.innerHTML = ''; return }
    const share = this.total ? (c.amount / this.total) * 100 : 0
    const ch = c.change
    const chText = ch == null ? '' : Math.abs(ch) < 0.05 ? `Same as ${this.prevLabel()}` : `${ch > 0 ? '▲' : '▼'} ${Math.abs(ch).toFixed(1)}% vs ${this.prevLabel()}`
    const chCls = ch == null ? '' : Math.abs(ch) < 0.05 ? 'same' : ch > 0 ? 'up' : 'down'
    this.mid.innerHTML = `<div style="--c:${c.c};--cd:${c.cd}"><p class="mname"><span class="dot"></span>${escapeHtml(c.name)}</p><p class="mval">${escapeHtml(this.fmt(c.amount))}</p><p class="mshare">${share.toFixed(0)}% of total</p>${chText ? `<p class="mchg ${chCls}">${chText}</p>` : ''}</div>`
    this.ringEl.setAttribute('aria-valuenow', i + 1)
    this.ringEl.setAttribute('aria-valuetext', `${c.name}, ${this.fmt(c.amount)}`)
  }

  prevLabel() { return { day: 'yesterday', week: 'last week', month: 'last month' }[this.config.period] || 'before' }

  track() { const i = sliceAt(this.spans, -this.sim.a); if (i !== this.selected) this.select(i) }

  tick = (now) => {
    const s = this.sim
    s.raf = 0
    if (s.drag) return
    const dt = s.last ? Math.min((now - s.last) / 1000, 1 / 30) : 1 / 60
    s.last = now
    const st = { a: s.a, v: s.v }
    const done = springStep(st, s.target, dt)
    s.a = done ? s.target : st.a; s.v = done ? 0 : st.v
    this.paint()
    if (s.coast) this.track()
    if (done) { s.last = 0; s.coast = false } else s.raf = requestAnimationFrame(this.tick)
  }

  turnTo(i, rest = this.sim.a, coast = false) {
    const s = this.sim
    const goal = -(this.spans[i] ? this.spans[i].mid : 0)
    s.target = rest + wrap(goal - rest)
    s.coast = coast
    if (!coast) this.select(i)
    if (reducedMotion()) { s.a = s.target; s.v = 0; s.coast = false; this.paint(); this.track(); return }
    if (!s.raf) { s.last = 0; s.raf = requestAnimationFrame(this.tick) }
  }

  angleOf(e) { const r = this.ringEl.getBoundingClientRect(); return (Math.atan2(e.clientX - r.left - r.width / 2, -(e.clientY - r.top - r.height / 2)) * 180) / Math.PI }

  down(e) {
    const s = this.sim
    if (s.drag || (e.pointerType === 'mouse' && e.button !== 0)) return
    this.ringEl.setPointerCapture(e.pointerId)
    cancelAnimationFrame(s.raf); s.raf = 0; s.v = 0
    s.drag = { id: e.pointerId, angle: this.angleOf(e), time: e.timeStamp, moved: 0, x: e.clientX, y: e.clientY }
  }

  move(e) {
    const s = this.sim, d = s.drag
    if (!d || d.id !== e.pointerId) return
    d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.x, e.clientY - d.y))
    if (d.moved < TAP_SLOP) return
    const angle = this.angleOf(e), delta = wrap(angle - d.angle)
    const dt = Math.max((e.timeStamp - d.time) / 1000, 1 / 240)
    s.a += delta
    s.v = s.v * 0.6 + (delta / dt) * 0.4
    d.angle = angle; d.time = e.timeStamp
    this.ringEl.toggleAttribute('data-dragging', true)
    this.paint(); this.track()
  }

  release(e) {
    const s = this.sim, d = s.drag
    if (!d || d.id !== e.pointerId) return
    s.drag = null
    this.ringEl.toggleAttribute('data-dragging', false)
    if (d.moved < TAP_SLOP) {
      const rect = this.ringEl.getBoundingClientRect()
      const r = Math.hypot(e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2)
      if (r > ((R - STROKE) / SIZE) * rect.width) this.turnTo(sliceAt(this.spans, this.angleOf(e) - s.a))
      return
    }
    if (e.timeStamp - d.time > 80) s.v = 0
    s.v = Math.max(-1440, Math.min(1440, s.v))
    const rest = s.a + s.v * PROJECT
    this.turnTo(sliceAt(this.spans, -rest), rest, true)
  }

  key(e) {
    const n = this.cats.length
    if (!n) return
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
    let next = null
    if (e.key in step) next = (this.selected + step[e.key] + n) % n
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    if (next !== null) { e.preventDefault(); this.turnTo(next) }
  }

  async loadStats() {
    const ids = this.specs().map((s) => s.entity).filter((id) => this.usesStats(this.hass.states[id]))
    if (!ids.length) return
    const p = this.config.period
    const start = periodStart(p, 1)
    const stats = await fetchStatistics(this.hass, ids, start, new Date(), 'hour', ['change'])
    const cut = periodStart(p, 0).getTime()
    for (const id of ids) {
      const rows = stats[id] || []
      this.periodVals[id] = rows.filter((r) => r.t >= cut).reduce((s, r) => s + (r.change || 0), 0)
      this.prevVals[id] = rows.filter((r) => r.t < cut).reduce((s, r) => s + (r.change || 0), 0)
    }
    this._statsAt = Date.now()
    this.refresh()
  }

  refresh() {
    this.cats = this.categories()
    const key = this.cats.map((c) => `${c.name}:${c.amount.toFixed(3)}:${c.change}`).join('|')
    if (key === this._key) return
    this._key = key
    this.layout()
  }

  update() {
    this.$('.title').textContent = this.config.title || this.config.name || 'Breakdown'
    this.refresh()
    // Statistics refresh at most every 5 minutes (hourly buckets anyway).
    if (!this._statsAt || Date.now() - this._statsAt > 300000) { this._statsAt = Date.now(); this.loadStats() }
  }

  disconnected() { cancelAnimationFrame(this.sim.raf); this.sim.raf = 0 }
  getCardSize() { return 7 }
  getGridOptions() { return { columns: 6, rows: 'auto', min_columns: 4 } }
}

register(SpendingRing)
