/**
 * Kokonut Split Flap Text → Lovelace.
 * Departure-board lettering: each tile flips forward through its drum only as
 * far as the new character, tiles start a beat apart, and every flap falls on
 * a hinge with the half below darkening under it.
 *
 *   type: custom:kokonut-split-flap
 *   clock: true                  # live clock (default when nothing else is set)
 *   clock_format: 24h | 12h
 *   entity: sensor.living_room_temperature   # its state, e.g. "21.6°C"
 *   entities:                    # or cycle through several, with short labels
 *     - entity: sensor.living_room_temperature
 *       label: IN
 *     - entity: sensor.outside_temperature
 *       label: OUT
 *   words: [WELCOME, HOME]       # or static words
 *   interval: 3800               # ms per item when cycling
 *   length: 8                    # tiles (defaults to the longest item)
 *   name: Living room            # small caption under the board
 *   size: auto | 36              # font size in px
 */
import { KokoCard, register, formatState, reducedMotion, escapeHtml } from './core.js'

const CHARSET = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.-/&!?°%+,'"
const FLIP = 56, STAGGER = 40
const clean = (v) => [...String(v).toUpperCase()].map((c) => (CHARSET.includes(c) ? c : c === 'Ä' ? 'A' : c === 'Ö' ? 'O' : c === 'Ü' ? 'U' : ' ')).join('')

class Tile {
  constructor(el, ch) {
    this.el = el; this.shown = ch; this.target = ch; this.timer = 0
    el.className = 'tile'
    el.setAttribute('aria-hidden', 'true')
    el.innerHTML = `<span class="half top s-top"><span>${escapeHtml(ch)}</span></span><span class="half bottom s-bot"><span>${escapeHtml(ch)}</span></span><span class="shade"></span><span class="hinge"></span>`
    this.sTop = el.querySelector('.s-top > span'); this.sBot = el.querySelector('.s-bot > span'); this.shade = el.querySelector('.shade')
  }
  set(target, delay) {
    this.target = target
    clearTimeout(this.timer)
    if (reducedMotion()) { this.show(target); return }
    this.timer = setTimeout(() => this.step(), delay)
  }
  show(ch) { this.shown = ch; this.sTop.textContent = ch; this.sBot.textContent = ch; this.clearFlaps() }
  clearFlaps() { for (const f of this.el.querySelectorAll('.flap')) f.remove() }
  step() {
    const from = this.shown
    if (from === this.target) { this.clearFlaps(); return }
    const i = CHARSET.indexOf(from)
    const to = CHARSET[(i < 0 ? 0 : i + 1) % CHARSET.length]
    // Still halves: the next letter's top, the old letter's bottom.
    this.sTop.textContent = to; this.sBot.textContent = from
    this.clearFlaps()
    const top = document.createElement('span')
    top.className = 'half top flap'; top.style.transformOrigin = '50% 100%'
    top.innerHTML = `<span>${escapeHtml(from)}</span>`
    const bot = document.createElement('span')
    bot.className = 'half bottom flap'; bot.style.transformOrigin = '50% 0%'; bot.style.transform = 'rotateX(90deg)'
    bot.innerHTML = `<span>${escapeHtml(to)}</span>`
    this.el.insertBefore(top, this.el.querySelector('.hinge'))
    this.el.insertBefore(bot, this.el.querySelector('.hinge'))
    const half = FLIP / 2
    top.animate([{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-90deg)' }], { duration: half, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)', fill: 'forwards' })
    bot.animate([{ transform: 'rotateX(90deg)' }, { transform: 'rotateX(0deg)' }], { duration: half, delay: half, easing: 'cubic-bezier(0.2, 0.6, 0.3, 1)', fill: 'both' })
    this.shade.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: FLIP, easing: 'linear' })
    this.timer = setTimeout(() => { this.shown = to; this.sBot.textContent = to; this.step() }, FLIP)
  }
  stop() { clearTimeout(this.timer) }
}

class SplitFlap extends KokoCard {
  static tag = 'kokonut-split-flap'
  static cardName = 'Kokonut Split Flap'
  static description = 'Departure-board split-flap display for a clock or sensor values.'
  static defaults() { return { interval: 3800, clock_format: '24h', size: 'auto' } }
  static getStubConfig() { return { clock: true } }
  watched() { return [this.config.entity, ...(this.config.entities || []).map((e) => (typeof e === 'string' ? e : e.entity))].filter(Boolean) }

  css() {
    return `
.k-card { padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.board { display: inline-flex; gap: .08em; font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums; font-size: var(--sf-size, 36px); }
.tile { position: relative; display: inline-block; height: 1.15em; width: .72em; border-radius: .12em; background: var(--sf-bg, #18181b); color: var(--sf-fg, #fafafa); box-shadow: inset 0 0 0 1px rgb(255 255 255/.06); perspective: 5em; }
.half { position: absolute; left: 0; right: 0; height: 50%; overflow: hidden; background: inherit; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.half.top { top: 0; border-radius: .12em .12em 0 0; }
.half.bottom { bottom: 0; border-radius: 0 0 .12em .12em; }
.half > span { position: absolute; left: 0; right: 0; height: 200%; display: flex; align-items: center; justify-content: center; }
.half.top > span { top: 0; } .half.bottom > span { bottom: 0; }
.shade { pointer-events: none; position: absolute; left: 0; right: 0; bottom: 0; height: 50%; border-radius: 0 0 .12em .12em; background: rgb(0 0 0/.5); opacity: 0; }
.hinge { pointer-events: none; position: absolute; left: 0; right: 0; top: 50%; height: .04em; transform: translateY(-50%); background: rgb(0 0 0/.7); }
.cap { font-size: 12px; color: var(--k-fg-2); letter-spacing: .02em; }
.cap:empty { display: none; }
`
  }

  render() { return '<div class="k-card"><span class="board"></span><span class="sr" aria-live="polite"></span><div class="cap"></div></div>' }

  build() {
    if (this.config.tile_color) this.style.setProperty('--sf-bg', this.config.tile_color)
    if (this.config.text_color) this.style.setProperty('--sf-fg', this.config.text_color)
    this.board = this.$('.board'); this.cap = this.$('.cap')
    this.tiles = []
    this.index = 0
    this.ro = new ResizeObserver(() => this.fit())
    this.ro.observe(this.$('.k-card'))
  }

  get isClock() { return this.config.clock || (!this.config.entity && !this.config.entities && !this.config.words && this.config.text == null) }

  items() {
    const c = this.config
    if (c.text != null) return [String(c.text)]
    if (c.words) return c.words.map(String)
    if (c.entities) {
      return c.entities.map((e) => {
        const spec = typeof e === 'string' ? { entity: e } : e
        const s = this.hass && this.hass.states[spec.entity]
        const v = s ? formatState(this.hass, s).replace(/\s+(°)/, '$1') : '—'
        return spec.label ? `${spec.label} ${v}` : v
      })
    }
    if (c.entity) {
      const s = this.hass && this.hass.states[c.entity]
      return [s ? formatState(this.hass, s).replace(/\s+(°)/, '$1') : '—']
    }
    return [this.clockText()]
  }

  clockText() {
    const d = new Date()
    if (this.config.clock_format === '12h') {
      const h = d.getHours() % 12 || 12
      return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`
    }
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  length() {
    if (this.config.length) return this.config.length
    if (this.isClock) return this.config.clock_format === '12h' ? 8 : 5
    return Math.max(1, ...this.items().map((w) => clean(w).length))
  }

  fit() {
    const n = this.tiles.length || this.length()
    let size = Number(this.config.size)
    if (!size) {
      const w = this.$('.k-card').clientWidth - 32
      size = Math.max(14, Math.min(64, Math.floor(w / (n * 0.8 + 0.1))))
    }
    this.style.setProperty('--sf-size', `${size}px`)
  }

  show(text) {
    const n = this.length()
    const padded = clean(text).slice(0, n).padEnd(n, ' ')
    if (this.tiles.length !== n) {
      for (const t of this.tiles) t.stop()
      this.board.innerHTML = ''
      this.tiles = [...padded].map((ch) => { const el = document.createElement('span'); this.board.append(el); return new Tile(el, ' ') })
      this.fit()
    }
    ;[...padded].forEach((ch, i) => { if (this.tiles[i].target !== ch) this.tiles[i].set(ch, i * STAGGER) })
    this.$('.sr').textContent = text
  }

  tick() {
    const items = this.items()
    if (this.index >= items.length) this.index = 0
    this.show(items[this.index] || '')
  }

  update() {
    this.cap.textContent = this.config.name || ''
    this.tick()
  }

  connected() {
    clearInterval(this._iv)
    const items = this.items()
    if (this.isClock) this._iv = setInterval(() => this.tick(), 1000)
    else if (items.length > 1) this._iv = setInterval(() => { this.index = (this.index + 1) % this.items().length; this.tick() }, this.config.interval)
    if (!this.hass) this.tick()
  }
  disconnected() { clearInterval(this._iv); for (const t of this.tiles || []) t.stop() }
  getCardSize() { return 2 }
  getGridOptions() { return { columns: 12, rows: 2, min_columns: 4 } }
}

register(SplitFlap)
