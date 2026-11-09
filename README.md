# Kokohome

[Kokonut UI](https://kokonutui.com) components, ported to **Home Assistant Lovelace cards**: the same physics, springs and details as the originals, wired to your entities.

- **Dependency-free**: plain web components plus a small built-in motion engine. Nothing is fetched at runtime, so cards keep working offline and load fast.
- **One resource** loads all 24 cards.
- **Light and dark**: they follow your Home Assistant theme.
- **Responsive**: each card adapts to its own width, including two-up on a phone.
- **Accessible**: keyboard support, screen-reader labels and reduced-motion fallbacks, as in the originals.

## Install

Add **one** dashboard resource (*Settings → Dashboards → ⋮ → Resources*), type **JavaScript module**:

```
https://cdn.jsdelivr.net/gh/Iskelmaikel/kokohome@<commit-or-tag>/kokohome.js
```

Pin a commit or tag (not `@main`). jsDelivr and your browser both cache aggressively, so bump the pin when you update. Then hard-refresh, or use *Reset frontend cache* in the companion app.

Every card accepts `card: false` to drop its frame, and `theme: light | dark` to force a theme.

## Cards

### Controls

| Card | What it does | Minimal config |
|---|---|---|
| `kokonut-hold-button` | Press and hold to run an action. The fill drains back on an early release; when complete it shows a drawn check. | `entity: script.x` · `variant: red/green/blue/orange/grey` · `hold_action:` |
| `kokonut-slide-to-confirm` | Slide to lock, unlock, open or run something. Rubber-bands at the ends, a flick commits, and labels adapt to locks, covers, alarms and scripts. | `entity: lock.front_door` |
| `kokonut-switch-button` | A sun that morphs into a moon, for any on/off entity. | `entity: input_boolean.night_mode` · `on_label` / `off_label` |
| `kokonut-bell-button` | A notification toggle with a physically swinging bell that rings when `ring_entity` turns on. | `entity: switch.push` · `ring_entity: binary_sensor.doorbell` · `count_entity:` |
| `kokonut-particle-button` | Runs a scene or script: spinner, then a check and a burst of particles, or a shake on error. | `entity: scene.x` · `tap_action:` |
| `kokonut-detent-dial` | A 270° knob with notches, overshoot and flick-coast. Sends one value after release. | `entity: climate.x` (or number / light / media volume / cover / fan) |
| `kokonut-wheel-picker` | An iOS-style drum picker. Climate entities get Mode and Fan drums automatically; also handles selects, sources and alarm times. | `entity: climate.x` or `columns: [...]` |
| `kokonut-liquid-slider` | A glass you fill with your finger, with waves, bubbles and a spring level. | `entity: media_player.x` · `color: sky/amber/emerald/violet/rose/orange` |
| `kokonut-lamp` | Pull cord plus liquid brightness gauge for one light (separate resource, see below). | `entity: light.x` |

### Display

| Card | What it does | Minimal config |
|---|---|---|
| `kokonut-now-playing` | A spinning record for any media player. Grab it to scrub (it seeks), flick it, and drag the rubber-band progress rail. The artwork is printed on the label. | `entity: media_player.x` |
| `kokonut-metric-card` | A headline total versus the previous period, from long-term statistics. Scrub to read a day, drag to read a range, switch periods and the line morphs, tap a segment to chart it alone. | `segments: [sensor.a, sensor.b]` · `price:` · `events:` |
| `kokonut-spending-ring` | A spinnable donut breakdown, e.g. energy by device today versus yesterday. | `entities: [...]` · `period: day/week/month` · `price:` |
| `kokonut-activity-rings` | Apple-Watch-style goal rings with overflow laps. | `rings: [{ entity, target }]` |
| `kokonut-uptime-card` | Status-page uptime bars from history. They swell under the pointer; pin a day to see its outage log. | `entities: [...]` · `days: 10` |
| `kokonut-activity-terrain` | Daily history as a heatmap that tilts up into a 3D terrain you can orbit. | `entity: sensor.energy` · `weeks: 26` |
| `kokonut-notification-stack` | HA's persistent notifications as a stack. Swipe to dismiss them in HA. | *(none)* |
| `kokonut-split-flap` | A departure-board display: a clock, a sensor value, or cycling values. | `clock: true` or `entities: [{ entity, label }]` |
| `kokonut-lightbox-grid` | A camera wall whose tiles grow into a swipeable full-screen viewer, with live refresh. | `entities: [camera.a, camera.b]` |

### Layout

| Card | What it does | Minimal config |
|---|---|---|
| `kokonut-swipe-tabs` | Swipeable tabs holding any cards. The panel height follows the tab. | `tabs: [{ title, icon, cards: [...] }]` |
| `kokonut-flick-card` | A two-sided card you flick over like a coin. | `front: {card}` · `back: {card}` |
| `kokonut-momentum-rail` | A cover-flow carousel of any cards, with mouse flick physics. | `cards: [...]` · `card_width: 240` |
| `kokonut-status-island` | A Dynamic-Island pill of what's happening: running scripts, media progress, open doors. | `items: [entity, { entity, label, done_label, above }]` |
| `kokonut-tool-dock` | A Figma-style dock for modes or scripts with a sliding plate. It can be thrown to any edge of a `canvas` card. | `entity: input_select.mode` or `tools: [...]` · `canvas: {card}` |

Each card's file under [`cards/`](cards/) starts with its full set of options.

### Older single-file cards

`kokonut-lamp.js`, `kokonut-pull-cord.js`, `kokonut-liquid-gauge.js` and `kokonut-light-card.js` are the first, React-based experiments. Each is still loaded as its own resource.

## Development

`node test/run.mjs --interact` renders every card in Chromium against a mock `hass` (see `test/mock-hass.js`), in light and dark, and runs gesture tests (`test/interactions.mjs`). It fails on any console error. Screenshots go to `test/shots/`.

## License

MIT. Kokonut UI is © Kokonut Labs, MIT licensed. Icons in `cards/core.js` are from Lucide (ISC).
