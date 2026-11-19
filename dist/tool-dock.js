/**
 * Kokonut Tool Dock → Lovelace (house modes / scenes as a Figma-style dock).
 * One plate slides between tools and settles on the active one. Tooltips come
 * as a group: the first waits, the rest are instant while the group is warm.
 * Long-press a tool for its details. Give it a `canvas` card and the dock
 * floats over it — grab the grip and throw it to any edge (it turns vertical
 * on the sides).
 *
 *   type: custom:kokonut-tool-dock
 *   entity: input_select.house_mode          # one tool per option; plate = state
 *   icons: { Home: mdi:home, Away: mdi:walk, Night: mdi:weather-night }
 *   # or a list of scenes / scripts (plate = most recently activated scene):
 *   tools:
 *     - entity: scene.movie_night
 *     - { entity: script.all_off, label: All off }
 *   canvas: { type: picture-entity, entity: camera.doggy_cam, show_state: false }
 *   edge: bottom                              # top | right | bottom | left
 */
import { KokoCard, register, MotionValue, clamp, icon, escapeHtml, friendlyName, domainOf, NestedCards, toggleEntity, fire, haptic, reducedMotion } from './core.js'

const EDGE_GAP = 12, TIP_DELAY = 400, TIP_WARM = 300, TIP_OFFSET = 8, LONG_PRESS = 350
const DECELERATION = 0.998, PROJECTION = DECELERATION / (1 - DECELERATION), VELOCITY_WINDOW = 100
const DOCK_SPRING = { stiffness: 380, damping: 32 }, PLATE_SPRING = { stiffness: 500, damping: 40 }
const MODE_ICONS = { home: 'mdi:home', away: 'mdi:walk', night: 'mdi:weather-night', sleep: 'mdi:sleep', guest: 'mdi:account-multiple', vacation: 'mdi:airplane', holiday: 'mdi:airplane', movie: 'mdi:movie-open', party: 'mdi:party-popper', work: 'mdi:briefcase', eco: 'mdi:leaf', off: 'mdi:power' }
const isVertical = (edge) => edge === 'left' || edge === 'right'

class ToolDock extends KokoCard {
  static tag = 'kokonut-tool-dock'
  static cardName = 'Kokonut Tool Dock'
  static description = 'A Figma-style dock for house modes or scenes, with a sliding plate; throwable over a canvas card.'
  static defaults() { return { edge: 'bottom', icons: {} } }
  static getStubConfig(hass) {
    const sel = Object.keys(hass.states).find((x) => x.startsWith('input_select.'))
    if (sel) return { entity: sel }
    return { tools: Object.keys(hass.states).filter((x) => x.startsWith('scene.')).slice(0, 4).map((entity) => ({ entity })) }
  }
  validate(c) { if (!c.entity && !(Array.isArray(c.tools) && c.tools.length)) throw new Error('kokonut-tool-dock: set "entity" (an input_select) or "tools"') }
  watched() { return [this.config.entity, ...(this.config.tools || []).map((t) => (typeof t === 'string' ? t : t.entity))].filter(Boolean) }

  css() {
    return `
.k-card { padding: 12px; }
.k-card.canvas { padding: 0; }
.stage { position: relative; display: flex; justify-content: center; }
.canvas .stage { display: block; min-height: 160px; }
.canvas-slot > * { --ha-card-border-radius: 0; --ha-card-border-width: 0; }
.dock { position: relative; display: inline-flex; align-items: center; gap: 4px; border-radius: 14px; padding: 4px; touch-action: none;
  background: #fff; box-shadow: 0 1px 2px rgb(0 0 0/.06), 0 8px 24px -8px rgb(0 0 0/.25), 0 0 0 1px rgb(0 0 0/.06); }
:host([dark]) .dock { background: #18181b; box-shadow: 0 1px 2px rgb(0 0 0/.5), 0 8px 24px -8px rgb(0 0 0/.8), 0 0 0 1px rgb(255 255 255/.08); }
.canvas .dock { position: absolute; left: 0; top: 0; z-index: 3; will-change: transform; }
.dock.v { flex-direction: column; }
.grip { display: grid; place-items: center; width: 20px; height: 36px; color: #a1a1aa; cursor: grab; border-radius: 8px; flex: none; }
.dock.v .grip { width: 36px; height: 20px; }
.grip:active { cursor: grabbing; }
.grip svg { transition: transform .2s; } .dock.v .grip svg { transform: rotate(90deg); }
.div { width: 1px; height: 20px; background: #e4e4e7; margin: 0 2px; flex: none; } :host([dark]) .div { background: #27272a; }
.dock.v .div { width: 20px; height: 1px; margin: 2px 0; }
.plate { position: absolute; left: 0; top: 0; width: 36px; height: 36px; border-radius: 10px; background: #18181b; opacity: 0; will-change: transform; pointer-events: none; }
:host([dark]) .plate { background: #f4f4f5; }
.tool { position: relative; display: flex; width: 36px; height: 36px; flex: none; align-items: center; justify-content: center; border-radius: 10px; border: 0; background: none; cursor: pointer;
  color: #71717a; transition: color .15s ease-out, background-color .15s ease-out; padding: 0; outline: none; }
:host([dark]) .tool { color: #a1a1aa; }
.tool:hover { background: #f4f4f5; color: #18181b; } :host([dark]) .tool:hover { background: #27272a; color: #fafafa; }
.tool[aria-pressed=true], .tool[aria-pressed=true]:hover { background: none; color: #fff; } :host([dark]) .tool[aria-pressed=true] { color: #18181b; }
.tool:focus-visible { box-shadow: 0 0 0 2px #a1a1aa; }
.tool:disabled { opacity: .4; pointer-events: none; }
.tip { pointer-events: none; position: absolute; z-index: 5; }
.tip > div { white-space: nowrap; border-radius: 6px; padding: 4px 8px; font-size: 12px; font-weight: 500; color: #fff; background: #18181b; box-shadow: 0 1px 2px rgb(0 0 0/.1); }
:host([dark]) .tip > div { color: #18181b; background: #f4f4f5; }
.tip.anim > div { animation: tipin .15s cubic-bezier(.23,1,.32,1); } @keyframes tipin { from { opacity: 0; transform: scale(.96); } }
`
  }

  render() {
    const canvas = !!this.config.canvas
    const grip = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg>'
    return `<div class="k-card${canvas ? ' canvas' : ''}"><div class="stage">
      ${canvas ? '<div class="canvas-slot"></div>' : ''}
      <div class="dock" role="toolbar">
        ${canvas ? `<span class="grip" aria-label="Move dock" title="Drag to move">${grip}</span><span class="div" aria-hidden="true"></span>` : ''}
        <span class="plate" aria-hidden="true"></span>
        <span class="tools" style="display:contents"></span>
      </div>
      <div class="tip" hidden><div></div></div>
    </div></div>`
  }

  build() {
    this.stage = this.$('.stage'); this.dock = this.$('.dock'); this.plateEl = this.$('.plate'); this.toolsEl = this.$('.tools'); this.tipEl = this.$('.tip')
    this.edge = this.config.edge
    this.px = new MotionValue(0); this.py = new MotionValue(0)
    const paintPlate = () => { this.plateEl.style.transform = `translate(${this.px.get()}px, ${this.py.get()}px)` }
    this.px.on(paintPlate); this.py.on(paintPlate)
    this.dx = new MotionValue(0); this.dy = new MotionValue(0)
    const paintDock = () => { if (this.config.canvas) this.dock.style.transform = `translate(${this.dx.get()}px, ${this.dy.get()}px)` }
    this.dx.on(paintDock); this.dy.on(paintDock)
    this.tipOpen = false; this.warmUntil = 0
    this.dock.addEventListener('keydown', (e) => this.rove(e))
    if (this.config.canvas) {
      this.nested = new NestedCards(this)
      this.nested.build([this.config.canvas], (els) => this.$('.canvas-slot').replaceChildren(...els))
      this.ro = new ResizeObserver(() => this.toEdge(this.edge, 0, 0, true))
      this.ro.observe(this.stage)
      this.wireGrip()
    }
  }

  /** Tools: options of an input_select, or a list of scenes/scripts. */
  toolList() {
    const c = this.config, h = this.hass
    if (c.entity) {
      const s = h.states[c.entity]
      const opts = (s && s.attributes.options) || []
      return opts.map((o) => ({ id: o, label: o, icon: (c.icons && c.icons[o]) || MODE_ICONS[String(o).toLowerCase()] || 'mdi:circle-medium', entity: c.entity, option: o }))
    }
    return c.tools.map((t) => {
      const spec = typeof t === 'string' ? { entity: t } : t
      const s = h.states[spec.entity]
      return { id: spec.entity, label: spec.label || friendlyName(s, spec.entity), icon: spec.icon || (s && s.attributes.icon) || 'mdi:palette', entity: spec.entity, momentary: domainOf(spec.entity) !== 'scene' && domainOf(spec.entity) !== 'input_boolean' }
    })
  }

  currentId() {
    const c = this.config, h = this.hass
    if (c.entity) { const s = h.states[c.entity]; return s ? s.state : null }
    // Scenes: the one activated most recently.
    let best = null, bestT = 0
    for (const t of this.tools) {
      const s = h.states[t.entity]
      if (!s || domainOf(t.entity) !== 'scene') continue
      const ts = Date.parse(s.state)
      if (Number.isFinite(ts) && ts > bestT) { bestT = ts; best = t.id }
    }
    return best
  }

  renderTools() {
    this.tools = this.toolList()
    const key = this.tools.map((t) => `${t.id}|${t.icon}|${t.label}`).join(',')
    if (key === this._key) return
    this._key = key
    this.toolsEl.innerHTML = this.tools.map((t, i) => `<button class="tool" type="button" data-i="${i}" aria-label="${escapeHtml(t.label)}" aria-pressed="false" tabindex="-1">${icon(t.icon, 18)}</button>`).join('')
    this.btns = this.$$('.tool')
    this.btns.forEach((b, i) => this.wireTool(b, i))
    this.dock.setAttribute('aria-label', this.config.name || (this.config.entity ? friendlyName(this.hass.states[this.config.entity]) : 'Scenes'))
  }

  wireTool(b, i) {
    const press = { timer: 0, fired: false, x: 0, y: 0 }
    b.addEventListener('pointerdown', (e) => {
      this.hideTip()
      if (e.button !== 0) return
      press.fired = false; press.x = e.clientX; press.y = e.clientY
      clearTimeout(press.timer)
      press.timer = setTimeout(() => { press.fired = true; haptic('medium'); fire(this, 'hass-more-info', { entityId: this.tools[i].entity }) }, LONG_PRESS)
    })
    b.addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) clearTimeout(press.timer) })
    for (const ev of ['pointerup', 'pointercancel']) b.addEventListener(ev, () => clearTimeout(press.timer))
    b.addEventListener('pointerleave', () => { clearTimeout(press.timer); this.hideTip() })
    b.addEventListener('pointerenter', () => this.showTip(b, this.tools[i].label))
    b.addEventListener('focus', () => { if (b.matches(':focus-visible')) this.showTip(b, this.tools[i].label) })
    b.addEventListener('blur', () => this.hideTip())
    b.addEventListener('contextmenu', (e) => e.preventDefault())
    b.addEventListener('click', () => { if (press.fired) { press.fired = false; return } this.pick(i) })
  }

  pick(i) {
    const t = this.tools[i]
    if (!t) return
    haptic('light')
    const prev = this.selected
    this.setSelected(t.id, true)
    if (t.option != null) this.call('input_select', 'select_option', { entity_id: t.entity, option: t.option })
    else toggleEntity(this.hass, t.entity)
    this._pickedAt = Date.now()
    // Scripts are momentary: the plate shows the press, then returns.
    if (t.momentary) setTimeout(() => this.setSelected(prev, true), 650)
  }

  setSelected(id, animate) {
    this.selected = id
    const i = this.tools.findIndex((t) => t.id === id)
    this.btns.forEach((b, j) => { b.setAttribute('aria-pressed', String(j === i)); b.tabIndex = j === (i < 0 ? 0 : i) ? 0 : -1 })
    if (i < 0) { this.plateEl.style.opacity = '0'; return }
    const b = this.btns[i]
    const x = b.offsetLeft, y = b.offsetTop
    const wasHidden = this.plateEl.style.opacity !== '1'
    this.plateEl.style.opacity = '1'
    if (!animate || wasHidden || reducedMotion()) { this.px.jump(x); this.py.jump(y) }
    else { this.px.spring(x, { ...PLATE_SPRING, velocity: 0 }); this.py.spring(y, { ...PLATE_SPRING, velocity: 0 }) }
  }

  rove(e) {
    if (!e.target.classList || !e.target.classList.contains('tool')) return
    const i = Number(e.target.dataset.i), n = this.btns.length
    const v = isVertical(this.edge)
    const next = { [v ? 'ArrowDown' : 'ArrowRight']: (i + 1) % n, [v ? 'ArrowUp' : 'ArrowLeft']: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key]
    if (next === undefined) return
    e.preventDefault()
    this.btns.forEach((b, j) => { b.tabIndex = j === next ? 0 : -1 })
    this.btns[next].focus()
  }

  /* ---- tooltip group ---- */
  showTip(el, label) {
    if (this.dragging) return
    clearTimeout(this._tipT)
    const reveal = (animated) => {
      const sr = this.stage.getBoundingClientRect(), br = el.getBoundingClientRect()
      const tip = this.tipEl
      tip.firstElementChild.textContent = label
      tip.hidden = false
      tip.classList.toggle('anim', animated)
      const cx = br.left - sr.left + br.width / 2, cy = br.top - sr.top + br.height / 2
      const tw = tip.offsetWidth, th = tip.offsetHeight
      const e = this.config.canvas ? this.edge : 'bottom'
      let x, y
      if (e === 'bottom') { x = cx - tw / 2; y = br.top - sr.top - TIP_OFFSET - th }
      else if (e === 'top') { x = cx - tw / 2; y = br.bottom - sr.top + TIP_OFFSET }
      else if (e === 'left') { x = br.right - sr.left + TIP_OFFSET; y = cy - th / 2 }
      else { x = br.left - sr.left - TIP_OFFSET - tw; y = cy - th / 2 }
      tip.style.left = `${clamp(x, 4, sr.width - tw - 4)}px`; tip.style.top = `${y}px`
      this.tipOpen = true
    }
    if (this.tipOpen || performance.now() < this.warmUntil) reveal(false)
    else this._tipT = setTimeout(() => reveal(true), TIP_DELAY)
  }
  hideTip() {
    clearTimeout(this._tipT)
    if (this.tipOpen) this.warmUntil = performance.now() + TIP_WARM
    this.tipOpen = false
    this.tipEl.hidden = true
  }

  /* ---- throwing the dock (canvas mode) ---- */
  edgeTarget(edge) {
    const sw = this.stage.clientWidth, sh = this.stage.clientHeight, dw = this.dock.offsetWidth, dh = this.dock.offsetHeight
    if (edge === 'top') return [(sw - dw) / 2, EDGE_GAP]
    if (edge === 'left') return [EDGE_GAP, (sh - dh) / 2]
    if (edge === 'right') return [sw - dw - EDGE_GAP, (sh - dh) / 2]
    return [(sw - dw) / 2, sh - dh - EDGE_GAP]
  }

  setEdge(edge) {
    this.edge = edge
    this.dock.classList.toggle('v', isVertical(edge))
    this.dock.setAttribute('aria-orientation', isVertical(edge) ? 'vertical' : 'horizontal')
    if (this.selected != null) this.setSelected(this.selected, false)
  }

  toEdge(edge, vx, vy, instant) {
    const before = { w: this.dock.offsetWidth, h: this.dock.offsetHeight }
    if (edge !== this.edge || instant) this.setEdge(edge)
    // Keep the dock's centre where it was when it changes orientation.
    const after = { w: this.dock.offsetWidth, h: this.dock.offsetHeight }
    if (!instant) { this.dx.jump(this.dx.get() + (before.w - after.w) / 2); this.dy.jump(this.dy.get() + (before.h - after.h) / 2) }
    const [tx, ty] = this.edgeTarget(edge)
    if (instant || reducedMotion()) { this.dx.jump(tx); this.dy.jump(ty); return }
    this.dx.spring(tx, { ...DOCK_SPRING, velocity: vx }); this.dy.spring(ty, { ...DOCK_SPRING, velocity: vy })
  }

  wireGrip() {
    const g = this.$('.grip')
    g.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      g.setPointerCapture(e.pointerId)
      this.hideTip()
      this.dragging = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: this.dx.get(), oy: this.dy.get(), samples: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }] }
      this.dx.stop(); this.dy.stop()
    })
    g.addEventListener('pointermove', (e) => {
      const d = this.dragging
      if (!d || d.id !== e.pointerId) return
      const sw = this.stage.clientWidth, sh = this.stage.clientHeight, dw = this.dock.offsetWidth, dh = this.dock.offsetHeight
      this.dx.set(clamp(d.ox + e.clientX - d.sx, -dw / 2, sw - dw / 2)); this.dy.set(clamp(d.oy + e.clientY - d.sy, -dh / 2, sh - dh / 2))
      d.samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp })
      while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > VELOCITY_WINDOW) d.samples.shift()
    })
    const up = (e) => {
      const d = this.dragging
      if (!d || d.id !== e.pointerId) return
      this.dragging = null
      const f = d.samples[0], l = d.samples[d.samples.length - 1] || f, dt = Math.max(1, l.t - f.t)
      const recent = e.timeStamp - l.t < 80
      const vx = recent ? (l.x - f.x) / dt : 0, vy = recent ? (l.y - f.y) / dt : 0
      // Project the throw, then dock to the nearest edge of the canvas.
      const cx = this.dx.get() + this.dock.offsetWidth / 2 + vx * PROJECTION, cy = this.dy.get() + this.dock.offsetHeight / 2 + vy * PROJECTION
      const sw = this.stage.clientWidth, sh = this.stage.clientHeight
      const dist = { left: cx, right: sw - cx, top: cy, bottom: sh - cy }
      const edge = Object.entries(dist).sort((a, b) => a[1] - b[1])[0][0]
      if (edge !== this.edge) haptic('light')
      this.toEdge(edge, vx * 1000, vy * 1000)
    }
    g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up); g.addEventListener('lostpointercapture', up)
  }

  update() {
    this.renderTools()
    const cur = this.currentId()
    // Don't let a stale state snap the plate back right after a pick.
    if (this._pickedAt && Date.now() - this._pickedAt < 1500 && cur !== this.selected) return
    this._pickedAt = 0
    requestAnimationFrame(() => this.setSelected(cur, this.selected !== undefined))
    if (this.config.canvas && this._firstEdge === undefined) { this._firstEdge = true; requestAnimationFrame(() => this.toEdge(this.edge, 0, 0, true)) }
  }

  hassChanged() { if (this.nested) this.nested.hass = this.hass }
  disconnected() { clearTimeout(this._tipT); this.dx.stop(); this.dy.stop() }
  getCardSize() { return this.config.canvas ? 5 : 1 }
  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 4 } }
}

register(ToolDock)
