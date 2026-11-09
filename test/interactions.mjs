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
}
