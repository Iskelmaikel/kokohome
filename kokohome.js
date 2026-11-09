/**
 * Kokohome — Kokonut UI components as Home Assistant Lovelace cards.
 * Register this one file as a dashboard resource (type: module); it loads
 * every card. https://github.com/Iskelmaikel/kokohome
 */
import { VERSION } from './cards/core.js'
import './cards/hold-button.js'
import './cards/slide-to-confirm.js'
import './cards/switch-button.js'
import './cards/bell-button.js'
import './cards/particle-button.js'
import './cards/detent-dial.js'
import './cards/wheel-picker.js'
import './cards/liquid-slider.js'
import './cards/split-flap.js'
import './cards/spending-ring.js'
import './cards/activity-rings.js'
import './cards/metric-card.js'
import './cards/uptime-card.js'
import './cards/activity-terrain.js'
import './cards/notification-stack.js'
import './cards/now-playing.js'
import './cards/lightbox-grid.js'
import './cards/swipe-tabs.js'
import './cards/flick-card.js'
import './cards/momentum-rail.js'
import './cards/status-island.js'
import './cards/tool-dock.js'

console.info(`%c KOKOHOME %c v${VERSION} `,
  'background:#18181b;color:#fafafa;border-radius:4px 0 0 4px;padding:2px 6px',
  'background:#fafafa;color:#18181b;border-radius:0 4px 4px 0;padding:2px 6px')
