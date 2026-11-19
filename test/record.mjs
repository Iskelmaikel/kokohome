// Records short animated GIFs of cards for the README:
//   node test/record.mjs [id ...]
// Each clip replays the card's gesture test from interactions.mjs (or just lets
// the card animate), with a dot showing where the pointer is.
import { createRequire } from 'node:module'
import { readFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { INTERACTIONS } from './interactions.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const OUT = join(ROOT, 'docs', 'media')

// name: [case id, width, ms of idle animation after the gesture, extra px below the card for content that grows]
const CLIPS = {
  'hold-button': ['hold-red', 380, 900],
  'slide-to-confirm': ['slide-lock', 380, 900],
  'switch-button': ['switch-night', 380, 700],
  'bell-button': ['bell-default', 380, 1200],
  'particle-button': ['particle-scene', 380, 900],
  'detent-dial': ['dial-ac', 380, 900],
  'wheel-picker': ['wheel-ac', 380, 800],
  'liquid-slider': ['liquid-volume', 380, 1200],
  'split-flap': ['flap-temps', 420, 4600],
  'spending-ring': ['ring-energy', 380, 900],
  'metric-card': ['metric-energy', 600, 900],
  'now-playing': ['now-playing', 460, 900],
  'swipe-tabs': ['tabs', 420, 900, 120],
  'flick-card': ['flick', 380, 900],
  'status-island': ['island', 460, 1500],
  'tool-dock': ['dock', 460, 900],
  'uptime-card': ['uptime', 460, 900, 250],
  'notification-stack': ['notifications', 420, 900, 110],
}

const only = process.argv.slice(2)
await mkdir(OUT, { recursive: true })
const browser = await chromium.launch()

for (const [name, [id, width, tail, grow = 0]] of Object.entries(CLIPS)) {
  if (only.length && !only.includes(name)) continue
  const page = await browser.newPage({ viewport: { width: width + 32, height: 900 }, deviceScaleFactor: 2 })
  await page.route('http://koko.test/**', async (r) => {
    const f = decodeURIComponent(new URL(r.request().url()).pathname)
    try { await r.fulfill({ body: await readFile(join(ROOT, f)), headers: { 'content-type': f.endsWith('.html') ? 'text/html' : 'text/javascript' } }) } catch { await r.fulfill({ status: 404 }) }
  })
  await page.goto(`http://koko.test/test/harness.html?only=${id}`)
  await page.waitForTimeout(1500)
  // Hide the case label, and draw a dot where the pointer is.
  await page.addStyleTag({ content: '.case > h4 { display: none } #__dot { position: fixed; z-index: 99999; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; background: rgb(24 24 27 / .28); border: 2px solid rgb(255 255 255 / .9); box-shadow: 0 1px 4px rgb(0 0 0 / .25); pointer-events: none; opacity: 0; transition: opacity .15s, transform .1s } #__dot.down { transform: scale(.8); background: rgb(24 24 27 / .45) }' })
  await page.evaluate(() => {
    const d = document.createElement('div'); d.id = '__dot'; document.body.append(d)
    const at = (e) => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; d.style.opacity = 1 }
    addEventListener('pointermove', at, true)
    addEventListener('pointerdown', (e) => { at(e); d.classList.add('down') }, true)
    addEventListener('pointerup', () => d.classList.remove('down'), true)
  })
  const card = await page.$(`#case-${id} > :not(h4)`)
  await card.scrollIntoViewIfNeeded()
  const b0 = await card.boundingBox()
  const clip = { x: Math.max(0, b0.x - 10), y: Math.max(0, b0.y - 10), width: b0.width + 20, height: b0.height + 20 + grow }

  const dir = join(OUT, `.frames-${name}`)
  await rm(dir, { recursive: true, force: true }); await mkdir(dir)
  let n = 0, rec = true
  const t0 = Date.now()
  const loop = (async () => {
    while (rec) {
      const buf = await page.screenshot({ clip, animations: 'allow' })
      await writeFile(join(dir, `f${String(n++).padStart(4, '0')}.png`), buf)
    }
  })()
  await page.waitForTimeout(500)
  const fn = INTERACTIONS[id]
  if (fn) { try { await fn(page, `#case-${id}`) } catch (e) { console.log(name, 'gesture:', e.message) } }
  await page.waitForTimeout(tail)
  rec = false; await loop
  const secs = (Date.now() - t0) / 1000
  const fps = Math.max(4, Math.round(n / secs))
  const gif = join(OUT, `${name}.gif`)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(dir, 'f%04d.png'),
    '-vf', `fps=${Math.min(fps, 20)},scale=${Math.round(clip.width)}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff:max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
    '-loop', '0', gif])
  await rm(dir, { recursive: true, force: true })
  const kb = Math.round((await readFile(gif)).length / 1024)
  console.log(`${name}: ${n} frames, ${secs.toFixed(1)}s, ~${fps}fps, ${kb} KB`)
  await page.close()
}
await browser.close()
