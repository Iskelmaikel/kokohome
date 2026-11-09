/**
 * Kokonut Particle Button → Lovelace.
 * A status button for actions: the label rolls to a spinner while the service
 * call runs, then to a drawn check with a burst of chips in the button's own
 * colour — or to "Try again" with a shake if the call fails.
 *
 *   type: custom:kokonut-particle-button
 *   entity: scene.movie_night          # default action: run/toggle it
 *   name: Movie night                  # idle label
 *   icon: mdi:movie-open
 *   pending_label: Starting
 *   success_label: Enjoy the film
 *   error_label: Try again
 *   variant: default | outline | secondary
 *   tap_action: { ... }                # any Lovelace action instead
 *   particles: true
 */
import { KokoCard, register, rollSwap, icon, lucide, escapeHtml, friendlyName, haptic, reducedMotion, wait, isUnavailable, runAction } from './core.js'

const PARTICLE_COUNT = 18, GRAVITY = 0.0016, DRAG = 0.0022, LIFETIME = 650, BLEED = 64
const SPINNER = `<svg width="16" height="16" fill="none" viewBox="0 0 16 16" aria-hidden="true" class="spin"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" opacity=".25"/><path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" stroke-linecap="round" stroke-width="2"/></svg>`
const CHECK = `<svg width="16" height="16" fill="none" viewBox="0 0 16 16" aria-hidden="true"><path class="draw" d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" pathLength="1"/></svg>`
const ALERT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>'

function createParticles(originX, width) {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const spread = (Math.random() - 0.5) * Math.min(width, 120)
    const x = Math.min(Math.max(originX + spread, 4), width - 4)
    const side = x < width / 2 ? -1 : 1
    const speed = 0.18 + Math.random() * 0.22
    const angle = -Math.PI / 2 + side * Math.random() * 0.9
    const chip = i % 3 === 0
    return { x, y: 0, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, angle: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.02, w: chip ? 5 : 3, h: chip ? 2 : 3 }
  })
}

class ParticleButton extends KokoCard {
  static tag = 'kokonut-particle-button'
  static cardName = 'Kokonut Particle Button'
  static description = 'Run a scene or script: spinner while it runs, then a check and a burst of particles.'
  static defaults() { return { variant: 'default', pending_label: 'Running', success_label: 'Done', error_label: 'Try again', particles: true, success_duration: 1600, error_duration: 3200 } }
  static getStubConfig(hass) {
    const e = Object.keys(hass.states).find((x) => x.startsWith('scene.')) || Object.keys(hass.states).find((x) => x.startsWith('script.'))
    return { entity: e || 'scene.movie_night' }
  }

  css() {
    return `
.k-card { padding: 12px; overflow: visible; }
:host([plain]) .k-card { padding: 0; }
.slot { position: relative; }
button.pb {
  position: relative; display: flex; width: 100%; height: 40px; align-items: center; justify-content: center; border-radius: 8px;
  padding: 0 16px; font-size: 14px; font-weight: 500; cursor: pointer; border: 1px solid transparent; outline: none; overflow: visible;
  background: #18181b; color: #fafafa; transition: background-color .2s ease-out, color .2s ease-out, opacity .2s ease-out; user-select: none;
}
button.pb:hover { background: #18181be6; }
:host([dark]) button.pb { background: #fafafa; color: #18181b; }
:host([dark]) button.pb:hover { background: #fafafae6; }
:host([variant=secondary]) button.pb { background: #f4f4f5; color: #18181b; }
:host([variant=secondary][dark]) button.pb { background: #27272a; color: #fafafa; }
:host([variant=outline]) button.pb { background: transparent; border-color: #e4e4e7; color: #18181b; }
:host([variant=outline]) button.pb:hover { background: #f4f4f5; }
:host([variant=outline][dark]) button.pb { border-color: #27272a; color: #fafafa; }
:host([variant=outline][dark]) button.pb:hover { background: #27272a; }
button.pb[data-status=error], :host([dark]) button.pb[data-status=error] { background: #dc2626; color: #fff; border-color: transparent; }
:host([dark]) button.pb[data-status=error] { background: #ef4444; }
button.pb:focus-visible { box-shadow: 0 0 0 2px var(--k-bg), 0 0 0 4px #a1a1aa; }
button.pb:disabled { opacity: .5; pointer-events: none; }
.content { position: relative; display: flex; align-items: center; justify-content: center; align-self: stretch; overflow: hidden; min-width: 0; }
.content .roll { gap: 8px; }
.burst { position: absolute; pointer-events: none; top: -${BLEED}px; left: -${BLEED}px; width: calc(100% + ${BLEED * 2}px); height: calc(100% + ${BLEED * 2}px); }
.burst canvas { display: block; width: 100%; height: 100%; }
.spin { animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw .3s .08s cubic-bezier(.23,1,.32,1) forwards; }
@keyframes draw { to { stroke-dashoffset: 0; } }
@media (prefers-reduced-motion: reduce) { .draw { animation: none; stroke-dashoffset: 0; } }
`
  }

  render() {
    return `<div class="k-card"><div class="slot"><button class="pb" type="button" data-status="idle"><span class="content"></span></button></div><span class="sr" aria-live="polite"></span></div>`
  }

  build() {
    this.setAttribute('variant', this.config.variant)
    this.btn = this.$('button.pb'); this.content = this.$('.content'); this.live = this.$('.sr')
    this.status = 'idle'; this.run = 0; this.pressX = null
    this.renderLabel()
    this.btn.addEventListener('click', (e) => this.onClick(e))
  }

  idleLabel() {
    const s = this.stateObj
    const name = this.config.name || (s ? friendlyName(s) : 'Run')
    const ic = this.config.icon || (s && s.attributes.icon)
    return `${ic ? icon(ic, 16) : ''}<span>${escapeHtml(name)}</span>`
  }

  renderLabel() {
    const c = this.config
    const html = this.status === 'pending' ? `${SPINNER}<span>${escapeHtml(c.pending_label)}</span>`
      : this.status === 'success' ? `${CHECK}<span>${escapeHtml(c.success_label)}</span>`
        : this.status === 'error' ? `${ALERT}<span>${escapeHtml(c.error_label)}</span>`
          : this.idleLabel()
    if (html === this._last) return
    this._last = html
    rollSwap(this.content, html, { dy: 8 })
  }

  setStatus(next) {
    const prev = this.status
    this.status = next
    this.btn.dataset.status = next
    this.btn.setAttribute('aria-busy', String(next === 'pending'))
    this.live.textContent = next === 'pending' ? this.config.pending_label : next === 'success' ? this.config.success_label : next === 'error' ? this.config.error_label : ''
    this.renderLabel()
    if (prev === next) return
    if (next === 'success' && this.config.particles && !reducedMotion()) this.burst()
    if (next === 'error' && !reducedMotion()) {
      this.content.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: 320, easing: 'ease-out' })
    }
  }

  settle(next) {
    this.setStatus(next)
    clearTimeout(this._reset)
    this._reset = setTimeout(() => this.setStatus('idle'), next === 'success' ? this.config.success_duration : this.config.error_duration)
  }

  async onClick(e) {
    if (this.status === 'pending' || !this.hass) return
    const rect = this.btn.getBoundingClientRect()
    this.pressX = e.clientX === 0 && e.clientY === 0 ? null : e.clientX - rect.left
    clearTimeout(this._reset)
    haptic('light')
    const run = ++this.run
    this.setStatus('pending')
    const fallback = this.config.entity ? { action: 'toggle' } : undefined
    try {
      // A floor on the wait so a fast call doesn't just flash the spinner.
      await Promise.all([runAction(this, this.hass, this.config.tap_action || fallback, this.config.entity), wait(450)])
      if (run === this.run) { this.settle('success'); haptic('success') }
    } catch (err) {
      console.error('[kokohome] particle button action failed', err)
      if (run === this.run) { this.settle('error'); haptic('failure') }
    }
  }

  burst() {
    const holder = document.createElement('span')
    holder.className = 'burst'
    holder.innerHTML = '<canvas></canvas>'
    this.btn.prepend(holder)
    const canvas = holder.firstChild
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const width = this.btn.offsetWidth
    const cssW = width + BLEED * 2, cssH = this.btn.offsetHeight + BLEED * 2
    canvas.width = cssW * dpr; canvas.height = cssH * dpr
    ctx.scale(dpr, dpr)
    const st = getComputedStyle(this.btn)
    const fill = st.backgroundColor
    const color = fill === 'transparent' || /(,|\/)\s*0\)$/.test(fill) ? st.color : fill
    const particles = createParticles(this.pressX ?? width / 2, width)
    const start = performance.now()
    let last = start
    const tick = (now) => {
      const dt = Math.min(now - last, 32)
      last = now
      const t = (now - start) / LIFETIME
      ctx.clearRect(0, 0, cssW, cssH)
      if (t >= 1) { holder.remove(); return }
      ctx.fillStyle = color
      ctx.globalAlpha = 1 - t * t
      for (const p of particles) {
        p.vx *= 1 - DRAG * dt
        p.vy = p.vy * (1 - DRAG * dt) + GRAVITY * dt
        p.x += p.vx * dt; p.y += p.vy * dt; p.angle += p.spin * dt
        ctx.save(); ctx.translate(p.x + BLEED, p.y + BLEED); ctx.rotate(p.angle); ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore()
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  update() {
    this.btn.disabled = !!this.config.entity && isUnavailable(this.stateObj)
    if (this.status === 'idle') this.renderLabel()
  }

  disconnected() { clearTimeout(this._reset) }
  getCardSize() { return 1 }
  getGridOptions() { return { columns: 6, rows: 1, min_columns: 3 } }
}

register(ParticleButton)
