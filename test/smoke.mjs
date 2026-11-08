import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0])
    const file = join(root, normalize(urlPath))
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404); res.end('not found')
  }
})
await new Promise((r) => server.listen(8099, r))

// Route CDN imports (esm.sh) through the sandbox agent proxy; localhost direct.
const proxyServer = process.env.HTTPS_PROXY || 'http://127.0.0.1:46411'
const browser = await chromium.launch({
  proxy: { server: proxyServer, bypass: 'localhost,127.0.0.1' },
})
const page = await browser.newPage({
  viewport: { width: 460, height: 900 },
  deviceScaleFactor: 2,
  ignoreHTTPSErrors: true, // proxy MITMs TLS with its own CA
})
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto('http://localhost:8099/test/smoke.html', { waitUntil: 'load' })
await page.waitForFunction(() => window.__ready === true, { timeout: 45000 })
// Wait until React has actually mounted into the shadow roots (CDN fetch + render).
await page.waitForFunction(
  () => [...document.querySelectorAll('kokonut-light-card')].every(
    (el) => el.shadowRoot && el.shadowRoot.querySelector('.klc-card')
  ),
  { timeout: 45000 }
)
await page.waitForTimeout(800)

const mounted = await page.evaluate(() =>
  [...document.querySelectorAll('kokonut-light-card')].map(
    (el) => !!el.shadowRoot && !!el.shadowRoot.querySelector('.klc-card')
  )
)

await page.evaluate(() => {
  const el = document.querySelector('kokonut-light-card')
  const range = el.shadowRoot.querySelector('.klc-range')
  range.value = 40
  range.dispatchEvent(new Event('change', { bubbles: true }))
})
await page.waitForTimeout(150)
const calls = await page.evaluate(() => window.__calls || [])

await page.screenshot({ path: join(root, 'test', 'smoke.png') })

console.log('mounted:', JSON.stringify(mounted))
console.log('service calls:', JSON.stringify(calls))
console.log('console errors:', JSON.stringify(errors))

await browser.close()
server.close()

const ok = mounted.length === 3 && mounted.every(Boolean) && calls.length > 0 && errors.length === 0
console.log(ok ? 'SMOKE_OK' : 'SMOKE_FAIL')
process.exit(ok ? 0 : 1)
