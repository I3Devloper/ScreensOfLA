# Screen Visualizer WordPress Plugin

A WordPress plugin that lets homeowners capture or upload patio photos, mark their opening, and preview realistic motorized-screen mockups for exterior and interior views. Rendering is deterministic and runs entirely in the browser — no AI or network calls.

## Features

- **Camera Capture**: Take a patio photo directly from a device camera
- **Drag & Drop Upload**: Easily upload patio photos
- **Opening Selector**: Drag corner pins to match the patio opening, with optional splits and structural beams for multi-panel screens
- **Screen Color**: Pick a preset frame color or enter a custom value
- **Retract Control**: Per-panel sliders to preview the screen open/closed
- **Video Export**: Record a short animation of the screen retracting
- **Responsive Design**: Mobile-friendly "Bento-box" UI
- **WordPress Integration**: Simple shortcode `[screen_visualizer]`

## Installation

1. Clone or download this repository into your WordPress plugins folder:
   ```
   wp-content/plugins/screen-visualizer/
   ```

2. Install dependencies:
   ```bash
   cd screen-visualizer
   npm install
   ```

3. Build the plugin:
   ```bash
   npm run build
   ```

4. Activate the plugin in WordPress Admin under Plugins.

5. Add the shortcode to any page or post:
   ```
   [screen_visualizer]
   ```

## Development

### Start Development Mode

```bash
npm start
```

This builds assets in watch mode for development.

### Build for Production

```bash
npm run build
```

### Local Test Server

Run the local test server, then open the test page in your browser:

```bash
npm run test:web
```

Then visit:

```text
http://127.0.0.1:4173/test.html
```

- Uses local React/ReactDOM files from `node_modules`
- Serves the page over HTTP so browser APIs work like a real webpage
- Useful for testing uploads, camera capture, opening selection, and rendering without WordPress

### Lint Code

```bash
npm run lint:js
npm run lint:css
```

### Format Code

```bash
npm run format
```

## Shortcode Options

```
[screen_visualizer width="100%" height="600px"]
```

- `width`: Canvas container width (default: 100%)
- `height`: Canvas container height hint (default: 600px)

## Technical Stack

- **Frontend**: React 18
- **Styling**: Tailwind CSS
- **Rendering**: Deterministic HTML canvas overlay (no AI, no network)
- **Build**: @wordpress/scripts with Webpack

## Project Structure

```
screen-visualizer/
├── screen-visualizer.php    # Main plugin file
├── package.json             # Dependencies
├── webpack.config.js        # Webpack configuration
├── tailwind.config.js       # Tailwind configuration
├── src/
│   ├── index.js             # React entry point
│   ├── App.jsx              # Main app component
│   ├── components/
│   │   ├── ImageUploader.jsx     # Upload + camera capture
│   │   └── OpeningSelector.jsx   # Corner-pin / split / beam editor
│   ├── hooks/
│   │   └── useViewState.js
│   ├── utils/
│   │   ├── screenRenderer.js     # Canvas overlay renderer
│   │   ├── imageUtils.js         # Resize + composite helpers
│   │   ├── imageCompositor.js    # Watermark stamping
│   │   └── videoExporter.js      # Retract animation recorder
│   └── styles/
│       └── app.scss         # Main styles
└── assets/build/            # Compiled output (generated)
```

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## License

GPL-2.0-or-later

## Author

Screens of LA - https://screensofla.com
