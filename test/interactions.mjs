// Per-case interaction checks, run with `node test/run.mjs --interact`.
// Each returns a summary of the service calls the gesture produced and throws
// when the expected call did not happen.

const calls = (page) => page.evaluate(() => window.__calls.map((c) => `${c.domain}.${c.service}`))
const reset = (page) => page.evaluate(() => { window.__calls = [] })
const box = async (page, sel) => {
  const h = await page.evaluateHandle((s) => {
    const [caseSel, inner] = s.split(' >> ')
    const host = document.querySelector(caseSel).querySelector('*:not(h4)')
    return inner ? host.shadowRoot.querySelector(inner) : host
  }, sel)
  const el = h.asElement()
  await el.scrollIntoViewIfNeeded()
  return el.boundingBox()
}
const expectCall = async (page, svc) => {
  const c = await calls(page)
  if (!c.includes(svc)) throw new Error(`expected ${svc}, got [${c.join(', ')}]`)
  return c
}

export const INTERACTIONS = {
  // Short tap must NOT fire; a full hold must.
  'hold-red': async (page, s) => {
    await reset(page)
    const b = await box(page, `${s} >> button.hold`)
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down(); await page.waitForTimeout(200); await page.mouse.up()
    await page.waitForTimeout(400)
    if ((await calls(page)).length) throw new Error('tap fired the action')
    await page.mouse.down(); await page.waitForTimeout(1350); await page.mouse.up()
    await page.waitForTimeout(150)
    return expectCall(page, 'script.turn_on')
  },
  // A half drag springs back; a full drag unlocks.
  'slide-lock': async (page, s) => {
    await reset(page)
    const t = await box(page, `${s} >> .thumb`)
    const tr = await box(page, `${s} >> .track`)
    const y = t.y + t.height / 2
    await page.mouse.move(t.x + t.width / 2, y); await page.mouse.down()
    await page.mouse.move(t.x + tr.width * 0.35, y, { steps: 12 }); await page.mouse.up()
    await page.waitForTimeout(700)
    if ((await calls(page)).length) throw new Error('half slide fired')
    await page.mouse.move(t.x + t.width / 2, y); await page.mouse.down()
    await page.mouse.move(tr.x + tr.width + 30, y, { steps: 20 }); await page.mouse.up()
    await page.waitForTimeout(1000)
    return expectCall(page, 'lock.unlock')
  },
  'switch-night': async (page, s) => {
    await reset(page)
    const b = await box(page, `${s} >> button.sw`)
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
    await page.waitForTimeout(700)
    const moon = await page.evaluate((sel) => document.querySelector(sel).querySelector('kokonut-switch-button').hasAttribute('moon'), s)
    if (!moon) throw new Error('did not morph to moon')
    return expectCall(page, 'homeassistant.toggle')
  },
  'bell-default': async (page, s) => {
    // Doorbell press while alerts are on: the bell must swing.
    await page.evaluate(() => {
      const st = window.__hass.states
      window.__setStates({ ...st, 'binary_sensor.doorbell': { ...st['binary_sensor.doorbell'], state: 'on' } })
    })
    await page.waitForTimeout(120)
    const angle = await page.evaluate((sel) => document.querySelector(sel).querySelector('kokonut-bell-button').sim.bell, s)
    if (Math.abs(angle) < 1) throw new Error('bell did not swing on doorbell')
    return { swing: Math.round(angle) }
  },
  'particle-scene': async (page, s) => {
    await reset(page)
    const b = await box(page, `${s} >> button.pb`)
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
    await page.waitForTimeout(150)
    const pending = await page.evaluate((sel) => document.querySelector(sel).querySelector('kokonut-particle-button').status, s)
    await page.waitForTimeout(500)
    const done = await page.evaluate((sel) => document.querySelector(sel).querySelector('kokonut-particle-button').status, s)
    if (pending !== 'pending' || done !== 'success') throw new Error(`status ${pending} -> ${done}`)
    return expectCall(page, 'scene.turn_on')
  },
  'particle-error': async (page, s) => {
    const b = await box(page, `${s} >> button.pb`)
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
    await page.waitForTimeout(700)
    const st = await page.evaluate((sel) => document.querySelector(sel).querySelector('kokonut-particle-button').status, s)
    if (st !== 'error') throw new Error('expected error status, got ' + st)
    return { status: st }
  },
  // Turn the knob clockwise a quarter turn: target goes up, sent once after release.
  'dial-ac': async (page, s) => {
    await reset(page)
    const k = await box(page, `${s} >> .knob`)
    const cx = k.x + k.width / 2, cy = k.y + k.height / 2, r = k.width * 0.4
    await page.mouse.move(cx, cy - r); await page.mouse.down()
    for (let a = 0; a <= 60; a += 4) {
      const rad = (a * Math.PI) / 180
      await page.mouse.move(cx + r * Math.sin(rad), cy - r * Math.cos(rad))
      await page.waitForTimeout(16)
    }
    await page.waitForTimeout(150); await page.mouse.up()
    await page.waitForTimeout(1600)
    const c = await page.evaluate(() => window.__calls)
    const sets = c.filter((x) => x.service === 'set_temperature')
    if (sets.length !== 1) throw new Error('expected exactly one set_temperature, got ' + JSON.stringify(c))
    if (!(sets[0].data.temperature > 22.5)) throw new Error('temperature did not go up: ' + sets[0].data.temperature)
    return { temperature: sets[0].data.temperature }
  },
  // Drag the Fan drum up two rows.
  'wheel-ac': async (page, s) => {
    await reset(page)
    const cols = await page.evaluateHandle((sel) => document.querySelector(sel).querySelector('kokonut-wheel-picker').shadowRoot.querySelectorAll('.col'), s)
    const fanEl = (await cols.getProperty('1')).asElement()
    await fanEl.scrollIntoViewIfNeeded()
    const fan = await fanEl.boundingBox()
    const x = fan.x + fan.width / 2, y = fan.y + fan.height / 2
    await page.mouse.move(x, y); await page.mouse.down()
    await page.mouse.move(x, y + 72, { steps: 10 }); await page.waitForTimeout(150); await page.mouse.up()
    await page.waitForTimeout(1200)
    const c = await page.evaluate(() => window.__calls)
    const set = c.find((x) => x.service === 'set_fan_mode')
    if (!set) throw new Error('no set_fan_mode: ' + JSON.stringify(c))
    return { fan_mode: set.data.fan_mode }
  },
  // Pour: drag from the bottom of the glass to near the top.
  'liquid-volume': async (page, s) => {
    await reset(page)
    const sv = await box(page, `${s} >> svg`)
    const x = sv.x + sv.width / 2
    await page.mouse.move(x, sv.y + sv.height * 0.8); await page.mouse.down()
    await page.mouse.move(x + 10, sv.y + sv.height * 0.45, { steps: 14 }); await page.mouse.up()
    await page.waitForTimeout(700)
    const c = await page.evaluate(() => window.__calls)
    const set = c.filter((x) => x.service === 'volume_set')
    if (!set.length) throw new Error('no volume_set: ' + JSON.stringify(c))
    const v = set[set.length - 1].data.volume_level
    if (!(v > 0.4 && v < 0.95)) throw new Error('unexpected volume ' + v)
    return { volume_level: v, calls: set.length }
  },
  // Tap the legend: the ring turns so that slice is selected.
  'ring-energy': async (page, s) => {
    const btn = await page.evaluateHandle((sel) => document.querySelector(sel).querySelector('kokonut-spending-ring').shadowRoot.querySelectorAll('li button')[2], s)
    await btn.asElement().scrollIntoViewIfNeeded()
    await btn.asElement().click()
    await page.waitForTimeout(900)
    const r = await page.evaluate((sel) => { const el = document.querySelector(sel).querySelector('kokonut-spending-ring'); return { selected: el.selected, a: el.sim.a, mid: el.spans[2].mid, label: el.shadowRoot.querySelector('.mname').textContent } }, s)
    if (r.selected !== 2) throw new Error('not selected: ' + JSON.stringify(r))
    if (Math.abs(((-r.a - r.mid) % 360 + 540) % 360 - 180) > 1) throw new Error('ring did not turn to slice: ' + JSON.stringify(r))
    return r.label
  },
  // Scrub the chart, then switch to 7 days: the headline must change.
  'metric-energy': async (page, s) => {
    const el = await page.evaluateHandle((sel) => document.querySelector(sel).querySelector('kokonut-metric-card'), s)
    const before = await el.evaluate((e) => e.shadowRoot.querySelector('.sr').textContent)
    const chart = await box(page, `${s} >> .chart`)
    await page.mouse.move(chart.x + chart.width * 0.5, chart.y + chart.height / 2)
    await page.waitForTimeout(200)
    const cap = await el.evaluate((e) => e.shadowRoot.querySelector('.cap').textContent)
    await page.mouse.move(chart.x - 40, chart.y - 40)
    const b7 = await el.evaluateHandle((e) => e.shadowRoot.querySelector('.seg button[data-d="7"]'))
    await b7.asElement().click()
    await page.waitForTimeout(600)
    const after = await el.evaluate((e) => e.shadowRoot.querySelector('.sr').textContent)
    if (before === after) throw new Error('period switch did not change total: ' + before)
    if (!/ vs /.test(cap)) throw new Error('scrub caption missing: ' + cap)
    return { before, after, cap }
  },
  // Pin a day: the log opens.
  'uptime': async (page, s) => {
    const rows = await box(page, `${s} >> .rows`)
    await page.mouse.move(rows.x + rows.width * 0.7, rows.y + rows.height / 2)
    await page.mouse.down(); await page.mouse.up()
    await page.waitForTimeout(400)
    const open = await page.evaluate((sel) => document.querySelector(sel).querySelector('kokonut-uptime-card').shadowRoot.querySelector('.log').hasAttribute('data-open'), s)
    if (!open) throw new Error('log did not open')
    await page.mouse.move(rows.x - 50, rows.y - 50)
    return { pinned: true }
  },
  // Swipe the front notification away: it is dismissed in HA.
  'notifications': async (page, s) => {
    await reset(page)
    await page.waitForTimeout(300)
    const art = await page.evaluateHandle((sel) => document.querySelector(sel).querySelector('kokonut-notification-stack').shadowRoot.querySelector('li article'), s)
    await art.asElement().scrollIntoViewIfNeeded()
    const b = await art.asElement().boundingBox()
    // Move off the card first so the stack is collapsed (no hover).
    const y = b.y + b.height / 2
    await page.mouse.move(b.x + 40, y); await page.mouse.down()
    await page.mouse.move(b.x + 220, y, { steps: 8 }); await page.mouse.up()
    await page.waitForTimeout(700)
    const left = await page.evaluate((sel) => document.querySelector(sel).querySelector('kokonut-notification-stack').shadowRoot.querySelectorAll('li').length, s)
    const c = await page.evaluate(() => window.__calls)
    const d = c.find((x) => x.service === 'dismiss')
    if (!d) throw new Error('no dismiss call: ' + JSON.stringify(c))
    if (left !== 2) throw new Error('expected 2 left, got ' + left)
    return { dismissed: d.data.notification_id, left }
  },
  // Pause, then drag the progress bar: media_seek.
  'now-playing': async (page, s) => {
    await reset(page)
    const pp = await box(page, `${s} >> .pp`)
    await page.mouse.click(pp.x + pp.width / 2, pp.y + pp.height / 2)
    await page.waitForTimeout(300)
    const seek = await box(page, `${s} >> .seek`)
    await page.mouse.move(seek.x + seek.width * 0.2, seek.y + seek.height / 2); await page.mouse.down()
    await page.mouse.move(seek.x + seek.width * 0.75, seek.y + seek.height / 2, { steps: 6 }); await page.mouse.up()
    await page.waitForTimeout(300)
    const c = await page.evaluate(() => window.__calls.map((x) => [x.service, x.data.seek_position]))
    if (!c.some((x) => x[0] === 'media_play_pause')) throw new Error('no play/pause: ' + JSON.stringify(c))
    const sk = c.find((x) => x[0] === 'media_seek')
    if (!sk || Math.abs(sk[1] - 2700) > 60) throw new Error('bad seek: ' + JSON.stringify(c))
    return c
  },
  // Open the first camera, then close with Escape.
  'cameras': async (page, s) => {
    const t = await box(page, `${s} >> button.th`)
    await page.mouse.click(t.x + t.width / 2, t.y + t.height / 2)
    await page.waitForTimeout(700)
    const open = await page.evaluate(() => { const h = document.querySelector('[data-kokohome-lightbox]'); return !!h && !h.hidden && h.shadowRoot.querySelector('.cnt').textContent })
    if (!open) throw new Error('viewer did not open')
    await page.screenshot({ path: '/tmp/claude-0/-home-claude/d29d6d97-0bf9-59bc-8f70-9059cf6dbac0/scratchpad/lightbox-open.png' })
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(400)
    const second = await page.evaluate(() => document.querySelector('[data-kokohome-lightbox]').shadowRoot.querySelector('.cnt').textContent)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(700)
    // Must be truly gone (not just [hidden]) and must not swallow taps.
    const closed = await page.evaluate(() => getComputedStyle(document.querySelector('[data-kokohome-lightbox]')).display === 'none')
    if (!closed) throw new Error('viewer still displayed after close')
    const hit = await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return el && el.closest('.case') ? el.closest('.case').id : el && el.tagName }, { x: t.x + t.width / 2, y: t.y + t.height / 2 })
    if (hit !== 'case-cameras') throw new Error('something covers the grid after close: ' + hit)
    return { open, second }
  },
  'tabs': async (page, s) => {
    const el = await page.evaluateHandle((sel) => document.querySelector(sel).querySelector('kokonut-swipe-tabs'), s)
    const tab = await el.evaluateHandle((e) => e.shadowRoot.querySelectorAll('.tab')[1])
    await tab.asElement().scrollIntoViewIfNeeded(); await tab.asElement().click()
    await page.waitForTimeout(700)
    const r = await el.evaluate((e) => ({ sel: e.selected, p: e.progress.get(), h: e.shadowRoot.querySelector('.view').style.height, dial: !!e.shadowRoot.querySelectorAll('.panel')[1].querySelector('kokonut-detent-dial') }))
    if (r.sel !== 1 || Math.abs(r.p - 1) > 0.01 || !r.dial) throw new Error(JSON.stringify(r))
    // Swipe back to the first tab on the panel area.
    const v = await box(page, `${s} >> .view`)
    await page.mouse.move(v.x + 20, v.y + v.height - 10); await page.mouse.down()
    await page.mouse.move(v.x + v.width * 0.7, v.y + v.height - 10, { steps: 6 }); await page.mouse.up()
    await page.waitForTimeout(700)
    const back = await el.evaluate((e) => e.selected)
    if (back !== 0) throw new Error('swipe did not go back, selected=' + back)
    return r
  },
  'flick': async (page, s) => {
    const r0 = await box(page, `${s} >> .root`)
    await page.mouse.click(r0.x + r0.width * 0.8, r0.y + r0.height * 0.7)
    await page.waitForTimeout(1300)
    const a = await page.evaluate((sel) => document.querySelector(sel).querySelector('kokonut-flick-card').s.angle, s)
    if (Math.abs(Math.abs(a) - 180) > 1) throw new Error('angle ' + a)
    return { angle: a }
  },
  'rail': async (page, s) => {
    const nx = await box(page, `${s} >> .next`)
    await page.mouse.click(nx.x + nx.width / 2, nx.y + nx.height / 2)
    await page.waitForTimeout(900)
    const a = await page.evaluate((sel) => document.querySelector(sel).querySelector('kokonut-momentum-rail').active, s)
    if (a !== 1) throw new Error('active ' + a)
    return { active: a }
  },
  'island': async (page, s) => {
    const label = () => page.evaluate((sel) => { const r = document.querySelector(sel).querySelector('kokonut-status-island').shadowRoot.querySelector('.pill .row:not(.out) .lbl'); return r && r.textContent }, s)
    const first = await label()
    await page.evaluate(() => { const st = window.__hass.states; window.__setStates({ ...st, 'script.play_youtube_on_lg_tv': { ...st['script.play_youtube_on_lg_tv'], state: 'on' } }) })
    await page.waitForTimeout(500)
    const running = await label()
    await page.evaluate(() => { const st = window.__hass.states; window.__setStates({ ...st, 'script.play_youtube_on_lg_tv': { ...st['script.play_youtube_on_lg_tv'], state: 'off' } }) })
    await page.waitForTimeout(500)
    const done = await label()
    if (running !== 'Starting Dog TV' || done !== 'Dog TV is on') throw new Error(JSON.stringify({ first, running, done }))
    return { first, running, done }
  },
  'dock': async (page, s) => {
    await reset(page)
    const btn = await page.evaluateHandle((sel) => document.querySelector(sel).querySelector('kokonut-tool-dock').shadowRoot.querySelectorAll('.tool')[2], s)
    await btn.asElement().scrollIntoViewIfNeeded(); await btn.asElement().click()
    await page.waitForTimeout(600)
    const c = await page.evaluate(() => window.__calls.map((x) => [x.service, x.data.option]))
    const plate = await page.evaluate((sel) => { const el = document.querySelector(sel).querySelector('kokonut-tool-dock'); return { x: el.px.get(), btn: el.btns[2].offsetLeft } }, s)
    if (!c.some((x) => x[0] === 'select_option' && x[1] === 'Night')) throw new Error(JSON.stringify(c))
    if (Math.abs(plate.x - plate.btn) > 1) throw new Error('plate not under Night: ' + JSON.stringify(plate))
    return { call: c[0], plate }
  },
  'dock-canvas': async (page, s) => {
    const g = await box(page, `${s} >> .grip`)
    const st = await box(page, `${s} >> .stage`)
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await page.mouse.down()
    await page.mouse.move(st.x + 30, st.y + st.height / 2, { steps: 10 }); await page.mouse.up()
    await page.waitForTimeout(900)
    const edge = await page.evaluate((sel) => document.querySelector(sel).querySelector('kokonut-tool-dock').edge, s)
    if (edge !== 'left') throw new Error('edge ' + edge)
    return { edge }
  },
}
