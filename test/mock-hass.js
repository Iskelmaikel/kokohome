// Mock Home Assistant `hass` object for rendering kokohome cards in a browser
// without a real HA instance. Records service calls in window.__calls.

const now = Date.now()
const svgPic = (a, b) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/><circle cx="210" cy="90" r="50" fill="rgba(255,255,255,.35)"/></svg>`)

function st(entity_id, state, attributes = {}, ago = 600) {
  const t = new Date(now - ago * 1000).toISOString()
  return { entity_id, state, attributes, last_changed: t, last_updated: t, context: { id: 'x' } }
}

export function makeStates() {
  return {
    'light.standing_light_1': st('light.standing_light_1', 'on', { friendly_name: 'Floor lamp', brightness: 180, supported_color_modes: ['brightness'], color_mode: 'brightness' }),
    'light.office_maikel_desk': st('light.office_maikel_desk', 'off', { friendly_name: 'Desk lamp', supported_color_modes: ['color_temp'], min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500 }),
    'switch.ikea_plug': st('switch.ikea_plug', 'on', { friendly_name: 'IKEA plug' }),
    'sensor.ikea_plug_power': st('sensor.ikea_plug_power', '86.4', { friendly_name: 'IKEA plug power', unit_of_measurement: 'W', device_class: 'power', state_class: 'measurement' }),
    'sensor.ikea_plug_energy': st('sensor.ikea_plug_energy', '1.82', { friendly_name: 'IKEA plug energy today', unit_of_measurement: 'kWh', device_class: 'energy', state_class: 'total_increasing' }),
    'sensor.living_room_temperature': st('sensor.living_room_temperature', '21.6', { friendly_name: 'Living room temperature', unit_of_measurement: '°C', device_class: 'temperature', state_class: 'measurement' }),
    'sensor.steps': st('sensor.steps', '6420', { friendly_name: 'Steps', unit_of_measurement: 'steps' }),
    'sensor.water': st('sensor.water', '1.4', { friendly_name: 'Water', unit_of_measurement: 'L' }),
    'climate.living_room_ac': st('climate.living_room_ac', 'cool', {
      friendly_name: 'Living room AC', hvac_modes: ['off', 'auto', 'cool', 'dry', 'heat', 'fan_only'],
      fan_modes: ['silent', 'low', 'medium', 'high', 'full', 'auto'], fan_mode: 'auto',
      min_temp: 16, max_temp: 30, target_temp_step: 0.5, temperature: 22.5, current_temperature: 24.1,
      supported_features: 1 | 8 | 128 | 256,
    }),
    'media_player.living_room_lg_tv': st('media_player.living_room_lg_tv', 'playing', {
      friendly_name: 'LG TV', media_title: 'Relaxing Music for Dogs', media_artist: 'Calm Pets TV',
      media_duration: 3600, media_position: 1260, media_position_updated_at: new Date(now - 5000).toISOString(),
      volume_level: 0.18, is_volume_muted: false, entity_picture: svgPic('#4f46e5', '#ec4899'),
      app_name: 'YouTube', supported_features: 1 | 2 | 4 | 16 | 32 | 128 | 256 | 4096 | 16384 | 2048,
    }),
    'lock.front_door': st('lock.front_door', 'locked', { friendly_name: 'Front door' }),
    'script.play_youtube_on_lg_tv': st('script.play_youtube_on_lg_tv', 'off', { friendly_name: 'Play Dog TV', icon: 'mdi:youtube-tv' }),
    'script.all_off': st('script.all_off', 'off', { friendly_name: 'Everything off', icon: 'mdi:power' }),
    'scene.movie_night': st('scene.movie_night', '2026-11-08T20:00:00', { friendly_name: 'Movie night', icon: 'mdi:movie-open' }),
    'input_select.house_mode': st('input_select.house_mode', 'Home', { friendly_name: 'House mode', options: ['Home', 'Away', 'Night', 'Guest', 'Vacation'] }),
    'input_number.tv_volume': st('input_number.tv_volume', '18', { friendly_name: 'TV volume', min: 0, max: 100, step: 1, unit_of_measurement: '%' }),
    'binary_sensor.doorbell': st('binary_sensor.doorbell', 'off', { friendly_name: 'Doorbell', device_class: 'occupancy' }),
    'binary_sensor.front_door': st('binary_sensor.front_door', 'off', { friendly_name: 'Front door', device_class: 'door' }),
    'binary_sensor.internet': st('binary_sensor.internet', 'on', { friendly_name: 'Internet', device_class: 'connectivity' }),
    'camera.doggy_cam': st('camera.doggy_cam', 'idle', { friendly_name: 'Doggy cam', entity_picture: svgPic('#0f766e', '#a3e635') }),
    'camera.front_door': st('camera.front_door', 'idle', { friendly_name: 'Front door', entity_picture: svgPic('#1e3a8a', '#f59e0b') }),
    'camera.backyard': st('camera.backyard', 'idle', { friendly_name: 'Backyard', entity_picture: svgPic('#14532d', '#38bdf8') }),
    'input_boolean.night_mode': st('input_boolean.night_mode', 'off', { friendly_name: 'Night mode', icon: 'mdi:weather-night' }),
    'input_boolean.doorbell_alerts': st('input_boolean.doorbell_alerts', 'on', { friendly_name: 'Doorbell alerts' }),
    'sensor.unread_notifications': st('sensor.unread_notifications', '1284', { friendly_name: 'Unread' }),
    'script.broken': st('script.broken', 'off', { friendly_name: 'Broken script', icon: 'mdi:alert' }),
    'input_datetime.alarm': st('input_datetime.alarm', '07:15:00', { friendly_name: 'Wake-up alarm', has_time: true, has_date: false }),
    'person.maikel': st('person.maikel', 'home', { friendly_name: 'Maikel' }),
    'sensor.time': st('sensor.time', '21:47', { friendly_name: 'Time' }),
    'cover.living_room_blinds': st('cover.living_room_blinds', 'open', { friendly_name: 'Blinds', current_position: 70, supported_features: 15 }),
  }
}

// Deterministic pseudo-random.
function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647 }

function historyFor(id, start, end) {
  const r = rng(id.length * 97 + 13)
  const out = []
  const s = start.getTime(), e = end.getTime()
  if (id.startsWith('binary_sensor') || id.startsWith('switch') || id.startsWith('light')) {
    let t = s, on = true
    while (t < e) {
      out.push({ s: on ? 'on' : 'off', lu: t / 1000 })
      t += (on ? 6 : 0.4 + r() * 1.5) * 3600e3 * (0.3 + r())
      on = !on
      if (r() < 0.04) { out.push({ s: 'unavailable', lu: t / 1000 }); t += 1800e3 }
    }
    return out
  }
  const base = id.includes('temperature') ? 21 : id.includes('power') ? 80 : 50
  const amp = id.includes('temperature') ? 2.5 : 40
  for (let t = s; t < e; t += 15 * 60e3) {
    const v = base + Math.sin(t / 3.6e6 / 3) * amp * 0.6 + (r() - 0.5) * amp * 0.5
    out.push({ s: v.toFixed(1), lu: t / 1000 })
  }
  return out
}

function statsFor(id, start, end, period) {
  const r = rng(id.length * 31 + 7)
  const step = { hour: 3600e3, day: 86400e3, week: 7 * 86400e3, month: 30 * 86400e3 }[period] || 86400e3
  const rows = []
  let sum = 0
  for (let t = start.getTime(); t < end.getTime(); t += step) {
    const day = new Date(t).getDay()
    const weekend = day === 0 || day === 6
    const mean = (id.includes('power') ? 60 : 20) * (0.4 + r() * (weekend ? 1.6 : 1))
    const change = Math.max(0, (weekend ? 2.6 : 1.6) * (0.3 + r()) - (r() < 0.12 ? 2 : 0))
    sum += change
    rows.push({ start: t, end: t + step, mean, min: mean * 0.6, max: mean * 1.4, sum, state: sum, change })
  }
  return rows
}

export function makeHass({ dark = false } = {}) {
  window.__calls = []
  const listeners = new Set()
  const hass = {
    states: makeStates(),
    themes: { darkMode: dark, theme: 'default' },
    language: 'en', locale: { language: 'en', number_format: 'language' },
    user: { name: 'Maikel', is_admin: true },
    formatEntityState(s) {
      if (!s) return ''
      const u = s.attributes.unit_of_measurement
      const map = { on: 'On', off: 'Off', locked: 'Locked', unlocked: 'Unlocked', playing: 'Playing', paused: 'Paused', cool: 'Cool', heat: 'Heat', idle: 'Idle', open: 'Open', closed: 'Closed', home: 'Home' }
      if (map[s.state]) return map[s.state]
      return u ? `${s.state} ${u}` : s.state
    },
    callService(domain, service, data = {}, target) {
      window.__calls.push({ domain, service, data, target })
      if ([].concat(data.entity_id || (target && target.entity_id) || []).includes('script.broken')) return Promise.reject(new Error('Script failed'))
      const ids = [].concat(data.entity_id || (target && target.entity_id) || [])
      const next = { ...(window.__hass || hass).states }
      for (const id of ids) {
        const s = next[id]
        if (!s) continue
        let ns = s.state, attrs = { ...s.attributes }
        if (service === 'turn_on') ns = 'on'
        if (service === 'turn_off') ns = 'off'
        if (service === 'toggle') ns = s.state === 'on' ? 'off' : 'on'
        if (service === 'lock') ns = 'locked'
        if (service === 'unlock') ns = 'unlocked'
        if (service === 'set_temperature') attrs.temperature = data.temperature
        if (service === 'set_hvac_mode') ns = data.hvac_mode
        if (service === 'set_fan_mode') attrs.fan_mode = data.fan_mode
        if (service === 'select_option') ns = data.option
        if (service === 'set_value') ns = String(data.value)
        if (service === 'set_datetime') ns = data.time
        if (service === 'volume_set') attrs.volume_level = data.volume_level
        if (service === 'media_play_pause') ns = s.state === 'playing' ? 'paused' : 'playing'
        if (service === 'media_pause') ns = 'paused'
        if (service === 'media_play') ns = 'playing'
        if (service === 'turn_on' && data.brightness_pct != null) attrs.brightness = Math.round(data.brightness_pct * 2.55)
        if (service === 'set_cover_position') attrs.current_position = data.position
        next[id] = { ...s, state: ns, attributes: attrs, last_changed: new Date().toISOString(), last_updated: new Date().toISOString() }
      }
      // Like real HA: a fresh hass object with fresh states on every change.
      setTimeout(() => window.__setStates && window.__setStates(next), 30)
      return Promise.resolve()
    },
    callWS(msg) {
      if (msg.type === 'history/history_during_period') {
        const res = {}
        for (const id of msg.entity_ids) res[id] = historyFor(id, new Date(msg.start_time), new Date(msg.end_time))
        return Promise.resolve(res)
      }
      if (msg.type === 'recorder/statistics_during_period') {
        const res = {}
        for (const id of msg.statistic_ids) res[id] = statsFor(id, new Date(msg.start_time), new Date(msg.end_time), msg.period)
        return Promise.resolve(res)
      }
      return Promise.resolve(null)
    },
    hassUrl: (p) => p,
    connection: {
      subscribeMessage(cb, msg) {
        if (msg.type === 'persistent_notification/subscribe') {
          listeners.add(cb)
          setTimeout(() => cb({
            type: 'current',
            notifications: {
              a: { notification_id: 'a', title: 'Front door opened', message: 'The front door was opened while nobody was home.', created_at: new Date(now - 4 * 60e3).toISOString() },
              b: { notification_id: 'b', title: 'Washing machine done', message: 'Laundry finished. Time to hang it up.', created_at: new Date(now - 42 * 60e3).toISOString() },
              c: { notification_id: 'c', title: 'Update available', message: 'Home Assistant Core 2026.11.1 is available.', created_at: new Date(now - 5 * 3600e3).toISOString() },
            },
          }), 50)
        }
        return Promise.resolve(() => listeners.delete(cb))
      },
    },
  }
  return hass
}
