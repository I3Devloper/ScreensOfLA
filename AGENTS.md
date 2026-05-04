# AGENTS.md — Screen Visualizer

WordPress plugin (React 18 + Tailwind) that generates AI patio-screen mockups via OpenRouter. Shortcode: `[screen_visualizer]`.

## Build & dev commands

- `npm start` — watch mode (uses `@wordpress/scripts`)
- `npm run build` — production build to `assets/build/`
- `npm run test:web` — local test server on `http://127.0.0.1:4173/test.html`
- `npm run test:web:debug` — same with `DEBUG=1`
- `npm run lint:js` / `npm run lint:css` / `npm run format`

**Must build before WordPress loads the plugin.** PHP checks for `assets/build/index.asset.php` and dies if missing.

## Local test server

`test-server.mjs` runs a standalone Node server so you can test without WordPress.

- Needs an OpenRouter API key from one of:
  - `SCREEN_VISUALIZER_OPENROUTER_API_KEY` env var (preferred)
  - `OPENROUTER_API_KEY` env var
  - Hardcoded key in `screen-visualizer.php` (falls back)
- Serves `test.html`, proxies AI requests to `/wp-json/screen-visualizer/v1/openrouter`
- On Windows, `set SCREEN_VISUALIZER_OPENROUTER_API_KEY=sk-...` before `npm run test:web`

## Architecture gotchas

- **WordPress element wrapper**: Production code imports React from `@wordpress/element`, not `react` directly. `test.html` mocks `window.wp.element` with global React/ReactDOM so the same bundle works locally.
- **OpenRouter proxy**: Frontend never calls OpenRouter directly. It POSTs to `/wp-json/screen-visualizer/v1/openrouter`. In WordPress this is handled by PHP (`screen-visualizer.php`). Locally it’s handled by `test-server.mjs`.
- **Allowed models whitelist**: `screen-visualizer.php` restricts the `model` field to a hardcoded list. If you add a new model on the frontend, you must also add it to the PHP `$allowed_models` array or the proxy rejects it.
- **Webpack aliases**: `@components`, `@hooks`, `@utils`, `@styles` → `src/{components,hooks,utils,styles}`.
- **Babel**: `@wordpress/babel-preset-default` with `modules: false`.
- **Tailwind content**: `./src/**/*.{js,jsx,ts,tsx}` and `./src/styles/**/*.{css,scss}`.

## AI generation flow

1. Vision prepass (`detectAllOpenings`) → returns corner candidates.
2. User picks/selects an opening.
3. Deterministic overlay rendered to canvas (`renderScreenOverlay`).
4. Overlay baked onto working image (`bakeOverlay`).
5. Cropped composite sent to OpenRouter for refinement (`enhanceScreenImage`).
6. Result composited back and watermarked.

**Diagnostic flag**: `DIAGNOSTIC_SKIP_AI` in `src/App.jsx` skips the AI call and shows the raw baked composite + watermark. Useful for alignment debugging.

## Key files

- `screen-visualizer.php` — WordPress plugin entry, shortcode, REST route, API key, model whitelist.
- `src/index.js` — React mount point (expects `#screen-visualizer-root`).
- `src/App.jsx` — Main app; handles outside/inside state, generation pipeline.
- `src/utils/openrouterProxy.js` — Figures out the proxy URL from WP globals or falls back to `/wp-json/...`.
- `test-server.mjs` — Standalone dev server + OpenRouter proxy.
- `test.html` — Local test page that loads `node_modules/react/umd/` globals and the built bundle.
- `webpack.config.js` — Extends `@wordpress/scripts/config/webpack.config`, changes entry/output/aliases.
