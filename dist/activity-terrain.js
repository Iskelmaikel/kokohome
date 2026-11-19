/**
 * Kokonut Activity Terrain → Lovelace (daily statistics as a 3D landscape).
 * A contribution-style heatmap that tilts up into terrain: columns rise in a
 * wave from where you grabbed, drag to orbit (with rubber-banded limits), flick
 * to spin, throw it down to go flat. Hover/arrow-keys read each day.
 *
 *   type: custom:kokonut-activity-terrain
 *   entity: sensor.ikea_plug_energy    # sum per day for meters, mean otherwise
 *   name: Desk energy
 *   weeks: 26
 *   flat: false                        # start in the flat heatmap view
 *   accent: '#10b981'
 *   height: 288
 */
import { KokoCard, register, clamp, friendlyName, fetchStatistics, formatNumber, reducedMotion, localDay, dayKey } from './core.js'

const DAYS = 7, GAP = 0.18, MAX_HEIGHT = 4.2, DEG = Math.PI / 180
const PITCH_TERRAIN = 56 * DEG, YAW_TERRAIN = 18 * DEG, YAW_LIMIT = 38 * DEG, PITCH_LIMIT = 66 * DEG
const DRAG_YAW = 0.32 * DEG, DRAG_PITCH = 0.36 * DEG, SPIN_HALF_LIFE = 0.16
const SPIN_IN = (YAW_TERRAIN * Math.LN2) / SPIN_HALF_LIFE
const PITCH_STIFFNESS = 140, PITCH_DAMPING = 2 * Math.sqrt(PITCH_STIFFNESS), EDGE_STIFFNESS = 180
const BUMP_STIFFNESS = 400, BUMP_DAMPING = 2 * Math.sqrt(BUMP_STIFFNESS) * 0.7, BUMP = 0.45, WAVE = 0.7, PADDING = 28, REST_EPSILON = 0.0005

function easeOutBack(t) { const c = 1.4, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u }
function rubber(v, min, max) {
  if (v < min) return min - 0.18 * (1 - Math.exp((v - min) / 0.18))
  if (v > max) return max + 0.18 * (1 - Math.exp((max - v) / 0.18))
  return v
}
function parseColor(value) {
  const v = value.trim()
  if (v.startsWith('#')) {
    const hex = v.slice(1), n = parseInt(hex.length === 3 ? hex.replace(/./g, '$&$&') : hex, 16)
    return [Math.floor(n / 65536) % 256, Math.floor(n / 256) % 256, n % 256]
  }
  const m = v.match(/[\d.]+/g)
  return m ? m.slice(0, 3).map(Number) : [136, 136, 136]
}
const shade = ([r, g, b], a) => { const k = 1 - a; return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})` }
function project(p, x, y, z) {
  const cos = Math.cos(p.yaw), sin = Math.sin(p.yaw)
  const xr = x * cos - z * sin, zr = x * sin + z * cos
  return [p.cx + xr * p.scale, p.cy + (zr * Math.cos(p.pitch) - y * Math.sin(p.pitch)) * p.scale]
}
function visibleFaces(pose, x0, z0, h) {
  const x1 = x0 + 1 - GAP, z1 = z0 + 1 - GAP
  const p = (x, y, z) => project(pose, x, y, z)
  const faces = []
  const sin = Math.sin(pose.yaw), cos = Math.cos(pose.yaw)
  if (h > 0.02 && pose.pitch > 0.01) {
    if (cos > 0) faces.push({ points: [p(x0, 0, z1), p(x1, 0, z1), p(x1, h, z1), p(x0, h, z1)], tone: 0.22 })
    else faces.push({ points: [p(x0, 0, z0), p(x1, 0, z0), p(x1, h, z0), p(x0, h, z0)], tone: 0.22 })
    if (sin > 0.001) faces.push({ points: [p(x1, 0, z0), p(x1, 0, z1), p(x1, h, z1), p(x1, h, z0)], tone: 0.38 })
    else if (sin < -0.001) faces.push({ points: [p(x0, 0, z0), p(x0, 0, z1), p(x0, h, z1), p(x0, h, z0)], tone: 0.38 })
  }
  faces.push({ points: [p(x0, h, z0), p(x1, h, z0), p(x1, h, z1), p(x0, h, z1)], tone: 0 })
  return faces
}
function inside(pts, x, y) {
  let hit = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}
function polygon(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath() }

class ActivityTerrain extends KokoCard {
  static tag = 'kokonut-activity-terrain'
  static cardName = 'Kokonut Activity Terrain'
  static description = 'Daily history as a heatmap that tilts up into an orbitable 3D terrain.'
  static defaults() { return { weeks: 26, flat: false, height: 288 } }
  static getStubConfig(hass) {
    const e = Object.keys(hass.states).find((x) => hass.states[x].attributes.state_class === 'total_increasing') || Object.keys(hass.states).find((x) => hass.states[x].attributes.state_class === 'measurement')
    return { entity: e || 'sensor.example_energy' }
  }
  validate(c) { if (!c.entity) throw new Error('kokonut-activity-terrain: "entity" is required') }
  watched() { return [] }

  css() {
    return `
.k-card { padding: 0; user-select: none; -webkit-user-select: none;
  --terrain-0: #f4f4f5; --terrain-1: #d4d4d8; --terrain-2: #a1a1aa; --terrain-3: #52525b; --terrain-4: #18181b; --terrain-accent: var(--t-accent, #10b981); --terrain-text: #a1a1aa; }
:host([dark]) .k-card { --terrain-0: #27272a; --terrain-1: #3f3f46; --terrain-2: #71717a; --terrain-3: #a1a1aa; --terrain-4: #f4f4f5; --terrain-accent: var(--t-accent, #34d399); --terrain-text: #71717a; }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 20px 20px 0; }
.head > div:first-child { min-width: 0; }
.t { margin: 0; font-size: 14px; font-weight: 500; }
.r { margin: 2px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; color: #71717a; font-variant-numeric: tabular-nums; } :host([dark]) .r { color: #a1a1aa; }
.seg { display: flex; flex: none; border-radius: 999px; background: #f4f4f5; padding: 2px; font-size: 12px; } :host([dark]) .seg { background: #18181b; }
.seg button { border-radius: 999px; padding: 4px 12px; font-weight: 500; border: 0; background: none; cursor: pointer; color: #71717a; transition: color .2s ease-out, background-color .2s ease-out; }
:host([dark]) .seg button { color: #a1a1aa; }
.seg button:hover { color: var(--k-fg); }
.seg button[aria-pressed=true] { background: #fff; color: #18181b; box-shadow: 0 1px 2px rgb(0 0 0/.05); } :host([dark]) .seg button[aria-pressed=true] { background: #3f3f46; color: #fafafa; }
canvas { display: block; width: 100%; touch-action: pan-y; outline: none; cursor: grab; }
canvas[data-dragging] { cursor: grabbing; }
canvas:focus-visible { box-shadow: inset 0 0 0 2px #a1a1aa; }
.legend { display: flex; align-items: center; justify-content: flex-end; gap: 4px; padding: 0 20px 16px; font-size: 12px; color: #71717a; } :host([dark]) .legend { color: #a1a1aa; }
.legend i { width: 10px; height: 10px; border-radius: 3px; }
@container koko (max-width: 320px) { .head { flex-direction: column; gap: 8px; padding: 14px 14px 0; } .legend { padding: 0 14px 12px; } }
`
  }

  render() {
    return `<div class="k-card">
      <div class="head"><div><p class="t"></p><p class="r" aria-live="polite"></p></div>
        <div class="seg"><button type="button" data-flat="1">Flat</button><button type="button" data-flat="0">Terrain</button></div></div>
      <canvas role="img" tabindex="0"></canvas>
      <div class="legend"><span style="margin-right:4px">Less</span>${[0, 1, 2, 3, 4].map((l) => `<i style="background:var(--terrain-${l})"></i>`).join('')}<span style="margin-left:4px">More</span></div>
    </div>`
  }

  build() {
    if (this.config.accent) this.style.setProperty('--t-accent', this.config.accent)
    this.canvas = this.$('canvas')
    this.canvas.style.height = `${this.config.height}px`
    this.flat = !!this.config.flat
    this.cells = []
    this.weeks = this.config.weeks
    this.s = { yaw: 0, yawSpeed: 0, pitch: 0, pitchSpeed: 0, pitchTarget: this.flat ? 0 : PITCH_TERRAIN, bumps: new Float64Array(0), bumpSpeeds: new Float64Array(0),
      hovered: -1, origin: { col: 0, row: 3 }, width: 0, height: 0, dpr: 1, drag: null, raf: 0, last: 0, visible: false, started: false }
    this.$('.seg').addEventListener('click', (e) => { const b = e.target.closest('button[data-flat]'); if (b) { const f = b.dataset.flat === '1'; if (f !== this.flat) this.setView(f) } })
    const c = this.canvas
    this.ro = new ResizeObserver(([en]) => {
      const s = this.s
      s.width = en.contentRect.width; s.height = en.contentRect.height
      s.dpr = Math.min(window.devicePixelRatio || 1, 2)
      c.width = Math.round(s.width * s.dpr); c.height = Math.round(s.height * s.dpr)
      this.draw()
    })
    this.ro.observe(c)
    let onScreen = false
    this._vis = () => {
      const s = this.s
      s.visible = onScreen && !document.hidden
      if (s.visible) {
        if (!s.started && this.cells.length) { s.started = true; if (s.pitchTarget > 0) this.turnIn() }
        this.wake()
      } else if (s.raf) { cancelAnimationFrame(s.raf); s.raf = 0; s.last = 0 }
    }
    this.io = new IntersectionObserver(([en]) => { onScreen = en.isIntersecting; this._vis() })
    this.io.observe(c)
    document.addEventListener('visibilitychange', this._vis)
    c.addEventListener('pointerdown', (e) => this.down(e))
    c.addEventListener('pointermove', (e) => this.move(e))
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) c.addEventListener(ev, (e) => this.up(e))
    c.addEventListener('pointerleave', (e) => { if (!this.s.drag && e.pointerType === 'mouse') this.hover(null) })
    c.addEventListener('blur', () => { if (!this.s.drag) this.hover(null) })
    c.addEventListener('keydown', (e) => this.key(e))
    this.paintSeg()
  }

  paintSeg() { this.$$('.seg button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.flat === '1') === this.flat))) }

  async load() {
    const id = this.config.entity
    const s = this.hass.states[id]
    const mode = this.config.aggregate || (s && s.attributes.state_class === 'measurement' ? 'mean' : 'sum')
    const days = this.config.weeks * DAYS
    const start = localDay(-(days - 1))
    const stats = await fetchStatistics(this.hass, [id], start, new Date(), 'day', ['change', 'mean'])
    const byDay = new Map()
    for (const r of stats[id] || []) byDay.set(dayKey(r.t), Math.max(0, Number(mode === 'mean' ? r.mean ?? 0 : r.change ?? 0) || 0))
    const data = Array.from({ length: days }, (_, i) => byDay.get(dayKey(localDay(i, start))) ?? 0)
    this.unit = this.config.unit || (s && s.attributes.unit_of_measurement) || ''
    this.mode = mode
    this.buildCells(data, start)
    this.loadedAt = Date.now()
    if (this.s.visible && !this.s.started) this._vis()
    this.readout()
    this.draw()
  }

  buildCells(data, start) {
    const offset = (start.getDay() + 6) % 7 // rows run Monday to Sunday
    const max = Math.max(1e-9, ...data)
    this.total = data.reduce((a, b) => a + b, 0)
    this.cells = data.map((count, index) => {
      const slot = index + offset, norm = count / max
      return { index, col: Math.floor(slot / DAYS), row: slot % DAYS, count, level: count === 0 ? 0 : Math.ceil(norm * 4), height: 0.06 + norm ** 0.85 * MAX_HEIGHT, date: localDay(index, start) }
    })
    this.weeks = (this.cells.length ? this.cells[this.cells.length - 1].col : 0) + 1
    this.s.bumps = new Float64Array(this.cells.length); this.s.bumpSpeeds = new Float64Array(this.cells.length)
  }

  readPalette() {
    const st = getComputedStyle(this.$('.k-card'))
    const read = (n) => st.getPropertyValue(n) || '#888888'
    return { levels: [0, 1, 2, 3, 4].map((l) => parseColor(read(`--terrain-${l}`))), accent: parseColor(read('--terrain-accent')), text: read('--terrain-text').trim(), font: st.fontFamily }
  }

  columnHeight(cell, lift) {
    const s = this.s
    const span = Math.hypot(this.weeks, DAYS) || 1
    const d = Math.hypot(cell.col - s.origin.col, cell.row - s.origin.row) / span
    const local = clamp(lift * (1 + WAVE) - d * WAVE, 0, 1)
    return cell.height * easeOutBack(local) + s.bumps[cell.index]
  }

  pose() {
    const s = this.s, w = this.weeks
    const lift = clamp(s.pitch / PITCH_TERRAIN, 0, 1.2)
    const probe = { yaw: s.yaw, pitch: s.pitch, scale: 1, cx: 0, cy: 0 }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const [x, z] of [[0, 0], [w, 0], [0, DAYS], [w, DAYS]]) {
      for (const y of [0, MAX_HEIGHT * Math.min(lift, 1)]) {
        const [px, py] = project(probe, x - w / 2, y, z - DAYS / 2)
        minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py)
      }
    }
    const scale = Math.min((s.width - PADDING * 2) / (maxX - minX), (s.height - PADDING * 2) / (maxY - minY))
    return { yaw: s.yaw, pitch: s.pitch, scale, cx: s.width / 2 - ((minX + maxX) / 2) * scale, cy: s.height / 2 - ((minY + maxY) / 2) * scale + 6, lift }
  }

  ordered(p) {
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw), w = this.weeks
    const depth = (c) => (c.col + 0.5 - w / 2) * sin + (c.row + 0.5 - DAYS / 2) * cos
    return [...this.cells].sort((a, b) => depth(a) - depth(b))
  }

  drawLabels(ctx, p, lift, pal) {
    const alpha = clamp(1 - lift * 1.6, 0, 1)
    if (alpha === 0) return
    const lang = (this.hass && this.hass.locale && this.hass.locale.language) || undefined
    ctx.globalAlpha = alpha
    ctx.fillStyle = pal.text
    ctx.font = `11px ${pal.font}`
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'
    let month = -1
    for (const cell of this.cells) {
      if (cell.row !== 0 && cell.index !== 0) continue
      const m = cell.date.getMonth()
      if (m !== month && cell.col < this.weeks - 1) {
        month = m
        const [x, y] = project(p, cell.col - this.weeks / 2, 0, -0.75 - DAYS / 2)
        ctx.fillText(cell.date.toLocaleDateString(lang, { month: 'short' }), x, y)
      }
    }
    ctx.textAlign = 'right'
    const mon = new Date(2024, 0, 1) // a Monday
    for (const row of [0, 2, 4]) {
      const [x, y] = project(p, -0.35 - this.weeks / 2, 0, row + 0.4 - DAYS / 2)
      ctx.fillText(localDay(row, mon).toLocaleDateString(lang, { weekday: 'short' }), x, y)
    }
    ctx.globalAlpha = 1
  }

  draw() {
    const s = this.s, ctx = this.canvas.getContext('2d')
    if (!ctx || !s.width || !this.cells.length) return
    const dark = this.hasAttribute('dark')
    if (!this.pal || this._palDark !== dark) { this.pal = this.readPalette(); this._palDark = dark }
    const pal = this.pal, p = this.pose()
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0)
    ctx.clearRect(0, 0, s.width, s.height)
    this.drawLabels(ctx, p, p.lift, pal)
    ctx.lineJoin = 'round'
    for (const cell of this.ordered(p)) {
      const h = this.columnHeight(cell, p.lift)
      const color = cell.index === s.hovered ? pal.accent : pal.levels[cell.level]
      for (const face of visibleFaces(p, cell.col - this.weeks / 2, cell.row - DAYS / 2, h)) {
        polygon(ctx, face.points)
        const fill = shade(color, face.tone)
        ctx.fillStyle = fill; ctx.fill()
        ctx.strokeStyle = fill; ctx.lineWidth = 0.6; ctx.stroke()
      }
    }
  }

  hitTest(x, y) {
    const p = this.pose(), list = this.ordered(p)
    for (let i = list.length - 1; i >= 0; i--) {
      const cell = list[i], h = this.columnHeight(cell, p.lift)
      for (const f of visibleFaces(p, cell.col - this.weeks / 2, cell.row - DAYS / 2, h)) if (inside(f.points, x, y)) return cell
    }
    return null
  }

  stepSprings(dt) {
    const s = this.s
    let energy = 0
    if (!s.drag) {
      s.yawSpeed *= 0.5 ** (dt / SPIN_HALF_LIFE)
      let target = s.yaw
      if (s.pitchTarget === 0) target = 0
      else if (s.yaw > YAW_LIMIT) target = YAW_LIMIT
      else if (s.yaw < -YAW_LIMIT) target = -YAW_LIMIT
      if (target !== s.yaw) s.yawSpeed += ((target - s.yaw) * EDGE_STIFFNESS - s.yawSpeed * 2 * Math.sqrt(EDGE_STIFFNESS)) * dt
      s.yaw += s.yawSpeed * dt
      energy = Math.max(energy, Math.abs(s.yawSpeed), Math.abs(target - s.yaw))
      s.pitchSpeed += ((s.pitchTarget - s.pitch) * PITCH_STIFFNESS - s.pitchSpeed * PITCH_DAMPING) * dt
      s.pitch += s.pitchSpeed * dt
      energy = Math.max(energy, Math.abs(s.pitchSpeed), Math.abs(s.pitchTarget - s.pitch))
    }
    for (let i = 0; i < s.bumps.length; i++) {
      const target = i === s.hovered && s.pitch > 0.1 ? BUMP : 0
      s.bumpSpeeds[i] += ((target - s.bumps[i]) * BUMP_STIFFNESS - s.bumpSpeeds[i] * BUMP_DAMPING) * dt
      s.bumps[i] += s.bumpSpeeds[i] * dt
      energy = Math.max(energy, Math.abs(s.bumpSpeeds[i]) * 0.1, Math.abs(target - s.bumps[i]))
    }
    return energy
  }

  tick = (now) => {
    const s = this.s
    s.raf = 0
    const dt = s.last ? Math.min((now - s.last) / 1000, 1 / 30) : 1 / 60
    s.last = now
    const energy = this.stepSprings(dt)
    this.draw()
    if ((s.drag || energy > REST_EPSILON) && s.visible) s.raf = requestAnimationFrame(this.tick); else s.last = 0
  }

  turnIn() { const s = this.s; if (Math.abs(s.yaw) > 2 * DEG) return; if (reducedMotion()) s.yaw = YAW_TERRAIN; else s.yawSpeed = SPIN_IN }

  wake() {
    const s = this.s
    if (reducedMotion()) { s.pitch = s.pitchTarget; s.yaw = clamp(s.yaw, -YAW_LIMIT, YAW_LIMIT); s.pitchSpeed = 0; s.yawSpeed = 0; s.bumps.fill(0); this.draw(); return }
    if (!s.raf && s.visible) s.raf = requestAnimationFrame(this.tick)
  }

  setView(flat, origin) {
    const s = this.s
    this.flat = flat; this.paintSeg()
    s.origin = origin || { col: flat ? this.weeks : 0, row: 3 }
    s.pitchTarget = flat ? 0 : PITCH_TERRAIN
    s.yawSpeed = 0
    if (!flat) this.turnIn()
    this.wake()
  }

  local(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }

  hover(cell) {
    const s = this.s, index = cell ? cell.index : -1
    if (index === s.hovered) return
    s.hovered = index
    this.active = cell
    this.readout()
    if (reducedMotion()) this.draw(); else this.wake()
  }

  fmt(v) { return `${formatNumber(this.hass, v, { maximumFractionDigits: v >= 100 ? 0 : 1 })}${this.unit ? ` ${this.unit}` : ''}` }

  readout() {
    const lang = (this.hass && this.hass.locale && this.hass.locale.language) || undefined
    const c = this.active
    const text = !this.cells.length ? 'Loading statistics…' : c
      ? `${this.fmt(c.count)} on ${c.date.toLocaleDateString(lang, { weekday: 'short', month: 'short', day: 'numeric' })}`
      : this.mode === 'mean' ? `${this.fmt(this.total / Math.max(1, this.cells.length))} on average over ${this.weeks} weeks` : `${this.fmt(this.total)} in the last ${this.weeks} weeks`
    this.$('.r').textContent = text
    this.canvas.setAttribute('aria-label', `${this.$('.t').textContent}: ${text}. Use the arrow keys to read each day.`)
  }

  down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const s = this.s, { x, y } = this.local(e)
    this.canvas.setPointerCapture(e.pointerId)
    const cell = this.hitTest(x, y)
    if (cell) s.origin = { col: cell.col, row: cell.row }
    s.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw: s.yaw, pitch: s.pitch, moved: false, samples: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }] }
    s.yawSpeed = 0; s.pitchSpeed = 0
    this.canvas.toggleAttribute('data-dragging', true)
    this.hover(cell)
    this.wake()
  }

  move(e) {
    const s = this.s, d = s.drag
    if (!d || d.id !== e.pointerId) { if (e.pointerType === 'mouse') { const { x, y } = this.local(e); this.hover(this.hitTest(x, y)) } return }
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) > 4) d.moved = true
    if (!d.moved) return
    s.yaw = rubber(d.yaw + dx * DRAG_YAW, -YAW_LIMIT, YAW_LIMIT)
    s.pitch = rubber(d.pitch + dy * DRAG_PITCH, 0, PITCH_LIMIT)
    d.samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY })
    if (d.samples.length > 5) d.samples.shift()
    if (reducedMotion()) this.draw(); else this.wake()
  }

  up(e) {
    const s = this.s, d = s.drag
    if (!d || d.id !== e.pointerId) return
    s.drag = null
    this.canvas.toggleAttribute('data-dragging', false)
    if (!d.moved) { this.wake(); return }
    const first = d.samples[0], last = d.samples[d.samples.length - 1] || first
    const dt = Math.max((last.t - first.t) / 1000, 0.016)
    const recent = e.timeStamp - last.t < 80
    s.yawSpeed = recent ? ((last.x - first.x) / dt) * DRAG_YAW : 0
    s.pitchSpeed = recent ? ((last.y - first.y) / dt) * DRAG_PITCH : 0
    const nextFlat = s.pitch + s.pitchSpeed * 0.15 < PITCH_TERRAIN / 2
    this.flat = nextFlat; this.paintSeg()
    s.pitchTarget = nextFlat ? 0 : PITCH_TERRAIN
    this.wake()
  }

  key(e) {
    const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
    if (!move || !this.cells.length) return
    e.preventDefault()
    const cur = this.cells[this.s.hovered] || this.cells[this.cells.length - 1]
    const next = this.cells.find((c) => c.col === cur.col + move[0] && c.row === cur.row + move[1])
    this.hover(next || cur)
  }

  update() {
    this.$('.t').textContent = this.config.name || friendlyName(this.hass.states[this.config.entity], this.config.entity)
    if (!this.cells.length && !this._loading) { this._loading = true; this.readout(); this.load().finally(() => { this._loading = false }) }
  }

  hassChanged() {
    if (this._palDark !== undefined && this._palDark !== this.hasAttribute('dark')) this.draw()
    if (this.loadedAt && Date.now() - this.loadedAt > 1800000 && !this._loading) { this._loading = true; this.load().finally(() => { this._loading = false }) }
  }

  connected() { if (this._vis) this._vis() }
  disconnected() { const s = this.s; if (s && s.raf) { cancelAnimationFrame(s.raf); s.raf = 0; s.last = 0 } }
  getCardSize() { return 7 }
  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 } }
}

register(ActivityTerrain)
