/**
 * Kokonut Metric Card → Lovelace (long-term statistics).
 * A headline number with its change vs the previous period, a smoothed line
 * for this period over a dashed line for the last one, and a breakdown by
 * segment. Scrub to read a day (pinned days snap the cursor), drag to read a
 * range, switch periods and the lines morph; pick a segment to chart it alone.
 *
 *   type: custom:kokonut-metric-card
 *   name: Energy
 *   segments:                       # one or more sensors with statistics
 *     - entity: sensor.ac_energy
 *       name: AC
 *     - sensor.fridge_energy
 *   periods: [7, 30, 90]
 *   default_period: 30
 *   aggregate: auto | sum | mean    # auto: sum for meters, mean for measurements
 *   price: 0.27                     # optional cost per unit
 *   currency: EUR
 *   higher_is_better: false         # colours the change (energy: lower is good)
 *   events:                         # notes pinned on the chart
 *     - { date: 2026-10-20, label: New AC }
 */
import { KokoCard, register, clamp, friendlyName, fetchStatistics, formatNumber, escapeHtml, reducedMotion, rollDigits, ROLL_CSS, localDay, dayKey } from './core.js'

const W = 400, H = 120, PAD_Y = 10, SAMPLES = 90, MORPH_MS = 420, SNAP_PX = 6
const SWATCH_L = ['#18181b', '#a1a1aa', '#e4e4e7', '#d4d4d8'], SWATCH_D = ['#f4f4f5', '#71717a', '#3f3f46', '#52525b']
const sum = (v) => v.reduce((s, x) => s + x, 0)
const mean = (v) => (v.length ? sum(v) / v.length : 0)
let uid = 0

function resample(values, count) {
  if (!values.length) return new Array(count).fill(0)
  const out = new Array(count)
  for (let i = 0; i < count; i++) {
    const at = (i / (count - 1)) * (values.length - 1)
    const lo = Math.floor(at), hi = Math.min(values.length - 1, lo + 1)
    out[i] = values[lo] + (values[hi] - values[lo]) * (at - lo)
  }
  return out
}
const yOf = (h) => PAD_Y + (1 - h) * (H - PAD_Y * 2)
function toPath(heights) {
  if (!heights.length) return ''
  const pts = heights.map((h, i) => [(i / Math.max(1, heights.length - 1)) * W, yOf(h)])
  let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2
    d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(2)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(2)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(2)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`
  }
  return d
}
const toArea = (line) => `${line}L${W} ${H}L0 ${H}Z`
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

class MetricCard extends KokoCard {
  static tag = 'kokonut-metric-card'
  static cardName = 'Kokonut Metric Card'
  static description = 'Statistics card: period total vs previous period, scrubbable chart and breakdown.'
  static defaults() { return { periods: [7, 30, 90], default_period: 30, aggregate: 'auto', higher_is_better: false, events: [] } }
  static getStubConfig(hass) {
    const e = Object.keys(hass.states).filter((x) => hass.states[x].attributes.state_class === 'total_increasing').slice(0, 3)
    return { name: 'Energy', segments: e.length ? e : ['sensor.example_energy'] }
  }
  validate(c) {
    if (!c.segments && !c.entity) throw new Error('kokonut-metric-card: set "entity" or "segments"')
  }
  watched() { return [] } // statistics refresh on a timer, not on every state change
  segs() { return (this.config.segments || [this.config.entity]).map((s) => (typeof s === 'string' ? { entity: s } : s)) }

  css() {
    return ROLL_CSS + `
.k-card { padding: 20px; user-select: none; -webkit-user-select: none; }
.top { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.label { margin: 0; font-size: 14px; color: #71717a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; } :host([dark]) .label { color: #a1a1aa; }
.label b { font-weight: 400; color: var(--k-fg); }
.seg { position: relative; display: flex; flex: none; border-radius: 999px; background: #f4f4f5; padding: 2px; font-size: 12px; } :host([dark]) .seg { background: #18181b; }
.pill { position: absolute; top: 2px; bottom: 2px; left: 2px; width: 40px; border-radius: 999px; background: #fff; box-shadow: 0 1px 2px rgb(0 0 0/.05); transition: transform .2s cubic-bezier(.23,1,.32,1); } :host([dark]) .pill { background: #3f3f46; }
.seg button { position: relative; width: 40px; border-radius: 999px; padding: 4px 0; border: 0; background: none; cursor: pointer; font-weight: 500; font-variant-numeric: tabular-nums; color: #71717a; transition: color .2s ease-out; }
:host([dark]) .seg button { color: #a1a1aa; }
.seg button[aria-pressed=true], .seg button:hover { color: var(--k-fg); }
.big { margin: 12px 0 0; font-size: clamp(26px, 11cqw, 36px); font-weight: 600; letter-spacing: -.025em; line-height: 1.1; }
.big .rolls { display: inline-flex; font-variant-numeric: tabular-nums; }
.sub { margin-top: 6px; display: flex; min-height: 20px; align-items: center; gap: 8px; font-size: 14px; font-variant-numeric: tabular-nums; }
.chg { flex: none; font-weight: 500; }
.chg.good { color: #059669; } :host([dark]) .chg.good { color: #34d399; }
.chg.bad { color: #e11d48; } :host([dark]) .chg.bad { color: #fb7185; }
.cap { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #71717a; min-width: 0; } :host([dark]) .cap { color: #a1a1aa; }
.cap .ev { color: #ea580c; } :host([dark]) .cap .ev { color: #fb923c; }
.clear { margin-left: auto; flex: none; border-radius: 999px; padding: 2px 8px; font-size: 12px; border: 0; background: none; cursor: pointer; color: #71717a; }
.clear:hover { background: #f4f4f5; color: #18181b; } :host([dark]) .clear:hover { background: #18181b; color: #f4f4f5; }
.chart { position: relative; margin-top: 20px; height: 128px; cursor: crosshair; touch-action: pan-y; border-radius: 8px; outline: none; }
.chart:focus-visible { box-shadow: 0 0 0 4px var(--k-bg), 0 0 0 6px #a1a1aa; }
.chart svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.base { stroke: #e4e4e7; } :host([dark]) .base { stroke: #27272a; }
.prev { fill: none; stroke: #d4d4d8; } :host([dark]) .prev { stroke: #3f3f46; }
.area { fill: rgb(24 24 27/.05); } :host([dark]) .area { fill: rgb(244 244 245/.06); }
.dim { fill: none; stroke: rgb(24 24 27/.25); } :host([dark]) .dim { stroke: rgb(244 244 245/.25); }
.cur { fill: none; stroke: #18181b; } :host([dark]) .cur { stroke: #f4f4f5; }
.mk { pointer-events: none; position: absolute; top: 0; bottom: 0; width: 1px; transform: translateX(-50%); }
.mk.ev::before { content: ''; position: absolute; top: 0; bottom: 0; left: 0; border-left: 1px dashed rgb(249 115 22/.3); }
.mk.ev::after { content: ''; position: absolute; bottom: 0; left: 50%; width: 6px; height: 6px; border-radius: 99px; transform: translate(-50%, 50%); background: #f97316; box-shadow: 0 0 0 2px var(--k-bg); }
.mk.line { background: #e4e4e7; } :host([dark]) .mk.line { background: #27272a; }
.mk.rng { background: #d4d4d8; } :host([dark]) .mk.rng { background: #3f3f46; }
.dot { pointer-events: none; position: absolute; border-radius: 99px; transform: translate(-50%, -50%); }
.dot.now { width: 10px; height: 10px; background: #18181b; box-shadow: 0 0 0 4px var(--k-bg); } :host([dark]) .dot.now { background: #f4f4f5; }
.dot.twin { width: 8px; height: 8px; border: 1px solid #d4d4d8; background: var(--k-bg); } :host([dark]) .dot.twin { border-color: #52525b; }
.dot.end { right: 0; left: auto; width: 8px; height: 8px; transform: translate(50%, -50%); background: #18181b; box-shadow: 0 0 0 4px var(--k-bg); transition: top .42s cubic-bezier(.65,0,.35,1), opacity .2s; } :host([dark]) .dot.end { background: #f4f4f5; }
.axis { margin-top: 8px; display: flex; justify-content: space-between; font-size: 12px; color: #a1a1aa; font-variant-numeric: tabular-nums; } :host([dark]) .axis { color: #71717a; }
.axis .lg { display: flex; align-items: center; gap: 6px; }
.axis .lg i { width: 12px; border-top: 1px dashed #d4d4d8; } :host([dark]) .axis .lg i { border-color: #3f3f46; }
.bd { margin-top: 16px; border-top: 1px solid #f4f4f5; padding-top: 16px; } :host([dark]) .bd { border-color: #18181b; }
.bar { display: flex; height: 6px; gap: 2px; }
.bar span { min-width: 0; border-radius: 999px; transition: flex-grow .3s cubic-bezier(.23,1,.32,1), opacity .3s; }
.bd ul { list-style: none; margin: 10px -8px 0; padding: 0; }
.bd button { display: flex; width: 100%; align-items: center; gap: 10px; border-radius: 8px; padding: 6px 8px; text-align: left; font-size: 14px; border: 0; background: none; cursor: pointer; transition: background-color .15s ease-out, opacity .15s ease-out; color: var(--k-fg); }
.bd button:hover { background: #fafafa; } :host([dark]) .bd button:hover { background: #18181b; }
.bd button[aria-pressed=true] { background: #f4f4f5; } :host([dark]) .bd button[aria-pressed=true] { background: #18181b; }
.bd button.fade { opacity: .5; }
.sw { width: 8px; height: 8px; border-radius: 99px; flex: none; }
.bn { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #52525b; } :host([dark]) .bn { color: #d4d4d8; }
.bv { font-weight: 500; font-variant-numeric: tabular-nums; }
.bp { width: 40px; text-align: right; color: #a1a1aa; font-variant-numeric: tabular-nums; } :host([dark]) .bp { color: #71717a; }
.loading { padding: 40px 0; text-align: center; color: var(--k-fg-3); font-size: 13px; }
@container koko (max-width: 300px) { .k-card { padding: 14px; } .bp { display: none; } .axis .lg { display: none; } }
`
  }

  render() {
    const id = `kmc-${++uid}`
    this.clipId = id
    return `<div class="k-card">
      <div class="top"><p class="label"></p><div class="seg"><span class="pill" aria-hidden="true"></span></div></div>
      <p class="big"><span class="sr"></span><span class="rolls" aria-hidden="true"></span></p>
      <div class="sub"><span class="chg"></span><span class="cap" aria-live="polite"></span></div>
      <div class="chart" role="slider" tabindex="0" aria-valuemin="1">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
          <defs><clipPath id="${id}"><rect y="-10" height="${H + 20}" x="0" width="${W}"/></clipPath></defs>
          <line class="base" vector-effect="non-scaling-stroke" x1="0" x2="${W}" y1="${H - 0.5}" y2="${H - 0.5}"/>
          <path class="prev" stroke-dasharray="3 4" stroke-width="1.25" vector-effect="non-scaling-stroke"/>
          <path class="area" clip-path="url(#${id})"/>
          <path class="dim" stroke-linecap="round" stroke-width="2" vector-effect="non-scaling-stroke"/>
          <path class="cur" clip-path="url(#${id})" stroke-linecap="round" stroke-width="2" vector-effect="non-scaling-stroke"/>
        </svg>
        <div class="marks"></div>
        <span class="dot end" aria-hidden="true"></span>
      </div>
      <div class="axis"><span class="a0"></span><span class="lg"><i></i>Previous period</span><span class="a1"></span></div>
      <div class="bd"><div class="bar" aria-hidden="true"></div><ul></ul></div>
    </div>`
  }

  build() {
    this.period = this.config.default_period
    this.focus = null; this.cursor = null; this.range = null; this.drag = null
    this.points = null
    this.shown = null
    this.morphRaf = 0
    const segBox = this.$('.seg')
    segBox.insertAdjacentHTML('beforeend', this.config.periods.map((d) => `<button type="button" data-d="${d}">${d}D</button>`).join(''))
    segBox.addEventListener('click', (e) => { const b = e.target.closest('button[data-d]'); if (b) { this.clearRead(); this.period = Number(b.dataset.d); this.recompute(true) } })
    this.$('.bd ul').addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) { const i = Number(b.dataset.i); this.focus = this.focus === i ? null : i; this.recompute(true) } })
    this.$('.sub').addEventListener('click', (e) => { if (e.target.closest('.clear')) this.clearRead() })
    const ch = this.$('.chart')
    ch.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      ch.setPointerCapture(e.pointerId)
      const at = this.indexAt(e.clientX)
      this.drag = at; this.range = null; this.cursor = at; this.read()
    })
    ch.addEventListener('pointermove', (e) => {
      if (!this.info) return
      const at = this.indexAt(e.clientX)
      if (this.drag !== null) { const a = this.drag; if (this.range || at !== a) this.range = { a, b: at }; this.cursor = at; this.read() }
      else if (e.pointerType === 'mouse' && !this.range) { this.cursor = at; this.read() }
    })
    const release = (e) => { this.drag = null; if (e.pointerType !== 'mouse') { this.cursor = null; this.read() } }
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) ch.addEventListener(ev, release)
    ch.addEventListener('pointerleave', () => { if (this.drag === null && !this.range) { this.cursor = null; this.read() } })
    ch.addEventListener('blur', () => { this.cursor = null; this.read() })
    ch.addEventListener('keydown', (e) => this.key(e))
  }

  aggMode() {
    if (this.config.aggregate !== 'auto') return this.config.aggregate
    const s = this.hass && this.hass.states[this.segs()[0].entity]
    return s && s.attributes.state_class === 'measurement' ? 'mean' : 'sum'
  }
  agg(values) { return this.aggMode() === 'mean' ? mean(values) : sum(values) }

  async load() {
    const ids = this.segs().map((s) => s.entity)
    const days = Math.max(...this.config.periods) * 2
    const start = localDay(-(days - 1))
    const stats = await fetchStatistics(this.hass, ids, start, new Date(), 'day', ['change', 'mean'])
    const mode = this.aggMode()
    const byDay = new Map()
    for (let i = 0; i < days; i++) byDay.set(dayKey(localDay(i, start)), new Array(ids.length).fill(0))
    ids.forEach((id, j) => {
      for (const r of stats[id] || []) {
        const k = dayKey(r.t)
        if (!byDay.has(k)) continue
        byDay.get(k)[j] = Number(mode === 'mean' ? r.mean ?? 0 : r.change ?? 0) || 0
      }
    })
    this.points = [...byDay.entries()].map(([date, parts]) => ({ date, parts }))
    this.loadedAt = Date.now()
    this.recompute(false)
  }

  buildPeriod() {
    const days = this.period, data = this.points
    const current = data.slice(-days), previous = data.slice(-days * 2, -days)
    const pick = (p) => (this.focus === null ? (this.aggMode() === 'mean' ? mean(p.parts) : sum(p.parts)) : p.parts[this.focus] || 0)
    const now = current.map(pick), before = previous.map(pick)
    const all = [...now, ...before]
    const lo = Math.min(...all) * 0.85, hi = Math.max(...all) * 1.04
    const norm = (v) => (v - lo) / (hi - lo || 1)
    return { current, previous, now, before, norm,
      shape: { current: resample(now.map(norm), SAMPLES), previous: resample(before.map(norm), SAMPLES) },
      paths: { current: toPath(now.map(norm)), previous: toPath(before.map(norm)) } }
  }

  paintPaths(p) {
    this.$('.cur').setAttribute('d', p.current); this.$('.dim').setAttribute('d', p.current)
    this.$('.area').setAttribute('d', toArea(p.current)); this.$('.prev').setAttribute('d', p.previous)
  }

  recompute(animate) {
    if (!this.points) return
    const info = this.buildPeriod()
    this.info = info
    const from = this.shown, to = info.shape
    cancelAnimationFrame(this.morphRaf)
    const land = () => { this.shown = to; this.paintPaths(info.paths) }
    if (!from || !animate || reducedMotion()) land()
    else {
      const start = performance.now()
      const frame = (now) => {
        const t = easeInOut(Math.min(1, (now - start) / MORPH_MS))
        const mix = (a, b) => a.map((v, i) => v + (b[i] - v) * t)
        this.shown = { current: mix(from.current, to.current), previous: mix(from.previous, to.previous) }
        if (t < 1) { this.paintPaths({ current: toPath(this.shown.current), previous: toPath(this.shown.previous) }); this.morphRaf = requestAnimationFrame(frame) } else land()
      }
      this.morphRaf = requestAnimationFrame(frame)
    }
    const idx = Math.max(0, this.config.periods.indexOf(this.period))
    this.$('.pill').style.transform = `translateX(${idx * 100}%)`
    this.$$('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.d) === this.period)))
    const last = info.current.length - 1
    const endY = info.now.length ? yOf(info.norm(info.now[last])) : 0
    this.$('.dot.end').style.top = `${(endY / H) * 100}%`
    const fmtShort = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(this.lang(), { month: 'short', day: 'numeric' })
    this.$('.a0').textContent = info.current[0] ? fmtShort(info.current[0].date) : ''
    this.$('.a1').textContent = info.current[last] ? fmtShort(info.current[last].date) : ''
    this.read()
  }

  lang() { return (this.hass && this.hass.locale && this.hass.locale.language) || undefined }

  fmt(v) {
    const c = this.config
    if (c.price != null) return formatNumber(this.hass, v * Number(c.price), { style: 'currency', currency: c.currency || 'EUR', maximumFractionDigits: v * Number(c.price) >= 100 ? 0 : 2 })
    const s = this.hass.states[this.segs()[0].entity]
    const unit = c.unit || (s && s.attributes.unit_of_measurement) || ''
    const digits = Math.abs(v) >= 100 ? 0 : 1
    return `${formatNumber(this.hass, v, { maximumFractionDigits: digits, minimumFractionDigits: digits })}${unit ? ` ${unit}` : ''}`
  }

  indexAt(clientX) {
    const rect = this.$('.chart').getBoundingClientRect()
    const last = this.info.current.length - 1
    const t = clamp((clientX - rect.left) / rect.width, 0, 1)
    const near = this.pinned().find((e) => Math.abs((e.at / (last || 1) - t) * rect.width) < SNAP_PX)
    return near ? near.at : Math.round(t * last)
  }

  pinned() { return (this.config.events || []).map((e) => ({ ...e, date: String(e.date), at: this.info.current.findIndex((p) => p.date === String(e.date)) })).filter((e) => e.at >= 0) }

  clearRead() { this.range = null; this.cursor = null; this.read() }

  key(e) {
    if (!this.info) return
    if (e.key === 'Escape') { this.clearRead(); return }
    const last = this.info.current.length - 1
    const move = { ArrowLeft: -1, ArrowRight: 1, Home: -last, End: last }[e.key]
    if (move === undefined) return
    e.preventDefault()
    const from = this.range ? this.range.b : this.cursor ?? last
    const to = clamp(from + move, 0, last)
    this.range = e.shiftKey ? { a: this.range ? this.range.a : from, b: to } : null
    this.cursor = to
    this.read()
  }

  read() {
    const info = this.info
    if (!info) return
    const last = info.current.length - 1
    let span = null, ranged = false
    if (this.range && this.range.a !== this.range.b) { span = { lo: Math.min(this.range.a, this.range.b), hi: Math.max(this.range.a, this.range.b) }; ranged = true }
    else if (this.cursor !== null && this.cursor <= last) span = { lo: this.cursor, hi: this.cursor }
    const slice = (v) => (span ? v.slice(span.lo, span.hi + 1) : v)
    const day = span && !ranged ? info.current[span.lo] : null
    const twin = span && !ranged ? info.previous[span.lo] : null
    const value = this.agg(slice(info.now)), compare = this.agg(slice(info.before))
    const delta = compare ? (value - compare) / compare : 0
    const ev = day ? (this.config.events || []).find((e) => String(e.date) === day.date) : null
    const fmtDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(this.lang(), { weekday: 'short', month: 'short', day: 'numeric' })
    const fmtShort = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(this.lang(), { month: 'short', day: 'numeric' })
    let caption = `vs previous ${this.period} days`
    if (ranged) caption = `${fmtShort(info.current[span.lo].date)} – ${fmtShort(info.current[span.hi].date)} vs prior ${span.hi - span.lo + 1} days`
    else if (day) caption = `${fmtDay(day.date)} vs ${fmtShort(twin ? twin.date : day.date)}`
    const formatted = this.fmt(value)
    this.$('.sr').textContent = formatted
    rollDigits(this.$('.rolls'), formatted)
    const up = delta >= 0
    const good = this.config.higher_is_better ? up : !up
    const chg = this.$('.chg')
    chg.className = `chg ${Math.abs(delta) < 0.0005 ? '' : good ? 'good' : 'bad'}`
    chg.textContent = `${up ? '▲' : '▼'} ${Math.abs(delta * 100).toFixed(1)}%`
    this.$('.cap').innerHTML = `${escapeHtml(caption)}${ev ? `<span class="ev"> · ${escapeHtml(ev.label)}</span>` : ''}`
    const clear = this.$('.sub .clear')
    if (ranged && !clear) this.$('.sub').insertAdjacentHTML('beforeend', '<button class="clear" type="button">Clear</button>')
    if (!ranged && clear) clear.remove()

    // Lit part of the line.
    const xOf = (i) => (last ? (i / last) * W : W)
    const pct = (i) => (xOf(i) / W) * 100
    const litFrom = ranged ? xOf(span.lo) : 0, litTo = span ? xOf(span.hi) : W
    const rect = this.$(`#${this.clipId} rect`)
    rect.setAttribute('x', litFrom); rect.setAttribute('width', Math.max(0, litTo - litFrom))
    // Marks: events, range edges, cursor and its dots.
    let m = this.pinned().map((e) => `<div class="mk ev" style="left:${pct(e.at)}%"></div>`).join('')
    if (ranged) m += [span.lo, span.hi].map((i) => `<div class="mk rng" style="left:${pct(i)}%"></div>`).join('')
    if (day) {
      m += `<div class="mk line" style="left:${pct(span.lo)}%"></div>`
      if (twin) m += `<span class="dot twin" style="left:${pct(span.lo)}%;top:${(yOf(info.norm(info.before[span.lo])) / H) * 100}%"></span>`
      m += `<span class="dot now" style="left:${pct(span.lo)}%;top:${(yOf(info.norm(info.now[span.lo])) / H) * 100}%"></span>`
    }
    this.$('.marks').innerHTML = m
    this.$('.dot.end').style.opacity = span ? '0' : '1'
    const chart = this.$('.chart')
    chart.setAttribute('aria-valuemax', info.current.length)
    chart.setAttribute('aria-valuenow', span ? span.hi + 1 : info.current.length)
    chart.setAttribute('aria-valuetext', ranged ? `${caption}: ${formatted}` : day ? `${fmtDay(day.date)}: ${formatted}` : `${formatted} in total`)
    chart.setAttribute('aria-label', `${this.title()} over the last ${this.period} days. Arrow keys read each day; hold Shift to select a range.`)
    this.renderBreakdown(span)
  }

  title() { return this.config.name || friendlyName(this.hass.states[this.segs()[0].entity], 'Metric') }

  renderBreakdown(span) {
    const segs = this.segs()
    const days = span ? this.info.current.slice(span.lo, span.hi + 1) : this.info.current
    const parts = segs.map((_, i) => this.agg(days.map((p) => p.parts[i] || 0)))
    const total = sum(parts)
    const dark = this.hasAttribute('dark')
    const sw = (i) => (dark ? SWATCH_D : SWATCH_L)[this.focus === i ? 0 : i % 4]
    const label = this.$('.label')
    label.innerHTML = `${escapeHtml(this.title())}${this.focus !== null ? ` <b>· ${escapeHtml(this.segName(this.focus))}</b>` : ''}`
    this.$('.bd').hidden = segs.length < 2
    this.$('.bar').innerHTML = segs.map((_, i) => `<span style="flex-grow:${parts[i] || 0};background:${sw(i)};${this.focus !== null && this.focus !== i ? 'opacity:.25' : ''}"></span>`).join('')
    this.$('.bd ul').innerHTML = segs.map((_, i) => `<li><button type="button" data-i="${i}" aria-pressed="${this.focus === i}" class="${this.focus !== null && this.focus !== i ? 'fade' : ''}" aria-label="${this.focus === i ? `Show all of ${escapeHtml(this.title())}` : `Show only ${escapeHtml(this.segName(i))}`}"><span class="sw" style="background:${sw(i)}"></span><span class="bn">${escapeHtml(this.segName(i))}</span><span class="bv">${escapeHtml(this.fmt(parts[i] || 0))}</span><span class="bp">${(total ? (parts[i] / total) * 100 : 0).toFixed(0)}%</span></button></li>`).join('')
  }

  segName(i) { const s = this.segs()[i]; return s.name || friendlyName(this.hass.states[s.entity], s.entity) }

  update() {
    if (!this.points && !this._loading) {
      this._loading = true
      this.$('.cap').textContent = 'Loading statistics…'
      this.load().finally(() => { this._loading = false })
    }
  }

  hassChanged() {
    // Statistics are compiled every 5 minutes; refresh at that pace.
    if (this.loadedAt && Date.now() - this.loadedAt > 300000 && !this._loading) { this._loading = true; this.load().finally(() => { this._loading = false }) }
  }

  disconnected() { cancelAnimationFrame(this.morphRaf) }
  getCardSize() { return 8 }
  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 } }
}

register(MetricCard)
