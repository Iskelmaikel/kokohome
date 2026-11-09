/**
 * Kokohome core — shared base for Kokonut-UI ports as Home Assistant Lovelace cards.
 * Dependency-free: plain custom elements + a tiny motion engine (tweens, springs,
 * motion values) standing in for the `motion` library the originals use.
 *
 * Kokonut UI is MIT licensed (https://github.com/kokonut-labs/kokonutui).
 */

export const VERSION = '1.0.0'

/* ------------------------------------------------------------------ easing */

function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
  const sx = (t) => ((ax * t + bx) * t + cx) * t
  const sy = (t) => ((ay * t + by) * t + cy) * t
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx
  return (x) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x
      if (Math.abs(e) < 1e-5) break
      const d = dx(t)
      if (Math.abs(d) < 1e-6) break
      t -= e / d
    }
    return sy(t)
  }
}

export const ease = {
  linear: (t) => t,
  out: bezier(0.23, 1, 0.32, 1),       // Kokonut EASE_OUT
  inOut: bezier(0.65, 0, 0.35, 1),     // Kokonut EASE_IN_OUT
  outQuad: bezier(0.25, 0.46, 0.45, 0.94),
  bezier,
}

export const reducedMotion = () =>
  !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
export const lerp = (a, b, t) => a + (b - a) * t
export const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/* ------------------------------------------------------------ motion value */

/**
 * A number that can be set directly or animated (tween or spring), notifying
 * subscribers every change and tracking its own velocity (units/second).
 */
export class MotionValue {
  constructor(v = 0) {
    this.v = v
    this.subs = new Set()
    this.anim = null
    this._hist = [] // [t, v] samples for velocity
  }
  get() { return this.v }
  on(fn) { this.subs.add(fn); return () => this.subs.delete(fn) }
  _emit() { for (const f of this.subs) f(this.v) }
  _sample() {
    const t = performance.now()
    this._hist.push([t, this.v])
    while (this._hist.length > 2 && t - this._hist[0][0] > 100) this._hist.shift()
  }
  set(v) { this.stop(); this._write(v) }
  _write(v) { this.v = v; this._sample(); this._emit() }
  jump(v) { this.stop(); this._hist = []; this.v = v; this._emit() }
  getVelocity() {
    if (this.anim && this.anim.velocity != null) return this.anim.velocity
    const h = this._hist
    if (h.length < 2) return 0
    const [t0, v0] = h[0], [t1, v1] = h[h.length - 1]
    const dt = (t1 - t0) / 1000
    if (dt <= 0 || performance.now() - t1 > 80) return 0
    return (v1 - v0) / dt
  }
  stop() { if (this.anim) { this.anim.cancel(); this.anim = null } }
  /** Tween to target. opts: duration (s), ease, delay (s). Resolves on finish. */
  tween(to, { duration = 0.3, ease: e = ease.out, delay = 0 } = {}) {
    this.stop()
    const from = this.v
    if (reducedMotion() || duration <= 0) { this._write(to); return Promise.resolve() }
    return this._run((elapsed) => {
      const t = clamp((elapsed - delay) / duration, 0, 1)
      this._write(from + (to - from) * e(t))
      return t >= 1
    })
  }
  /** Spring to target. opts: stiffness, damping, mass, velocity (units/s). */
  spring(to, { stiffness = 400, damping = 40, mass = 1, velocity, restDelta = 0.01, restSpeed = 0.05 } = {}) {
    const v0 = velocity != null ? velocity : this.getVelocity()
    this.stop()
    if (reducedMotion()) { this._write(to); return Promise.resolve() }
    let x = this.v, v = v0
    const state = { velocity: v }
    return this._run((elapsed, dt) => {
      // Semi-implicit Euler in small sub-steps for stability.
      let remaining = Math.min(dt, 0.064)
      while (remaining > 0) {
        const h = Math.min(remaining, 1 / 240)
        const f = -stiffness * (x - to) - damping * v
        v += (f / mass) * h
        x += v * h
        remaining -= h
      }
      state.velocity = v
      const done = Math.abs(v) < restSpeed * Math.max(1, Math.abs(to)) && Math.abs(x - to) < restDelta
      this._write(done ? to : x)
      return done
    }, state)
  }
  _run(stepFn, extra = {}) {
    return new Promise((resolve) => {
      let raf = 0, start = 0, last = 0, cancelled = false
      const anim = {
        ...extra,
        get velocity() { return extra.velocity },
        cancel: () => { cancelled = true; cancelAnimationFrame(raf); resolve() },
      }
      const frame = (now) => {
        if (cancelled) return
        if (!start) { start = now; last = now }
        const dt = (now - last) / 1000
        last = now
        let finished = false
        try { finished = stepFn((now - start) / 1000, dt) } catch (e) { finished = true; console.error(e) }
        if (finished) { if (this.anim === anim) this.anim = null; resolve() }
        else raf = requestAnimationFrame(frame)
      }
      this.anim = anim
      raf = requestAnimationFrame(frame)
    })
  }
}

/** Derived value: recompute fn(...values) whenever any source changes. */
export function derive(sources, fn, onChange) {
  const run = () => onChange(fn(...sources.map((s) => s.get())))
  const offs = sources.map((s) => s.on(run))
  run()
  return () => offs.forEach((o) => o())
}

/** Swap content with Kokonut's "roll" transition (fade + y + blur). */
export function rollSwap(container, html, { dy = 10, blur = 2, duration = 200 } = {}) {
  const old = container.firstElementChild
  const next = document.createElement('span')
  next.className = 'roll'
  next.innerHTML = html
  if (reducedMotion() || !old) {
    container.replaceChildren(next)
    return
  }
  // Exit: up and out; enter: from below. popLayout-style: old is absolutely positioned.
  for (const el of [...container.children]) {
    if (el === old) continue
    el.remove()
  }
  old.style.position = 'absolute'
  old.animate(
    [{ opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' },
     { opacity: 0, transform: `translateY(${-dy}px)`, filter: `blur(${blur}px)` }],
    { duration, easing: 'cubic-bezier(0.23,1,0.32,1)', fill: 'forwards' },
  ).onfinish = () => old.remove()
  container.appendChild(next)
  next.animate(
    [{ opacity: 0, transform: `translateY(${dy}px)`, filter: `blur(${blur}px)` },
     { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }],
    { duration, easing: 'cubic-bezier(0.23,1,0.32,1)' },
  )
}

/* ------------------------------------------------------------------- icons */

// A few Lucide icons (ISC) as path data, 24x24, stroke-based.
const LUCIDE = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  'skip-forward': '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>',
  'skip-back': '<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" x2="5" y1="19" y2="5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  'trending-up': '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  'trending-down': '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
  'volume-2': '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
  sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
}

export function lucide(name, { size = 16, stroke = 2, cls = '' } = {}) {
  const body = LUCIDE[name] || ''
  return `<svg class="lucide ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
}

/** An HA icon (mdi:…) via the frontend's own <ha-icon>, or a Lucide fallback. */
export function icon(name, size = 18) {
  if (!name) return ''
  if (name.startsWith('lucide:')) return lucide(name.slice(7), { size })
  return `<ha-icon icon="${escapeAttr(name)}" style="--mdc-icon-size:${size}px;width:${size}px;height:${size}px;display:inline-flex"></ha-icon>`
}

const DOMAIN_ICONS = {
  light: 'mdi:lightbulb', switch: 'mdi:toggle-switch', fan: 'mdi:fan', climate: 'mdi:air-conditioner',
  media_player: 'mdi:play-circle', lock: 'mdi:lock', cover: 'mdi:window-shutter', script: 'mdi:script-text',
  scene: 'mdi:palette', button: 'mdi:gesture-tap-button', input_boolean: 'mdi:toggle-switch',
  sensor: 'mdi:eye', binary_sensor: 'mdi:checkbox-blank-circle-outline', automation: 'mdi:robot',
  alarm_control_panel: 'mdi:shield-home', vacuum: 'mdi:robot-vacuum', camera: 'mdi:cctv',
  input_select: 'mdi:format-list-bulleted', select: 'mdi:format-list-bulleted', number: 'mdi:ray-vertex',
  input_number: 'mdi:ray-vertex', person: 'mdi:account', siren: 'mdi:bullhorn', valve: 'mdi:pipe-valve',
}
export const domainOf = (id) => (id || '').split('.')[0]
export function entityIcon(stateObj, fallback) {
  if (!stateObj) return fallback || 'mdi:help-circle-outline'
  return stateObj.attributes.icon || fallback || DOMAIN_ICONS[domainOf(stateObj.entity_id)] || 'mdi:eye'
}

/* ------------------------------------------------------------------ escaping */

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export const escapeAttr = escapeHtml

/* -------------------------------------------------------------- HA helpers */

export function friendlyName(stateObj, fallback) {
  if (!stateObj) return fallback || ''
  return stateObj.attributes.friendly_name || stateObj.entity_id
}

export function formatState(hass, stateObj) {
  if (!stateObj) return '—'
  if (hass && typeof hass.formatEntityState === 'function') {
    try { return hass.formatEntityState(stateObj) } catch (_) { /* fall through */ }
  }
  const unit = stateObj.attributes.unit_of_measurement
  return unit ? `${stateObj.state} ${unit}` : stateObj.state
}

export function formatNumber(hass, value, opts = {}) {
  const lang = (hass && hass.locale && hass.locale.language) || (hass && hass.language) || undefined
  try { return new Intl.NumberFormat(lang, opts).format(value) } catch (_) { return String(value) }
}

export const isUnavailable = (s) => !s || s.state === 'unavailable' || s.state === 'unknown'

export const ON_STATES = new Set(['on', 'open', 'opening', 'unlocked', 'playing', 'home', 'active', 'heat', 'cool', 'auto', 'dry', 'fan_only', 'heat_cool', 'cleaning', 'armed_away', 'armed_home', 'armed_night', 'triggered'])
export const isActive = (s) => !!s && ON_STATES.has(s.state)

export function haptic(kind = 'light') {
  // The HA frontend (and the companion apps) listen for a window "haptic" event.
  window.dispatchEvent(new CustomEvent('haptic', { detail: kind }))
  if (navigator.vibrate) { try { navigator.vibrate(kind === 'heavy' ? 25 : kind === 'success' ? [10, 40, 15] : 10) } catch (_) { /* noop */ } }
}

export function fire(node, type, detail, opts = {}) {
  node.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, cancelable: false, detail, ...opts }))
}

/** Toggle with HA's own semantics for the common domains. */
export function toggleEntity(hass, entityId) {
  const d = domainOf(entityId)
  const s = hass.states[entityId]
  if (d === 'lock') return hass.callService('lock', s && s.state === 'locked' ? 'unlock' : 'lock', { entity_id: entityId })
  if (d === 'cover') return hass.callService('cover', 'toggle', { entity_id: entityId })
  if (d === 'scene') return hass.callService('scene', 'turn_on', { entity_id: entityId })
  if (d === 'script') return hass.callService('script', 'turn_on', { entity_id: entityId })
  if (d === 'button' || d === 'input_button') return hass.callService(d, 'press', { entity_id: entityId })
  if (d === 'automation') return hass.callService('automation', 'toggle', { entity_id: entityId })
  if (d === 'media_player') return hass.callService('media_player', 'media_play_pause', { entity_id: entityId })
  if (d === 'valve') return hass.callService('valve', 'toggle', { entity_id: entityId })
  return hass.callService('homeassistant', 'toggle', { entity_id: entityId })
}

/**
 * Run a Lovelace-style action config: more-info, toggle, navigate, url,
 * perform-action / call-service (with data + target), fire-dom-event, none.
 */
export async function runAction(node, hass, action, fallbackEntity) {
  if (!action || action.action === 'none') return
  const entity = action.entity || fallbackEntity
  switch (action.action) {
    case 'more-info':
      if (entity) fire(node, 'hass-more-info', { entityId: entity })
      return
    case 'toggle':
      if (entity) return toggleEntity(hass, entity)
      return
    case 'navigate':
      if (action.navigation_path) {
        history.pushState(null, '', action.navigation_path)
        fire(window, 'location-changed', { replace: false })
      }
      return
    case 'url':
      if (action.url_path) window.open(action.url_path, action.new_tab === false ? '_self' : '_blank', 'noopener')
      return
    case 'fire-dom-event':
      fire(node, 'll-custom', action)
      return
    case 'perform-action':
    case 'call-service': {
      const svc = action.perform_action || action.service
      if (!svc) return
      const [domain, service] = svc.split('.')
      const data = { ...(action.data || action.service_data || {}) }
      const target = action.target || (entity && !data.entity_id ? { entity_id: entity } : undefined)
      return hass.callService(domain, service, data, target)
    }
    default:
      return
  }
}

/**
 * Map an entity onto a number line, for dials and sliders.
 * Returns { min, max, step, value, unit, format(v), set(v), readOnly } or null.
 * Config can override min / max / step / unit.
 */
export function numericAdapter(hass, stateObj, config = {}) {
  if (!stateObj) return null
  const a = stateObj.attributes, id = stateObj.entity_id, d = domainOf(id)
  const svc = (domain, service, data) => hass.callService(domain, service, { entity_id: id, ...data })
  const decimals = (step) => (step >= 1 ? 0 : step >= 0.1 ? 1 : 2)
  let r
  switch (d) {
    case 'climate': {
      const unit = (hass.config && hass.config.unit_system && hass.config.unit_system.temperature) || '°C'
      const step = a.target_temp_step || (unit === '°F' ? 1 : 0.5)
      r = { min: a.min_temp ?? 16, max: a.max_temp ?? 30, step, value: Number(a.temperature ?? a.target_temp_low ?? a.current_temperature ?? 21), unit: '°',
        set: (v) => svc('climate', 'set_temperature', { temperature: v }) }
      break
    }
    case 'light':
      r = { min: 0, max: 100, step: 1, unit: '%', value: stateObj.state === 'on' ? Math.round(((a.brightness ?? 255) / 255) * 100) : 0,
        set: (v) => (v <= 0 ? svc('light', 'turn_off', {}) : svc('light', 'turn_on', { brightness_pct: Math.round(v) })) }
      break
    case 'media_player':
      r = { min: 0, max: 100, step: 1, unit: '%', value: Math.round((a.volume_level ?? 0) * 100),
        set: (v) => svc('media_player', 'volume_set', { volume_level: Math.round(v) / 100 }) }
      break
    case 'cover':
      r = { min: 0, max: 100, step: 1, unit: '%', value: Number(a.current_position ?? (stateObj.state === 'open' ? 100 : 0)),
        set: (v) => svc('cover', 'set_cover_position', { position: Math.round(v) }) }
      break
    case 'valve':
      r = { min: 0, max: 100, step: 1, unit: '%', value: Number(a.current_position ?? 0),
        set: (v) => svc('valve', 'set_valve_position', { position: Math.round(v) }) }
      break
    case 'fan':
      r = { min: 0, max: 100, step: a.percentage_step || 1, unit: '%', value: Number(a.percentage ?? (stateObj.state === 'on' ? 100 : 0)),
        set: (v) => svc('fan', 'set_percentage', { percentage: Math.round(v) }) }
      break
    case 'input_number':
    case 'number':
      r = { min: Number(a.min ?? 0), max: Number(a.max ?? 100), step: Number(a.step ?? 1), unit: a.unit_of_measurement || '', value: Number(stateObj.state),
        set: (v) => svc(d, 'set_value', { value: v }) }
      break
    default: {
      const v = Number(stateObj.state)
      if (Number.isNaN(v)) return null
      r = { min: 0, max: 100, step: 1, unit: a.unit_of_measurement || '', value: v, readOnly: true, set: () => {} }
    }
  }
  if (config.min != null) r.min = Number(config.min)
  if (config.max != null) r.max = Number(config.max)
  if (config.step != null) r.step = Number(config.step)
  if (config.unit != null) r.unit = config.unit
  if (Number.isNaN(r.value)) r.value = r.min
  r.readOnly = !!r.readOnly
  const dec = config.decimals ?? decimals(r.step)
  r.format = (v) => `${Number(v).toFixed(dec)}${r.unit === '°' || r.unit === '%' ? r.unit : r.unit ? ` ${r.unit}` : ''}`
  return r
}

/** Debounce: call fn once, `ms` after the last call. */
export function debounce(fn, ms) {
  let t
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms) }
  d.cancel = () => clearTimeout(t)
  d.flush = (...args) => { clearTimeout(t); fn(...args) }
  return d
}

/** Fetch state history (minimal) for entities between start and end. */
export async function fetchHistory(hass, entityIds, start, end = new Date()) {
  if (!hass || !hass.callWS) return {}
  try {
    const res = await hass.callWS({
      type: 'history/history_during_period',
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      entity_ids: [].concat(entityIds),
      minimal_response: true,
      no_attributes: true,
      significant_changes_only: false,
    })
    // Normalise to [{ s, t }] with t in ms.
    const out = {}
    for (const [id, rows] of Object.entries(res || {})) {
      out[id] = rows.map((r) => ({ s: r.s, t: (r.lu || r.lc || 0) * 1000 }))
    }
    return out
  } catch (e) {
    console.warn('[kokohome] history fetch failed', e)
    return {}
  }
}

/** Long-term statistics (hour/day/week/month) for one or more statistic ids. */
export async function fetchStatistics(hass, ids, start, end = new Date(), period = 'day', types = ['mean', 'sum', 'state', 'change']) {
  if (!hass || !hass.callWS) return {}
  try {
    const res = await hass.callWS({
      type: 'recorder/statistics_during_period',
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      statistic_ids: [].concat(ids),
      period,
      types,
    })
    const out = {}
    for (const [id, rows] of Object.entries(res || {})) {
      out[id] = rows.map((r) => ({ ...r, t: typeof r.start === 'number' ? r.start : Date.parse(r.start) }))
    }
    return out
  } catch (e) {
    console.warn('[kokohome] statistics fetch failed', e)
    return {}
  }
}

/** Create a nested Lovelace card (for container cards like tabs, flip, rail). */
let helpersPromise
export async function createCard(config, hass) {
  if (!helpersPromise && window.loadCardHelpers) helpersPromise = window.loadCardHelpers()
  let el
  if (helpersPromise) {
    const helpers = await helpersPromise
    el = helpers.createCardElement(config)
  } else {
    const tag = config.type && config.type.startsWith('custom:') ? config.type.slice(7) : `hui-${config.type}-card`
    el = document.createElement(tag)
    if (el.setConfig) el.setConfig(config)
  }
  if (hass) el.hass = hass
  return el
}

/* --------------------------------------------------------------- base card */

// Theme tokens shared by all cards. Kokonut's zinc palette, switched by the
// HA theme's dark mode (host[dark]), sitting on the user's card background.
export const BASE_CSS = `
:host {
  display: block;
  container: koko / inline-size;
  --k-bg: var(--ha-card-background, var(--card-background-color, #fff));
  --k-fg: #18181b; --k-fg-2: #52525b; --k-fg-3: #a1a1aa;
  --k-line: #e4e4e7; --k-line-2: #f4f4f5; --k-sunken: #f4f4f5; --k-raised: #ffffff;
  --k-ink: #18181b; --k-on-ink: #ffffff;
  --k-accent: var(--primary-color, #3b82f6);
  --k-green: #059669; --k-red: #dc2626; --k-amber: #d97706; --k-blue: #2563eb; --k-orange: #ea580c;
  --k-shadow: 0 1px 2px rgb(0 0 0 / .06), 0 0 0 1px rgb(0 0 0 / .04);
  --k-radius: var(--ha-card-border-radius, 12px);
  font-family: var(--ha-font-family-body, var(--primary-font-family, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif));
  color: var(--k-fg);
  -webkit-tap-highlight-color: transparent;
}
:host([dark]) {
  --k-fg: #f4f4f5; --k-fg-2: #a1a1aa; --k-fg-3: #71717a;
  --k-line: #27272a; --k-line-2: #1f1f23; --k-sunken: #18181b; --k-raised: #27272a;
  --k-ink: #f4f4f5; --k-on-ink: #18181b;
  --k-green: #10b981; --k-red: #ef4444; --k-amber: #f59e0b; --k-blue: #3b82f6; --k-orange: #f97316;
  --k-shadow: 0 1px 2px rgb(0 0 0 / .5), 0 0 0 1px rgb(255 255 255 / .08);
}
* { box-sizing: border-box; }
.k-card {
  position: relative; background: var(--k-bg); border-radius: var(--k-radius);
  border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color, var(--k-line)));
  box-shadow: var(--ha-card-box-shadow, none); padding: 16px; overflow: hidden;
}
:host([plain]) .k-card { background: none; border: 0; box-shadow: none; padding: 0; }
.k-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; min-width: 0; }
.k-title { font-size: 14px; font-weight: 600; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 3em; flex-shrink: 1; }
.k-sub { font-size: 12px; color: var(--k-fg-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex-shrink: 4; }
/* Narrow cards (two-up on a phone): stack the header. */
@container koko (max-width: 240px) {
  .k-head { flex-direction: column; align-items: flex-start; gap: 0; }
  .k-head > * { max-width: 100%; }
}
.k-muted { color: var(--k-fg-2); }
.k-unavail { opacity: .5; pointer-events: none; }
.roll { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
.sr { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); border: 0; }
button { font: inherit; color: inherit; }
.lucide { display: block; flex: none; }
`

/**
 * Base class. Subclasses implement:
 *   static tag, static cardName, static description
 *   static defaults() -> config defaults
 *   validate(config)  -> throw on bad config
 *   css()             -> component CSS string
 *   render()          -> initial HTML (built once; keep animated nodes alive)
 *   build()           -> wire up nodes/listeners after first render
 *   update(oldHass)   -> refresh from this.hass (called when watched entities change)
 *   watched()         -> entity ids whose changes trigger update()
 *   connected() / disconnected() for timers/rafs
 */
export class KokoCard extends HTMLElement {
  static defaults() { return {} }
  static getStubConfig() { return {} }

  setConfig(config) {
    if (!config) throw new Error('Invalid configuration')
    this.validate(config)
    this.config = { ...this.constructor.defaults(), ...config }
    this.toggleAttribute('plain', this.config.card === false)
    if (this._built) { this._teardown(); this._built = false }
    if (this.isConnected) this._build()
  }

  validate() {}
  watched() { return this.config && this.config.entity ? [this.config.entity] : [] }

  set hass(hass) {
    const old = this._hass
    this._hass = hass
    const dark = hass && hass.themes ? !!hass.themes.darkMode : false
    if (this.config && this.config.theme) this.toggleAttribute('dark', this.config.theme === 'dark')
    else this.toggleAttribute('dark', dark)
    if (!this._built) { if (this.config && this.isConnected) this._build(); return }
    if (!old || this.watched().some((id) => old.states[id] !== hass.states[id]) || this.alwaysUpdate) {
      this._safe(() => this.update(old))
    }
    this.hassChanged && this._safe(() => this.hassChanged(old))
  }
  get hass() { return this._hass }

  connectedCallback() {
    if (this.config && !this._built) this._build()
    else if (this._built) this._safe(() => this.connected && this.connected())
  }
  disconnectedCallback() { this._safe(() => this.disconnected && this.disconnected()) }

  _safe(fn) { try { return fn() } catch (e) { console.error(`[kokohome] ${this.localName}:`, e) } }

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: 'open' })
    const css = BASE_CSS + (this.css ? this.css() : '')
    try {
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(css)
      root.adoptedStyleSheets = [sheet]
      root.innerHTML = ''
    } catch (_) {
      root.innerHTML = `<style>${css}</style>`
    }
    const wrap = document.createElement('div')
    wrap.innerHTML = this.render()
    root.append(...wrap.childNodes)
    this._built = true
    this._safe(() => this.build && this.build())
    if (this._hass) this._safe(() => this.update(undefined))
    this._safe(() => this.connected && this.connected())
  }
  _teardown() { this._safe(() => this.disconnected && this.disconnected()) }

  $(sel) { return this.shadowRoot.querySelector(sel) }
  $$(sel) { return [...this.shadowRoot.querySelectorAll(sel)] }

  get stateObj() { return this._hass && this.config.entity ? this._hass.states[this.config.entity] : undefined }
  call(domain, service, data, target) { return this._hass && this._hass.callService(domain, service, data, target) }
  action(which = 'tap_action', fallback) {
    const a = this.config[which] || fallback
    return runAction(this, this._hass, a, this.config.entity)
  }
  moreInfo(entityId = this.config.entity) { if (entityId) fire(this, 'hass-more-info', { entityId }) }

  getCardSize() { return 2 }
}

export function register(cls) {
  if (!customElements.get(cls.tag)) customElements.define(cls.tag, cls)
  window.customCards = window.customCards || []
  if (!window.customCards.some((c) => c.type === cls.tag)) {
    window.customCards.push({
      type: cls.tag,
      name: cls.cardName,
      description: cls.description,
      preview: true,
      documentationURL: 'https://github.com/Iskelmaikel/kokohome',
    })
  }
}
