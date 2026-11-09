/**
 * Kokonut Status Island → Lovelace ("what's happening at home").
 * A dark pill showing the newest thing going on — a script running, media
 * playing with progress, a door left open — with older items peeking out
 * behind it. Hover, focus or tap and it springs open into the full list.
 * When something stops it shows a drawn check for a moment, then leaves.
 *
 *   type: custom:kokonut-status-island
 *   idle_label: All quiet at home      # false hides the card when idle
 *   dismiss_after: 4000
 *   items:
 *     - entity: script.play_youtube_on_lg_tv
 *       label: Starting Dog TV
 *       done_label: Dog TV is on
 *     - entity: media_player.living_room_lg_tv
 *     - entity: binary_sensor.front_door        # doors/windows: shown as alerts
 *     - entity: lock.front_door                 # unlocked: alert with a Lock button
 *     - entity: sensor.washing_machine_power
 *       above: 5
 *       label: Washing machine running
 *       done_label: Laundry done
 *   # any item: status (running|error), active_states, detail, action { label, ...lovelace action }
 */
import { KokoCard, register, MotionValue, friendlyName, domainOf, escapeHtml, runAction, reducedMotion, haptic, rollDigits, ROLL_CSS } from './core.js'

const MORPH = { stiffness: 195, damping: 22.9 } // ≈ { duration: .45, bounce: .18 }
const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)', MAX_PEEK = 2
const OPENING = new Set(['door', 'window', 'opening', 'garage_door', 'gate'])

/** Defaults for an item by domain. */
function rule(hass, spec) {
  const s = hass.states[spec.entity]
  const d = domainOf(spec.entity), name = spec.name || friendlyName(s, spec.entity)
  const dc = s && s.attributes.device_class
  let r = { active: ['on'], status: 'running', label: `${name}`, done: `${name} finished` }
  if (d === 'script' || d === 'automation') r = { active: ['on'], status: 'running', label: `${name}`, done: `${name} done` }
  else if (d === 'media_player') r = { active: ['playing'], status: 'running', label: null, done: null }
  else if (d === 'binary_sensor' && OPENING.has(dc)) r = { active: ['on'], status: 'error', label: `${name} open`, done: `${name} closed` }
  else if (d === 'lock') r = { active: ['unlocked', 'open', 'jammed'], status: 'error', label: `${name} unlocked`, done: `${name} locked`,
    action: { label: 'Lock', action: 'perform-action', perform_action: 'lock.lock', target: { entity_id: spec.entity } } }
  else if (d === 'cover') r = { active: ['open', 'opening'], status: 'running', label: `${name} open`, done: `${name} closed` }
  else if (d === 'vacuum') r = { active: ['cleaning', 'returning'], status: 'running', label: `${name} cleaning`, done: `${name} done` }
  else if (d === 'alarm_control_panel') r = { active: ['triggered', 'pending', 'arming'], status: 'error', label: `${name} ${s ? s.state : ''}`, done: `${name} ok` }
  else if (d === 'update') r = { active: ['on'], status: 'running', label: `Update: ${name}`, done: null }
  return {
    status: spec.status || r.status,
    label: spec.label || r.label,
    done: spec.done_label === false ? null : spec.done_label || r.done,
    action: spec.action === false ? null : spec.action || r.action || null,
    isActive: (st) => {
      if (!st || st.state === 'unavailable' || st.state === 'unknown') return false
      if (spec.above != null || spec.below != null) {
        const v = Number(st.state)
        return Number.isFinite(v) && (spec.above == null || v > spec.above) && (spec.below == null || v < spec.below)
      }
      return (spec.active_states || r.active).includes(st.state)
    },
  }
}

const ICONS = {
  done: `<svg class="ic ok" width="16" height="16" fill="none" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="currentColor" opacity=".18"/><path class="draw" d="M4.75 8.25 7 10.5l4.25-4.75" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" pathLength="1"/></svg>`,
  error: `<svg class="ic err" width="16" height="16" fill="none" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="currentColor" opacity=".18"/><path d="M8 4.5v4" stroke="currentColor" stroke-linecap="round" stroke-width="1.75"/><circle cx="8" cy="11.25" r="1" fill="currentColor"/></svg>`,
}
function runningIcon(progress) {
  const known = typeof progress === 'number', c = 2 * Math.PI * 6, p = known ? Math.min(1, Math.max(0, progress)) : 0.25
  return `<svg class="ic run${known ? '' : ' spin'}" width="16" height="16" fill="none" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-opacity=".18" stroke-width="2"/><circle class="arc" cx="8" cy="8" r="6" stroke="currentColor" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" stroke-linecap="round" stroke-width="2"/></svg>`
}

class StatusIsland extends KokoCard {
  static tag = 'kokonut-status-island'
  static cardName = 'Kokonut Status Island'
  static description = "A Dynamic-Island-style pill of what's happening at home right now."
  static defaults() { return { idle_label: 'All quiet at home', dismiss_after: 4000 } }
  static getStubConfig(hass) {
    const pick = Object.keys(hass.states).filter((x) => x.startsWith('script.') || x.startsWith('media_player.') || x.startsWith('lock.')).slice(0, 4)
    return { items: pick.map((entity) => ({ entity })) }
  }
  validate(c) { if (!Array.isArray(c.items) || !c.items.length) throw new Error('kokonut-status-island: "items" must be a non-empty list') }
  specs() { return this.config.items.map((i) => (typeof i === 'string' ? { entity: i } : i)) }
  watched() { return this.specs().map((s) => s.entity) }

  css() {
    return ROLL_CSS + `
.k-card { padding: 14px 12px; display: flex; justify-content: center; background: none; border: 0; box-shadow: none; overflow: visible; }
.wrap { position: relative; display: flex; flex-direction: column; align-items: center; max-width: 100%; }
.wrap[hidden] { display: none; }
.peek { position: absolute; inset: 0; border-radius: 20px; background: #27272a; box-shadow: 0 0 0 1px rgb(255 255 255/.05); transition: opacity .45s ${EASE}, transform .45s ${EASE}; }
.isl { position: relative; overflow: hidden; border-radius: 20px; background: #09090b; color: #fff; box-shadow: 0 10px 15px -3px rgb(0 0 0/.2), 0 0 0 1px rgb(0 0 0/.05); max-width: 100%; }
:host([dark]) .isl { background: #18181b; box-shadow: 0 10px 15px -3px rgb(0 0 0/.2), 0 0 0 1px rgb(255 255 255/.1); }
.isl.idle { background: transparent; color: var(--k-fg-2); box-shadow: inset 0 0 0 1px var(--k-line); }
.pill { display: flex; height: 40px; max-width: 100%; align-items: center; padding: 0 16px; text-align: left; border: 0; background: none; color: inherit; cursor: pointer; font: inherit; outline: none; }
.pill:focus-visible { box-shadow: inset 0 0 0 2px rgb(255 255 255/.5); border-radius: 20px; }
.slot { position: relative; min-width: 0; overflow: hidden; }
.row { display: flex; min-width: 192px; max-width: 100%; align-items: center; gap: 10px; }
.slot > .row.out { position: absolute; left: 0; top: 0; }
.lbl { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; line-height: 16px; }
.lbl i { font-style: normal; color: rgb(255 255 255/.5); }
.trail { flex: none; padding-left: 12px; display: flex; align-items: center; font-size: 12px; color: rgb(255 255 255/.55); font-variant-numeric: tabular-nums; }
.trail .rolls { display: inline-flex; }
.trail .rd { height: 16px; } .trail .rd-wheel > span { height: 16px; line-height: 16px; }
.act { margin: -4px 0; flex: none; border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 500; color: #fff; background: rgb(255 255 255/.12); border: 0; cursor: pointer; transition: background-color .15s; font-family: inherit; }
.act:hover { background: rgb(255 255 255/.2); }
.act:focus-visible { outline: 2px solid rgb(255 255 255/.6); }
span.act { cursor: inherit; }
ul { list-style: none; margin: 0; display: flex; width: 320px; max-width: calc(100vw - 2rem); flex-direction: column; gap: 14px; padding: 14px 16px; outline: none; }
.ic { flex: none; }
.ic.ok { color: #34d399; } .ic.err { color: #f87171; } .ic.run { color: #fff; transform: rotate(-90deg); }
.ic .arc { transition: stroke-dashoffset .25s ${EASE}; }
.spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(-90deg); } to { transform: rotate(270deg); } }
.draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw .3s .08s ${EASE} forwards; } @keyframes draw { to { stroke-dashoffset: 0; } }
.idle .row { min-width: 0; color: var(--k-fg-2); }
.dot { width: 8px; height: 8px; border-radius: 99px; background: #10b981; box-shadow: 0 0 0 3px rgb(16 185 129/.18); flex: none; }
@media (prefers-reduced-motion: reduce) { .spin, .draw { animation: none; } .draw { stroke-dashoffset: 0; } .peek { transition: none; } }
`
  }

  render() { return '<div class="k-card"><div class="wrap"><div class="peeks"></div><div class="isl"></div></div><output class="sr" aria-live="polite"></output></div>' }

  build() {
    this.isl = this.$('.isl'); this.peeks = this.$('.peeks'); this.wrap = this.$('.wrap')
    this.tasks = new Map()   // entity -> task
    this.open = false
    this.w = new MotionValue(0); this.h = new MotionValue(0)
    const sz = () => { if (this._morphing) { this.isl.style.width = `${this.w.get()}px`; this.isl.style.height = `${this.h.get()}px` } }
    this.w.on(sz); this.h.on(sz)
    this.isl.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.setOpen(true) })
    this.isl.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.setOpen(false) })
    this.isl.addEventListener('focusout', (e) => { if (!this.isl.contains(e.relatedTarget)) this.setOpen(false) })
    this.isl.addEventListener('keydown', (e) => { if (e.key === 'Escape') { this.setOpen(false); requestAnimationFrame(() => { const p = this.isl.querySelector('.pill'); if (p) p.focus({ preventScroll: true }) }) } })
    this.isl.addEventListener('click', (e) => {
      const a = e.target.closest('button.act')
      if (a) { e.stopPropagation(); const t = this.tasks.get(a.dataset.id); if (t && t.action) { haptic('light'); runAction(this, this.hass, t.action, t.entity) } return }
      if (e.target.closest('.pill') && this.list().length) this.setOpen(true)
    })
    this._outside = (e) => { if (this.open && !e.composedPath().includes(this.isl)) this.setOpen(false) }
  }

  list() { return [...this.tasks.values()].sort((a, b) => a.since - b.since) }

  setOpen(o) {
    o = o && this.list().length > 0
    if (o === this.open) return
    if (o) for (const t of this.tasks.values()) if (t.doneAt) t.doneAt = Date.now() // reading restarts the clock
    this.morph(() => { this.open = o; this.paint() })
    this.paint(true)
  }

  /** FLIP-style size morph: measure, change, spring from old size to new. */
  morph(change) {
    const before = this.isl.getBoundingClientRect()
    change()
    if (reducedMotion() || !before.width) return
    this._morphing = false
    this.isl.style.width = ''; this.isl.style.height = ''
    const after = this.isl.getBoundingClientRect()
    if (Math.abs(after.width - before.width) < 1 && Math.abs(after.height - before.height) < 1) return
    this._morphing = true
    this.w.jump(before.width); this.h.jump(before.height)
    this.isl.style.width = `${before.width}px`; this.isl.style.height = `${before.height}px`
    const run = ++this._morphRun || (this._morphRun = 1)
    Promise.all([this.w.spring(after.width, { ...MORPH, velocity: 0, restDelta: 0.5 }), this.h.spring(after.height, { ...MORPH, velocity: 0, restDelta: 0.5 })])
      .then(() => { if (this._morphRun === run) { this._morphing = false; this.isl.style.width = ''; this.isl.style.height = '' } })
  }

  rowHtml(t, inert) {
    const icon = t.status === 'done' ? ICONS.done : t.status === 'error' ? ICONS.error : runningIcon(t.progress)
    let trail = ''
    if (t.action && t.status !== 'done') trail = inert ? `<span class="act">${escapeHtml(t.action.label || 'Open')}</span>` : `<button class="act" type="button" data-id="${escapeHtml(t.id)}">${escapeHtml(t.action.label || 'Open')}</button>`
    else if (t.status === 'running' && typeof t.progress === 'number') trail = `<span class="rolls" data-pct="${Math.round(t.progress * 100)}"></span>%`
    return `<div class="row" data-key="${escapeHtml(`${t.id}|${t.status}|${t.label}`)}">${icon}<span class="lbl">${escapeHtml(t.label)}${t.detail ? `<i> · ${escapeHtml(t.detail)}</i>` : ''}</span>${trail ? `<span class="trail">${trail}</span>` : ''}</div>`
  }

  fillRolls(root) { for (const r of root.querySelectorAll('.rolls[data-pct]')) rollDigits(r, r.dataset.pct, { duration: 200 }) }

  paint(onlyPeeks) {
    const tasks = this.list()
    const current = tasks[tasks.length - 1]
    const behind = Math.min(tasks.length - 1, MAX_PEEK)
    const expanded = this.open && tasks.length > 0
    // Peeking layers behind the island.
    if (this.peeks.children.length !== Math.max(0, behind)) this.peeks.innerHTML = Array.from({ length: Math.max(0, behind) }, (_, i) => `<div class="peek" aria-hidden="true" style="z-index:${-1 - i}"></div>`).join('')
    ;[...this.peeks.children].forEach((p, i) => { p.style.opacity = expanded ? '0' : String(1 - (i + 1) * 0.3); p.style.transform = `translateY(${expanded ? 0 : -(i + 1) * 5}px) scale(${1 - (i + 1) * 0.06})` })
    if (onlyPeeks) return
    const idle = !current
    this.wrap.hidden = idle && this.config.idle_label === false
    this.isl.classList.toggle('idle', idle)
    if (idle) {
      this.isl.innerHTML = `<div class="pill" role="status"><div class="slot"><div class="row"><span class="dot"></span><span class="lbl">${escapeHtml(this.config.idle_label || '')}</span></div></div></div>`
      this._shownKey = null
      return
    }
    if (expanded) {
      if (!this.isl.querySelector('ul')) this.isl.innerHTML = '<ul aria-label="Activity" tabindex="-1"></ul>'
      const ul = this.isl.querySelector('ul')
      ul.innerHTML = tasks.map((t) => `<li>${this.rowHtml(t, false)}</li>`).join('')
      this.fillRolls(ul)
      this._shownKey = null
      return
    }
    let pill = this.isl.querySelector('.pill')
    if (!pill || pill.tagName !== 'BUTTON') {
      this.isl.innerHTML = '<button class="pill" type="button" aria-expanded="false"><div class="slot"></div></button>'
      pill = this.isl.querySelector('.pill')
      this._shownKey = null
    }
    pill.setAttribute('aria-label', `${current.label}${current.detail ? `, ${current.detail}` : ''}. ${tasks.length} ${tasks.length === 1 ? 'item' : 'items'}, show all`)
    const slot = pill.querySelector('.slot')
    const key = `${current.id}|${current.status}|${current.label}`
    if (key === this._shownKey) {
      // Same item: update progress in place without a swap.
      const r = slot.querySelector('.row:not(.out)')
      const fresh = document.createElement('div'); fresh.innerHTML = this.rowHtml(current, true)
      const arc = r && r.querySelector('.arc'), farc = fresh.querySelector('.arc')
      if (arc && farc) arc.setAttribute('stroke-dashoffset', farc.getAttribute('stroke-dashoffset'))
      const rolls = r && r.querySelector('.rolls'), fr = fresh.querySelector('.rolls')
      if (rolls && fr) rollDigits(rolls, fr.dataset.pct, { duration: 200 })
      const lbl = r && r.querySelector('.lbl'), fl = fresh.querySelector('.lbl')
      if (lbl && fl && lbl.innerHTML !== fl.innerHTML) lbl.innerHTML = fl.innerHTML
      return
    }
    this._shownKey = key
    const old = slot.querySelector('.row:not(.out)')
    const holder = document.createElement('div'); holder.innerHTML = this.rowHtml(current, true)
    const next = holder.firstElementChild
    this.fillRolls(next)
    this.morph(() => {
      if (old && !reducedMotion()) {
        old.classList.add('out')
        old.animate([{ opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }, { opacity: 0, transform: 'translateY(-6px)', filter: 'blur(4px)' }], { duration: 220, easing: EASE, fill: 'forwards' }).onfinish = () => old.remove()
        slot.append(next)
        next.animate([{ opacity: 0, transform: 'translateY(6px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }], { duration: 220, easing: EASE })
      } else slot.replaceChildren(next)
    })
  }

  /** Recompute tasks from entity states; ended ones flip to done, then leave. */
  sync(old) {
    const now = Date.now()
    let changed = false
    for (const spec of this.specs()) {
      const s = this.hass.states[spec.entity]
      const r = rule(this.hass, spec)
      const active = r.isActive(s)
      const prev = this.tasks.get(spec.entity)
      if (active) {
        const a = (s && s.attributes) || {}
        let progress, label = r.label, detail = spec.detail
        if (domainOf(spec.entity) === 'media_player') {
          label = label || a.media_title || friendlyName(s)
          detail = detail || a.app_name || (a.media_title ? friendlyName(s) : undefined)
          if (a.media_duration && a.media_position != null) {
            const at = Date.parse(a.media_position_updated_at || s.last_updated)
            progress = Math.min(1, (Number(a.media_position) + (at ? (now - at) / 1000 : 0)) / Number(a.media_duration))
          }
        }
        if (spec.progress_attribute && a[spec.progress_attribute] != null) progress = Number(a[spec.progress_attribute]) / 100
        const t = { id: spec.entity, entity: spec.entity, status: r.status, label: label || friendlyName(s), detail, progress, action: r.action, since: prev && prev.status !== 'done' ? prev.since : now, doneAt: null }
        if (!prev || prev.status !== t.status || prev.label !== t.label || prev.detail !== t.detail || Math.round((prev.progress ?? -1) * 100) !== Math.round((t.progress ?? -1) * 100)) changed = true
        this.tasks.set(spec.entity, t)
        if (!prev || prev.status === 'done') this.$('.sr').textContent = `${t.label}${t.detail ? `, ${t.detail}` : ''}`
      } else if (prev && prev.status !== 'done') {
        if (r.done && old) {
          this.tasks.set(spec.entity, { ...prev, status: 'done', label: r.done, detail: undefined, progress: undefined, action: null, since: now, doneAt: now })
          this.$('.sr').textContent = r.done
        } else this.tasks.delete(spec.entity)
        changed = true
      }
    }
    // Finished items leave on their own, never while the list is open.
    for (const [id, t] of this.tasks) {
      if (t.status === 'done' && !this.open && now - t.doneAt >= this.config.dismiss_after) { this.tasks.delete(id); changed = true }
    }
    if (this.open && !this.tasks.size) this.open = false
    if (changed) this.paint()
  }

  update(old) { this.sync(old) }

  connected() {
    document.addEventListener('pointerdown', this._outside)
    clearInterval(this._iv)
    // Ticks media progress and expires finished items.
    this._iv = setInterval(() => { if (this.hass && !document.hidden) this.sync(this.hass) }, 1000)
  }
  disconnected() { clearInterval(this._iv); document.removeEventListener('pointerdown', this._outside) }
  getCardSize() { return 1 }
  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 4 } }
}

register(StatusIsland)
