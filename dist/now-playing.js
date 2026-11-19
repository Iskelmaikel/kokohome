/**
 * Kokonut Now Playing → Lovelace (any media_player).
 * A record that spins at 33⅓ while playing (on the compositor), spins up and
 * down with play/pause, and can be grabbed: a finger stops it dead, turning it
 * scrubs the track (faster turns cover more), a flick keeps spinning and eases
 * back to cruise. The progress rail rubber-bands past its ends. The media's
 * artwork is printed on the disc label; the tonearm drops when playing.
 *
 *   type: custom:kokonut-now-playing
 *   entity: media_player.living_room_lg_tv
 *   name: Living room TV
 *   accent: '#f97316'
 */
import { KokoCard, register, clamp, friendlyName, domainOf, escapeHtml, haptic, isUnavailable } from './core.js'

const CRUISE = 200, CRUISE_MS = 1800, MAX_OMEGA = 2160
const COAST_TAU = 0.45, SPIN_UP_TAU = 0.22, SPIN_DOWN_TAU = 0.2, SETTLE_EPSILON = 2
const DEAD_ZONE = 10, VELOCITY_WINDOW_MS = 80, STALE_MOVE_MS = 60, HOLD_SETTLE_S = 0.05
const BAR_COUNT = 5, BAR_REST = 0.14, BAR_DECAY_S = 0.3, BAR_ATTACK_S = 0.08
const RUBBER_MAX = 18, SEEK_STEP = 5, MAX_DT = 0.05, ROLL_MS = 220
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)', RUBBER_RETURN = 'transform 450ms cubic-bezier(0.34, 1.4, 0.64, 1)'
const SUPPORT = { PAUSE: 1, SEEK: 2, PREVIOUS: 16, NEXT: 32, TURN_ON: 128, PLAY: 16384 }
const GROOVES = [28, 31, 34, 37, 40, 43, 46]
let uid = 0

const damp = (d, max) => max * (1 - Math.exp(-d / max))
const fmtTime = (sec) => { const s = Math.max(0, Math.floor(sec)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}` }
function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s) }
function noise(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i) * (1 - u) + hash(i + 1) * u }
const barLevel = (i, t) => 0.6 * noise(t * 4.3 + i * 17.3) + 0.4 * noise(t * 9.1 + i * 31.7 + 100)
const scrubGain = (speed) => 1 + 1.5 * (Math.max(0, Math.abs(speed) - CRUISE) / CRUISE) ** 1.5
const trackRate = (omega) => (omega / CRUISE) * scrubGain(omega)
const rotate = (a) => `rotate(${Math.round((a % 360) * 100) / 100}deg)`
function strHash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) }

function labelArt(variant) {
  const INK = 'fill="#18181b"', ACC = 'fill="var(--np-accent)"'
  if (variant === 1) return `<g><path ${ACC} d="M50 50 L50 8 A42 42 0 0 1 92 50 Z"/><path ${INK} d="M50 50 L8 50 A42 42 0 0 1 50 8 Z"/><rect ${INK} height="6" rx="1" width="30" x="50" y="62"/><rect ${INK} height="6" rx="1" width="20" x="50" y="72"/></g>`
  if (variant === 2) return `<g>${Array.from({ length: 25 }, (_, i) => `<circle ${i === 8 ? ACC : INK} cx="${26 + (i % 5) * 12}" cy="${26 + Math.floor(i / 5) * 12}" r="${i === 8 ? 5.5 : 2.6}"/>`).join('')}</g>`
  return `<g><circle ${ACC} cx="64" cy="36" r="20"/><rect ${INK} height="5" width="64" x="18" y="60"/><rect ${INK} height="5" width="52" x="18" y="70"/><rect ${INK} height="5" width="40" x="18" y="80"/></g>`
}

class NowPlaying extends KokoCard {
  static tag = 'kokonut-now-playing'
  static cardName = 'Kokonut Now Playing'
  static description = 'A spinning, scrubbable record for any media player.'
  static defaults() { return { accent: '#f97316' } }
  static getStubConfig(hass) { const e = Object.keys(hass.states).find((x) => x.startsWith('media_player.')); return { entity: e || 'media_player.example' } }
  validate(c) { if (!c.entity || domainOf(c.entity) !== 'media_player') throw new Error('kokonut-now-playing: "entity" must be a media_player') }

  css() {
    return `
.k-card { padding: 20px; container-type: inline-size; }
@keyframes in-up { from { transform: translateY(90%); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes out-up { from { transform: none; opacity: 1 } to { transform: translateY(-90%); opacity: 0 } }
@keyframes in-down { from { transform: translateY(-90%); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes out-down { from { transform: none; opacity: 1 } to { transform: translateY(90%); opacity: 0 } }
.top { display: flex; align-items: center; gap: 20px; }
.deck { position: relative; width: 112px; height: 112px; flex: none; }
@container (min-width: 352px) { .deck { width: 128px; height: 128px; } }
@container (max-width: 250px) { .top { flex-direction: column; align-items: flex-start; gap: 14px; } }
.disc { width: 100%; height: 100%; border-radius: 999px; box-shadow: 0 6px 16px -6px rgb(0 0 0/.45); touch-action: none; user-select: none; cursor: grab; }
.disc:active { cursor: grabbing; }
.disc svg { display: block; width: 100%; height: 100%; }
.vinyl { fill: #18181b; } :host([dark]) .vinyl { fill: #000; }
.hole { fill: #fff; } :host([dark]) .hole { fill: #18181b; }
.arm { pointer-events: none; position: absolute; top: -4px; right: -16px; height: 80%; width: auto; transform-origin: 77.5% 10%; transition: transform .5s cubic-bezier(.77,0,.175,1); transform: rotate(-8deg); }
.arm[data-down] { transform: rotate(11deg); }
.arm .pivot { fill: #e4e4e7; stroke: #d4d4d8; } :host([dark]) .arm .pivot { fill: #3f3f46; stroke: #52525b; }
.arm .rod { fill: none; stroke: #a1a1aa; } :host([dark]) .arm .rod { stroke: #71717a; }
.arm .head { fill: #52525b; } :host([dark]) .arm .head { fill: #d4d4d8; }
.meta { min-width: 0; flex: 1; width: 100%; }
.np { display: flex; align-items: center; gap: 8px; }
.bars { display: flex; height: 14px; align-items: flex-end; gap: 2px; }
.bars i { height: 100%; width: 3px; transform-origin: bottom; border-radius: 1px; background: var(--np-accent); transform: scaleY(${BAR_REST}); }
.np b { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: .05em; color: #71717a; } :host([dark]) .np b { color: #a1a1aa; }
h3 { margin: 8px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 16px; font-weight: 600; cursor: pointer; }
.artist { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; color: #71717a; } :host([dark]) .artist { color: #a1a1aa; }
.rpm { margin-top: 8px; display: inline-block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: #a1a1aa; font-variant-numeric: tabular-nums; } :host([dark]) .rpm { color: #71717a; }
.seek { margin: 12px 0 -8px; padding: 8px 0; cursor: pointer; touch-action: none; outline: none; }
.seek[aria-disabled=true] { cursor: default; }
.track { height: 6px; }
.rail { height: 100%; overflow: hidden; border-radius: 999px; background: #e4e4e7; } :host([dark]) .rail { background: #27272a; }
.seek:focus-visible .rail { box-shadow: 0 0 0 2px var(--k-bg), 0 0 0 4px #a1a1aa; }
.fill { height: 100%; width: 100%; transform-origin: left; background: var(--np-accent); transform: scaleX(0); }
.times { margin-top: 8px; display: flex; justify-content: space-between; font-size: 12px; font-weight: 500; color: #71717a; font-variant-numeric: tabular-nums; } :host([dark]) .times { color: #a1a1aa; }
.clock { display: inline-flex; flex-direction: row-reverse; }
.dg { position: relative; display: inline-block; height: 1lh; overflow: hidden; }
.dg > span { display: block; }
.dg > span.prev { position: absolute; inset: 0; }
.ctl { margin-top: 12px; display: flex; align-items: center; justify-content: center; gap: 12px; }
.ib { display: inline-flex; width: 40px; height: 40px; align-items: center; justify-content: center; border-radius: 999px; border: 0; background: none; cursor: pointer; color: #52525b; transition: background-color .15s, color .15s; }
:host([dark]) .ib { color: #a1a1aa; }
.ib:hover { background: #f4f4f5; color: #18181b; } :host([dark]) .ib:hover { background: #27272a; color: #f4f4f5; }
.ib:active { background: #e4e4e7; } :host([dark]) .ib:active { background: #3f3f46; }
.ib:disabled { opacity: .35; pointer-events: none; }
.pp { display: inline-flex; width: 48px; height: 48px; align-items: center; justify-content: center; border-radius: 999px; border: 0; cursor: pointer; background: #18181b; color: #fff; transition: background-color .15s; }
.pp:hover { background: #3f3f46; } .pp:active { background: #52525b; }
:host([dark]) .pp { background: #f4f4f5; color: #18181b; } :host([dark]) .pp:hover { background: #fff; } :host([dark]) .pp:active { background: #d4d4d8; }
.pp:focus-visible, .ib:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--k-bg), 0 0 0 4px #a1a1aa; }
.pp:disabled { opacity: .5; pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .dg > span { animation: none !important; } .dg > span.prev { display: none; } .arm { transition: none; } }
`
  }

  render() {
    const id = `knp-${++uid}`
    const fillIcon = (d) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
    this.icons = {
      play: fillIcon('<polygon points="6 3 20 12 6 21 6 3"/>'),
      pause: fillIcon('<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>'),
      power: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/></svg>',
    }
    return `<div class="k-card">
      <div class="top">
        <div class="deck">
          <div class="disc" title="Spin to scrub">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle class="vinyl" cx="50" cy="50" r="50"/>
              ${GROOVES.map((r) => `<circle cx="50" cy="50" r="${r}" fill="none" stroke="rgb(255 255 255/.08)" stroke-width=".6"/>`).join('')}
              <circle cx="50" cy="50" r="49" fill="none" stroke="rgb(255 255 255/.16)" stroke-width=".8"/>
              <clipPath id="${id}"><circle cx="50" cy="50" r="24"/></clipPath>
              <circle cx="50" cy="50" r="24" fill="#f4f4f5"/>
              <g class="label" clip-path="url(#${id})"></g>
              <circle class="hole" cx="50" cy="50" r="1.8"/>
            </svg>
          </div>
          <svg class="arm" viewBox="0 0 40 110" aria-hidden="true">
            <circle class="pivot" cx="31" cy="11" r="8"/><circle cx="31" cy="11" r="3" fill="#a1a1aa"/>
            <path class="rod" d="M31 11 L31 70 L18 92" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"/>
            <rect class="head" height="12" rx="1.5" transform="rotate(32 16 96)" width="7" x="12.5" y="90"/>
          </svg>
        </div>
        <div class="meta">
          <div class="np"><span class="bars" aria-hidden="true">${'<i></i>'.repeat(BAR_COUNT)}</span><b class="state">Now playing</b></div>
          <h3></h3><p class="artist"></p><span class="rpm"></span>
        </div>
      </div>
      <div class="seek" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0">
        <div class="track"><div class="rail"><div class="fill"></div></div></div>
      </div>
      <div class="times"><span class="clock" aria-hidden="true"></span><span class="dur"></span></div>
      <div class="ctl">
        <button class="ib prev" type="button" aria-label="Previous track">${fillIcon('<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" x2="5" y1="19" y2="5"/>')}</button>
        <button class="pp" type="button"></button>
        <button class="ib next" type="button" aria-label="Next track">${fillIcon('<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>')}</button>
      </div>
    </div>`
  }

  build() {
    this.style.setProperty('--np-accent', this.config.accent)
    this.discEl = this.$('.disc'); this.fillEl = this.$('.fill'); this.railEl = this.$('.rail'); this.rpmEl = this.$('.rpm')
    this.barEls = this.$$('.bars i'); this.clockEl = this.$('.clock'); this.seekEl = this.$('.seek')
    this.e = { angle: 0, omega: 0, time: 0, duration: 0, playing: false, held: false, barDrag: false, pointerId: null, visible: true, env: 0,
      scrubOmega: 0, pointerAngle: 0, center: { x: 0, y: 0 }, lastMoveAt: 0, samples: [], cruise: null, cruiseAngle: 0 }
    this.raf = 0; this.last = 0; this.clockS = -1
    this.$('.pp').addEventListener('click', () => this.togglePlay())
    this.$('.prev').addEventListener('click', () => { haptic('light'); this.call('media_player', 'media_previous_track', { entity_id: this.config.entity }) })
    this.$('.next').addEventListener('click', () => { haptic('light'); this.call('media_player', 'media_next_track', { entity_id: this.config.entity }) })
    this.$('h3').addEventListener('click', () => this.moreInfo())
    const d = this.discEl
    d.addEventListener('pointerdown', (ev) => this.discDown(ev))
    d.addEventListener('pointermove', (ev) => this.discMove(ev))
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) d.addEventListener(t, (ev) => this.discUp(ev))
    const s = this.seekEl
    s.addEventListener('pointerdown', (ev) => this.barDown(ev))
    s.addEventListener('pointermove', (ev) => { if (this.e.barDrag && this.e.pointerId === ev.pointerId) this.seekFrom(ev.clientX) })
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) s.addEventListener(t, (ev) => this.barUp(ev))
    s.addEventListener('keydown', (ev) => this.barKey(ev))
    let inView = true
    this._sync = () => {
      const e = this.e
      e.visible = inView && !document.hidden
      if (e.visible) { if (e.cruise) e.cruise.play(); this.wake() } else { if (e.cruise) e.cruise.pause(); cancelAnimationFrame(this.raf); this.raf = 0 }
    }
    this.io = new IntersectionObserver(([en]) => { inView = en ? en.isIntersecting : true; this._sync() })
    this.io.observe(this.$('.k-card'))
    document.addEventListener('visibilitychange', this._sync)
  }

  get reduced() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) }
  supports(f) { const s = this.stateObj; return !!s && ((s.attributes.supported_features || 0) & f) !== 0 }

  /* ---- engine ---- */
  readAngle() { const e = this.e; return e.cruise && e.cruise.currentTime !== null ? e.cruiseAngle + (Number(e.cruise.currentTime) / CRUISE_MS) * 360 : e.angle }
  stopCruise() { const e = this.e; if (!e.cruise) return; e.angle = this.readAngle(); this.discEl.style.transform = rotate(e.angle); e.cruise.cancel(); e.cruise = null }
  startCruise() {
    const e = this.e
    if (e.cruise || this.reduced || !this.discEl.animate) return
    e.angle %= 360; e.cruiseAngle = e.angle
    e.cruise = this.discEl.animate([{ transform: `rotate(${e.angle}deg)` }, { transform: `rotate(${e.angle + 360}deg)` }], { duration: CRUISE_MS, iterations: Infinity })
    if (!e.visible) e.cruise.pause()
  }
  integrate(dt) {
    const e = this.e, target = e.playing ? CRUISE : 0
    if (this.reduced) { e.omega = target; e.time += e.playing ? dt : 0; return }
    if (e.cruise) { e.omega = CRUISE; e.time += dt; return }
    let tau = SPIN_UP_TAU
    if (Math.abs(e.omega) > Math.abs(target)) tau = e.playing ? COAST_TAU : SPIN_DOWN_TAU
    e.omega = target + (e.omega - target) * Math.exp(-dt / tau)
    if (Math.abs(e.omega - target) < SETTLE_EPSILON) e.omega = target
    e.angle += e.omega * dt
    e.time += trackRate(e.omega) * dt
    if (e.playing && e.omega === CRUISE) this.startCruise()
  }
  meter(dt) {
    const e = this.e
    const target = clamp(Math.abs(e.held ? e.scrubOmega : e.omega) / CRUISE, 0, 1)
    if (this.reduced) e.env = e.playing ? 1 : 0
    else if (target > e.env) e.env = Math.min(target, e.env + dt / BAR_ATTACK_S)
    else e.env = Math.max(target, e.env - dt / BAR_DECAY_S)
    const t = this.reduced ? 0.37 : e.time
    this.barEls.forEach((b, i) => { b.style.transform = `scaleY(${(BAR_REST + (1 - BAR_REST) * barLevel(i, t) * e.env).toFixed(3)})` })
  }
  rpmLabel() {
    const e = this.e
    if (e.held) return `${Math.round(e.scrubOmega / 6)} rpm`
    if (e.omega === CRUISE) return this.app ? `${this.app} · 33⅓ rpm` : '33⅓ rpm'
    return `${Math.round(e.omega / 6)} rpm`
  }
  paint() {
    const e = this.e
    if (!e.cruise) this.discEl.style.transform = rotate(e.angle)
    const p = e.duration > 0 ? clamp(e.time / e.duration, 0, 1) : 0
    this.fillEl.style.transform = `scaleX(${p.toFixed(4)})`
    const label = this.rpmLabel()
    if (this.rpmEl.textContent !== label) this.rpmEl.textContent = label
    const s = Math.floor(e.time)
    if (s !== this.clockS) { const dir = s > this.clockS ? 1 : -1; this.clockS = s; this.renderClock(s, dir) }
  }
  renderClock(sec, dir) {
    const chars = fmtTime(sec).split('').reverse()
    const slots = [...this.clockEl.children]
    if (slots.length !== chars.length) {
      this.clockEl.innerHTML = chars.map((c) => (c === ':' ? '<span>:</span>' : `<span class="dg"><span>${c}</span></span>`)).join('')
    } else {
      chars.forEach((c, i) => {
        const slot = slots[i]
        if (c === ':' || !slot.classList.contains('dg')) return
        const cur = slot.querySelector('span:not(.prev)')
        if (!cur || cur.textContent === c) return
        slot.querySelectorAll('.prev').forEach((p) => p.remove())
        const up = dir > 0, timing = `${ROLL_MS}ms ${EASE_OUT} both`
        cur.className = 'prev'; cur.style.animation = `${up ? 'out-up' : 'out-down'} ${timing}`
        const n = document.createElement('span'); n.textContent = c; n.style.animation = `${up ? 'in-up' : 'in-down'} ${timing}`
        slot.append(n)
        setTimeout(() => cur.remove(), ROLL_MS + 20)
      })
    }
    this.seekEl.setAttribute('aria-valuenow', sec)
    this.seekEl.setAttribute('aria-valuetext', `${fmtTime(sec)} of ${fmtTime(this.e.duration)}`)
  }
  tick = (now) => {
    const e = this.e
    const dt = this.last ? Math.min((now - this.last) / 1000, MAX_DT) : 0
    this.last = now
    if (e.held) e.scrubOmega *= Math.exp(-dt / HOLD_SETTLE_S)
    else if (!e.barDrag) this.integrate(dt)
    e.time = clamp(e.time, 0, e.duration || 0)
    this.meter(dt)
    this.paint()
    const awake = e.playing || e.held || e.barDrag || e.omega !== 0 || e.env > 0
    if (awake && e.visible) this.raf = requestAnimationFrame(this.tick); else { this.raf = 0; this.last = 0 }
  }
  wake() { this.paint(); if (!this.raf && this.e.visible && this.isConnected) { this.last = 0; this.raf = requestAnimationFrame(this.tick) } }

  /* ---- controls ---- */
  togglePlay() {
    const s = this.stateObj
    if (!s) return
    haptic('light')
    if (s.state === 'off' || s.state === 'standby') { this.call('media_player', 'turn_on', { entity_id: this.config.entity }); return }
    const e = this.e
    e.playing = !e.playing
    if (!e.playing) this.stopCruise()
    this._optimisticAt = Date.now()
    this.renderPlayState()
    this.wake()
    this.call('media_player', 'media_play_pause', { entity_id: this.config.entity })
  }

  seek(seconds) {
    if (!this.supports(SUPPORT.SEEK)) return
    this._seekAt = Date.now()
    this.call('media_player', 'media_seek', { entity_id: this.config.entity, seek_position: Math.round(seconds) })
  }

  angleOf(x, y) { const e = this.e, dx = x - e.center.x, dy = y - e.center.y; return { angle: (Math.atan2(dy, dx) * 180) / Math.PI, distance: Math.hypot(dx, dy) } }

  discDown(ev) {
    const e = this.e
    if (ev.button !== 0 || e.pointerId !== null) return
    e.pointerId = ev.pointerId
    this.discEl.setPointerCapture(ev.pointerId)
    const r = this.discEl.getBoundingClientRect()
    e.center = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    this.stopCruise()
    e.held = true; e.omega = 0; e.scrubOmega = 0
    e.pointerAngle = this.angleOf(ev.clientX, ev.clientY).angle
    e.lastMoveAt = performance.now()
    e.samples = [{ t: e.lastMoveAt, a: e.angle }]
    e.timeAtGrab = e.time
    this.wake()
  }
  discMove(ev) {
    const e = this.e
    if (!e.held || e.pointerId !== ev.pointerId) return
    const { angle, distance } = this.angleOf(ev.clientX, ev.clientY)
    if (distance < DEAD_ZONE) { e.pointerAngle = angle; return }
    let delta = angle - e.pointerAngle
    delta -= Math.round(delta / 360) * 360
    e.pointerAngle = angle
    const now = performance.now(), dt = Math.max(now - e.lastMoveAt, 1) / 1000
    e.lastMoveAt = now
    e.scrubOmega += (clamp(delta / dt, -MAX_OMEGA, MAX_OMEGA) - e.scrubOmega) * 0.35
    e.angle += delta
    if (this.supports(SUPPORT.SEEK)) e.time = clamp(e.time + (delta / CRUISE) * scrubGain(e.scrubOmega), 0, e.duration)
    e.samples.push({ t: now, a: e.angle })
    while (e.samples.length > 2 && now - e.samples[0].t > VELOCITY_WINDOW_MS) e.samples.shift()
    this.discEl.style.transform = rotate(e.angle)
  }
  discUp(ev) {
    const e = this.e
    if (!e.held || e.pointerId !== ev.pointerId) return
    e.pointerId = null
    if (this.discEl.hasPointerCapture(ev.pointerId)) this.discEl.releasePointerCapture(ev.pointerId)
    e.held = false
    const now = performance.now(), first = e.samples[0]
    let v = 0
    if (first && now - e.lastMoveAt < STALE_MOVE_MS && now > first.t) v = ((e.angle - first.a) / (now - first.t)) * 1000
    e.omega = this.reduced ? 0 : clamp(v, -MAX_OMEGA, MAX_OMEGA)
    e.scrubOmega = 0
    this.wake()
    // Seek once the coast has mostly settled, to where the needle landed.
    if (this.supports(SUPPORT.SEEK) && Math.abs(e.time - e.timeAtGrab) > 1) {
      clearTimeout(this._discSeek)
      this._discSeek = setTimeout(() => this.seek(this.e.time), Math.abs(e.omega) > CRUISE ? 700 : 150)
    }
  }
  seekFrom(clientX) {
    const e = this.e, rail = this.railEl
    const rect = rail.parentElement.getBoundingClientRect()
    const x = clientX - rect.left
    e.time = clamp(x / rect.width, 0, 1) * e.duration
    let over = 0
    if (x < 0) over = -damp(-x, RUBBER_MAX); else if (x > rect.width) over = damp(x - rect.width, RUBBER_MAX)
    const stretch = 1 + Math.abs(over) / rect.width, thin = 1 - (0.35 * Math.abs(over)) / RUBBER_MAX
    rail.style.transition = 'none'
    rail.style.transformOrigin = over < 0 ? 'right center' : 'left center'
    rail.style.transform = over === 0 ? '' : `scale(${stretch.toFixed(4)}, ${thin.toFixed(3)})`
    this.wake()
  }
  barDown(ev) {
    const e = this.e
    if (ev.button !== 0 || e.pointerId !== null || !this.supports(SUPPORT.SEEK) || !e.duration) return
    e.pointerId = ev.pointerId
    this.seekEl.setPointerCapture(ev.pointerId)
    e.barDrag = true
    this.seekFrom(ev.clientX)
  }
  barUp(ev) {
    const e = this.e
    if (!e.barDrag || e.pointerId !== ev.pointerId) return
    e.pointerId = null; e.barDrag = false
    this.railEl.style.transition = RUBBER_RETURN; this.railEl.style.transform = ''
    this.seek(e.time)
    this.wake()
  }
  barKey(ev) {
    const e = this.e
    const t = { ArrowRight: e.time + SEEK_STEP, ArrowUp: e.time + SEEK_STEP, ArrowLeft: e.time - SEEK_STEP, ArrowDown: e.time - SEEK_STEP, Home: 0, End: e.duration - 1 }[ev.key]
    if (t === undefined || !this.supports(SUPPORT.SEEK)) return
    ev.preventDefault()
    e.time = clamp(t, 0, e.duration)
    clearTimeout(this._keySeek)
    this._keySeek = setTimeout(() => this.seek(this.e.time), 400)
    this.wake()
  }

  renderPlayState() {
    const s = this.stateObj
    const off = !s || ['off', 'standby', 'unavailable', 'unknown'].includes(s.state)
    const pp = this.$('.pp')
    pp.innerHTML = off ? this.icons.power : this.e.playing ? this.icons.pause : this.icons.play
    pp.setAttribute('aria-label', off ? 'Turn on' : this.e.playing ? 'Pause' : 'Play')
    pp.disabled = isUnavailable(s) || (off && !this.supports(SUPPORT.TURN_ON))
    this.$('.arm').toggleAttribute('data-down', this.e.playing)
  }

  update() {
    const s = this.stateObj, e = this.e
    const a = (s && s.attributes) || {}
    const off = !s || ['off', 'standby', 'unavailable', 'unknown'].includes(s.state)
    const title = a.media_title || (off ? 'Nothing playing' : a.app_name || a.source || 'Idle')
    const artist = a.media_artist || a.media_album_name || a.media_series_title || (this.config.name || friendlyName(s, this.config.entity))
    this.$('h3').textContent = title
    this.$('.artist').textContent = artist
    this.$('.state').textContent = off ? (s ? (s.state === 'unavailable' ? 'Unavailable' : 'Off') : 'Not found') : s.state === 'playing' ? 'Now playing' : s.state === 'paused' ? 'Paused' : s.state === 'idle' ? 'Idle' : 'On'
    this.app = a.app_name || a.source || ''
    // Label art: the media's own picture, or Kokonut's printed label.
    const pic = a.entity_picture_local || a.entity_picture
    const key = pic ? `pic:${pic}` : `art:${strHash(title) % 3}`
    if (key !== this._labelKey) {
      this._labelKey = key
      const url = pic ? (this.hass.hassUrl ? this.hass.hassUrl(pic) : pic) : null
      this.$('.label').innerHTML = url
        ? `<image href="${escapeHtml(url)}" x="26" y="26" width="48" height="48" preserveAspectRatio="xMidYMid slice"/>`
        : `<g transform="translate(26 26) scale(0.48)">${labelArt(strHash(title) % 3)}</g>`
    }
    // Duration / position from HA, extrapolated while playing.
    const dur = Number(a.media_duration) || 0
    e.duration = dur
    this.$('.dur').textContent = dur ? fmtTime(dur) : '--:--'
    this.seekEl.setAttribute('aria-valuemax', dur)
    this.seekEl.setAttribute('aria-disabled', String(!dur || !this.supports(SUPPORT.SEEK)))
    if (a.media_position != null && !e.held && !e.barDrag && !(this._seekAt && Date.now() - this._seekAt < 2500)) {
      const at = Date.parse(a.media_position_updated_at || s.last_updated)
      const pos = Number(a.media_position) + (s.state === 'playing' && at ? (Date.now() - at) / 1000 : 0)
      if (Math.abs(pos - e.time) > 2) e.time = clamp(pos, 0, dur || pos)
    }
    if (!dur && !a.media_position) e.time = 0
    // Playing state (ignore a stale echo right after an optimistic toggle).
    const playing = !!s && s.state === 'playing'
    if (!(this._optimisticAt && Date.now() - this._optimisticAt < 2000 && playing !== e.playing)) {
      this._optimisticAt = 0
      if (playing !== e.playing) { e.playing = playing; if (!playing) this.stopCruise() }
    }
    this.$('.prev').disabled = off || !this.supports(SUPPORT.PREVIOUS)
    this.$('.next').disabled = off || !this.supports(SUPPORT.NEXT)
    this.renderPlayState()
    this.wake()
  }

  connected() { if (this._sync) this._sync() }
  disconnected() { cancelAnimationFrame(this.raf); this.raf = 0; if (this.e && this.e.cruise) { this.e.cruise.cancel(); this.e.cruise = null } clearTimeout(this._discSeek); clearTimeout(this._keySeek) }
  getCardSize() { return 4 }
  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 } }
}

register(NowPlaying)
