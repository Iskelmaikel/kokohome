import { useState, useEffect } from 'react'
import { motion } from 'motion/react'

function BulbIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-4 10.5c.5.5 1 1.2 1 2V16h6v-.5c0-.8.5-1.5 1-2A6 6 0 0 0 12 3Z" />
    </svg>
  )
}

const COLOR_MODES_WITH_BRIGHTNESS = ['brightness', 'color_temp', 'hs', 'xy', 'rgb', 'rgbw', 'rgbww', 'white']

export function LightCard({ hass, config }) {
  const entityId = config.entity
  const stateObj = hass && hass.states ? hass.states[entityId] : undefined
  const attrs = (stateObj && stateObj.attributes) || {}

  const available = !!stateObj && stateObj.state !== 'unavailable' && stateObj.state !== 'unknown'
  const isOn = stateObj && stateObj.state === 'on'

  const brightnessPct = attrs.brightness != null
    ? Math.round((attrs.brightness / 255) * 100)
    : (isOn ? 100 : 0)

  const modes = attrs.supported_color_modes || []
  const supportsBrightness = attrs.brightness != null || modes.some((m) => COLOR_MODES_WITH_BRIGHTNESS.includes(m))
  const supportsColorTemp = modes.includes('color_temp')
  const minK = attrs.min_color_temp_kelvin || 2200
  const maxK = attrs.max_color_temp_kelvin || 6500
  const curK = attrs.color_temp_kelvin || Math.round((minK + maxK) / 2)

  const name = config.name || attrs.friendly_name || entityId
  const rgb = attrs.rgb_color
  const accent = !isOn
    ? 'rgb(120,130,150)'
    : rgb
      ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
      : 'rgb(255,197,143)'

  // Local brightness for a snappy slider; re-sync when HA reports a new value.
  const [localB, setLocalB] = useState(brightnessPct)
  useEffect(() => { setLocalB(brightnessPct) }, [brightnessPct])

  const call = (service, data) =>
    hass && hass.callService && hass.callService('light', service, { entity_id: entityId, ...data })

  const toggle = () => call(isOn ? 'turn_off' : 'turn_on', {})
  const onBrightness = (v) => {
    setLocalB(v)
    if (v <= 0) call('turn_off', {})
    else call('turn_on', { brightness_pct: v })
  }
  const onKelvin = (v) => call('turn_on', { color_temp_kelvin: v })

  const glowOpacity = isOn ? 0.25 + (localB / 100) * 0.6 : 0

  if (!available) {
    return (
      <div className="klc-card">
        <div className="klc-content">
          <div className="klc-top">
            <div className="klc-iconbtn" style={{ opacity: 0.5 }}><BulbIcon /></div>
            <div className="klc-titles">
              <div className="klc-name">{name}</div>
              <div className="klc-unavailable"><span className="klc-dot" />Unavailable</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="klc-card">
      <motion.div
        className="klc-glow"
        animate={{
          opacity: glowOpacity,
          background: `radial-gradient(60% 100% at 50% 0%, ${accent}, rgba(0,0,0,0) 70%)`,
        }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
      <div className="klc-content">
        <div className="klc-top">
          <motion.button
            className="klc-iconbtn"
            onClick={toggle}
            whileTap={{ scale: 0.9 }}
            animate={{
              color: isOn ? accent : 'rgba(245,247,251,0.75)',
              boxShadow: isOn
                ? `0 0 22px -4px ${accent}`
                : '0 0 0px rgba(0,0,0,0)',
            }}
            transition={{ duration: 0.35 }}
            aria-label={isOn ? 'Turn off' : 'Turn on'}
          >
            <BulbIcon />
          </motion.button>

          <div className="klc-titles">
            <div className="klc-name">{name}</div>
            <div className="klc-sub">
              {isOn ? (supportsBrightness ? `On · ${localB}%` : 'On') : 'Off'}
            </div>
          </div>

          {supportsBrightness && isOn && (
            <motion.div
              className="klc-pct"
              key={localB}
              initial={{ opacity: 0.4, y: -3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              {localB}%
            </motion.div>
          )}
        </div>

        {supportsBrightness && (
          <div className="klc-sliderwrap">
            <div className="klc-sliderlabel"><span>Brightness</span></div>
            <input
              className="klc-range"
              type="range"
              min="0"
              max="100"
              value={localB}
              style={{ '--klc-fill': accent }}
              onChange={(e) => onBrightness(Number(e.target.value))}
            />
          </div>
        )}

        {supportsColorTemp && isOn && (
          <div className="klc-sliderwrap klc-ct">
            <div className="klc-sliderlabel">
              <span>Warm</span><span>Cool</span>
            </div>
            <input
              className="klc-range"
              type="range"
              min={minK}
              max={maxK}
              step="50"
              defaultValue={curK}
              onChange={(e) => onKelvin(Number(e.target.value))}
            />
          </div>
        )}
      </div>
    </div>
  )
}
