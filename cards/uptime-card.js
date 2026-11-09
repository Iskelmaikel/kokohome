/**
 * Kokonut Uptime Card → Lovelace (from state history).
 * One row of daily bars per entity — green, amber (brief outage) or red
 * (outage) — that swell like a dock under the pointer. Pin a day to open its
 * outage log.
 *
 *   type: custom:kokonut-uptime-card
 *   title: Network & devices
 *   days: 10                          # HA's recorder keeps 10 days by default
 *   down_after: 30                    # minutes offline before a day is red
 *   entities:
 *     - entity: binary_sensor.internet   # connectivity: off = down
 *       name: Internet
 *     - entity: media_player.living_room_lg_tv
 *       down_states: [unavailable]       # override what counts as down
 */
import { KokoCard, register, clamp, friendlyName, fetchHistory, escapeHtml, lucide, reducedMotion, domainOf, localDay } from './core.js'

const MAGNIFY = 5, SPREAD = 2.4, EASE = 18
const STATUS_TEXT = { up: 'Operational', degraded: 'Degraded', down: 'Outage', none: 'No data' }

function swell(count, focus, out) {
  for (let i = 0; i < count; i++) out[i] = focus === null ? 1 : 1 + MAGNIFY * Math.exp(-(((i - focus) / SPREAD) ** 2))
  return out
}
function barAt(weights, x) {
  let total = 0
  for (const w of weights) total += w
  let at = x * total
  for (let i = 0; i < weights.length; i++) { at -= weights[i]; if (at <= 0) return i }
  return weights.length - 1
}
const hhmm = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

/** Which states count as "down" for an entity. */
function downStates(spec, stateObj) {
  if (spec.down_states) return new Set(spec.down_states)
  const base = ['unavailable', 'unknown']
  if (!stateObj) return new Set(base)
  const d = domainOf(stateObj.entity_id), dc = stateObj.attributes.device_class
  if (d === 'binary_sensor' && dc === 'connectivity') return new Set([...base, 'off'])
  if (d === 'binary_sensor' && dc === 'problem') return new Set([...base, 'on'])
  if (d === 'device_tracker') return new Set([...base, 'not_home'])
  return new Set(base)
}

class UptimeCard extends KokoCard {
  static tag = 'kokonut-uptime-card'
  static cardName = 'Kokonut Uptime Card'
  static description = 'Status-page style uptime bars for your connection and devices, from history.'
  static defaults() { return { title: 'System status', days: 10, down_after: 30 } }
  static getStubConfig(hass) {
    const e = Object.keys(hass.states).filter((x) => hass.states[x].attributes.device_class === 'connectivity').slice(0, 3)
    return { entities: e.length ? e : ['binary_sensor.internet'] }
  }
  validate(c) { if (!Array.isArray(c.entities) || !c.entities.length) throw new Error('kokonut-uptime-card: "entities" must be a non-empty list') }
  specs() { return this.config.entities.map((e) => (typeof e === 'string' ? { entity: e } : e)) }
  watched() { return this.specs().map((s) => s.entity) }

  css() {
    return `
.k-card { padding: 20px; user-select: none; -webkit-user-select: none; }
.top { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.title { margin: 0; font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.ok, .warn { margin: 0; display: flex; align-items: center; gap: 6px; font-size: 14px; flex: none; }
.ok { color: #059669; } :host([dark]) .ok { color: #34d399; }
.warn { color: #d97706; } :host([dark]) .warn { color: #fbbf24; }
.sum { margin: 4px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; color: #71717a; font-variant-numeric: tabular-nums; } :host([dark]) .sum { color: #a1a1aa; }
.bars { margin-top: 16px; cursor: pointer; touch-action: pan-y; border-radius: 8px; outline: none; }
.bars:focus-visible { box-shadow: 0 0 0 4px var(--k-bg), 0 0 0 6px #a1a1aa; }
.svc + .svc { margin-top: 12px; }
.svh { margin-bottom: 6px; display: flex; justify-content: space-between; font-size: 12px; gap: 8px; }
.svh b { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.svh span { color: #71717a; font-variant-numeric: tabular-nums; } :host([dark]) .svh span { color: #a1a1aa; }
.row { display: flex; height: 28px; gap: 2px; }
@container koko (max-width: 360px) { .row { gap: 1px; } }
.row i { min-width: 0; flex-basis: 0; flex-grow: 1; border-radius: 2px; transition: opacity .15s ease-out; }
.row i.up { background: #10b981; } :host([dark]) .row i.up { background: #34d399; }
.row i.degraded { background: #fbbf24; } :host([dark]) .row i.degraded { background: #fcd34d; }
.row i.down { background: #f43f5e; } :host([dark]) .row i.down { background: #fb7185; }
.row i.none { background: #e4e4e7; } :host([dark]) .row i.none { background: #27272a; }
.bars[data-focus] .row i:not(.lit) { opacity: .6; }
.ax { margin-top: 8px; display: flex; justify-content: space-between; font-size: 12px; color: #a1a1aa; } :host([dark]) .ax { color: #71717a; }
.log { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows .26s cubic-bezier(.23,1,.32,1), opacity .26s cubic-bezier(.23,1,.32,1); }
.log[data-open] { grid-template-rows: 1fr; opacity: 1; }
.log > div { overflow: hidden; }
.box { margin-top: 16px; border-radius: 16px; background: #fafafa; padding: 16px; } :host([dark]) .box { background: #18181b; }
.bh { display: flex; align-items: center; justify-content: space-between; }
.bh p { margin: 0; font-size: 14px; font-weight: 500; }
.x { border-radius: 999px; padding: 4px; border: 0; background: none; cursor: pointer; color: #71717a; display: grid; place-items: center; }
.x:hover { background: #e4e4e7; color: #18181b; } :host([dark]) .x:hover { background: #27272a; color: #f4f4f5; }
.none { margin: 4px 0 0; font-size: 14px; color: #71717a; } :host([dark]) .none { color: #a1a1aa; }
.inc { margin-top: 12px; }
.ih { margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 14px; }
.badge { border-radius: 999px; padding: 2px 8px; font-size: 11px; font-weight: 500; }
.badge.down { background: #ffe4e6; color: #be123c; } :host([dark]) .badge.down { background: rgb(244 63 94/.15); color: #fda4af; }
.badge.degraded { background: #fef3c7; color: #92400e; } :host([dark]) .badge.degraded { background: rgb(251 191 36/.15); color: #fde68a; }
.ih b { font-weight: 500; }
.ih span:last-child { color: #71717a; } :host([dark]) .ih span:last-child { color: #a1a1aa; }
ol { margin: 10px 0 0 4px; padding: 0; list-style: none; border-left: 1px solid #e4e4e7; } :host([dark]) ol { border-color: #27272a; }
ol li { position: relative; padding: 0 0 10px 16px; font-size: 14px; }
ol li:last-child { padding-bottom: 0; }
ol li::before { content: ''; position: absolute; top: 7px; left: -3.5px; width: 6px; height: 6px; border-radius: 99px; background: #a1a1aa; } :host([dark]) ol li::before { background: #71717a; }
ol .t { color: #a1a1aa; font-variant-numeric: tabular-nums; } :host([dark]) ol .t { color: #71717a; }
ol b { font-weight: 500; }
ol .n { color: #71717a; } :host([dark]) ol .n { color: #a1a1aa; }
`
  }

  render() {
    return `<div class="k-card">
      <div class="top"><p class="title"></p><p class="status"></p></div>
      <p class="sum" aria-live="polite"></p>
      <div class="bars" role="slider" tabindex="0" aria-valuemin="1"><div class="rows"></div><div class="ax"><span class="ago"></span><span>Today</span></div></div>
      <div class="log"><div></div></div>
    </div>`
  }

  build() {
    const days = this.config.days
    this.sim = { weights: new Float64Array(days).fill(1), target: new Float64Array(days).fill(1), raf: 0, last: 0 }
    this.active = null; this.pinned = null; this.lastPinned = null
    this.data = null
    const bars = this.$('.bars')
    bars.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' && !bars.hasPointerCapture(e.pointerId)) return
      const d = this.dayAt(e.clientX)
      if (d !== this.active) { this.active = d; this.focusOn(d); this.paintState() }
    })
    bars.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (e.pointerType !== 'mouse') bars.setPointerCapture(e.pointerId)
      this.active = this.dayAt(e.clientX); this.focusOn(this.active); this.paintState()
    })
    bars.addEventListener('click', () => { if (this.active !== null) { this.pinned = this.pinned === this.active ? null : this.active; this.paintState() } })
    bars.addEventListener('lostpointercapture', (e) => { if (e.target === bars) this.leave() })
    bars.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.leave() })
    bars.addEventListener('blur', () => { if (this.active !== null) this.leave() })
    bars.addEventListener('keydown', (e) => this.key(e))
    this.$('.log').addEventListener('click', (e) => { if (e.target.closest('.x')) { this.pinned = null; this.focusOn(null); this.paintState() } })
  }

  leave() { this.active = null; this.focusOn(this.pinned); this.paintState() }

  key(e) {
    const days = this.config.days
    const from = this.active ?? this.pinned ?? days - 1
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.pinned = this.pinned === from ? null : from; this.paintState(); return }
    if (e.key === 'Escape') { this.pinned = null; this.active = null; this.focusOn(null); this.paintState(); return }
    const move = { ArrowLeft: -1, ArrowRight: 1, Home: -days, End: days }[e.key]
    if (move === undefined) return
    e.preventDefault()
    this.active = clamp(from + move, 0, days - 1); this.focusOn(this.active); this.paintState()
  }

  dayAt(clientX) {
    const days = this.config.days
    const rect = this.$('.rows').getBoundingClientRect()
    const x = clamp((clientX - rect.left) / rect.width, 0, 1)
    const probe = new Float64Array(days)
    let d = Math.round(x * (days - 1))
    for (let p = 0; p < 3; p++) d = barAt(swell(days, d, probe), x)
    return d
  }

  paint() {
    const w = this.sim.weights
    for (const row of this.$$('.row')) { const bars = row.children; for (let i = 0; i < bars.length; i++) bars[i].style.flexGrow = w[i].toFixed(3) }
  }

  tick = (now) => {
    const s = this.sim
    s.raf = 0
    const dt = s.last ? Math.min((now - s.last) / 1000, 1 / 30) : 1 / 60
    s.last = now
    const k = 1 - Math.exp(-EASE * dt)
    let moving = false
    for (let i = 0; i < s.weights.length; i++) {
      const gap = s.target[i] - s.weights[i]
      if (Math.abs(gap) > 0.002) { s.weights[i] += gap * k; moving = true } else s.weights[i] = s.target[i]
    }
    this.paint()
    if (moving) s.raf = requestAnimationFrame(this.tick); else s.last = 0
  }

  focusOn(f) {
    const s = this.sim
    swell(s.weights.length, f, s.target)
    if (reducedMotion()) { s.weights.set(s.target); this.paint() } else if (!s.raf) s.raf = requestAnimationFrame(this.tick)
  }

  /** Build per-day status for each entity from history. */
  async load() {
    const days = this.config.days
    const start = localDay(-(days - 1))
    const specs = this.specs()
    const hist = await fetchHistory(this.hass, specs.map((s) => s.entity), start, new Date())
    const now = Date.now()
    this.dayStart = (i) => localDay(i, start).getTime()
    this.data = specs.map((spec) => {
      const s = this.hass.states[spec.entity]
      const bad = downStates(spec, s)
      const rows = (hist[spec.entity] || []).slice().sort((a, b) => a.t - b.t)
      // Outage intervals [from, to).
      const outages = []
      let open = null
      for (const r of rows) {
        const isBad = bad.has(r.s)
        if (isBad && open === null) open = Math.max(r.t, start.getTime())
        if (!isBad && open !== null) { outages.push([open, r.t]); open = null }
      }
      if (open !== null) outages.push([open, now])
      const firstSeen = rows.length ? Math.max(rows[0].t, start.getTime()) : now
      const daysOut = Array.from({ length: days }, (_, i) => {
        const d0 = localDay(i, start).getTime(), d1 = Math.min(localDay(i + 1, start).getTime(), now)
        if (d1 <= firstSeen || d1 <= d0) return { status: 'none', minutes: 0, events: [] }
        let ms = 0
        const events = []
        for (const [a, b] of outages) {
          const lo = Math.max(a, d0), hi = Math.min(b, d1)
          if (hi > lo) {
            ms += hi - lo
            if (a >= d0 && a < d1) events.push({ time: hhmm(a), label: 'Offline' })
            if (b >= d0 && b < d1 && b < now) events.push({ time: hhmm(b), label: 'Back online', note: `after ${Math.max(1, Math.round((b - a) / 60000))} min` })
          }
        }
        const minutes = Math.round(ms / 60000)
        const status = minutes === 0 ? 'up' : minutes >= this.config.down_after ? 'down' : 'degraded'
        return { status, minutes, events, tracked: (d1 - Math.max(d0, firstSeen)) / 60000 }
      })
      const tracked = daysOut.reduce((a, d) => a + (d.tracked || 0), 0)
      const lost = daysOut.reduce((a, d) => a + d.minutes, 0)
      return { name: spec.name || friendlyName(s, spec.entity), entity: spec.entity, days: daysOut, uptime: tracked ? 100 * (1 - lost / tracked) : null, nowDown: !!s && bad.has(s.state) }
    })
    this.loadedAt = Date.now()
    this.renderRows()
    this.paintState()
  }

  renderRows() {
    this.$('.rows').innerHTML = this.data.map((svc) => `<div class="svc"><div class="svh"><b>${escapeHtml(svc.name)}</b><span>${svc.uptime == null ? '—' : `${svc.uptime.toFixed(2)}%`}</span></div><div class="row">${svc.days.map((d) => `<i class="${d.status}"></i>`).join('')}</div></div>`).join('')
    this.$('.ago').textContent = `${this.config.days} days ago`
    this.paint()
  }

  fmtDay(i) { return new Date(this.dayStart(i)).toLocaleDateString((this.hass.locale && this.hass.locale.language) || undefined, { weekday: 'short', month: 'short', day: 'numeric' }) }

  incidentsOn(i) { return this.data.flatMap((svc) => (svc.days[i].minutes ? [{ svc, d: svc.days[i] }] : [])) }

  paintState() {
    if (!this.data) return
    const days = this.config.days
    const shown = this.active ?? this.pinned
    const bars = this.$('.bars')
    bars.toggleAttribute('data-focus', shown !== null)
    for (const row of this.$$('.row')) [...row.children].forEach((b, i) => b.classList.toggle('lit', i === shown))
    const list = shown === null ? [] : this.incidentsOn(shown)
    let desc = 'No incidents'
    if (list[0]) desc = `${list[0].svc.name} ${list[0].d.status === 'down' ? 'down' : 'degraded'} for ${list[0].d.minutes} min${list.length > 1 ? `, +${list.length - 1} more` : ''}`
    const summary = shown === null ? (window.matchMedia('(hover: hover)').matches ? 'Hover a day to see what happened' : 'Tap a day to see what happened') : `${this.fmtDay(shown)} · ${desc}`
    this.$('.sum').textContent = summary
    bars.setAttribute('aria-valuemax', days); bars.setAttribute('aria-valuenow', (shown ?? days - 1) + 1); bars.setAttribute('aria-valuetext', summary)
    bars.setAttribute('aria-label', `Daily status for the last ${days} days. Use the arrow keys to move between days and Enter to open one.`)
    // Header: anything down right now?
    const open = this.data.filter((s) => s.nowDown)
    this.$('.status').outerHTML = open.length
      ? `<p class="status warn">${lucide('x', { size: 16 })}${open.length} ${open.length > 1 ? 'devices' : 'device'} offline</p>`
      : `<p class="status ok"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>All systems operational</p>`
    // Log of the pinned day (kept while it collapses).
    if (this.pinned !== null) this.lastPinned = this.pinned
    const logDay = this.pinned ?? this.lastPinned
    const log = this.$('.log')
    log.toggleAttribute('data-open', this.pinned !== null)
    log.inert = this.pinned === null
    if (logDay === null) { log.firstElementChild.innerHTML = ''; return }
    const inc = this.incidentsOn(logDay)
    log.firstElementChild.innerHTML = `<div class="box"><div class="bh"><p>${escapeHtml(this.fmtDay(logDay))}</p><button class="x" type="button" aria-label="Close day">${lucide('x', { size: 14 })}</button></div>
      ${inc.length ? '' : '<p class="none">No outages recorded. Everything was online.</p>'}
      ${inc.map(({ svc, d }) => `<div class="inc"><p class="ih"><span class="badge ${d.status}">${STATUS_TEXT[d.status]}</span><b>${escapeHtml(svc.name)}</b><span>Offline · ${d.minutes} min</span></p>
        ${d.events.length ? `<ol>${d.events.map((u) => `<li><span class="t">${u.time}</span> <b>${escapeHtml(u.label)}</b>${u.note ? `<span class="n"> ${escapeHtml(u.note)}</span>` : ''}</li>`).join('')}</ol>` : ''}</div>`).join('')}</div>`
  }

  update() {
    this.$('.title').textContent = this.config.title
    if (!this.data && !this._loading) { this._loading = true; this.load().finally(() => { this._loading = false }) }
  }

  hassChanged(old) {
    // A device going up or down refreshes now; otherwise every 10 minutes.
    const changed = old && this.watched().some((id) => old.states[id] && this.hass.states[id] && old.states[id].state !== this.hass.states[id].state)
    if (this.loadedAt && !this._loading && (changed || Date.now() - this.loadedAt > 600000)) { this._loading = true; this.load().finally(() => { this._loading = false }) }
  }

  disconnected() { cancelAnimationFrame(this.sim.raf); this.sim.raf = 0 }
  getCardSize() { return 4 + this.config.entities.length }
  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 } }
}

register(UptimeCard)
