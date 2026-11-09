/**
 * Kokonut Notification Stack → Lovelace (Home Assistant persistent notifications).
 * Notifications pile into a stack with the cards behind peeking out; hover,
 * focus or "Show all" fans them out. Swipe a card sideways (flick or drag past
 * the threshold) to dismiss it in Home Assistant; it flies off with its own
 * speed while the rest close the gap. Delete/Backspace dismiss from the keyboard.
 *
 *   type: custom:kokonut-notification-stack
 *   title: Notifications
 *   empty_text: You're all caught up.
 *   max: 20
 */
import { KokoCard, register, escapeHtml, icon, lucide, reducedMotion, haptic } from './core.js'

const PEEK = 10, VISIBLE_BEHIND = 2, GAP = 8, FALLBACK_HEIGHT = 76
const DISMISS_DISTANCE = 100, DISMISS_VELOCITY = 0.11, AXIS_LOCK = 6
const SPRING_STIFFNESS = 520, SPRING_DAMPING = 2 * Math.sqrt(SPRING_STIFFNESS)
const FLIGHT_MIN_SPEED = 1400, FLIGHT_ACCEL = 4200, VELOCITY_WINDOW_MS = 80, EXIT_MS = 200
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'
const opacityFor = (x) => Math.max(1 - Math.abs(x) / 240, 0.3)

function releaseVelocity(samples) {
  const last = samples[samples.length - 1]
  if (!last) return 0
  let first = last
  for (let i = samples.length - 1; i >= 0; i--) { if (last.t - samples[i].t > VELOCITY_WINDOW_MS) break; first = samples[i] }
  const dt = last.t - first.t
  return dt > 0 ? (last.x - first.x) / dt : 0
}
function dismissDirection(dx, v) {
  const flick = Math.abs(v) > DISMISS_VELOCITY && Math.sign(v) === Math.sign(dx)
  if (Math.abs(dx) < DISMISS_DISTANCE && !flick) return 0
  return (dx === 0 ? v : dx) > 0 ? 1 : -1
}
/** Persistent notifications are markdown; keep the words, drop the syntax. */
const plain = (md) => String(md || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim()
const TONES = ['#10b981', '#ef4444', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ec4899']
function toneFor(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) | 0; return TONES[Math.abs(h) % TONES.length] }

class NotificationStack extends KokoCard {
  static tag = 'kokonut-notification-stack'
  static cardName = 'Kokonut Notification Stack'
  static description = "Home Assistant's notifications as a swipe-to-dismiss stack."
  static defaults() { return { title: 'Notifications', empty_text: "You're all caught up.", max: 20 } }
  static getStubConfig() { return {} }
  watched() { return [] }

  css() {
    return `
.k-card { padding: 16px; }
:host([plain]) .k-card { padding: 0; }
.head { margin-bottom: 12px; display: flex; height: 28px; align-items: center; justify-content: space-between; padding: 0 4px; }
.head p { margin: 0; font-size: 14px; font-weight: 500; }
.head .n { margin-left: 8px; color: #71717a; font-variant-numeric: tabular-nums; } :host([dark]) .head .n { color: #a1a1aa; }
.more { border-radius: 6px; padding: 4px 8px; font-size: 14px; border: 0; background: none; cursor: pointer; color: #71717a; transition: background-color .15s, color .15s; }
.more:hover { background: #f4f4f5; color: #18181b; } :host([dark]) .more:hover { background: #27272a; color: #f4f4f5; }
ol { position: relative; margin: 0; padding: 0; list-style: none; outline: none; transition: height .3s ${EASE_OUT}; }
li { position: absolute; left: 0; right: 0; top: 0; transform-origin: top; transition: transform .3s ${EASE_OUT}, opacity .3s ${EASE_OUT}; }
.sw { touch-action: pan-y; }
article { position: relative; display: flex; gap: 12px; user-select: none; -webkit-user-select: none; border-radius: 16px; border: 1px solid #e4e4e7; background: #fff; padding: 14px; box-shadow: 0 1px 2px rgb(0 0 0/.05); outline: none; }
:host([dark]) article { border-color: #27272a; background: #18181b; }
article:focus-visible { box-shadow: 0 0 0 2px #a1a1aa; }
article.tap { cursor: pointer; }
.c { display: flex; min-width: 0; flex: 1; gap: 12px; transition: opacity .2s; }
.c.muted { opacity: 0; }
.ic { flex: none; display: flex; width: 32px; height: 32px; align-items: center; justify-content: center; border-radius: 8px; color: #fff; }
.tx { min-width: 0; flex: 1; }
.tr { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.tt { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 500; }
.tm { flex: none; font-size: 12px; color: #a1a1aa; font-variant-numeric: tabular-nums; }
.bd { margin: 0; font-size: 14px; color: #71717a; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; } :host([dark]) .bd { color: #a1a1aa; }
.x { position: absolute; top: -8px; left: -8px; display: flex; width: 24px; height: 24px; align-items: center; justify-content: center; border-radius: 999px; border: 1px solid #e4e4e7; background: #fff; color: #71717a; opacity: 0; transition: opacity .15s; cursor: pointer; padding: 0; }
:host([dark]) .x { border-color: #3f3f46; background: #27272a; color: #a1a1aa; }
.x:hover { color: #18181b; } :host([dark]) .x:hover { color: #f4f4f5; }
article:hover .x, .x:focus-visible { opacity: 1; }
@media (hover: none) { .x { opacity: 1; } }
.x.hide { display: none; }
.empty { padding: 24px 0; text-align: center; font-size: 14px; color: #71717a; margin: 0; } :host([dark]) .empty { color: #a1a1aa; }
@media (prefers-reduced-motion: reduce) { li { transition: opacity .3s; } ol { transition: none; } }
`
  }

  render() {
    return `<div class="k-card"><div class="stack">
      <div class="head"><p><span class="title"></span><span class="n"></span></p></div>
      <ol aria-label="Notifications" tabindex="-1"></ol>
      <p class="empty" hidden></p>
    </div></div>`
  }

  build() {
    this.items = []          // newest first: { id, title, body, time, tone }
    this.heights = {}
    this.hovered = false; this.focused = false; this.pinned = false
    this.leaving = new Set(); this.dismissed = new Set()
    this.nodes = new Map()   // id -> { li, sw, article, content, x }
    this.lastY = new Map(); this.swipeX = new Map(); this.frames = new Map()
    this.drag = null; this.suppressClick = false
    this.list = this.$('ol')
    const stack = this.$('.stack')
    stack.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { this.hovered = true; this.layout() } })
    stack.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { this.hovered = false; this.layout() } })
    stack.addEventListener('focusin', () => { this.focused = true; this.layout() })
    stack.addEventListener('focusout', (e) => { if (!stack.contains(e.relatedTarget)) { this.focused = false; this.layout() } })
    this.$('.head').addEventListener('click', (e) => { if (e.target.closest('.more')) { this.pinned = !this.pinned; this.layout() } })
    this.ro = new ResizeObserver((entries) => {
      let changed = false
      for (const en of entries) {
        const id = en.target.dataset.id
        const h = Math.round(en.borderBoxSize && en.borderBoxSize[0] ? en.borderBoxSize[0].blockSize : en.target.offsetHeight)
        if (id && h && this.heights[id] !== h) { this.heights[id] = h; changed = true }
      }
      if (changed) this.layout()
    })
  }

  connected() { this.subscribe() }
  disconnected() {
    if (this._unsub) { Promise.resolve(this._unsub).then((u) => { if (typeof u === 'function') u() }).catch(() => {}); this._unsub = null }
    for (const f of this.frames.values()) cancelAnimationFrame(f)
    this.frames.clear()
  }

  subscribe() {
    if (this._unsub || !this.hass || !this.hass.connection) return
    this._unsub = this.hass.connection.subscribeMessage((msg) => this.onMessage(msg), { type: 'persistent_notification/subscribe' })
  }

  onMessage(msg) {
    const all = msg.notifications || {}
    if (msg.type === 'current') {
      const next = Object.values(all).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      this.setItems(next.map((n) => this.toItem(n)))
    } else if (msg.type === 'added' || msg.type === 'updated') {
      const incoming = Object.values(all).map((n) => this.toItem(n))
      const map = new Map(this.items.map((i) => [i.id, i]))
      for (const it of incoming) map.set(it.id, it)
      this.setItems([...map.values()].sort((a, b) => b.created - a.created))
      if (msg.type === 'added') haptic('light')
    } else if (msg.type === 'removed') {
      for (const id of Object.keys(all)) if (!this.leaving.has(id)) this.dismiss(id, 1, 0, true)
    }
  }

  toItem(n) {
    return { id: n.notification_id, title: plain(n.title) || 'Notification', body: plain(n.message), created: Date.parse(n.created_at) || Date.now(), tone: toneFor(n.notification_id) }
  }

  timeLabel(t) {
    const m = Math.round((Date.now() - t) / 60000)
    if (m < 1) return 'now'
    if (m < 60) return `${m}m`
    const h = Math.round(m / 60)
    if (h < 24) return `${h}h`
    return new Date(t).toLocaleDateString((this.hass && this.hass.locale && this.hass.locale.language) || undefined, { month: 'short', day: 'numeric' })
  }

  setItems(items) {
    const keep = items.slice(0, this.config.max).filter((i) => !this.dismissed.has(i.id))
    // Leaving cards stay in the DOM until their flight ends.
    const leavingItems = this.items.filter((i) => this.leaving.has(i.id) && !keep.some((k) => k.id === i.id))
    this.items = [...keep, ...leavingItems]
    for (const it of this.items) this.ensureNode(it)
    for (const [id, n] of this.nodes) if (!this.items.some((i) => i.id === id)) { this.ro.unobserve(n.li); n.li.remove(); this.nodes.delete(id) }
    // Newest on top in DOM order too (z-index handles stacking).
    this.layout()
  }

  ensureNode(item) {
    let n = this.nodes.get(item.id)
    if (!n) {
      const li = document.createElement('li')
      li.dataset.id = item.id
      li.innerHTML = `<div class="sw"><article tabindex="0"><div class="c"><div><span class="ic" style="background:${item.tone}">${icon('mdi:bell-outline', 16)}</span></div><div class="tx"><div class="tr"><p class="tt"></p><span class="tm"></span></div><p class="bd"></p></div></div><button class="x" type="button">${lucide('x', { size: 12 })}</button></article></div>`
      // New arrivals drop in from above.
      li.style.transition = 'none'; li.style.opacity = '0'; li.style.transform = 'translateY(-12px) scale(.98)'
      this.list.prepend(li)
      n = { li, sw: li.firstElementChild, article: li.querySelector('article'), content: li.querySelector('.c'), xBtn: li.querySelector('.x') }
      this.nodes.set(item.id, n)
      this.wire(item.id, n)
      this.ro.observe(li)
      requestAnimationFrame(() => { li.style.transition = '' })
    }
    n.li.querySelector('.tt').textContent = item.title
    n.li.querySelector('.bd').textContent = item.body
    n.li.querySelector('.tm').textContent = this.timeLabel(item.created)
    n.article.setAttribute('aria-label', `${item.title}. ${item.body}`)
    n.xBtn.setAttribute('aria-label', `Dismiss ${item.title}`)
    return n
  }

  wire(id, n) {
    n.xBtn.addEventListener('click', (e) => { e.stopPropagation(); this.dismiss(id, 1) })
    n.article.addEventListener('click', () => {
      if (this.suppressClick) { this.suppressClick = false; return }
      if (!this.expanded) { this.pinned = true; this.layout() }
    })
    n.article.addEventListener('keydown', (e) => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (!e.repeat) this.dismiss(id, 1) } })
    n.sw.addEventListener('pointerdown', (e) => this.down(e, id))
    n.sw.addEventListener('pointermove', (e) => this.move(e, id))
    n.sw.addEventListener('pointerup', (e) => this.up(e, id))
    n.sw.addEventListener('pointercancel', (e) => this.up(e, id))
    n.sw.addEventListener('lostpointercapture', (e) => { if (e.target === e.currentTarget) this.up(e, id) })
  }

  get laidOut() { return this.items.filter((i) => !this.leaving.has(i.id)) }
  heightOf(id) { return this.heights[id] ?? FALLBACK_HEIGHT }

  layout() {
    const laid = this.laidOut
    this.expanded = (this.hovered || this.focused || this.pinned) && laid.length > 1
    const exp = this.expanded
    const frontH = laid[0] ? this.heightOf(laid[0].id) : 0
    const stackH = exp ? laid.reduce((s, i) => s + this.heightOf(i.id), 0) + Math.max(laid.length - 1, 0) * GAP : frontH + Math.min(laid.length - 1, VISIBLE_BEHIND) * PEEK
    this.list.style.height = `${stackH}px`
    const offsets = []
    let run = 0
    for (const it of laid) { offsets.push(run); run += this.heightOf(it.id) + GAP }
    for (const it of this.items) {
      const n = this.nodes.get(it.id)
      if (!n) continue
      const index = laid.findIndex((c) => c.id === it.id)
      const isLeaving = index === -1
      const depth = Math.max(index, 0)
      const hidden = !(exp || depth <= VISIBLE_BEHIND)
      const scale = exp || isLeaving ? 1 : 1 - depth * 0.05
      const resting = exp ? offsets[depth] : frontH + depth * PEEK - this.heightOf(it.id) * scale
      const y = isLeaving ? this.lastY.get(it.id) ?? 0 : resting
      if (!isLeaving) this.lastY.set(it.id, resting)
      n.li.style.transform = `translateY(${y}px) scale(${scale})`
      n.li.style.opacity = hidden ? '0' : '1'
      n.li.style.zIndex = String(this.items.length - depth)
      n.li.style.pointerEvents = hidden ? 'none' : ''
      n.article.tabIndex = hidden ? -1 : 0
      n.xBtn.tabIndex = hidden ? -1 : 0
      const muted = !exp && depth > 0
      n.content.classList.toggle('muted', muted)
      n.xBtn.classList.toggle('hide', muted)
      n.article.classList.toggle('tap', !exp && depth === 0 && laid.length > 1)
    }
    this.$('.title').textContent = this.config.title
    this.$('.n').textContent = String(laid.length)
    const head = this.$('.head')
    let more = head.querySelector('.more')
    if (laid.length > 1 && !more) { head.insertAdjacentHTML('beforeend', '<button class="more" type="button"></button>'); more = head.querySelector('.more') }
    if (laid.length <= 1 && more) { more.remove(); more = null }
    if (more) { more.textContent = exp ? 'Show less' : 'Show all'; more.setAttribute('aria-expanded', String(exp)) }
    const empty = this.$('.empty')
    empty.hidden = laid.length !== 0
    empty.textContent = this.config.empty_text
  }

  stopFrame(id) { const f = this.frames.get(id); if (f !== undefined) { cancelAnimationFrame(f); this.frames.delete(id) } }

  paint(id, x) {
    this.swipeX.set(id, x)
    const n = this.nodes.get(id)
    if (!n) return
    n.sw.style.transition = 'none'
    n.sw.style.transform = x === 0 ? '' : `translateX(${x}px)`
    n.sw.style.opacity = x === 0 ? '' : `${opacityFor(x)}`
  }

  runSim(id, step, done) {
    this.stopFrame(id)
    let last = performance.now()
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 1 / 30)
      last = now
      if (step(dt)) { this.frames.delete(id); done && done(); return }
      this.frames.set(id, requestAnimationFrame(tick))
    }
    this.frames.set(id, requestAnimationFrame(tick))
  }

  snapBack(id, velocity) {
    let x = this.swipeX.get(id) ?? 0, v = velocity * 1000
    if (reducedMotion()) { this.paint(id, 0); return }
    this.runSim(id, (dt) => {
      v += (-SPRING_STIFFNESS * x - SPRING_DAMPING * v) * dt
      x += v * dt
      if (Math.abs(x) < 0.5 && Math.abs(v) < 10) { this.paint(id, 0); return true }
      this.paint(id, x); return false
    })
  }

  finishDismiss(id) {
    this.items = this.items.filter((i) => i.id !== id)
    const n = this.nodes.get(id)
    if (n) { this.ro.unobserve(n.li); n.li.remove(); this.nodes.delete(id) }
    this.lastY.delete(id); this.swipeX.delete(id); this.leaving.delete(id)
    this.layout()
  }

  /** Throw the card off the side and dismiss it in HA. */
  dismiss(id, direction, velocity = 0, fromHA = false) {
    if (this.dismissed.has(id) && !fromHA) return
    this.dismissed.add(id)
    if (!fromHA && this.hass) {
      this.hass.callService('persistent_notification', 'dismiss', { notification_id: id }).catch((e) => console.error('[kokohome] dismiss failed', e))
      haptic('light')
    }
    this.leaving.add(id)
    const n = this.nodes.get(id)
    if (n && n.li.contains(this.shadowRoot.activeElement)) {
      const laid = this.items.filter((i) => !this.leaving.has(i.id) || i.id === id)
      const at = laid.findIndex((i) => i.id === id)
      const next = laid[at + 1] || laid[at - 1]
      const target = next && next.id !== id ? this.nodes.get(next.id).article : this.list
      target.focus()
    }
    this.layout()
    if (!n || reducedMotion()) {
      this.stopFrame(id)
      if (n) { n.sw.style.transition = `opacity ${EXIT_MS}ms ${EASE_OUT}`; n.sw.style.opacity = '0' }
      setTimeout(() => this.finishDismiss(id), EXIT_MS)
      return
    }
    const distance = n.sw.offsetWidth * 1.1
    let x = this.swipeX.get(id) ?? 0, speed = Math.max(Math.abs(velocity) * 1000, FLIGHT_MIN_SPEED)
    this.runSim(id, (dt) => {
      speed += FLIGHT_ACCEL * dt
      x += direction * speed * dt
      const done = Math.abs(x) >= distance
      this.paint(id, done ? direction * distance : x)
      n.sw.style.opacity = `${Math.max(1 - Math.abs(x) / distance, 0)}`
      return done
    }, () => this.finishDismiss(id))
  }

  down(e, id) {
    const laid = this.laidOut
    const index = laid.findIndex((i) => i.id === id)
    if (this.drag || this.leaving.has(id) || (!this.expanded && index > 0)) return
    this.suppressClick = false
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (e.target.closest('button')) return
    this.stopFrame(id)
    const pid = e.pointerId
    const release = (up) => {
      if (up.pointerId !== pid) return
      window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release)
      if (this.drag && this.drag.pointerId === pid) { this.drag = null; if (this.swipeX.get(id)) this.snapBack(id, 0) }
    }
    window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release)
    this.drag = { pointerId: pid, startX: e.clientX, startY: e.clientY, originX: this.swipeX.get(id) ?? 0, dx: 0, axis: null, samples: [] }
  }

  move(e, id) {
    const d = this.drag
    if (!d || d.pointerId !== e.pointerId) return
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY
    if (d.axis === null) {
      if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (d.axis === 'x') e.currentTarget.setPointerCapture(e.pointerId)
    }
    if (d.axis !== 'x') return
    d.dx = d.originX + dx
    d.samples.push({ t: e.timeStamp, x: d.dx })
    if (d.samples.length > 12) d.samples.shift()
    this.paint(id, d.dx)
  }

  up(e, id) {
    const d = this.drag
    if (!d || d.pointerId !== e.pointerId) return
    this.drag = null
    if (d.axis !== 'x') { if (this.swipeX.get(id)) this.snapBack(id, 0); return }
    this.suppressClick = true
    const v = releaseVelocity(d.samples)
    const dir = dismissDirection(d.dx, v)
    if (dir === 0) { this.snapBack(id, v); return }
    this.dismiss(id, dir, Math.sign(v) === dir ? v : 0)
  }

  update() {
    this.subscribe()
    this.layout()
  }

  getCardSize() { return 3 }
  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 } }
}

register(NotificationStack)
