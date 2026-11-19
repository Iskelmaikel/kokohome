/**
 * Kokonut Swipe Tabs → Lovelace (a tab container for any cards).
 * A pill tab bar over swipeable panels. One fractional position drives the
 * panel track, the indicator and a clipped copy of the labels in the active
 * colour — so a label is exactly right at every point of the slide. Swipe or
 * flick the panels; past the ends they rubber-band and the pill squashes.
 * The panel area's height follows the tabs, interpolated while swiping.
 *
 *   type: custom:kokonut-swipe-tabs
 *   default_tab: 0
 *   swipe: true
 *   tabs:
 *     - title: Living room
 *       icon: mdi:sofa
 *       cards:
 *         - type: custom:kokonut-lamp
 *           entity: light.living_room_lights
 *     - title: Bedroom
 *       card: { type: tile, entity: climate.bedroom_ac }
 */
import { KokoCard, register, MotionValue, clamp, lerp, escapeHtml, icon, NestedCards, haptic, reducedMotion } from './core.js'

const RUBBER_BAND = 0.35, SWIPE_VELOCITY = 0.11, AXIS_LOCK = 6, VELOCITY_WINDOW = 100, NEIGHBOUR_OPACITY = 0.35
const SPRING = { stiffness: 420, damping: 38 }

function indicatorRect(rects, progress) {
  const last = rects.length - 1
  if (last < 0) return null
  const p = clamp(progress, 0, last)
  const i = Math.min(Math.floor(p), Math.max(last - 1, 0))
  const a = rects[i], b = rects[Math.min(i + 1, last)], t = p - i
  let left = lerp(a.left, b.left, t), width = lerp(a.width, b.width, t)
  const over = progress < 0 ? -progress : progress - last
  if (over > 0) { const squash = width * Math.min(over, 0.5) * 0.4; width -= squash; if (progress > last) left += squash }
  return { left, width, top: a.top, height: a.height }
}
const rubberBand = (raw, last) => (raw < 0 ? raw * RUBBER_BAND : raw > last ? last + (raw - last) * RUBBER_BAND : raw)

/** Does a gesture start on something that owns horizontal drags (a slider…)? */
function ownsDrag(e, stopAt) {
  for (const el of e.composedPath()) {
    if (el === stopAt) return false
    if (!(el instanceof Element)) continue
    const tag = el.tagName
    if (tag === 'INPUT' || tag === 'HA-SLIDER' || tag === 'HA-CONTROL-SLIDER' || el.getAttribute('role') === 'slider') return true
    const ta = getComputedStyle(el).touchAction
    if (ta === 'none' || ta === 'pan-y') { if (ta === 'none') return true }
  }
  return false
}

class SwipeTabs extends KokoCard {
  static tag = 'kokonut-swipe-tabs'
  static cardName = 'Kokonut Swipe Tabs'
  static description = 'Swipeable tabs that hold any cards — rooms, floors or modes in one card.'
  static defaults() { return { default_tab: 0, swipe: true, card: false } }
  static getStubConfig() { return { tabs: [{ title: 'One', cards: [{ type: 'markdown', content: 'First tab' }] }, { title: 'Two', cards: [{ type: 'markdown', content: 'Second tab' }] }] } }
  validate(c) { if (!Array.isArray(c.tabs) || !c.tabs.length) throw new Error('kokonut-swipe-tabs: "tabs" must be a non-empty list') }
  watched() { return [] }

  css() {
    return `
.k-card { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
:host([plain]) .k-card { padding: 0; }
.bar { display: flex; justify-content: center; }
.list { position: relative; display: inline-flex; max-width: 100%; overflow-x: auto; scrollbar-width: none; border-radius: 999px; background: #f4f4f5; padding: 4px; }
.list::-webkit-scrollbar { display: none; }
:host([dark]) .list { background: #18181b; }
.tab { position: relative; display: flex; flex: none; align-items: center; gap: 6px; border-radius: 999px; padding: 6px 14px; font-size: 14px; font-weight: 500; border: 0; background: none; cursor: pointer;
  color: #71717a; transition: color .15s ease-out; outline: none; white-space: nowrap; }
:host([dark]) .tab { color: #a1a1aa; }
.tab:hover { color: #18181b; } :host([dark]) .tab:hover { color: #f4f4f5; }
.tab:focus-visible { outline: 2px solid #a1a1aa; outline-offset: 2px; }
.ov { pointer-events: none; position: absolute; top: 0; bottom: 0; left: 0; display: flex; padding: 4px; background: var(--tabs-active, #18181b); clip-path: inset(0 100% 0 0); }
:host([dark]) .ov { background: var(--tabs-active, #f4f4f5); }
.ov span.l { display: flex; flex: none; align-items: center; gap: 6px; padding: 6px 14px; font-size: 14px; font-weight: 500; white-space: nowrap; color: var(--tabs-active-text, #fff); }
:host([dark]) .ov span.l { color: var(--tabs-active-text, #18181b); }
.view { position: relative; overflow: hidden; touch-action: pan-y; user-select: none; -webkit-user-select: none; border-radius: var(--ha-card-border-radius, 12px); transition: height .3s cubic-bezier(.23,1,.32,1); }
.view[data-dragging] { cursor: grabbing; transition: none; }
.track { display: flex; align-items: flex-start; will-change: transform; }
.panel { flex: none; display: flex; flex-direction: column; gap: 8px; outline: none; min-width: 0; }
.panel:focus-visible { box-shadow: inset 0 0 0 2px #a1a1aa; }
`
  }

  render() {
    const tabs = this.config.tabs
    const label = (t) => `${t.icon ? icon(t.icon, 16) : ''}<span>${escapeHtml(t.title || '')}</span>`
    return `<div class="k-card">
      <div class="bar"><div class="list" role="tablist" aria-label="${escapeHtml(this.config.name || 'Sections')}">
        ${tabs.map((t, i) => `<button class="tab" role="tab" type="button" data-i="${i}" id="t${i}" aria-controls="p${i}">${label(t)}</button>`).join('')}
        <div class="ov" aria-hidden="true">${tabs.map((t) => `<span class="l">${label(t)}</span>`).join('')}</div>
      </div></div>
      <div class="view"><div class="track" style="width:${tabs.length * 100}%">
        ${tabs.map((t, i) => `<div class="panel" role="tabpanel" id="p${i}" aria-labelledby="t${i}" style="width:${100 / tabs.length}%"></div>`).join('')}
      </div></div>
    </div>`
  }

  build() {
    if (this.config.active_color) this.style.setProperty('--tabs-active', this.config.active_color)
    if (this.config.active_text_color) this.style.setProperty('--tabs-active-text', this.config.active_text_color)
    const n = this.config.tabs.length
    this.count = n
    this.selected = clamp(this.config.default_tab, 0, n - 1)
    this.progress = new MotionValue(this.selected)
    this.list = this.$('.list'); this.ov = this.$('.ov'); this.view = this.$('.view'); this.track = this.$('.track')
    this.tabs = this.$$('.tab'); this.panels = this.$$('.panel')
    this.rects = []; this.size = { width: 0, height: 0 }; this.heights = new Array(n).fill(0)
    this.progress.on((p) => this.paint(p))
    this.tabs.forEach((t, i) => {
      t.addEventListener('click', () => this.select(i))
      t.addEventListener('keydown', (e) => {
        const next = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key]
        if (next === undefined) return
        e.preventDefault(); this.tabs[next].focus(); this.select(next, { instant: e.repeat })
      })
    })
    this.ro = new ResizeObserver(() => this.measure())
    this.ro.observe(this.list)
    this.pro = new ResizeObserver(() => { this.heights = this.panels.map((p) => p.offsetHeight); this.paint(this.progress.get()) })
    this.panels.forEach((p) => this.pro.observe(p))
    if (this.config.swipe !== false) this.wireSwipe()
    // Nested cards.
    this.nested = this.config.tabs.map(() => new NestedCards(this))
    this.config.tabs.forEach((t, i) => {
      const cards = t.cards || (t.card ? [t.card] : [])
      this.nested[i].build(cards, (els) => this.panels[i].replaceChildren(...els))
    })
    this.selectState(this.selected)
    this.paint(this.selected)
  }

  measure() {
    const box = this.list.getBoundingClientRect()
    // Content coordinates: the overlay scrolls with the tabs and spans them all.
    this.size = { width: this.list.scrollWidth, height: box.height }
    this.ov.style.width = `${this.list.scrollWidth}px`
    this.rects = this.tabs.map((t) => { const r = t.getBoundingClientRect(); return { left: r.left - box.left + this.list.scrollLeft, width: r.width, top: r.top - box.top, height: r.height } })
    this.paint(this.progress.get())
  }

  paint(p) {
    const n = this.count
    this.track.style.transform = `translate3d(${(-p * 100) / n}%, 0, 0)`
    this.panels.forEach((panel, i) => { panel.style.opacity = String(1 - Math.min(Math.abs(p - i), 1) * (1 - NEIGHBOUR_OPACITY)) })
    const r = indicatorRect(this.rects, p)
    if (r) {
      const right = this.size.width - r.left - r.width, bottom = this.size.height - r.top - r.height
      this.ov.style.clipPath = `inset(${r.top}px ${right}px ${bottom}px ${r.left}px round ${r.height / 2}px)`
    }
    // Height follows the panels, blended between neighbours mid-swipe.
    const c = clamp(p, 0, n - 1), i = Math.floor(c), j = Math.min(i + 1, n - 1)
    const h = lerp(this.heights[i] || 0, this.heights[j] || 0, c - i)
    if (h) this.view.style.height = `${h}px`
  }

  settle(index, opts = {}) {
    this.target = index
    if (opts.instant) { this.progress.jump(index); return }
    if (reducedMotion()) this.progress.tween(index, { duration: 0.15 })
    else this.progress.spring(index, { ...SPRING, velocity: opts.velocity ?? 0, restDelta: 0.001 })
  }

  selectState(i) {
    this.selected = i
    this.tabs.forEach((t, j) => { t.setAttribute('aria-selected', String(j === i)); t.tabIndex = j === i ? 0 : -1 })
    this.panels.forEach((p, j) => { p.inert = j !== i; p.tabIndex = j === i ? 0 : -1 })
    const t = this.tabs[i]
    if (t && t.scrollIntoView && this.list.scrollWidth > this.list.clientWidth) t.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' })
  }

  select(index, opts) {
    const next = clamp(index, 0, this.count - 1)
    this.settle(next, opts)
    if (next !== this.selected) { this.selectState(next); haptic('light') }
  }

  wireSwipe() {
    const v = this.view
    v.addEventListener('pointerdown', (e) => {
      if (this.count < 2 || (e.pointerType === 'mouse' && e.button !== 0) || ownsDrag(e, v)) return
      this.drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, sp: this.progress.get(), axis: null, width: v.clientWidth || 1, samples: [{ x: e.clientX, t: e.timeStamp }] }
    })
    v.addEventListener('pointermove', (e) => {
      const d = this.drag
      if (!d || d.id !== e.pointerId) return
      if (d.axis === null) {
        const dx = e.clientX - d.sx, dy = e.clientY - d.sy
        if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK) return
        d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
        if (d.axis === 'x') { this.progress.stop(); d.sp = this.progress.get(); d.sx = e.clientX; d.samples = [{ x: e.clientX, t: e.timeStamp }]; v.setPointerCapture(e.pointerId); v.toggleAttribute('data-dragging', true) }
      }
      if (d.axis !== 'x') return
      d.samples.push({ x: e.clientX, t: e.timeStamp })
      while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > VELOCITY_WINDOW) d.samples.shift()
      this.progress.set(rubberBand(d.sp - (e.clientX - d.sx) / d.width, this.count - 1))
    })
    const end = (e, cancelled) => {
      const d = this.drag
      if (!d || d.id !== e.pointerId) return
      this.drag = null
      v.toggleAttribute('data-dragging', false)
      if (d.axis !== 'x') return
      if (!cancelled) { this.suppress = true; setTimeout(() => { this.suppress = false }, 0) }
      const f = d.samples[0]
      const vx = (e.clientX - f.x) / Math.max(e.timeStamp - f.t, 1)
      const p = this.progress.get()
      let next = Math.round(p)
      if (!cancelled && Math.abs(vx) > SWIPE_VELOCITY) next = vx < 0 ? Math.floor(p) + 1 : Math.ceil(p) - 1
      this.select(next, { velocity: (-vx * 1000) / d.width })
    }
    v.addEventListener('pointerup', (e) => end(e, false))
    v.addEventListener('pointercancel', (e) => end(e, true))
    v.addEventListener('lostpointercapture', (e) => end(e, false))
    v.addEventListener('click', (e) => { if (this.suppress) { this.suppress = false; e.preventDefault(); e.stopPropagation() } }, true)
  }

  update() {}
  hassChanged() { for (const n of this.nested || []) n.hass = this.hass }
  disconnected() { this.progress && this.progress.stop() }
  getCardSize() { return 6 }
  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 } }
}

register(SwipeTabs)
