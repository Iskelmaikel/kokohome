/**
 * Kokonut Flick Card → Lovelace (two cards, front and back).
 * Drag it and it turns one-to-one under your finger; let go and a spring
 * lands it on a face — a flick spins it over (up to three full turns). It
 * lifts toward you mid-turn, a band of light sweeps the face, the edge shows
 * its thickness and the floor shadow narrows as it goes edge-on. Click a half
 * to push it away; Enter/Space flips. A small handle flips even when the face
 * is a fully tappable card.
 *
 *   type: custom:kokonut-flick-card
 *   axis: y | x
 *   front: { type: picture-entity, entity: camera.doggy_cam }
 *   back:  { type: custom:kokonut-now-playing, entity: media_player.living_room_lg_tv }
 */
import { KokoCard, register, NestedCards, reducedMotion, haptic } from './core.js'

const DEG_PER_PX = 0.6, STIFFNESS = 170, DAMPING = 20, PROJECTION = 0.22, FLICK_SPEED = 450, MAX_HALF_TURNS = 6
const DRAG_SLOP = 4, LIFT = 36, TILT = 6, THICKNESS = 6, SLICES = 7, SUBSTEP = 1 / 240, VELOCITY_WINDOW = 80
const SLICE_DEPTHS = Array.from({ length: SLICES }, (_, i) => -THICKNESS / 2 + (THICKNESS * (i + 0.5)) / SLICES)
const INTERACTIVE = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'HA-SLIDER', 'HA-CONTROL-SLIDER', 'HA-SWITCH', 'HA-ICON-BUTTON'])
const mod2 = (n) => ((n % 2) + 2) % 2
const sideOf = (a) => mod2(Math.round(a / 180)) === 1
const nearestFace = (a) => Math.round(a / 180) * 180

class FlickCard extends KokoCard {
  static tag = 'kokonut-flick-card'
  static cardName = 'Kokonut Flick Card'
  static description = 'A two-sided card you flick over like a coin — any card on each face.'
  static defaults() { return { axis: 'y' } }
  static getStubConfig() { return { front: { type: 'markdown', content: '## Front\nFlick me' }, back: { type: 'markdown', content: '## Back' } } }
  validate(c) { if (!c.front || !c.back) throw new Error('kokonut-flick-card: set "front" and "back" cards') }
  watched() { return [] }

  css() {
    return `
.k-card { padding: 16px 16px 36px; overflow: visible; background: none; border: 0; box-shadow: none; }
.root { position: relative; user-select: none; -webkit-user-select: none; border-radius: 16px; outline: none; perspective: 1100px; }
.root:focus-visible { box-shadow: 0 0 0 2px var(--k-bg), 0 0 0 4px #f97316; }
.root.y { touch-action: pan-y; } .root.x { touch-action: pan-x; }
.floor { pointer-events: none; position: absolute; left: 8%; right: 8%; bottom: -28px; height: 24px; border-radius: 50%; background: rgb(24 24 27/.25); filter: blur(12px); }
:host([dark]) .floor { background: rgb(0 0 0/.7); }
.tilt { position: relative; width: 100%; height: 100%; transition: transform .5s cubic-bezier(.23,1,.32,1); transform-style: preserve-3d; }
.card3d { position: relative; width: 100%; height: 100%; cursor: grab; border-radius: 16px; transform-style: preserve-3d; }
.root:active .card3d { cursor: grabbing; }
.slice { position: absolute; inset: 0; border-radius: 16px; background: #d4d4d8; } :host([dark]) .slice { background: #3f3f46; }
.face { position: absolute; inset: 0; overflow: hidden; border-radius: 16px; backface-visibility: hidden; -webkit-backface-visibility: hidden; background: var(--k-bg); }
.face > .slot { height: 100%; overflow: auto; }
.face > .slot > * { --ha-card-border-radius: 16px; }
.light { pointer-events: none; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.light .shade { position: absolute; inset: 0; background: #000; opacity: 0; }
.light .band { height: 220%; width: 33%; flex: none; background: #fff; opacity: 0; }
.handle { position: absolute; z-index: 2; top: 8px; right: 8px; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 999px; border: 1px solid var(--k-line); background: color-mix(in srgb, var(--k-bg) 85%, transparent); color: var(--k-fg-2); cursor: pointer; padding: 0; opacity: .8; transition: opacity .15s; }
.handle:hover { opacity: 1; color: var(--k-fg); }
.handle:focus-visible { outline: 2px solid #a1a1aa; }
@media (prefers-reduced-motion: reduce) { .tilt { transition: none; } }
`
  }

  render() {
    const ax = this.config.axis === 'x' ? 'x' : 'y'
    const flipIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>'
    const light = '<div class="light" aria-hidden="true"><div class="shade"></div><div class="band"></div></div>'
    return `<div class="k-card"><div class="root ${ax}" role="group" tabindex="0" aria-roledescription="flip card" aria-label="${this.config.name || 'Flip card'}">
      <div class="floor" aria-hidden="true"></div>
      <div class="tilt"><div class="card3d">
        ${SLICE_DEPTHS.map((z) => `<div class="slice" aria-hidden="true" style="transform:translateZ(${z.toFixed(3)}px)"></div>`).join('')}
        <div class="face front" style="transform:translateZ(${THICKNESS / 2}px)"><div class="slot"></div>${light}<button class="handle" type="button" aria-label="Flip to back">${flipIcon}</button></div>
        <div class="face back" style="transform:${ax === 'y' ? 'rotateY' : 'rotateX'}(180deg) translateZ(${THICKNESS / 2}px)"><div class="slot"></div>${light}<button class="handle" type="button" aria-label="Flip to front">${flipIcon}</button></div>
      </div></div>
      <span class="sr" aria-live="polite"></span>
    </div></div>`
  }

  build() {
    this.axis = this.config.axis === 'x' ? 'x' : 'y'
    this.root = this.$('.root'); this.tilt = this.$('.tilt'); this.card3d = this.$('.card3d'); this.floor = this.$('.floor')
    this.front = this.$('.face.front'); this.back = this.$('.face.back')
    this.bands = this.$$('.band'); this.shades = this.$$('.shade')
    this.s = { angle: 0, velocity: 0, target: 0, raf: 0, last: 0, pointerId: null, startX: 0, startY: 0, startAngle: 0, dragging: false, samples: [] }
    this.backVisible = false
    // Nested faces; the card takes the height of the taller face.
    this.nestedFront = new NestedCards(this); this.nestedBack = new NestedCards(this)
    const fslot = this.front.querySelector('.slot'), bslot = this.back.querySelector('.slot')
    this.nestedFront.build([this.config.front], (els) => fslot.replaceChildren(...els))
    this.nestedBack.build([this.config.back], (els) => bslot.replaceChildren(...els))
    this.ro = new ResizeObserver(() => {
      const h = Math.max(fslot.scrollHeight, bslot.scrollHeight, this.config.min_height || 120)
      this.root.style.height = `${h}px`
    })
    this.ro.observe(fslot); this.ro.observe(bslot)
    for (const b of this.$$('.handle')) b.addEventListener('click', (e) => { e.stopPropagation(); this.flipBy(1) })
    const r = this.root
    r.addEventListener('pointerdown', (e) => this.down(e))
    r.addEventListener('pointermove', (e) => this.move(e))
    r.addEventListener('pointerup', (e) => this.release(e, false))
    r.addEventListener('pointercancel', (e) => this.release(e, true))
    r.addEventListener('lostpointercapture', (e) => this.release(e, true))
    r.addEventListener('pointerleave', () => { if (this.s.pointerId === null) this.setTilt(0, 0) })
    r.addEventListener('keydown', (e) => { if (e.target !== r) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.flipBy(1) } })
    this.paint()
    this.syncFaces()
  }

  setTilt(x, y) { this.tilt.style.transform = `rotateX(${(-y * TILT).toFixed(2)}deg) rotateY(${(x * TILT).toFixed(2)}deg)` }

  paint() {
    const s = this.s, ax = this.axis
    const rad = (s.angle * Math.PI) / 180, sin = Math.sin(rad), turn = Math.abs(sin), facing = Math.abs(Math.cos(rad))
    this.card3d.style.transform = `translateZ(${(turn * LIFT).toFixed(2)}px) ${ax === 'y' ? 'rotateY' : 'rotateX'}(${s.angle.toFixed(2)}deg)`
    const narrow = (0.16 + 0.84 * facing).toFixed(3), soft = (1 - turn * 0.12).toFixed(3)
    this.floor.style.transform = ax === 'y' ? `scale(${narrow}, ${soft})` : `scale(${soft}, ${narrow})`
    this.floor.style.opacity = (1 - turn * 0.45).toFixed(3)
    const shift = `${(sin * 140).toFixed(1)}%`
    const bt = ax === 'y' ? `translateX(${shift}) rotate(18deg)` : `translateY(${shift}) rotate(72deg)`
    for (const b of this.bands) { b.style.opacity = (turn * 0.12).toFixed(3); b.style.transform = bt }
    for (const sh of this.shades) sh.style.opacity = (turn * 0.14).toFixed(3)
    const showsBack = sideOf(s.angle)
    if (showsBack !== this.backVisible) { this.backVisible = showsBack; this.syncFaces() }
  }

  syncFaces() {
    this.front.inert = this.backVisible; this.back.inert = !this.backVisible
    this.front.setAttribute('aria-hidden', String(this.backVisible)); this.back.setAttribute('aria-hidden', String(!this.backVisible))
    this.$('.sr').textContent = `Showing the ${this.backVisible ? 'back' : 'front'}.`
  }

  step = (now) => {
    const s = this.s
    const dt = Math.min(0.05, (now - s.last) / 1000)
    s.last = now
    const n = Math.max(1, Math.ceil(dt / SUBSTEP)), h = dt / n
    for (let i = 0; i < n; i++) { s.velocity += (-STIFFNESS * (s.angle - s.target) - DAMPING * s.velocity) * h; s.angle += s.velocity * h }
    if (Math.abs(s.angle - s.target) < 0.05 && Math.abs(s.velocity) < 0.5) {
      s.target = sideOf(s.target) ? 180 : 0; s.angle = s.target; s.velocity = 0; s.raf = 0; this.paint(); return
    }
    this.paint()
    s.raf = requestAnimationFrame(this.step)
  }

  settle() {
    const s = this.s
    if (reducedMotion()) { cancelAnimationFrame(s.raf); s.raf = 0; s.target = sideOf(s.target) ? 180 : 0; s.angle = s.target; s.velocity = 0; this.paint(); return }
    if (!s.raf) { s.last = performance.now(); s.raf = requestAnimationFrame(this.step) }
  }

  aim(target) {
    const was = sideOf(this.s.target)
    this.s.target = target
    if (sideOf(target) !== was) haptic('light')
    this.settle()
  }

  flipBy(dir) { this.aim(nearestFace(this.s.target) + 180 * dir) }

  interactive(e) {
    for (const el of e.composedPath()) {
      if (el === this.root) return false
      if (!(el instanceof Element)) continue
      if (INTERACTIVE.has(el.tagName) || el.getAttribute('role') === 'button' || el.getAttribute('role') === 'slider' || el.hasAttribute('data-no-flip')) return true
    }
    return false
  }

  down(e) {
    const s = this.s
    if (s.pointerId !== null || e.button !== 0 || this.interactive(e)) return
    Object.assign(s, { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startAngle: s.angle, dragging: false, samples: [{ t: e.timeStamp, a: s.angle }] })
    this.root.setPointerCapture(e.pointerId)
  }

  move(e) {
    const s = this.s
    if (s.pointerId !== e.pointerId) {
      if (e.pointerType === 'mouse' && !reducedMotion()) { const r = this.root.getBoundingClientRect(); this.setTilt(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1) }
      return
    }
    const dx = e.clientX - s.startX, dy = e.clientY - s.startY
    if (!s.dragging) {
      if (Math.hypot(dx, dy) < DRAG_SLOP) return
      s.dragging = true; cancelAnimationFrame(s.raf); s.raf = 0; s.velocity = 0; this.setTilt(0, 0)
    }
    s.angle = s.startAngle + (this.axis === 'y' ? dx : -dy) * DEG_PER_PX
    s.samples.push({ t: e.timeStamp, a: s.angle }); if (s.samples.length > 8) s.samples.shift()
    this.paint()
  }

  release(e, cancelled) {
    const s = this.s
    if (s.pointerId !== e.pointerId) return
    s.pointerId = null
    if (!s.dragging) {
      if (!cancelled) {
        const r = this.root.getBoundingClientRect()
        const pushed = this.axis === 'y' ? e.clientX > r.left + r.width / 2 : e.clientY < r.top + r.height / 2
        this.flipBy(pushed ? 1 : -1)
      }
      return
    }
    s.dragging = false
    let v = 0
    const last = s.samples[s.samples.length - 1]
    if (!cancelled && last && e.timeStamp - last.t <= VELOCITY_WINDOW) {
      const first = s.samples.find((p) => last.t - p.t <= VELOCITY_WINDOW)
      if (first && last.t > first.t) v = ((last.a - first.a) / (last.t - first.t)) * 1000
    }
    const from = nearestFace(s.startAngle)
    let target = nearestFace(s.angle + v * PROJECTION)
    if (Math.abs(v) > FLICK_SPEED && target === from) target = from + 180 * Math.sign(v)
    const limit = MAX_HALF_TURNS * 180
    target = Math.max(from - limit, Math.min(from + limit, target))
    s.velocity = v
    this.aim(target)
  }

  update() {}
  hassChanged() { if (this.nestedFront) { this.nestedFront.hass = this.hass; this.nestedBack.hass = this.hass } }
  disconnected() { if (this.s) { cancelAnimationFrame(this.s.raf); this.s.raf = 0 } }
  getCardSize() { return 5 }
  getGridOptions() { return { columns: 6, rows: 'auto', min_columns: 4 } }
}

register(FlickCard)
