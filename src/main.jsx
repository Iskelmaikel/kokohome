import { createRoot } from 'react-dom/client'
import { createElement } from 'react'
import { LightCard } from './LightCard.jsx'
import styles from './card.css?inline'

const VERSION = '0.1.0'

class KokonutLightCard extends HTMLElement {
  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error('kokonut-light-card: you must define an "entity"')
    }
    if (config.entity.split('.')[0] !== 'light') {
      throw new Error('kokonut-light-card: "entity" must be a light.* entity')
    }
    this._config = config
    this._render()
  }

  set hass(hass) {
    this._hass = hass
    this._render()
  }

  connectedCallback() {
    this._render()
  }

  disconnectedCallback() {
    // Defer unmount so React doesn't tear down during a synchronous move.
    const root = this._root
    this._root = null
    this._mount = null
    if (root) queueMicrotask(() => root.unmount())
  }

  _ensure() {
    if (this._root) return
    const shadow = this.shadowRoot || this.attachShadow({ mode: 'open' })
    try {
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(styles)
      shadow.adoptedStyleSheets = [sheet]
    } catch (e) {
      const styleEl = document.createElement('style')
      styleEl.textContent = styles
      shadow.appendChild(styleEl)
    }
    this._mount = document.createElement('div')
    shadow.appendChild(this._mount)
    this._root = createRoot(this._mount)
  }

  _render() {
    if (!this._config) return
    this._ensure()
    this._root.render(createElement(LightCard, { hass: this._hass, config: this._config }))
  }

  // Rough height hint for the masonry/sections layout engine.
  getCardSize() {
    return 3
  }

  static getStubConfig() {
    return { entity: 'light.example' }
  }
}

if (!customElements.get('kokonut-light-card')) {
  customElements.define('kokonut-light-card', KokonutLightCard)
}

window.customCards = window.customCards || []
window.customCards.push({
  type: 'kokonut-light-card',
  name: 'Kokonut Light Card',
  description: 'An animated light control card (brightness + colour temperature).',
  preview: true,
})

// eslint-disable-next-line no-console
console.info(`%c KOKONUT-LIGHT-CARD %c v${VERSION} `,
  'background:#1b2030;color:#ffc58f;border-radius:4px 0 0 4px;padding:2px 4px',
  'background:#ffc58f;color:#1b2030;border-radius:0 4px 4px 0;padding:2px 4px')
