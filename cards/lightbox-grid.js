/**
 * Kokonut Lightbox Grid → Lovelace (camera wall).
 * Camera snapshots in a grid (the first one large). Tap one and that very
 * image grows out of its slot into a full-screen viewer — a transform and a
 * crop carry it there and back. Drag down to dismiss (the photo shrinks and
 * the page shows through), swipe sideways for the next camera, Esc to close.
 * Thumbnails refresh every `refresh` seconds; the open camera every second.
 *
 *   type: custom:kokonut-lightbox-grid
 *   entities: [camera.doggy_cam, camera.front_door, camera.backyard]
 *   refresh: 10
 *   images:                     # or static images
 *     - url: /local/photo.jpg
 *       caption: Holiday
 */
import { KokoCard, register, MotionValue, friendlyName, escapeHtml, fire, ease, reducedMotion, haptic } from './core.js'

const OPEN = { stiffness: 158, damping: 22.1 }, CLOSE = { stiffness: 224, damping: 27.5 }, SETTLE = { stiffness: 322, damping: 28.7 }
const MARGIN = 48, MARGIN_SMALL = 12, CAPTION_ROOM = 56, OPEN_RADIUS = 10
const DISMISS_DISTANCE = 110, DISMISS_SPEED = 0.55, SWIPE_SPEED = 0.45, AXIS_LOCK = 6

function fitRect(img) {
  const vw = window.innerWidth, vh = window.innerHeight
  const m = vw < 640 ? MARGIN_SMALL : MARGIN
  const s = Math.min((vw - m * 2) / img.width, (vh - m * 2 - CAPTION_ROOM) / img.height)
  const width = img.width * s, height = img.height * s
  return { left: (vw - width) / 2, top: (vh - CAPTION_ROOM - height) / 2, width, height }
}
function thumbFrame(open, thumb, img, radius) {
  const ir = img.width / img.height, tr = thumb.width / thumb.height
  const coverWidth = ir > tr ? thumb.height * ir : thumb.width
  const scale = coverWidth / open.width
  return { x: thumb.left + thumb.width / 2 - (open.left + open.width / 2), y: thumb.top + thumb.height / 2 - (open.top + open.height / 2), scale,
    iy: (open.height - thumb.height / scale) / 2, ix: (open.width - thumb.width / scale) / 2, r: radius / scale }
}
const visible = (r) => r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth

const VIEWER_CSS = `
:host { all: initial; }
:host([hidden]) { display: none !important; }
.dlg { position: fixed; inset: 0; z-index: 1000; font-family: var(--ha-font-family-body, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif); }
.bd { position: absolute; inset: 0; background: #09090b; }
.ph { position: absolute; cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; overflow: hidden; will-change: transform, clip-path; background: #18181b; }
.ph:active { cursor: grabbing; }
.ph img { pointer-events: none; width: 100%; height: 100%; object-fit: cover; display: block; }
.ui { pointer-events: none; position: absolute; inset: 0; }
.tr { pointer-events: auto; position: absolute; top: 12px; right: 12px; display: flex; align-items: center; gap: 12px; }
@media (min-width: 640px) { .tr { top: 16px; right: 16px; } }
.cnt { font-size: 14px; color: rgb(255 255 255/.6); font-variant-numeric: tabular-nums; }
.ib { display: flex; width: 40px; height: 40px; align-items: center; justify-content: center; border-radius: 999px; border: 0; background: rgb(255 255 255/.1); color: #fff; cursor: pointer; transition: background-color .15s, opacity .15s; }
.ib:hover { background: rgb(255 255 255/.2); }
.ib:focus-visible { outline: 2px solid rgb(255 255 255/.7); }
.ib[aria-disabled=true] { cursor: default; opacity: .3; }
.ib[aria-disabled=true]:hover { background: rgb(255 255 255/.1); }
.nav { pointer-events: auto; position: absolute; top: 50%; transform: translateY(-50%); display: none; }
@media (min-width: 640px) { .nav { display: flex; } }
.nav.l { left: 16px; } .nav.r { right: 16px; }
.cap { position: absolute; left: 16px; right: 16px; text-align: center; font-size: 14px; color: rgb(255 255 255/.8); margin: 0; }
.cap span { color: rgb(255 255 255/.45); margin-left: 6px; font-variant-numeric: tabular-nums; }
`

class LightboxGrid extends KokoCard {
  static tag = 'kokonut-lightbox-grid'
  static cardName = 'Kokonut Lightbox Grid'
  static description = 'Camera snapshot wall whose tiles grow into a swipeable full-screen viewer.'
  static defaults() { return { refresh: 10 } }
  static getStubConfig(hass) { return { entities: Object.keys(hass.states).filter((x) => x.startsWith('camera.')).slice(0, 4) } }
  validate(c) { if (!(Array.isArray(c.entities) && c.entities.length) && !(Array.isArray(c.images) && c.images.length)) throw new Error('kokonut-lightbox-grid: set "entities" (cameras) or "images"') }
  watched() { return (this.config.entities || []).map((e) => (typeof e === 'string' ? e : e.entity)) }

  css() {
    return `
.k-card { padding: 12px; }
ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
li.big { grid-column: span 2; grid-row: span 2; }
:host([count="1"]) li.big { grid-column: span 3; grid-row: span 1; }
:host([count="1"]) li.big button { aspect-ratio: 16 / 9; }
:host([count="2"]) ul { grid-template-columns: 1fr 1fr; } :host([count="2"]) li.big { grid-column: auto; grid-row: auto; }
button.th { position: relative; display: block; width: 100%; aspect-ratio: 1; overflow: hidden; border-radius: 12px; border: 0; padding: 0; cursor: pointer; background: #f4f4f5; outline-offset: 2px; }
:host([dark]) button.th { background: #27272a; }
button.th:focus-visible { outline: 2px solid #18181b; } :host([dark]) button.th:focus-visible { outline-color: #fff; }
button.th img { width: 100%; height: 100%; object-fit: cover; display: block; transition: filter .2s; }
button.th:hover img { filter: brightness(.95); }
.tag { position: absolute; left: 8px; bottom: 8px; max-width: calc(100% - 16px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-radius: 999px; padding: 2px 8px; font-size: 11px; font-weight: 500; color: #fff; background: rgb(0 0 0/.55); pointer-events: none; }
.off { position: absolute; inset: 0; display: grid; place-items: center; font-size: 12px; color: var(--k-fg-3); }
`
  }

  render() { return '<div class="k-card"><ul></ul></div>' }

  build() {
    this.items = []
    this.dims = {}
    this.active = null
    this.x = new MotionValue(0); this.y = new MotionValue(0); this.scale = new MotionValue(1)
    this.iy = new MotionValue(0); this.ix = new MotionValue(0); this.rad = new MotionValue(OPEN_RADIUS)
    this.alpha = new MotionValue(1); this.fade = new MotionValue(0)
    const paint = () => {
      if (!this.ph) return
      this.ph.style.transform = `translate(${this.x.get()}px, ${this.y.get()}px) scale(${this.scale.get()})`
      this.ph.style.clipPath = `inset(${this.iy.get()}px ${this.ix.get()}px ${this.iy.get()}px ${this.ix.get()}px round ${this.rad.get()}px)`
      this.ph.style.opacity = String(this.alpha.get())
      this.bdEl.style.opacity = String(this.fade.get() * 0.92)
      this.uiEl.style.opacity = String(this.fade.get())
    }
    for (const mv of [this.x, this.y, this.scale, this.iy, this.ix, this.rad, this.alpha, this.fade]) mv.on(paint)
    this.$('ul').addEventListener('click', (e) => { const b = e.target.closest('button.th'); if (b) this.open(Number(b.dataset.i)) })
  }

  sources() {
    if (this.config.images) return this.config.images.map((im, i) => ({ id: `img${i}`, url: im.url, caption: im.caption || '', live: false }))
    return this.config.entities.map((e) => {
      const spec = typeof e === 'string' ? { entity: e } : e
      const s = this.hass && this.hass.states[spec.entity]
      const pic = s && s.attributes.entity_picture
      const url = pic ? (this.hass.hassUrl ? this.hass.hassUrl(pic) : pic) : null
      return { id: spec.entity, entity: spec.entity, url, caption: spec.name || friendlyName(s, spec.entity), live: true, off: !s || s.state === 'unavailable' }
    })
  }

  bust(url) { if (!url || url.startsWith('data:')) return url; return `${url}${url.includes('?') ? '&' : '?'}t=${Math.floor(Date.now() / 1000)}` }

  renderGrid() {
    const items = this.sources()
    this.items = items
    this.setAttribute('count', String(Math.min(items.length, 3)))
    this.$('ul').innerHTML = items.map((it, i) => `<li class="${i === 0 ? 'big' : ''}"><button class="th" type="button" data-i="${i}" aria-label="Open ${escapeHtml(it.caption)}">
      ${it.url ? `<img alt="" draggable="false" src="${escapeHtml(it.live ? this.bust(it.url) : it.url)}">` : '<span class="off">No image</span>'}
      ${it.caption ? `<span class="tag">${escapeHtml(it.caption)}</span>` : ''}</button></li>`).join('')
    this.thumbs = this.$$('button.th')
    this.thumbs.forEach((b, i) => {
      const img = b.querySelector('img')
      if (img) img.addEventListener('load', () => { if (img.naturalWidth) this.dims[items[i].id] = { width: img.naturalWidth, height: img.naturalHeight } })
    })
    if (this.active !== null && this.thumbs[this.active]) this.thumbs[this.active].style.opacity = '0'
  }

  refreshThumbs() {
    if (!this.thumbs || document.hidden) return
    this.items.forEach((it, i) => {
      if (!it.live || !it.url) return
      const img = this.thumbs[i] && this.thumbs[i].querySelector('img')
      if (!img) return
      // Swap only once the new frame has loaded, so tiles never flash blank.
      const pre = new Image()
      pre.onload = () => { img.src = pre.src }
      pre.src = this.bust(it.url)
    })
  }

  imgOf(i) { const it = this.items[i]; return { ...(this.dims[it.id] || { width: 1600, height: 900 }) } }

  frameFor(i, open) {
    const t = this.thumbs && this.thumbs[i]
    if (!t) return null
    const box = t.getBoundingClientRect()
    if (!visible(box)) return null
    return thumbFrame(open, box, this.imgOf(i), parseFloat(getComputedStyle(t).borderTopLeftRadius) || 0)
  }

  /* ---- viewer (lives on document.body: cards are layout-contained) ---- */
  mountViewer() {
    const host = document.createElement('div')
    host.setAttribute('data-kokohome-lightbox', '')
    const root = host.attachShadow({ mode: 'open' })
    root.innerHTML = `<style>${VIEWER_CSS}</style><div class="dlg" role="dialog" aria-modal="true">
      <div class="bd" aria-hidden="true"></div>
      <div class="ph"><img alt="" draggable="false"></div>
      <div class="ui">
        <div class="tr"><span class="cnt"></span>
          <button class="ib live" type="button" aria-label="Open live view"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg></button>
          <button class="ib close" type="button" aria-label="Close"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" stroke-linecap="round" stroke-width="1.6"/></svg></button></div>
        <button class="ib nav l" type="button" aria-label="Previous camera"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style="transform:rotate(180deg)"><path d="m6 3.5 4.5 4.5L6 12.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/></svg></button>
        <button class="ib nav r" type="button" aria-label="Next camera"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/></svg></button>
        <p class="cap"></p>
      </div></div>`
    document.body.append(host)
    this.vHost = host
    this.dlg = root.querySelector('.dlg'); this.ph = root.querySelector('.ph'); this.phImg = this.ph.querySelector('img')
    this.bdEl = root.querySelector('.bd'); this.uiEl = root.querySelector('.ui')
    this.bdEl.addEventListener('click', () => this.close())
    root.querySelector('.close').addEventListener('click', () => this.close())
    root.querySelector('.live').addEventListener('click', () => { const it = this.items[this.active]; if (it && it.entity) { const ent = it.entity; this.close(); setTimeout(() => fire(this, 'hass-more-info', { entityId: ent }), 450) } })
    root.querySelector('.nav.l').addEventListener('click', () => this.step(-1))
    root.querySelector('.nav.r').addEventListener('click', () => this.step(1))
    this.dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.close() }
      else if (e.key === 'ArrowRight') this.step(1)
      else if (e.key === 'ArrowLeft') this.step(-1)
      else if (e.key === 'Tab') {
        const f = [...root.querySelectorAll('button')].filter((b) => getComputedStyle(b).display !== 'none')
        const a = root.activeElement
        if (e.shiftKey && a === f[0]) { e.preventDefault(); f[f.length - 1].focus() } else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
      }
    })
    const p = this.ph
    p.addEventListener('pointerdown', (e) => {
      if (!this.settled || e.button !== 0) return
      p.setPointerCapture(e.pointerId)
      this.vdrag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, axis: null, samples: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }] }
    })
    p.addEventListener('pointermove', (e) => {
      const d = this.vdrag
      if (!d || d.id !== e.pointerId) return
      const dx = e.clientX - d.sx, dy = e.clientY - d.sy
      if (!d.axis) { if (Math.hypot(dx, dy) < AXIS_LOCK) return; d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y' }
      d.samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp }); if (d.samples.length > 5) d.samples.shift()
      if (d.axis === 'y') {
        const pull = Math.min(Math.abs(dy) / window.innerHeight, 1)
        this.x.set(dx); this.y.set(dy); this.scale.set(1 - pull * 0.45); this.fade.set(1 - Math.min(Math.abs(dy) / 360, 1) * 0.85)
      } else {
        const blocked = (dx > 0 && this.active === 0) || (dx < 0 && this.active === this.items.length - 1)
        this.x.set(blocked ? dx * 0.25 : dx)
      }
    })
    const up = (e) => {
      const d = this.vdrag
      if (!d || d.id !== e.pointerId) return
      this.vdrag = null
      const f0 = d.samples[0], l = d.samples[d.samples.length - 1] || f0, dt = Math.max(1, l.t - f0.t)
      const v = { x: (l.x - f0.x) / dt, y: (l.y - f0.y) / dt }
      if (d.axis === 'y') {
        if (Math.abs(e.clientY - d.sy) > DISMISS_DISTANCE || Math.abs(v.y) > DISMISS_SPEED) this.close(v)
        else { this.x.spring(0, SETTLE); this.y.spring(0, SETTLE); this.scale.spring(1, SETTLE); this.fade.tween(1, { duration: 0.2, ease: ease.out }) }
      } else if (d.axis === 'x') {
        const dx = e.clientX - d.sx
        const far = Math.abs(dx) > this.rect.width * 0.22 || Math.abs(v.x) > SWIPE_SPEED
        if (far && dx < 0 && this.active < this.items.length - 1) this.step(1)
        else if (far && dx > 0 && this.active > 0) this.step(-1)
        else this.x.spring(0, SETTLE)
      }
    }
    p.addEventListener('pointerup', up); p.addEventListener('pointercancel', up); p.addEventListener('lostpointercapture', up)
    this._onResize = () => { if (this.active !== null) { this.rect = fitRect(this.imgOf(this.active)); this.placeViewer() } }
    window.addEventListener('resize', this._onResize)
  }

  placeViewer() {
    const r = this.rect, it = this.items[this.active]
    Object.assign(this.ph.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` })
    const cap = this.dlg.querySelector('.cap')
    cap.style.top = `${r.top + r.height + 18}px`
    cap.innerHTML = it.caption ? `${escapeHtml(it.caption)}${it.live ? `<span class="ts">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>` : ''}` : ''
    this.dlg.querySelector('.cnt').textContent = `${this.active + 1} / ${this.items.length}`
    this.dlg.querySelector('.nav.l').setAttribute('aria-disabled', String(this.active === 0))
    this.dlg.querySelector('.nav.r').setAttribute('aria-disabled', String(this.active === this.items.length - 1))
    this.dlg.querySelector('.live').hidden = !it.entity
    this.dlg.setAttribute('aria-label', it.caption || 'Image')
  }

  setViewerImage(i) {
    const it = this.items[i]
    const src = it.live ? this.bust(it.url) : it.url
    const thumbImg = this.thumbs[i] && this.thumbs[i].querySelector('img')
    this.phImg.src = thumbImg ? thumbImg.src : src
  }

  open(i) {
    if (!this.items[i] || !this.items[i].url) return
    haptic('light')
    if (!this.vHost) this.mountViewer()
    this.vHost.hidden = false
    this.vHost.style.display = ''
    this.active = i
    this.rect = fitRect(this.imgOf(i))
    this.closing = false; this.settled = false
    this.placeViewer(); this.setViewerImage(i)
    this.thumbs.forEach((t, j) => { t.style.opacity = j === i ? '0' : '1' })
    this._prevOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    this.alpha.jump(1)
    const from = this.frameFor(i, this.rect)
    const done = () => { this.settled = true }
    if (!from || reducedMotion()) {
      this.x.jump(0); this.y.jump(0); this.scale.jump(1); this.iy.jump(0); this.ix.jump(0); this.rad.jump(OPEN_RADIUS); this.fade.jump(0); this.alpha.jump(0)
      this.alpha.tween(1, { duration: 0.18 }); this.fade.tween(1, { duration: 0.18 }).then(done)
    } else {
      this.x.jump(from.x); this.y.jump(from.y); this.scale.jump(from.scale); this.iy.jump(from.iy); this.ix.jump(from.ix); this.rad.jump(from.r); this.fade.jump(0)
      for (const [mv, to] of [[this.x, 0], [this.y, 0], [this.scale, 1], [this.iy, 0], [this.ix, 0], [this.rad, OPEN_RADIUS]]) mv.spring(to, { ...OPEN, velocity: 0 })
      this.fade.tween(1, { duration: 0.3, ease: ease.out }).then(done)
    }
    this.dlg.querySelector('.close').focus({ preventScroll: true })
    clearInterval(this._live)
    this._live = setInterval(() => this.refreshOpen(), 1000)
  }

  refreshOpen() {
    const it = this.items[this.active]
    if (!it || !it.live || this.closing) return
    const pre = new Image()
    pre.onload = () => {
      if (this.items[this.active] !== it || this.closing) return
      this.phImg.src = pre.src
      if (pre.naturalWidth) this.dims[it.id] = { width: pre.naturalWidth, height: pre.naturalHeight }
      const ts = this.dlg.querySelector('.cap .ts')
      if (ts) ts.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }
    pre.src = it.url.startsWith('data:') ? it.url : this.bust(it.url).replace(/t=\d+$/, `t=${Date.now()}`)
  }

  close(v) {
    if (this.active === null || this.closing) return
    this.closing = true
    clearInterval(this._live)
    const i = this.active
    if (this.thumbs[i]) this.thumbs[i].scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'nearest' })
    const to = this.frameFor(i, this.rect)
    const finish = () => {
      this.active = null; this.closing = false
      if (this.vHost) { this.vHost.hidden = true; this.vHost.style.display = 'none' }
      document.documentElement.style.overflow = this._prevOverflow || ''
      if (this.thumbs[i]) { this.thumbs[i].style.opacity = '1'; this.thumbs[i].focus({ preventScroll: true }) }
    }
    if (!to || reducedMotion()) { this.alpha.tween(0, { duration: 0.16 }); this.fade.tween(0, { duration: 0.16 }).then(finish); return }
    const vx = ((v && v.x) || 0) * 1000, vy = ((v && v.y) || 0) * 1000
    this.x.spring(to.x, { ...CLOSE, velocity: vx }); this.y.spring(to.y, { ...CLOSE, velocity: vy })
    this.scale.spring(to.scale, { ...CLOSE, velocity: 0 }); this.iy.spring(to.iy, { ...CLOSE, velocity: 0 }); this.ix.spring(to.ix, { ...CLOSE, velocity: 0 }); this.rad.spring(to.r, { ...CLOSE, velocity: 0 })
    this.fade.tween(0, { duration: 0.28, ease: ease.out })
    clearTimeout(this._closeT)
    this._closeT = setTimeout(finish, 420)
  }

  step(dir) {
    if (this.active === null || this.closing) return
    const next = this.active + dir
    if (next < 0 || next >= this.items.length || !this.items[next].url) return
    this.thumbs[this.active].style.opacity = '1'
    this.active = next
    this.thumbs[next].style.opacity = '0'
    this.rect = fitRect(this.imgOf(next))
    this.placeViewer(); this.setViewerImage(next)
    this.y.jump(0); this.scale.jump(1); this.iy.jump(0); this.ix.jump(0); this.rad.jump(OPEN_RADIUS); this.fade.jump(1)
    if (reducedMotion()) { this.x.jump(0); this.alpha.jump(1); return }
    this.x.jump(dir * 72); this.alpha.jump(0)
    this.x.tween(0, { duration: 0.32, ease: ease.out }); this.alpha.tween(1, { duration: 0.22, ease: ease.out })
  }

  update() {
    const src = this.sources()
    const key = JSON.stringify(src.map((s) => [s.id, s.caption, s.off, s.url && s.url.split('?')[0]]))
    if (key !== this._key) { this._key = key; this.renderGrid() }
    // Camera URLs carry an access token HA rotates; always keep the latest.
    else this.items = src
  }

  connected() {
    clearInterval(this._iv)
    if (!this.config.images) this._iv = setInterval(() => this.refreshThumbs(), Math.max(2, this.config.refresh) * 1000)
  }
  disconnected() {
    clearInterval(this._iv); clearInterval(this._live); clearTimeout(this._closeT)
    if (this.active !== null) { document.documentElement.style.overflow = this._prevOverflow || ''; this.active = null }
    if (this.vHost) { this.vHost.remove(); this.vHost = null; window.removeEventListener('resize', this._onResize) }
  }
  getCardSize() { return 5 }
  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 } }
}

register(LightboxGrid)
