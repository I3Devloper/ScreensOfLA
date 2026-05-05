/**
 * Screen Visualizer - React Entry Point
 * Mounts the React app to the WordPress shortcode container
 */
import { createRoot } from '@wordpress/element';
import App from './App';
import './styles/app.scss';

// Wait for DOM to be ready
function initScreenVisualizer() {
	const container = document.getElementById( 'screen-visualizer-root' );

	if ( container ) {
		const root = createRoot( container );
		root.render( <App /> );
	}
}

// Initialize on DOMContentLoaded
if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', initScreenVisualizer );
} else {
	initScreenVisualizer();
}
