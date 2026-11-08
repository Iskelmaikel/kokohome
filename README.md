# Kokonut Light Card

An animated, Kokonut-style light control card for Home Assistant (Lovelace).
Brightness slider with a live glow, smooth Framer-Motion transitions, optional
colour-temperature slider. Built as a React component hosted inside a web
component so it drops into any dashboard as a resource.

![preview](test/smoke.png)

## Two ways to ship it

### A. No-build single file (simplest) — `kokonut-light-card.js`
This file imports React + Motion from a pinned ESM CDN at load time, so there is
nothing to compile. Host the repo on GitHub and load it via jsDelivr:

1. Commit this repo and tag a release, e.g. `v0.1.0`.
2. Add a Lovelace resource (Settings → Dashboards → ⋮ → Resources, or YAML):
   ```yaml
   url: https://cdn.jsdelivr.net/gh/<user>/<repo>@v0.1.0/kokonut-light-card.js
   type: module
   ```
   Pin the tag (not `@latest`) and bump it on changes — jsDelivr and HA both
   cache aggressively.
3. Use it on a dashboard:
   ```yaml
   type: custom:kokonut-light-card
   entity: light.living_room
   name: Living Room   # optional
   ```

> Trade-off: the card fetches React/Motion from `esm.sh` at runtime, so it needs
> internet and depends on that CDN. For a fully self-contained file, use option B.

### B. Self-contained bundle (robust) — the Vite project
`src/` + `vite.config.js` build everything (React, ReactDOM, Motion, CSS) into a
single file with no external runtime dependency. The build needs npm, so run it
in CI or on your machine:

```bash
npm ci
npm run build        # → dist/kokonut-light-card.js
```

The included GitHub Action (`.github/workflows/release.yml`) builds and attaches
`dist/kokonut-light-card.js` to a GitHub Release whenever you push a `v*` tag —
then serve that release asset (or the committed `dist/` file) via jsDelivr the
same way as option A.

## HACS install (either option)
Add this repo as a **custom repository** (category: *Dashboard*/*Lovelace*) in
HACS. HACS downloads the file locally, serves it from your instance, and
registers the resource — no external CDN at runtime.

## Config options
| Option   | Required | Description                               |
|----------|----------|-------------------------------------------|
| `entity` | yes      | A `light.*` entity                        |
| `name`   | no       | Override the displayed name               |

## Notes
- The card reads `supported_color_modes` to decide whether to show brightness
  and colour-temperature controls, so plain on/off lights render as a toggle.
- Loading third-party JS into your HA frontend runs it with your session —
  review the version you pin.
