/**
 * Kokonut Momentum Rail → Lovelace (a carousel of any cards).
 * Touch scrolls natively with snapping; with a mouse you can grab and flick
 * it: the release velocity projects an end point (UIScrollView deceleration),
 * a spring snaps to the nearest card and the ends rubber-band. Cards tilt in
 * cover-flow depth from scroll-driven animations, off the main thread.
 *
 *   type: custom:kokonut-momentum-rail
 *   title: Rooms
 *   eyebrow: Swipe through
 *   card_width: 240
 *   cards:
 *     - { type: custom:kokonut-lamp, entity: light.standing_light_1 }
 *     - { type: custom:kokonut-detent-dial, entity: climate.living_room_ac }
 */
import { KokoCard, register, clamp, escapeHtml, lucide, NestedCards, reducedMotion } from './core.js'

const STIFFNESS = 170, DAMPING = 26, DECELERATION = 0.997, DRAG_THRESHOLD = 4
const rubber = (o, size) => Math.sign(o) * (1 - 1 / ((Math.abs(o) * 0.55) / size + 1)) * size

class MomentumRail extends KokoCard {
  static tag = 'kokonut-momentum-rail'
  static cardName = 'Kokonut Momentum Rail'
  static description = 'A flickable cover-flow carousel of any cards.'
  static defaults() { return { card_width: 240 } }
  static getStubConfig() { return { title: 'Rail', cards: [1, 2, 3].map((n) => ({ type: 'markdown', content: `Card ${n}` })) } }
  validate(c) { if (!Array.isArray(c.cards) || !c.cards.length) throw new Error('kokonut-momentum-rail: "cards" must be a non-empty list') }
  watched() { return [] }

  css() {
    return `
.k-card { padding: 16px 0 4px; }
:host([plain]) .k-card { padding: 0; }
@keyframes tilt { 0% { transform: perspective(900px) translateZ(-180px) rotateY(-14deg); } 50% { transform: perspective(900px) translateZ(0) rotateY(0deg); } 100% { transform: perspective(900px) translateZ(-180px) rotateY(14deg); } }
@supports (animation-timeline: view()) {
  .item { view-timeline: --koko-rail inline; }
  @media (prefers-reduced-motion: no-preference) { .tilt { animation: tilt linear both; animation-timeline: --koko-rail; } }
}
.head { margin-bottom: 4px; display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding: 0 16px; }
.head > div:first-child { min-width: 0; }
.eb { margin: 0; font-size: 12px; color: #71717a; } :host([dark]) .eb { color: #a1a1aa; }
h2 { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 18px; font-weight: 600; letter-spacing: -.025em; }
.nav { display: flex; flex: none; align-items: center; gap: 8px; }
.cnt { margin-right: 4px; font-size: 12px; color: #71717a; font-variant-numeric: tabular-nums; } :host([dark]) .cnt { color: #a1a1aa; }
.arr { display: grid; width: 32px; height: 32px; cursor: pointer; place-items: center; border-radius: 999px; border: 1px solid #e4e4e7; background: #fff; color: #18181b; transition: background-color .15s, opacity .15s; padding: 0; }
:host([dark]) .arr { border-color: #27272a; background: #09090b; color: #f4f4f5; }
.arr:hover { background: #f4f4f5; } :host([dark]) .arr:hover { background: #18181b; }
.arr[aria-disabled=true] { cursor: default; opacity: .4; }
.arr:focus-visible { outline: 2px solid #18181b; outline-offset: 2px; } :host([dark]) .arr:focus-visible { outline-color: #f4f4f5; }
.sc { position: relative; overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x mandatory; padding: 20px 0; outline: none; scrollbar-width: none; }
.sc::-webkit-scrollbar { display: none; }
.sc[data-free=true] { scroll-snap-type: none; }
.sc[data-dragging=true] { cursor: grabbing; }
@media (pointer: fine) { .sc { cursor: grab; user-select: none; -webkit-user-select: none; } }
.sc:focus-visible { box-shadow: inset 0 0 0 2px #a1a1aa; }
ul { position: relative; display: flex; width: max-content; gap: 16px; margin: 0; padding: 0 var(--pad, 16px); list-style: none; }
.item { width: var(--cw, 240px); flex: none; scroll-snap-align: center; }
.tilt { will-change: transform; }
`
  }

  render() {
    return `<div class="k-card">
      <div class="head"><div><p class="eb"></p><h2></h2></div>
        <div class="nav"><span class="cnt" aria-live="polite"></span>
          <button class="arr prev" type="button" aria-label="Previous">${lucide('chevron-left', { size: 16 })}</button>
          <button class="arr next" type="button" aria-label="Next">${lucide('chevron-right', { size: 16 })}</button></div></div>
      <div class="sc" tabindex="0" role="region" aria-roledescription="carousel"><ul></ul></div>
    </div>`
  }

  build() {
    const c = this.config
    this.style.setProperty('--cw', `${c.card_width}px`)
    this.$('.eb').textContent = c.eyebrow || ''
    this.$('.eb').hidden = !c.eyebrow
    this.$('h2').textContent = c.title || ''
    this.$('.head').hidden = !c.title && !c.eyebrow && c.show_header === false
    this.sc = this.$('.sc'); this.ul = this.$('ul')
    this.sc.setAttribute('aria-label', `${c.title || 'Cards'}, use arrow keys to move`)
    this.ul.innerHTML = c.cards.map(() => '<li class="item"><div class="tilt"></div></li>').join('')
    this.items = this.$$('.item')
    this.nested = new NestedCards(this)
    this.nested.build(c.cards, (els) => els.forEach((el, i) => this.items[i].firstElementChild.replaceChildren(el)))
    this.st = { mode: 'idle', pointerId: -1, startX: 0, startPos: 0, pos: 0, vel: 0, target: 0, samples: [], raf: 0, last: 0, suppress: false, caught: false }
    this.active = 0
    this.$('.prev').addEventListener('click', () => this.goTo(this.currentIndex() - 1))
    this.$('.next').addEventListener('click', () => this.goTo(this.currentIndex() + 1))
    this.ro = new ResizeObserver(() => {
      // Pad so the first and last cards can sit centred.
      this.ul.style.setProperty('--pad', `${Math.max(16, (this.sc.clientWidth - c.card_width) / 2)}px`)
      this.onScroll()
    })
    this.ro.observe(this.sc)
    this.wire()
    this.renderCount()
  }

  maxScroll() { return this.sc.scrollWidth - this.sc.clientWidth }
  snapPoints() {
    const max = this.maxScroll()
    return this.items.map((li) => clamp(this.ul.offsetLeft + li.offsetLeft + li.offsetWidth / 2 - this.sc.clientWidth / 2, 0, max))
  }
  nearest(points, pos) { let b = 0; for (let i = 1; i < points.length; i++) if (Math.abs(points[i] - pos) < Math.abs(points[b] - pos)) b = i; return b }

  apply(pos) {
    const inRange = clamp(pos, 0, this.maxScroll())
    this.sc.scrollLeft = inRange
    const over = pos - inRange
    this.ul.style.transform = Math.abs(over) > 0.1 ? `translate3d(${(-rubber(over, this.sc.clientWidth)).toFixed(2)}px,0,0)` : ''
  }
  setFree(f) { this.sc.dataset.free = String(f) }

  step = (now) => {
    const s = this.st
    const dt = Math.min((now - s.last) / 1000, 1 / 30)
    s.last = now
    const h = dt / 4
    for (let i = 0; i < 4; i++) { s.vel += (-STIFFNESS * (s.pos - s.target) - DAMPING * s.vel) * h; s.pos += s.vel * h }
    if (Math.abs(s.pos - s.target) < 0.5 && Math.abs(s.vel) < 8) { s.pos = s.target; s.vel = 0; s.mode = 'idle'; this.apply(s.target); this.setFree(false); return }
    this.apply(s.pos)
    s.raf = requestAnimationFrame(this.step)
  }

  springTo(target, velocity) {
    const s = this.st
    cancelAnimationFrame(s.raf)
    if (s.mode === 'idle') s.pos = this.sc.scrollLeft
    s.target = target; s.vel = velocity
    if (reducedMotion()) { s.mode = 'idle'; s.pos = target; this.apply(target); this.setFree(false); return }
    s.mode = 'spring'; this.setFree(true); s.last = performance.now(); s.raf = requestAnimationFrame(this.step)
  }

  goTo(i) { const p = this.snapPoints(); this.springTo(p[clamp(i, 0, p.length - 1)], this.st.mode === 'spring' ? this.st.vel : 0) }
  currentIndex() { return this.nearest(this.snapPoints(), this.st.mode === 'spring' ? this.st.target : this.sc.scrollLeft) }

  onScroll() {
    cancelAnimationFrame(this._sraf)
    this._sraf = requestAnimationFrame(() => { const i = this.nearest(this.snapPoints(), this.sc.scrollLeft); if (i !== this.active) { this.active = i; this.renderCount() } })
  }

  renderCount() {
    const n = this.items.length
    this.$('.cnt').textContent = `${String(this.active + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`
    this.$('.prev').setAttribute('aria-disabled', String(this.active === 0))
    this.$('.next').setAttribute('aria-disabled', String(this.active === n - 1))
  }

  wire() {
    const sc = this.sc, s = this.st
    sc.addEventListener('scroll', () => this.onScroll(), { passive: true })
    const suppressNext = () => { s.suppress = true; setTimeout(() => { s.suppress = false }, 0) }
    sc.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      // Leave buttons, sliders and other controls inside the cards alone.
      for (const el of e.composedPath()) { if (el === sc) break; if (el instanceof Element && (el.tagName === 'BUTTON' || el.getAttribute('role') === 'slider' || getComputedStyle(el).touchAction === 'none')) return }
      cancelAnimationFrame(s.raf)
      s.caught = s.mode === 'spring'
      s.pos = s.caught ? s.pos : sc.scrollLeft
      s.mode = 'pressing'; s.pointerId = e.pointerId; s.startX = e.clientX; s.startPos = s.pos
      s.samples = [{ t: e.timeStamp, x: e.clientX }]
    })
    sc.addEventListener('pointermove', (e) => {
      if (e.pointerId !== s.pointerId) return
      const dx = e.clientX - s.startX
      if (s.mode === 'pressing' && Math.abs(dx) > DRAG_THRESHOLD) { s.mode = 'dragging'; sc.setPointerCapture(e.pointerId); sc.dataset.dragging = 'true'; this.setFree(true) }
      if (s.mode !== 'dragging') return
      s.pos = s.startPos - dx
      this.apply(s.pos)
      s.samples.push({ t: e.timeStamp, x: e.clientX })
      while (s.samples.length > 2 && e.timeStamp - s.samples[0].t > 100) s.samples.shift()
    })
    const release = (e) => {
      if (e.pointerId !== s.pointerId) return
      s.pointerId = -1
      if (s.mode !== 'dragging') {
        if (s.caught) { suppressNext(); const p = this.snapPoints(); this.springTo(p[this.nearest(p, s.pos)], 0); return }
        s.mode = 'idle'; this.setFree(false); return
      }
      sc.dataset.dragging = 'false'
      suppressNext()
      const f = s.samples[0], l = s.samples[s.samples.length - 1] || f, dt = l.t - f.t
      const v = dt <= 0 || e.timeStamp - l.t > 60 ? 0 : -(l.x - f.x) / dt
      const projected = s.pos + (v * DECELERATION) / (1 - DECELERATION)
      const p = this.snapPoints()
      this.springTo(p[this.nearest(p, projected)], v * 1000)
    }
    sc.addEventListener('pointerup', release); sc.addEventListener('pointercancel', release); sc.addEventListener('lostpointercapture', release)
    sc.addEventListener('click', (e) => { if (s.suppress) { e.preventDefault(); e.stopPropagation(); s.suppress = false } }, true)
    const native = () => { if (s.mode !== 'spring') return; cancelAnimationFrame(s.raf); s.mode = 'idle'; this.apply(clamp(s.pos, 0, this.maxScroll())); this.setFree(false) }
    sc.addEventListener('wheel', native, { passive: true })
    sc.addEventListener('touchstart', native, { passive: true })
    sc.addEventListener('keydown', (e) => {
      if (e.target !== sc) return
      const i = this.currentIndex(), last = this.items.length - 1
      const next = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: last }[e.key]
      if (next === undefined) return
      e.preventDefault(); this.goTo(next)
    })
  }

  update() {}
  hassChanged() { if (this.nested) this.nested.hass = this.hass }
  disconnected() { if (this.st) cancelAnimationFrame(this.st.raf) }
  getCardSize() { return 6 }
  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 } }
}

register(MomentumRail)
