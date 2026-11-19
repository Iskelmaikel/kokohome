/**
 * Kokonut Apple Activity Card → Lovelace.
 * Up to three concentric goal rings that draw one after another when scrolled
 * into view, counting their numbers up in step. Past the goal the ring keeps
 * going for another lap, led by a shadowed end cap; hitting the goal pulses
 * the cap. Hover or focus a ring to dim the others.
 *
 *   type: custom:kokonut-activity-rings
 *   title: Today
 *   rings:                              # outermost first
 *     - entity: sensor.ikea_plug_energy
 *       target: 2                       # goal (number or entity id)
 *       label: ENERGY
 *       unit: KWH
 *       color: '#FF2D55'                # colour; color_end optional
 *     - entity: sensor.steps
 *       target: 10000
 */
import { KokoCard, register, MotionValue, friendlyName, escapeHtml, ease, reducedMotion, isUnavailable } from './core.js'

const STROKE = 16, STAGGER = 0.18, DRAW_S = 1.2, OVER_S = 0.6, MAX_LAPS = 3
const PRESETS = [['#FF2D55', '#FF6B8B'], ['#A3F900', '#C5FF4D'], ['#04C7DD', '#4DDFED']]
let uid = 0
const ratioOf = (cur, tgt) => (tgt > 0 ? Math.min(Math.max(cur / tgt, 0), MAX_LAPS) : 0)
const drawSeconds = (ratio) => DRAW_S + OVER_S * Math.min(Math.max(ratio - 1, 0), 1)

class ActivityRings extends KokoCard {
  static tag = 'kokonut-activity-rings'
  static cardName = 'Kokonut Activity Rings'
  static description = 'Apple-Watch-style goal rings for energy, steps, water or any sensor vs a target.'
  static defaults() { return { title: 'Activity' } }
  static getStubConfig(hass) {
    const e = Object.keys(hass.states).filter((x) => x.startsWith('sensor.') && !Number.isNaN(Number(hass.states[x].state))).slice(0, 3)
    return { rings: e.map((x) => ({ entity: x, target: Math.max(1, Math.round(Number(hass.states[x].state) * 1.5)) })) }
  }
  validate(c) { if (!Array.isArray(c.rings) || !c.rings.length) throw new Error('kokonut-activity-rings: "rings" must be a non-empty list') }
  watched() { return this.config.rings.flatMap((r) => [r.entity, typeof r.target === 'string' ? r.target : null]).filter(Boolean) }

  css() {
    return `
.k-card { padding: 20px; }
.wrap { display: flex; flex-direction: column; align-items: center; gap: 20px; }
h2 { margin: 0; font-size: 18px; font-weight: 500; opacity: 0; transform: translateY(-12px); transition: opacity .5s cubic-bezier(.23,1,.32,1), transform .5s cubic-bezier(.23,1,.32,1); }
.row { display: flex; flex-direction: column; align-items: center; gap: 20px; }
@container koko (min-width: 400px) { .row { flex-direction: row; gap: 32px; } }
.box { position: relative; flex: none; }
.layer { pointer-events: none; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0; transform: scale(.96); transition: opacity .3s cubic-bezier(.23,1,.32,1), transform .3s cubic-bezier(.23,1,.32,1); }
svg.r { transform: rotate(-90deg); overflow: visible; border-radius: 999px; outline: none; transition: opacity .2s ease-out; pointer-events: none;
  --ring-from: var(--ring); --ring-to: var(--ring-end); }
@supports (color: oklch(from red l c h)) {
  :host(:not([dark])) svg.r { --ring-from: oklch(from var(--ring) min(l, 0.8) c h); --ring-to: oklch(from var(--ring) min(l, 0.7) c h); }
}
svg.r.dim { opacity: .25; }
svg.r:focus-visible { box-shadow: 0 0 0 2px #a1a1aa; }
.track { color: rgb(228 228 231/.6); pointer-events: stroke; } :host([dark]) .track { color: rgb(39 39 42/.6); }
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 16px; opacity: 0; transform: translateX(16px); transition: opacity .5s .3s cubic-bezier(.23,1,.32,1), transform .5s .3s cubic-bezier(.23,1,.32,1); }
@container koko (max-width: 399px) { ul { flex-direction: row; flex-wrap: wrap; justify-content: center; gap: 12px 20px; transform: translateY(8px); } }
li { display: flex; flex-direction: column; transition: opacity .2s ease-out; }
li.dim { opacity: .4; }
.lab { font-size: 13px; font-weight: 500; color: #52525b; } :host([dark]) .lab { color: #a1a1aa; }
.num { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--ring); }
@supports (color: oklch(from red l c h)) { :host(:not([dark])) .num { color: oklch(from var(--ring) 0.6 c h); } }
.num small { margin-left: 4px; font-size: 14px; color: #52525b; font-weight: 500; } :host([dark]) .num small { color: #a1a1aa; }
.in h2 { opacity: 1; transform: none; }
.in .layer { opacity: 1; transform: none; }
.in ul { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) { h2, .layer, ul { transform: none !important; } }
`
  }

  render() {
    return `<div class="k-card"><div class="wrap"><h2></h2><div class="row"><div class="box"></div><ul></ul></div></div></div>`
  }

  build() {
    this.wrapEl = this.$('.wrap'); this.box = this.$('.box'); this.list = this.$('ul')
    this.rings = []
    this.inView = false
    this.active = null
    this.io = new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting) && !this.inView) { this.inView = true; this.wrapEl.classList.add('in'); this.drawAll() }
    }, { rootMargin: '-40px 0px' })
    this.io.observe(this.$('.k-card'))
    this.ro = new ResizeObserver(() => this.layout())
    this.ro.observe(this.$('.k-card'))
  }

  data() {
    return this.config.rings.map((r, i) => {
      const s = this.hass.states[r.entity]
      const tgtState = typeof r.target === 'string' ? this.hass.states[r.target] : null
      const target = Number(tgtState ? tgtState.state : r.target ?? 100)
      const current = Number(s ? s.state : 0)
      const [c0, c1] = PRESETS[i % PRESETS.length]
      const dec = Number.isInteger(current) ? 0 : 1
      return { label: (r.label || (s ? friendlyName(s) : r.entity)).toUpperCase(), color: r.color || c0, colorEnd: r.color_end || r.color || c1,
        current: Number.isFinite(current) ? current : 0, target, unit: (r.unit ?? (s && s.attributes.unit_of_measurement) ?? '').toUpperCase(), dec, unavailable: isUnavailable(s) }
    })
  }

  layout() {
    if (!this.hass) return
    const w = this.$('.k-card').clientWidth - 40
    const n = this.config.rings.length
    const big = Math.max(120, Math.min(200, w))
    const sizes = Array.from({ length: n }, (_, i) => big - i * (big / 5))
    const key = sizes.join(',')
    if (key === this._sizes) return
    this._sizes = key
    this.box.style.width = `${big}px`; this.box.style.height = `${big}px`
    this.box.innerHTML = ''
    this.rings = this.data().map((d, i) => this.makeRing(d, i, sizes[i]))
    this.renderList()
    if (this.inView) this.drawAll(true)
  }

  makeRing(d, i, size) {
    const radius = (size - STROKE) / 2, circ = radius * 2 * Math.PI, c = size / 2
    const gid = `kar-g-${++uid}`, sid = `kar-s-${uid}`
    const layer = document.createElement('div')
    layer.className = 'layer'
    layer.style.transitionDelay = `${i * STAGGER}s`
    layer.innerHTML = `<svg class="r" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" tabindex="0" style="--ring:${d.color};--ring-end:${d.colorEnd}">
      <title></title>
      <defs><linearGradient id="${gid}" x1="0%" x2="100%" y1="0%" y2="100%"><stop offset="0%" style="stop-color:var(--ring-from)"/><stop offset="100%" style="stop-color:var(--ring-to)"/></linearGradient>
      <filter id="${sid}" x="-100%" y="-100%" width="300%" height="300%"><feDropShadow dx="0" dy="-2.5" flood-color="#000" flood-opacity=".5" stdDeviation="2"/></filter></defs>
      <circle class="track" cx="${c}" cy="${c}" r="${radius}" fill="none" stroke="currentColor" stroke-width="${STROKE}"/>
      <circle class="base" cx="${c}" cy="${c}" r="${radius}" fill="none" stroke="url(#${gid})" stroke-dasharray="${circ}" stroke-dashoffset="${circ}" stroke-linecap="round" stroke-width="${STROKE}" pointer-events="none"/>
      <circle class="lap" cx="${c}" cy="${c}" r="${radius}" fill="none" stroke-dasharray="${circ}" stroke-dashoffset="${circ}" stroke-linecap="round" stroke-width="${STROKE}" pointer-events="none" style="opacity:0;stroke:var(--ring-to)"/>
      <g class="cap" pointer-events="none" style="opacity:0;transform-box:view-box;transform-origin:center"><circle cx="${c + radius}" cy="${c}" r="${STROKE / 2}" filter="url(#${sid})" style="fill:var(--ring-to)"/></g>
      <circle class="pulse" cx="${c + radius}" cy="${c}" r="${STROKE / 2}" fill="none" stroke-width="2" pointer-events="none" style="opacity:0;stroke:var(--ring-to);transform-box:fill-box;transform-origin:center"/>
    </svg>`
    this.box.append(layer)
    const svg = layer.querySelector('svg')
    const ring = { i, d, circ, layer, svg, base: svg.querySelector('.base'), lap: svg.querySelector('.lap'), cap: svg.querySelector('.cap'), pulse: svg.querySelector('.pulse'), shown: null, mv: new MotionValue(0) }
    const track = svg.querySelector('.track')
    track.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.setActive(i) })
    track.addEventListener('pointerleave', () => this.setActive(null, i))
    svg.addEventListener('focus', () => this.setActive(i))
    svg.addEventListener('blur', () => this.setActive(null, i))
    svg.addEventListener('click', () => this.moreInfo(this.config.rings[i].entity))
    track.style.pointerEvents = 'stroke'
    track.style.cursor = 'pointer'
    ring.mv.on((p) => this.paintRing(ring, p))
    return ring
  }

  setActive(i, leaving) {
    if (i === null && leaving !== undefined && this.active !== leaving) return
    this.active = i
    this.rings.forEach((r, j) => r.svg.classList.toggle('dim', i !== null && i !== j))
    this.$$('li').forEach((li, j) => li.classList.toggle('dim', i !== null && i !== j))
  }

  renderList() {
    this.list.innerHTML = this.data().map((d, i) => `<li style="--ring:${d.color}"><span class="lab">${escapeHtml(d.label)}</span><span class="num"><span class="sr">${d.current} of ${d.target} ${escapeHtml(d.unit)}</span><span aria-hidden="true"><span class="cnt" data-i="${i}">${d.current.toFixed(d.dec)}</span>/${d.target}<small>${escapeHtml(d.unit)}</small></span></span></li>`).join('')
    this.list.querySelectorAll('li').forEach((li, i) => {
      li.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.setActive(i) })
      li.addEventListener('pointerleave', () => this.setActive(null, i))
    })
  }

  paintRing(ring, p) {
    const { circ, d } = ring
    const ratio = ratioOf(d.current, d.target)
    ring.base.setAttribute('stroke-dashoffset', `${(1 - Math.min(p, 1)) * circ}`)
    const over = p > 1
    const rest = over ? p - Math.floor(p) || 1 : 0
    ring.lap.setAttribute('stroke-dashoffset', `${(1 - rest) * circ}`)
    ring.lap.style.opacity = over ? '1' : '0'
    ring.cap.style.transform = `rotate(${rest * 360}deg)`
    ring.cap.style.opacity = over ? '1' : '0'
    const cnt = this.list.querySelector(`.cnt[data-i="${ring.i}"]`)
    if (cnt) cnt.textContent = p >= ratio || ratio === 0 ? d.current.toFixed(d.dec) : ((p / ratio) * d.current).toFixed(d.dec)
    if (!ring.pulsed && p >= 1) {
      ring.pulsed = true
      ring.pulse.animate([{ transform: 'scale(1)', opacity: 0.6 }, { transform: 'scale(2.4)', opacity: 0 }], { duration: 560, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' })
    }
  }

  drawAll(instant) {
    const data = this.data()
    this.rings.forEach((ring, i) => {
      ring.d = data[i]
      const ratio = ratioOf(ring.d.current, ring.d.target)
      ring.svg.setAttribute('aria-label', `${ring.d.label}: ${ring.d.current} of ${ring.d.target} ${ring.d.unit}, ${Math.round(ratio * 100)}%`)
      ring.svg.querySelector('title').textContent = ring.svg.getAttribute('aria-label')
      if (instant || reducedMotion() || ratio === 0) { ring.pulsed = ratio >= 1; ring.mv.jump(ratio); ring.shown = ratio; return }
      if (ring.shown === ratio) return
      const from = ring.shown
      if (from === null) { ring.pulsed = false; ring.mv.jump(0) } else ring.pulsed = from >= 1
      ring.shown = ratio
      ring.mv.tween(ratio, { duration: drawSeconds(ratio), delay: from === null ? i * STAGGER : 0, ease: ease.out })
    })
  }

  update() {
    this.$('h2').textContent = this.config.title
    if (!this.rings.length) { this.layout(); return }
    const key = JSON.stringify(this.data())
    if (key === this._dataKey) return
    this._dataKey = key
    this.renderList()
    if (this.inView) this.drawAll()
  }

  disconnected() { for (const r of this.rings) r.mv.stop() }
  getCardSize() { return 6 }
  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 } }
}

register(ActivityRings)
