# AGENTS.md — Screen Visualizer

WordPress plugin (React 18 + Tailwind) that deterministically renders patio-screen mockups on a canvas. Shortcode: `[screen_visualizer]`.

## Build & dev commands

- `npm start` — watch mode (`@wordpress/scripts`)
- `npm run build` — production build to `assets/build/`
- `npm run test:web` — local static server on `http://127.0.0.1:4173/test.html`
- `npm run test:web:debug` — same with `DEBUG=1` (uses Windows `set` syntax in `package.json`; on macOS/Linux run `DEBUG=1 node ./test-server.mjs` directly)
- `npm run lint:js` / `npm run lint:css` / `npm run format`

**Must build before WordPress loads the plugin.** `screen-visualizer.php` checks for `assets/build/index.asset.php` and dies if missing. The `assets/build/` directory is gitignored, so a fresh clone always requires `npm run build`.

## Local test server

`test-server.mjs` is a plain static file server. It serves `test.html` and built assets from the repo root. It does **not** proxy AI requests — the current app has no backend API calls.

## Architecture gotchas

- **WordPress element wrapper**: Production code imports React from `@wordpress/element`, not `react` directly. `test.html` mocks `window.wp.element` with global React/ReactDOM so the same bundle works locally.
- **No AI/OpenRouter in current code**: `App.jsx` is purely deterministic canvas-based. The flow is: resize image → `renderScreenOverlay` (canvas) → `bakeOverlay` (composite) → `addWatermark`. No network calls, no vision prepass, no model whitelists.
- **Working image size**: `createWorkingImage` downsizes uploads to a max dimension of 1024px. All downstream canvas rendering assumes this resolution.
- **Webpack aliases**: `@components`, `@hooks`, `@utils`, `@styles` → `src/{components,hooks,utils,styles}`.
- **Babel**: `@wordpress/babel-preset-default` via `babel-loader` in `webpack.config.js`.
- **Tailwind content**: `./src/**/*.{js,jsx,ts,tsx}` and `./src/styles/**/*.{css,scss}`.
- **Legacy components**: `VisualizerCanvas.jsx` and `ControlPanel.jsx` exist in `src/components/` but are unused by the current `App.jsx`.

## Key files

- `screen-visualizer.php` — WordPress plugin entry, shortcode, asset enqueueing.
- `src/index.js` — React mount point (expects `#screen-visualizer-root`).
- `src/App.jsx` — Main app; handles outside/inside state, generation pipeline.
- `src/utils/screenRenderer.js` — Deterministic canvas overlay renderer (frames, fabric weave, dividers).
- `src/utils/imageUtils.js` — `createWorkingImage` (1024px resize), `bakeOverlay`.
- `src/utils/imageCompositor.js` — `addWatermark` and legacy compositing helpers.
- `src/components/OpeningSelector.jsx` — Canvas-based polygon editor with draggable pins and vertical split dividers.
- `test-server.mjs` — Standalone static dev server.
- `test.html` — Local test page that loads `node_modules/react/umd/` globals and the built bundle.
- `webpack.config.js` — Extends `@wordpress/scripts/config/webpack.config`, changes entry/output/aliases.
