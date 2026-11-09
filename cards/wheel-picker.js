/**
 * Kokonut Wheel Picker → Lovelace.
 * iOS-style drum picker: each column is a real 3D cylinder, drawn twice — a
 * muted copy and a full-colour copy clipped to the selection band, so text
 * darkens exactly as it crosses the band. Flicks coast and land on a row;
 * non-looping wheels rubber-band past the ends.
 *
 *   type: custom:kokonut-wheel-picker
 *   entity: climate.living_room_ac        # auto columns: Mode + Fan
 *   # or explicit columns (any mix of entities/attributes):
 *   columns:
 *     - entity: climate.living_room_ac     # hvac mode
 *     - entity: climate.living_room_ac
 *       attribute: fan_mode
 *     - entity: input_select.house_mode
 *     - entity: input_datetime.alarm       # expands to hour + minute
 *   name: Living room AC
 *   show_labels: true
 */
import { KokoCard, register, MotionValue, clamp, friendlyName, domainOf, debounce, reducedMotion, isUnavailable, escapeHtml } from './core.js'

const ITEM_HEIGHT = 36, ITEM_ANGLE = 20
const RADIUS = Math.round((ITEM_HEIGHT / 2 / Math.tan((ITEM_ANGLE / 2) * (Math.PI / 180))) * 100) / 100
const WINDOW = Math.ceil(90 / ITEM_ANGLE)
const VIEW_HEIGHT = Math.round(RADIUS * 2) + ITEM_HEIGHT / 2
const MAX_OVERSCROLL = 1.2, VELOCITY_WINDOW_MS = 80, TAP_SLOP = 4, COAST = 0.32
const SETTLE = { stiffness: 247, damping: 26.7, restDelta: 0.001 } // ≈ { duration: .4, bounce: .15 }
const mod = (n, m) => ((n % m) + m) % m
const damp = (d, max) => max * (1 - Math.exp(-d / max))
const pretty = (s) => String(s).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

// attribute → [list attribute, service, data key] per domain
const ATTRS = {
  climate: { fan_mode: ['fan_modes', 'set_fan_mode'], swing_mode: ['swing_modes', 'set_swing_mode'], preset_mode: ['preset_modes', 'set_preset_mode'], swing_horizontal_mode: ['swing_horizontal_modes', 'set_swing_horizontal_mode'] },
  fan: { preset_mode: ['preset_modes', 'set_preset_mode'], direction: [null, 'set_direction'] },
  media_player: { source: ['source_list', 'select_source'], sound_mode: ['sound_mode_list', 'select_sound_mode'] },
  light: { effect: ['effect_list', 'turn_on'] },
  humidifier: { mode: ['available_modes', 'set_mode'] },
  water_heater: { operation_mode: ['operation_list', 'set_operation_mode'] },
  vacuum: { fan_speed: ['fan_speed_list', 'set_fan_speed'] },
}
const COLUMN_TITLES = { hvac_mode: 'Mode', fan_mode: 'Fan', swing_mode: 'Swing', preset_mode: 'Preset', source: 'Source', sound_mode: 'Sound', effect: 'Effect', mode: 'Mode', operation_mode: 'Mode', fan_speed: 'Suction', swing_horizontal_mode: 'Swing ↔' }

/** Resolve one column spec into { id, title, options:[{value,label}], value, loop, set(v) }. */
function resolveColumn(hass, spec) {
  const s = hass.states[spec.entity]
  if (!s) return []
  const d = domainOf(spec.entity), a = s.attributes
  const svc = (domain, service, data) => hass.callService(domain, service, { entity_id: spec.entity, ...data })
  const attrLabel = (attr, v) => {
    if (hass.formatEntityAttributeValue) { try { const t = hass.formatEntityAttributeValue(s, attr, v); if (t && t !== v) return t } catch (_) { /* noop */ } }
    return pretty(v)
  }
  const stateLabel = (v) => {
    if (hass.formatEntityState) { try { const t = hass.formatEntityState({ ...s, state: v }); if (t && t !== v) return t } catch (_) { /* noop */ } }
    return pretty(v)
  }
  const filter = (list) => (spec.options ? list.filter((o) => spec.options.includes(o)) : list)

  if (d === 'input_datetime' || (d === 'time')) {
    const [hh, mm] = String(d === 'time' ? s.state : (a.has_time ? s.state.split(' ').pop() : '00:00')).split(':')
    const step = spec.minute_step || 1
    const setTime = (h, m) => d === 'time'
      ? svc('time', 'set_value', { time: `${h}:${m}:00` })
      : svc('input_datetime', 'set_datetime', { time: `${h}:${m}:00` })
    const shared = { h: hh, m: mm }
    const commit = debounce(() => setTime(shared.h, shared.m), 500)
    return [
      { id: `${spec.entity}:h`, title: spec.label || 'Hour', loop: true, value: hh,
        options: Array.from({ length: 24 }, (_, i) => ({ value: String(i).padStart(2, '0'), label: String(i).padStart(2, '0') })),
        set: (v) => { shared.h = v; commit() } },
      { id: `${spec.entity}:m`, title: 'Min', loop: true, value: String(Math.round(Number(mm) / step) * step % 60).padStart(2, '0'),
        options: Array.from({ length: Math.ceil(60 / step) }, (_, i) => ({ value: String(i * step).padStart(2, '0'), label: String(i * step).padStart(2, '0') })),
        set: (v) => { shared.m = v; commit() } },
    ]
  }
  if (d === 'input_select' || d === 'select') {
    return [{ id: spec.entity, title: spec.label || friendlyName(s), loop: !!spec.loop, value: s.state,
      options: filter(a.options || []).map((o) => ({ value: o, label: d === 'select' ? stateLabel(o) : o })),
      set: (v) => svc(d, 'select_option', { option: v }) }]
  }
  const attr = spec.attribute
  if (d === 'climate' && (!attr || attr === 'hvac_mode')) {
    return [{ id: `${spec.entity}:hvac`, title: spec.label || 'Mode', loop: !!spec.loop, value: s.state,
      options: filter(a.hvac_modes || []).map((o) => ({ value: o, label: stateLabel(o) })),
      set: (v) => svc('climate', 'set_hvac_mode', { hvac_mode: v }) }]
  }
  const map = ATTRS[d] && ATTRS[d][attr || (d === 'media_player' ? 'source' : d === 'light' ? 'effect' : '')]
  const key = attr || (d === 'media_player' ? 'source' : d === 'light' ? 'effect' : null)
  if (!map || !key) return []
  const list = map[0] ? a[map[0]] || [] : ['forward', 'reverse']
  return [{ id: `${spec.entity}:${key}`, title: spec.label || COLUMN_TITLES[key] || pretty(key), loop: !!spec.loop, value: a[key],
    options: filter(list).map((o) => ({ value: o, label: attrLabel(key, o) })),
    set: (v) => svc(d, map[1], { [key]: v }) }]
}

function autoSpecs(hass, entity) {
  const s = hass.states[entity]
  if (!s) return [{ entity }]
  const d = domainOf(entity)
  if (d === 'climate') {
    const out = [{ entity }]
    if (s.attributes.fan_modes) out.push({ entity, attribute: 'fan_mode' })
    return out
  }
  return [{ entity }]
}

class Column {
  constructor(host, el, spec) {
    this.host = host; this.el = el; this.spec = spec
    this.position = new MotionValue(0)
    this.center = null
    this.drag = null
    this.pointerType = 'mouse'
    this.drums = [el.querySelector('.drum.muted .rot'), el.querySelector('.drum.ink .rot')]
    this.position.on((p) => this.onPosition(p))
    el.addEventListener('pointerdown', (e) => this.down(e))
    el.addEventListener('pointermove', (e) => this.move(e))
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, (e) => this.up(e))
    el.addEventListener('keydown', (e) => this.key(e))
    let timer
    el.addEventListener('wheel', (e) => {
      e.preventDefault()
      this.position.stop()
      this.pointerType = 'mouse'
      const raw = this.position.get() + (e.deltaY / ITEM_HEIGHT) * 0.4
      this.position.set(this.spec.loop ? raw : clamp(raw, -0.4, this.count - 1 + 0.4))
      clearTimeout(timer)
      timer = setTimeout(() => this.goTo(this.clampIndex(Math.round(this.position.get()))), 120)
    }, { passive: false })
  }

  get count() { return this.spec.options.length }
  optionAt(i) { return this.spec.options[mod(i, this.count)] }
  clampIndex(i) { return this.spec.loop ? i : clamp(i, 0, this.count - 1) }
  withOverscroll(raw) {
    if (this.spec.loop) return raw
    if (raw < 0) return -damp(-raw, MAX_OVERSCROLL)
    if (raw > this.count - 1) return this.count - 1 + damp(raw - (this.count - 1), MAX_OVERSCROLL)
    return raw
  }

  setSpec(spec) {
    const sameOptions = this.spec && this.spec.options.length === spec.options.length && this.spec.options.every((o, i) => o.value === spec.options[i].value && o.label === spec.options[i].label)
    this.spec = spec
    this.el.setAttribute('aria-label', spec.title)
    if (!sameOptions) { this.center = null; this.position.jump(Math.max(0, spec.options.findIndex((o) => o.value === spec.value))); this.onPosition(this.position.get()) }
    this.follow()
  }

  /** Follow the HA value unless the user is spinning or just committed. */
  follow() {
    if (!this.count) return
    if (this.drag || this.position.anim || (this.sentAt && Date.now() - this.sentAt < 2500)) return
    const idx = this.spec.options.findIndex((o) => o.value === this.spec.value)
    if (idx < 0) return
    const current = mod(Math.round(this.position.get()), this.count)
    if (current === idx) return
    let delta = idx - current
    if (this.spec.loop && Math.abs(delta) > this.count / 2) delta -= Math.sign(delta) * this.count
    this.position.jump(Math.round(this.position.get()) + delta)
  }

  onPosition(p) {
    const t = `translateZ(${-RADIUS}px) rotateX(${p * ITEM_ANGLE}deg)`
    for (const d of this.drums) d.style.transform = t
    const rounded = Math.round(p)
    if (rounded !== this.center) {
      if (this.center !== null && this.pointerType === 'touch' && navigator.vibrate) { try { navigator.vibrate(1) } catch (_) { /* noop */ } }
      this.center = rounded
      this.renderRows()
    }
    const opt = this.optionAt(rounded)
    if (opt) { this.el.setAttribute('aria-valuetext', opt.label); this.el.setAttribute('aria-valuenow', mod(rounded, this.count)) }
  }

  renderRows() {
    if (!this.count) { for (const d of this.drums) d.innerHTML = ''; return }
    const rows = []
    for (let i = this.center - WINDOW; i <= this.center + WINDOW; i++) {
      if (this.spec.loop || (i >= 0 && i < this.count)) rows.push(i)
    }
    const html = rows.map((i) => `<div class="row" style="transform:rotateX(${-i * ITEM_ANGLE}deg) translateZ(${RADIUS}px)">${escapeHtml(this.optionAt(i).label)}</div>`).join('')
    for (const d of this.drums) d.innerHTML = html
  }

  settle() {
    this.position.anim = null
    const opt = this.optionAt(Math.round(this.position.get()))
    if (!opt || opt.value === this.spec.value) return
    this.spec.value = opt.value
    this.sentAt = Date.now()
    try { this.spec.set(opt.value) } catch (e) { console.error('[kokohome] wheel set failed', e) }
  }

  goTo(target) {
    this.position.stop()
    if (reducedMotion()) { this.position.jump(target); this.settle(); return }
    this.position.spring(target, { ...SETTLE, velocity: 0 }).then(() => { if (!this.drag && Math.abs(this.position.get() - target) < 0.01) this.settle() })
  }

  down(e) {
    if (this.drag || this.host.disabled || (e.pointerType === 'mouse' && e.button !== 0)) return
    this.position.stop()
    this.pointerType = e.pointerType
    this.el.setPointerCapture(e.pointerId)
    this.drag = { id: e.pointerId, startY: e.clientY, start: this.position.get(), moved: false, samples: [{ t: e.timeStamp, v: this.position.get() }] }
  }

  move(e) {
    const d = this.drag
    if (!d || d.id !== e.pointerId) return
    const dy = e.clientY - d.startY
    if (!d.moved && Math.abs(dy) < TAP_SLOP) return
    d.moved = true
    const raw = d.start - dy / ITEM_HEIGHT
    this.position.set(this.withOverscroll(raw))
    d.samples.push({ t: e.timeStamp, v: raw })
    while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > VELOCITY_WINDOW_MS) d.samples.shift()
  }

  up(e) {
    const d = this.drag
    if (!d || d.id !== e.pointerId) return
    this.drag = null
    if (!d.moved && e.type !== 'pointerup') { this.goTo(this.clampIndex(Math.round(this.position.get()))); return }
    if (!d.moved) {
      // A tap turns to the row under the finger; asin undoes foreshortening.
      const rect = this.el.getBoundingClientRect()
      const ratio = clamp((e.clientY - (rect.top + rect.height / 2)) / RADIUS, -1, 1)
      const rows = Math.round((Math.asin(ratio) * 180) / Math.PI / ITEM_ANGLE)
      this.goTo(this.clampIndex(Math.round(this.position.get()) + rows))
      return
    }
    const first = d.samples[0], last = d.samples[d.samples.length - 1] || first
    const elapsed = (last.t - first.t) / 1000
    const paused = e.timeStamp - last.t > VELOCITY_WINDOW_MS
    const velocity = elapsed > 0 && !paused ? (last.v - first.v) / elapsed : 0
    const p = this.position.get()
    const out = !this.spec.loop && (p < 0 || p > this.count - 1)
    if (reducedMotion() || out || Math.abs(velocity) < 2) { this.goTo(this.clampIndex(Math.round(p))); return }
    const target = this.clampIndex(Math.round(p + velocity * COAST))
    this.position.spring(target, { velocity, stiffness: 140, damping: 24, restDelta: 0.005 }).then(() => { if (!this.drag && Math.abs(this.position.get() - target) < 0.01) this.settle() })
  }

  key(e) {
    const index = Math.round(this.position.get())
    const moves = { ArrowUp: 1, ArrowDown: -1, PageUp: 5, PageDown: -5 }
    let target
    if (e.key === 'Home') target = index - mod(index, this.count)
    else if (e.key === 'End') target = index - mod(index, this.count) + this.count - 1
    else if (e.key in moves) target = this.clampIndex(index + moves[e.key])
    else return
    e.preventDefault()
    this.position.stop()
    this.pointerType = 'keyboard'
    this.position.jump(target)
    this.settle()
  }
}

class WheelPicker extends KokoCard {
  static tag = 'kokonut-wheel-picker'
  static cardName = 'Kokonut Wheel Picker'
  static description = 'iOS-style drum picker for AC mode and fan, input selects, sources or an alarm time.'
  static defaults() { return { show_labels: true } }
  static getStubConfig(hass) {
    const e = Object.keys(hass.states).find((x) => x.startsWith('climate.')) || Object.keys(hass.states).find((x) => x.startsWith('input_select.'))
    return { entity: e || 'input_select.house_mode' }
  }
  validate(c) { if (!c.entity && !c.columns) throw new Error('kokonut-wheel-picker: set "entity" or "columns"') }
  watched() { return [...new Set([this.config.entity, ...(this.config.columns || []).map((c) => c.entity)].filter(Boolean))] }

  css() {
    return `
.k-card { padding: 14px 12px 12px; }
.k-head { padding: 0 4px; margin-bottom: 8px; }
.labels { display: flex; justify-content: center; gap: 4px; padding: 0 12px; margin-bottom: 2px; }
.labels span { font-size: 11px; color: var(--k-fg-3); text-transform: uppercase; letter-spacing: .05em; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.picker { position: relative; display: flex; justify-content: center; gap: 4px; user-select: none; -webkit-user-select: none; border-radius: 16px; border: 1px solid #e4e4e7; background: #fff; padding: 0 12px; }
:host([dark]) .picker { border-color: #27272a; background: #09090b; }
:host([plain]) .picker { border: 0; background: none; }
.picker[data-disabled] { opacity: .5; pointer-events: none; }
.band { pointer-events: none; position: absolute; left: 8px; right: 8px; top: 50%; height: ${ITEM_HEIGHT}px; transform: translateY(-50%); border-radius: 8px; background: #f4f4f5; }
:host([dark]) .band { background: #27272ab3; }
.hair { pointer-events: none; position: absolute; top: 50%; height: 1px; width: 4px; transform: translateY(-50%); background: #a1a1aa; }
:host([dark]) .hair { background: #71717a; }
.hair.l { left: 2px; } .hair.r { right: 2px; }
.col { position: relative; height: ${VIEW_HEIGHT}px; cursor: grab; touch-action: none; border-radius: 8px; outline: none; min-width: 48px; flex: 0 1 auto; }
.col:active { cursor: grabbing; }
.col:focus-visible { box-shadow: inset 0 0 0 2px #a1a1aa; }
.fade { position: absolute; inset: 0; -webkit-mask-image: linear-gradient(to bottom, transparent, #000 34%, #000 66%, transparent); mask-image: linear-gradient(to bottom, transparent, #000 34%, #000 66%, transparent); }
.drum { pointer-events: none; position: absolute; inset: 0; perspective: 1000px; }
.drum.ink { clip-path: inset(calc(50% - ${ITEM_HEIGHT / 2}px) 0 calc(50% - ${ITEM_HEIGHT / 2}px) 0); }
.rot { position: absolute; left: 0; right: 0; top: 50%; transform-style: preserve-3d; will-change: transform; }
.row { position: absolute; left: 0; right: 0; top: ${-ITEM_HEIGHT / 2}px; height: ${ITEM_HEIGHT}px; display: flex; align-items: center; justify-content: center; font-size: var(--wp-font, 20px); font-variant-numeric: tabular-nums; backface-visibility: hidden; -webkit-backface-visibility: hidden; white-space: nowrap; padding: 0 6px; }
.muted .row { color: #a1a1aa; } :host([dark]) .muted .row { color: #71717a; }
.ink .row { font-weight: 500; color: #18181b; } :host([dark]) .ink .row { color: #fafafa; }
.empty { font-size: 13px; color: var(--k-fg-2); padding: 24px; text-align: center; }
`
  }

  render() {
    return `<div class="k-card"><div class="k-head"><div class="k-title"></div><div class="k-sub"></div></div><div class="labels" aria-hidden="true"></div><div class="picker" role="group"><div class="band" aria-hidden="true"></div><span class="hair l" aria-hidden="true"></span><span class="hair r" aria-hidden="true"></span></div></div>`
  }

  build() {
    this.picker = this.$('.picker'); this.labelsEl = this.$('.labels')
    this.columns = []
    this._layoutKey = ''
    this.ro = new ResizeObserver(() => this.fit())
    this.ro.observe(this.picker)
  }

  specs() {
    const raw = this.config.columns || autoSpecs(this.hass, this.config.entity)
    return raw.flatMap((spec) => resolveColumn(this.hass, typeof spec === 'string' ? { entity: spec } : spec))
  }

  /** Size columns to their longest label and shrink the font if they don't fit. */
  fit() {
    if (!this.columns.length) return
    const avail = this.picker.clientWidth - 24 - (this.columns.length - 1) * 4
    const longest = this.columns.map((c) => Math.max(2, ...c.spec.options.map((o) => o.label.length)))
    let font = 20
    const widthFor = (n, f) => Math.max(48, Math.ceil(n * f * 0.58 + 16))
    while (font > 13 && longest.reduce((s, n) => s + widthFor(n, font), 0) > avail) font -= 1
    this.style.setProperty('--wp-font', `${font}px`)
    const labels = [...this.labelsEl.children]
    this.columns.forEach((c, i) => {
      const w = widthFor(longest[i], font)
      c.el.style.width = `${w}px`
      if (labels[i]) labels[i].style.width = `${w}px`
    })
  }

  update() {
    const specs = this.specs()
    const key = specs.map((s) => s.id).join('|')
    const first = this.config.entity ? this.hass.states[this.config.entity] : null
    this.$('.k-title').textContent = this.config.name || (first ? friendlyName(first) : (specs[0] && specs[0].title) || 'Picker')
    this.$('.k-sub').textContent = specs.map((s) => (s.options.find((o) => o.value === s.value) || {}).label || '—').join(' · ')
    this.$('.k-head').hidden = this.config.name === false
    const entities = this.watched()
    this.disabled = entities.some((id) => isUnavailable(this.hass.states[id]))
    this.picker.toggleAttribute('data-disabled', this.disabled)
    if (key !== this._layoutKey) {
      this._layoutKey = key
      for (const c of this.columns) c.el.remove()
      this.columns = []
      this.labelsEl.innerHTML = this.config.show_labels && specs.length > 1 ? specs.map((s) => `<span>${escapeHtml(s.title)}</span>`).join('') : ''
      if (!specs.length) { this.picker.insertAdjacentHTML('beforeend', '<div class="empty col">Nothing to pick</div>'); return }
      for (const spec of specs) {
        const el = document.createElement('div')
        el.className = 'col'
        el.setAttribute('role', 'spinbutton'); el.tabIndex = 0
        el.innerHTML = '<div class="fade"><div class="drum muted" aria-hidden="true"><div class="rot"></div></div><div class="drum ink" aria-hidden="true"><div class="rot"></div></div></div>'
        this.picker.append(el)
        const col = new Column(this, el, null)
        col.setSpec(spec)
        this.columns.push(col)
      }
      requestAnimationFrame(() => this.fit())
      return
    }
    specs.forEach((spec, i) => this.columns[i] && this.columns[i].setSpec(spec))
  }

  disconnected() { for (const c of this.columns) c.position.stop() }
  getCardSize() { return 5 }
  getGridOptions() { return { columns: 6, rows: 5, min_columns: 4 } }
}

register(WheelPicker)
