# Screen Visualizer WordPress Plugin

An AI-powered WordPress plugin that lets homeowners capture or upload patio photos, then generate realistic screen mockups for exterior and interior views.

## Features

- **Camera Capture**: Take a patio photo directly from a device camera
- **Drag & Drop Upload**: Easily upload patio photos
- **Screen Color Prompt**: Enter the desired screen color and send it into the generation prompt
- **Opening-Aware Generation**: Uses a vision prepass plus prompt rules to better isolate the main patio opening
- **Door-Safe Prompting**: Keeps nearby doors and door frames untouched
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
- Serves the page over HTTP so browser fetches work like a real webpage
- Proxies AI requests server-side through the same OpenRouter flow
- Set `SCREEN_VISUALIZER_OPENROUTER_API_KEY` in your shell before starting the server
- Useful for testing uploads, camera capture, prompt behavior, and result rendering without WordPress

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
- **AI Generation**: OpenRouter image generation with prompt steering
- **AI Detection**: OpenRouter vision prepass for patio-opening hints
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
│   │   ├── ImageUploader.jsx
│   │   ├── VisualizerCanvas.jsx  # Legacy canvas visualizer
│   │   └── ControlPanel.jsx      # Legacy canvas controls
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
