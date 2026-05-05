/**
 * Screen Renderer Utility
 * Deterministically renders a photorealistic screen overlay onto a canvas.
 * Supports multi-panel screens via dividers.
 *
 * Frame bar proportions (real retractable screen ratios):
 *   - Top Cassette:  thickest  (~20-24px at 1024px)  — houses the motor/roller
 *   - Bottom Rail:   medium    (~12-14px)             — weighted bar
 *   - Side Tracks:   slimmest  (~8-10px)              — guide channels
 *   - Center Posts:  slightly thicker than tracks      — shared divider posts
 */

const hexToRgba = ( hex, alpha ) => {
	const r = parseInt( hex.slice( 1, 3 ), 16 );
	const g = parseInt( hex.slice( 3, 5 ), 16 );
	const b = parseInt( hex.slice( 5, 7 ), 16 );
	return `rgba(${ r }, ${ g }, ${ b }, ${ alpha })`;
};

const hexToRgb = ( hex ) => ( {
	r: parseInt( hex.slice( 1, 3 ), 16 ),
	g: parseInt( hex.slice( 3, 5 ), 16 ),
	b: parseInt( hex.slice( 5, 7 ), 16 ),
} );

const lighten = ( hex, amount ) => {
	const { r, g, b } = hexToRgb( hex );
	const clamp = ( v ) => Math.min( 255, Math.max( 0, Math.round( v ) ) );
	return `rgb(${ clamp( r + amount ) }, ${ clamp( g + amount ) }, ${ clamp(
		b + amount
	) })`;
};

const darken = ( hex, amount ) => lighten( hex, -amount );

/**
 * Resolves a color name or value to a hex string.
 */
const normalizeColor = ( colorName ) => {
	const map = {
		'dark bronze': '#5C4033',
		bronze: '#8C7853',
		black: '#1a1a1a',
		white: '#f5f5f5',
		gray: '#808080',
		grey: '#808080',
		silver: '#C0C0C0',
		beige: '#F5F5DC',
		brown: '#654321',
		charcoal: '#36454F',
		tan: '#D2B48C',
		cream: '#FFFDD0',
		ivory: '#FFFFF0',
		sand: '#C2B280',
		taupe: '#483C32',
		espresso: '#3C1414',
		chocolate: '#3D2B1F',
		pewter: '#8A8D8F',
		graphite: '#383838',
		slate: '#708090',
		navy: '#1B1F3B',
		forest: '#228B22',
		olive: '#556B2F',
		rust: '#8B4513',
		copper: '#B87333',
		champagne: '#F7E7CE',
		mocha: '#5D3A1A',
	};
	const cleaned = ( colorName || 'dark bronze' ).toLowerCase().trim();
	if ( map[ cleaned ] ) return map[ cleaned ];
	if ( /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test( cleaned ) ) {
		if ( cleaned.length === 4 ) {
			return `#${ cleaned[ 1 ] }${ cleaned[ 1 ] }${ cleaned[ 2 ] }${ cleaned[ 2 ] }${ cleaned[ 3 ] }${ cleaned[ 3 ] }`;
		}
		return cleaned;
	}
	try {
		const probe = document.createElement( 'canvas' );
		probe.width = 1;
		probe.height = 1;
		const pctx = probe.getContext( '2d' );
		pctx.fillStyle = '#000000';
		pctx.fillStyle = cleaned;
		const result = pctx.fillStyle;
		if ( result && result !== '#000000' ) return result;
	} catch {
		/* ignore */
	}
	return '#5C4033';
};

// Linear interpolation between two points at fraction t
const lerp = ( p1, p2, t ) => ( {
	x: p1.x + ( p2.x - p1.x ) * t,
	y: p1.y + ( p2.y - p1.y ) * t,
} );

// ─── Frame bar rendering (edge-following) ───────────────────────────

/**
 * Draws a 3D metallic bar along a line segment.
 */
const drawEdgeBar = ( ctx, x1, y1, x2, y2, thickness, baseColor ) => {
	ctx.save();
	const dx = x2 - x1,
		dy = y2 - y1;
	const len = Math.sqrt( dx * dx + dy * dy );
	if ( len < 1 ) {
		ctx.restore();
		return;
	}
	const nx = -dy / len,
		ny = dx / len;

	// Shadow
	ctx.save();
	ctx.shadowColor = 'rgba(0,0,0,0.3)';
	ctx.shadowBlur = 5;
	ctx.shadowOffsetX = nx * 2;
	ctx.shadowOffsetY = ny * 2 + 2;
	ctx.strokeStyle = 'rgba(0,0,0,0)';
	ctx.lineWidth = thickness;
	ctx.lineCap = 'butt';
	ctx.beginPath();
	ctx.moveTo( x1, y1 );
	ctx.lineTo( x2, y2 );
	ctx.stroke();
	ctx.restore();

	// Main body
	ctx.strokeStyle = baseColor;
	ctx.lineWidth = thickness;
	ctx.lineCap = 'butt';
	ctx.beginPath();
	ctx.moveTo( x1, y1 );
	ctx.lineTo( x2, y2 );
	ctx.stroke();

	// Highlight edge
	const hlOff = thickness * 0.35;
	ctx.strokeStyle = lighten( baseColor, 35 );
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.moveTo( x1 + nx * hlOff, y1 + ny * hlOff );
	ctx.lineTo( x2 + nx * hlOff, y2 + ny * hlOff );
	ctx.stroke();

	// Shadow edge
	ctx.strokeStyle = darken( baseColor, 40 );
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.moveTo( x1 - nx * hlOff, y1 - ny * hlOff );
	ctx.lineTo( x2 - nx * hlOff, y2 - ny * hlOff );
	ctx.stroke();

	// Specular highlight
	ctx.strokeStyle = lighten( baseColor, 55 );
	ctx.lineWidth = 0.8;
	ctx.globalAlpha = 0.5;
	ctx.beginPath();
	ctx.moveTo( x1 + nx * ( hlOff * 0.5 ), y1 + ny * ( hlOff * 0.5 ) );
	ctx.lineTo( x2 + nx * ( hlOff * 0.5 ), y2 + ny * ( hlOff * 0.5 ) );
	ctx.stroke();
	ctx.globalAlpha = 1.0;
	ctx.restore();
};

/**
 * Creates a seamless woven cloth pattern canvas
 */
const createClothPattern = ( hexColor, isInside, panelScale ) => {
	const pCanvas = document.createElement( 'canvas' );

	// Increased density: smaller base size.
	const baseSize = isInside ? 4 : 2.66; // Smaller sizes mean tighter weave
	// Scale relative to the size of the panel to maintain perspective, but clamp to minimum 2px
	const size = Math.max( 2, Math.round( baseSize * panelScale ) );

	pCanvas.width = size;
	pCanvas.height = size;
	const pCtx = pCanvas.getContext( '2d' );

	if ( ! isInside ) {
		// Opaque base for exterior
		pCtx.fillStyle = hexColor;
		pCtx.fillRect( 0, 0, size, size );
	} else {
		// Transparent base for interior
		pCtx.clearRect( 0, 0, size, size );
	}

	const shadow = darken( hexColor, 40 );
	const highlight = lighten( hexColor, 30 );

	// Horizontal thread
	pCtx.fillStyle = shadow;
	pCtx.globalAlpha = isInside ? 0.7 : 0.4;
	pCtx.fillRect( 0, 0, size, size * 0.3 );

	pCtx.fillStyle = highlight;
	pCtx.globalAlpha = isInside ? 0.4 : 0.2;
	pCtx.fillRect( 0, size * 0.3, size, size * 0.2 );

	// Vertical thread (interwoven)
	pCtx.fillStyle = shadow;
	pCtx.globalAlpha = isInside ? 0.8 : 0.5;
	pCtx.fillRect( size * 0.5, 0, size * 0.3, size );

	pCtx.fillStyle = highlight;
	pCtx.globalAlpha = isInside ? 0.4 : 0.2;
	pCtx.fillRect( size * 0.8, 0, size * 0.2, size );

	return pCanvas;
};

/**
 * Draws a fabric fill (clipped to a 4-point polygon).
 */
const drawFabricPanel = (
	ctx,
	panelPts,
	color,
	isInside,
	visibility,
	width,
	height
) => {
	ctx.save();
	ctx.beginPath();

	let minX = Infinity,
		maxX = -Infinity,
		minY = Infinity,
		maxY = -Infinity;

	panelPts.forEach( ( p, i ) => {
		if ( i === 0 ) ctx.moveTo( p.x, p.y );
		else ctx.lineTo( p.x, p.y );
		minX = Math.min( minX, p.x );
		maxX = Math.max( maxX, p.x );
		minY = Math.min( minY, p.y );
		maxY = Math.max( maxY, p.y );
	} );
	ctx.closePath();
	ctx.clip();

	// Scale based on the panel's physical size to adjust weave density dynamically.
	// If the panel is smaller (farther away or just small), the weave gets proportionally smaller.
	// A 1024px dimension is our baseline 1.0 scale.
	// We boost it slightly (e.g., x 1.5) to balance the baseSizes defined above.
	const panelScale = ( Math.max( maxX - minX, maxY - minY ) / 1024 ) * 1.5;

	if ( isInside ) {
		const meshOpacity = 1 - visibility / 100;

		// Base dark tint
		ctx.fillStyle = hexToRgba( color, meshOpacity * 0.4 );
		ctx.fillRect( 0, 0, width, height );

		// Cloth pattern
		const patternCanvas = createClothPattern( color, true, panelScale );
		ctx.fillStyle = ctx.createPattern( patternCanvas, 'repeat' );
		ctx.globalAlpha = meshOpacity * 1.5; // Boost pattern visibility relative to tint
		ctx.fillRect( 0, 0, width, height );
		ctx.globalAlpha = 1.0;
	} else {
		// Opaque cloth pattern
		const patternCanvas = createClothPattern( color, false, panelScale );
		ctx.fillStyle = ctx.createPattern( patternCanvas, 'repeat' );
		ctx.fillRect( 0, 0, width, height );

		// Subtle large-scale shadows/lighting for realism
		const minY = Math.min( ...panelPts.map( ( p ) => p.y ) );
		const maxY = Math.max( ...panelPts.map( ( p ) => p.y ) );
		const lightGrad = ctx.createLinearGradient( 0, minY, 0, maxY );
		lightGrad.addColorStop( 0, 'rgba(255,255,255,0.05)' );
		lightGrad.addColorStop( 0.3, 'rgba(0,0,0,0)' );
		lightGrad.addColorStop( 0.7, 'rgba(0,0,0,0)' );
		lightGrad.addColorStop( 1, 'rgba(0,0,0,0.15)' );
		ctx.fillStyle = lightGrad;
		ctx.fillRect( 0, 0, width, height );

		// Subtle horizontal roller waves
		const waveGrad = ctx.createLinearGradient( 0, minY, 0, maxY );
		for ( let i = 0; i <= 1; i += 0.1 ) {
			waveGrad.addColorStop(
				i,
				i % 0.2 === 0 ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.02)'
			);
		}
		ctx.fillStyle = waveGrad;
		ctx.fillRect( 0, 0, width, height );
	}

	ctx.restore();
};

// ─── Main export ────────────────────────────────────────────────────

/**
 * Renders a screen overlay with support for multi-panel splits.
 *
 * @param {Object} params
 * @param {number} params.width - canvas width
 * @param {number} params.height - canvas height
 * @param {Array} params.corners - [{x%, y%, label}, ...] TL, TR, BR, BL
 * @param {Array} params.dividers - [0.33, 0.66, ...] fractions for vertical splits
 * @param {string} params.viewType - 'inside' | 'outside'
 * @param {string} params.screenColor - e.g. 'dark bronze'
 * @param {number} params.interiorVisibility - 90 or 95
 * @returns {HTMLCanvasElement}
 */
export const renderScreenOverlay = ( {
	width,
	height,
	corners,
	dividers = [],
	viewType,
	screenColor,
	interiorVisibility,
} ) => {
	const canvas = document.createElement( 'canvas' );
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext( '2d' );

	const color = normalizeColor( screenColor );
	const isInside = viewType === 'inside';
	const visibility = interiorVisibility || 90;
	const scale = Math.min( width, height ) / 1024;

	// Convert percentage corners to pixel coordinates
	// TL=0, TR=1, BR=2, BL=3
	const pts = corners.map( ( c ) => ( {
		x: ( c.x / 100 ) * width,
		y: ( c.y / 100 ) * height,
	} ) );

	const sortedDivs = [ ...dividers ].sort( ( a, b ) => a - b );

	// Build panel boundaries: [0, div1, div2, ..., 1]
	const boundaries = [ 0, ...sortedDivs, 1 ];

	// ── 1. Draw fabric for each panel ─────────────────────────────────

	for ( let i = 0; i < boundaries.length - 1; i++ ) {
		const tLeft = boundaries[ i ];
		const tRight = boundaries[ i + 1 ];

		// 4 corners of this panel (interpolated from outer corners)
		const panelPts = [
			lerp( pts[ 0 ], pts[ 1 ], tLeft ), // panel TL
			lerp( pts[ 0 ], pts[ 1 ], tRight ), // panel TR
			lerp( pts[ 3 ], pts[ 2 ], tRight ), // panel BR
			lerp( pts[ 3 ], pts[ 2 ], tLeft ), // panel BL
		];

		drawFabricPanel(
			ctx,
			panelPts,
			color,
			isInside,
			visibility,
			width,
			height
		);
	}

	// ── 2. Draw frame bars ────────────────────────────────────────────

	const FRAME_COLOR = '#2a2a2a';
	const sizeMultiplier = isInside ? 0.8 : 1.0;
	const cassetteThick = Math.max(
		10,
		Math.round( 24 * scale * sizeMultiplier )
	);
	const railThick = Math.max( 6, Math.round( 14 * scale * sizeMultiplier ) );
	const trackThick = Math.max( 5, Math.round( 10 * scale * sizeMultiplier ) );
	const postThick = Math.max( 6, Math.round( 12 * scale * sizeMultiplier ) ); // center posts

	// Helper: extend one end of a segment
	const extendAsym = ( ax, ay, bx, by, startAmt, endAmt ) => {
		const dx = bx - ax,
			dy = by - ay;
		const len = Math.sqrt( dx * dx + dy * dy );
		if ( len < 1 ) return { x1: ax, y1: ay, x2: bx, y2: by };
		const ux = dx / len,
			uy = dy / len;
		return {
			x1: ax - ux * startAmt,
			y1: ay - uy * startAmt,
			x2: bx + ux * endAmt,
			y2: by + uy * endAmt,
		};
	};
	const extend = ( ax, ay, bx, by, amt ) =>
		extendAsym( ax, ay, bx, by, amt, amt );

	// Outer left track (TL→BL), extend up into cassette only
	const leftExt = extendAsym(
		pts[ 0 ].x,
		pts[ 0 ].y,
		pts[ 3 ].x,
		pts[ 3 ].y,
		cassetteThick * 0.6,
		0
	);
	drawEdgeBar(
		ctx,
		leftExt.x1,
		leftExt.y1,
		leftExt.x2,
		leftExt.y2,
		trackThick,
		FRAME_COLOR
	);

	// Outer right track (TR→BR), extend up into cassette only
	const rightExt = extendAsym(
		pts[ 1 ].x,
		pts[ 1 ].y,
		pts[ 2 ].x,
		pts[ 2 ].y,
		cassetteThick * 0.6,
		0
	);
	drawEdgeBar(
		ctx,
		rightExt.x1,
		rightExt.y1,
		rightExt.x2,
		rightExt.y2,
		trackThick,
		FRAME_COLOR
	);

	// Center post tracks (one per divider)
	sortedDivs.forEach( ( t ) => {
		const divTop = lerp( pts[ 0 ], pts[ 1 ], t );
		const divBot = lerp( pts[ 3 ], pts[ 2 ], t );
		const divExt = extendAsym(
			divTop.x,
			divTop.y,
			divBot.x,
			divBot.y,
			cassetteThick * 0.6,
			0
		);
		drawEdgeBar(
			ctx,
			divExt.x1,
			divExt.y1,
			divExt.x2,
			divExt.y2,
			postThick,
			FRAME_COLOR
		);
	} );

	// Top cassette (full width TL→TR), extends past outer tracks
	const topExt = extend(
		pts[ 0 ].x,
		pts[ 0 ].y,
		pts[ 1 ].x,
		pts[ 1 ].y,
		trackThick * 0.6
	);
	drawEdgeBar(
		ctx,
		topExt.x1,
		topExt.y1,
		topExt.x2,
		topExt.y2,
		cassetteThick,
		FRAME_COLOR
	);

	// Bottom rail (full width BL→BR), extends past outer tracks
	const bottomExt = extend(
		pts[ 3 ].x,
		pts[ 3 ].y,
		pts[ 2 ].x,
		pts[ 2 ].y,
		trackThick * 0.6
	);
	drawEdgeBar(
		ctx,
		bottomExt.x1,
		bottomExt.y1,
		bottomExt.x2,
		bottomExt.y2,
		railThick,
		FRAME_COLOR
	);

	return canvas;
};
