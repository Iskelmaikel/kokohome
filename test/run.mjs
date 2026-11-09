// Render kokohome cards in Chromium against the mock hass and screenshot them.
// Usage: node test/run.mjs [--only id1,id2] [--out dir] [--col 340px] [--interact]
import { createRequire } from 'node:module'
import { readFile, mkdir } from 'node:fs/promises'
import { join, extname, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const only = opt('--only', '')
const out = resolve(opt('--out', join(ROOT, 'test', 'shots')))
const col = opt('--col', '340px')
const width = Number(opt('--width', '1100'))
const interact = args.includes('--interact')
await mkdir(out, { recursive: true })

const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' }

const browser = await chromium.launch()
let failures = 0
for (const dark of [false, true]) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
  const errors = []
  // 'EXPECTED' errors come from cases that deliberately fail (script.broken).
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Script failed/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
  await page.route('http://koko.test/**', async (route) => {
    const p = decodeURIComponent(new URL(route.request().url()).pathname)
    try {
      const body = await readFile(join(ROOT, p))
      await route.fulfill({ body, headers: { 'content-type': TYPES[extname(p)] || 'application/octet-stream' } })
    } catch { await route.fulfill({ status: 404, body: 'nf' }) }
  })
  const q = new URLSearchParams({ dark: dark ? '1' : '0', col })
  if (only) q.set('only', only)
  if (opt('--cases', '')) { q.set('cases', opt('--cases', '')); q.set('lamp', '1') }
  await page.goto(`http://koko.test/test/harness.html?${q}`)
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 })
  await page.waitForTimeout(1600)
  if (interact) {
    const { INTERACTIONS } = await import(join(ROOT, 'test', 'interactions.mjs'))
    for (const [id, fn] of Object.entries(INTERACTIONS)) {
      if (only && !only.split(',').includes(id)) continue
      if (!(await page.$(`#case-${id}`))) continue
      try {
        const res = await fn(page, `#case-${id}`)
        console.log(`  interact ${id}: ${res === undefined ? 'ok' : JSON.stringify(res)}`)
      } catch (e) { failures++; console.log(`  interact ${id}: FAIL ${e.message}`) }
    }
    await page.waitForTimeout(400)
  }
  const tag = dark ? 'dark' : 'light'
  await page.screenshot({ path: join(out, `all-${tag}.png`), fullPage: true })
  for (const el of await page.$$('.case')) {
    const id = (await el.getAttribute('id')).replace('case-', '')
    await el.screenshot({ path: join(out, `${id}-${tag}.png`) })
  }
  if (errors.length) { failures += errors.length; console.log(`[${tag}] console problems:\n  ` + errors.join('\n  ')) }
  else console.log(`[${tag}] no console errors`)
  await page.close()
}
await browser.close()
console.log(failures ? `FAILURES: ${failures}` : 'OK')
process.exit(failures ? 1 : 0)
