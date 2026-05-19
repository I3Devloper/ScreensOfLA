/**
 * Screen Renderer Utility
 * Deterministically renders a photorealistic screen overlay onto a canvas.
 * Supports multi-panel screens via dividers and beams.
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

/** Resolves a color name or value to a hex string. */
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
	if ( map[ cleaned ] ) {
		return map[ cleaned ];
	}
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
		if ( result && result !== '#000000' ) {
			return result;
		}
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

// ─── Frame bar rendering ────────────────────────────────────────────

/** Draws a 3D metallic bar along a line segment. */
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

/** Creates a seamless woven cloth pattern canvas. */
const createClothPattern = ( hexColor, isInside, panelScale ) => {
	const pCanvas = document.createElement( 'canvas' );

	const baseSize = isInside ? 4 : 2.66;
	const size = Math.max( 2, Math.round( baseSize * panelScale ) );

	pCanvas.width = size;
	pCanvas.height = size;
	const pCtx = pCanvas.getContext( '2d' );

	if ( ! isInside ) {
		pCtx.fillStyle = hexColor;
		pCtx.fillRect( 0, 0, size, size );
	} else {
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

/** Draws a fabric fill clipped to a 4-point polygon. */
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
		if ( i === 0 ) {
			ctx.moveTo( p.x, p.y );
		} else {
			ctx.lineTo( p.x, p.y );
		}
		minX = Math.min( minX, p.x );
		maxX = Math.max( maxX, p.x );
		minY = Math.min( minY, p.y );
		maxY = Math.max( maxY, p.y );
	} );
	ctx.closePath();
	ctx.clip();

	const panelScale = ( Math.max( maxX - minX, maxY - minY ) / 1024 ) * 1.5;

	if ( isInside ) {
		const meshOpacity = 1 - visibility / 100;

		ctx.fillStyle = hexToRgba( color, meshOpacity * 0.4 );
		ctx.fillRect( 0, 0, width, height );

		const patternCanvas = createClothPattern( color, true, panelScale );
		ctx.fillStyle = ctx.createPattern( patternCanvas, 'repeat' );
		ctx.globalAlpha = meshOpacity * 1.5;
		ctx.fillRect( 0, 0, width, height );
		ctx.globalAlpha = 1.0;
	} else {
		const patternCanvas = createClothPattern( color, false, panelScale );
		ctx.fillStyle = ctx.createPattern( patternCanvas, 'repeat' );
		ctx.fillRect( 0, 0, width, height );

		const lightGrad = ctx.createLinearGradient( 0, minY, 0, maxY );
		lightGrad.addColorStop( 0, 'rgba(255,255,255,0.05)' );
		lightGrad.addColorStop( 0.3, 'rgba(0,0,0,0)' );
		lightGrad.addColorStop( 0.7, 'rgba(0,0,0,0)' );
		lightGrad.addColorStop( 1, 'rgba(0,0,0,0.15)' );
		ctx.fillStyle = lightGrad;
		ctx.fillRect( 0, 0, width, height );

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

/** Draws a 3D structural pillar at a divider position. */
const drawPillar = ( ctx, x1, y1, x2, y2, thickness, baseColor ) => {
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

	ctx.save();
	ctx.shadowColor = 'rgba(0,0,0,0.4)';
	ctx.shadowBlur = 8;
	ctx.shadowOffsetX = 3;
	ctx.shadowOffsetY = 2;
	ctx.strokeStyle = 'rgba(0,0,0,0)';
	ctx.lineWidth = thickness;
	ctx.lineCap = 'butt';
	ctx.beginPath();
	ctx.moveTo( x1, y1 );
	ctx.lineTo( x2, y2 );
	ctx.stroke();
	ctx.restore();

	ctx.strokeStyle = baseColor;
	ctx.lineWidth = thickness;
	ctx.lineCap = 'butt';
	ctx.beginPath();
	ctx.moveTo( x1, y1 );
	ctx.lineTo( x2, y2 );
	ctx.stroke();

	const innerOff = thickness * 0.25;
	ctx.strokeStyle = darken( baseColor, 35 );
	ctx.lineWidth = Math.max( 2, thickness * 0.35 );
	ctx.beginPath();
	ctx.moveTo( x1 - nx * innerOff, y1 - ny * innerOff );
	ctx.lineTo( x2 - nx * innerOff, y2 - ny * innerOff );
	ctx.stroke();

	const hlOff = thickness * 0.38;
	ctx.strokeStyle = lighten( baseColor, 40 );
	ctx.lineWidth = Math.max( 1.5, thickness * 0.2 );
	ctx.beginPath();
	ctx.moveTo( x1 + nx * hlOff, y1 + ny * hlOff );
	ctx.lineTo( x2 + nx * hlOff, y2 + ny * hlOff );
	ctx.stroke();

	ctx.strokeStyle = lighten( baseColor, 70 );
	ctx.lineWidth = Math.max( 0.8, thickness * 0.1 );
	ctx.globalAlpha = 0.6;
	ctx.beginPath();
	ctx.moveTo( x1 + nx * ( hlOff * 0.6 ), y1 + ny * ( hlOff * 0.6 ) );
	ctx.lineTo( x2 + nx * ( hlOff * 0.6 ), y2 + ny * ( hlOff * 0.6 ) );
	ctx.stroke();
	ctx.globalAlpha = 1.0;

	ctx.restore();
};

// ─── Main export ────────────────────────────────────────────────────

/** Renders a screen overlay with multi-panel splits and beams. */
export const renderScreenOverlay = ( {
	width,
	height,
	corners,
	dividers = [],
	beams = [],
	viewType,
	screenColor,
	interiorVisibility,
	retractLevels = [],
	targetCanvas = null,
} ) => {
	const canvas = targetCanvas || document.createElement( 'canvas' );
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext( '2d' );
	ctx.clearRect( 0, 0, width, height );

	const color = normalizeColor( screenColor );
	const isInside = viewType === 'inside';
	const visibility = interiorVisibility || 90;
	const scale = Math.min( width, height ) / 1024;

	const pts = corners.map( ( c ) => ( {
		x: ( c.x / 100 ) * width,
		y: ( c.y / 100 ) * height,
	} ) );

	const sortedDivs = [ ...dividers ].sort( ( a, b ) => a - b );
	const sortedBeams = [ ...beams ].sort( ( a, b ) => a.left - b.left );

	// Build all boundaries: splits + beam edges
	const allBoundaries = [ 0, ...sortedDivs ];
	sortedBeams.forEach( ( beam ) => {
		allBoundaries.push( beam.left );
		allBoundaries.push( beam.right );
	} );
	allBoundaries.push( 1 );
	allBoundaries.sort( ( a, b ) => a - b );

	// Check if we're in multi-panel mode
	const isMultiPanel = sortedDivs.length > 0 || sortedBeams.length > 0;

	// Helper to check if a panel range falls within a beam gap
	const isBeamGap = ( tLeft, tRight ) => {
		return sortedBeams.some( ( beam ) => {
			return tLeft >= beam.left - 0.001 && tRight <= beam.right + 0.001;
		} );
	};

	// Helper to get retract level for a panel index
	const getRetractLevel = ( panelIdx ) => {
		if ( ! Array.isArray( retractLevels ) || retractLevels.length === 0 ) {
			return 1;
		}
		const idx = Math.min( panelIdx, retractLevels.length - 1 );
		return Math.max( 0, Math.min( 1, retractLevels[ idx ] ?? 1 ) );
	};

	// ── 1. Draw fabric for each panel ─────────────────────────────────

	let panelIdx = 0;
	for ( let i = 0; i < allBoundaries.length - 1; i++ ) {
		const tLeft = allBoundaries[ i ];
		const tRight = allBoundaries[ i + 1 ];

		if ( isBeamGap( tLeft, tRight ) ) {
			continue;
		}

		const r = getRetractLevel( panelIdx );
		const panelTL = lerp( pts[ 0 ], pts[ 1 ], tLeft );
		const panelTR = lerp( pts[ 0 ], pts[ 1 ], tRight );
		const panelBR = lerp( pts[ 3 ], pts[ 2 ], tRight );
		const panelBL = lerp( pts[ 3 ], pts[ 2 ], tLeft );

		const panelPts = [
			panelTL,
			panelTR,
			lerp( panelBR, panelTR, r ),
			lerp( panelBL, panelTL, r ),
		];

		if ( r < 0.98 ) {
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
		panelIdx++;
	}

	// ── 2. Draw frame bars ────────────────────────────────────────────

	const FRAME_COLOR = '#2a2a2a';
	const sizeMultiplier = isInside ? 0.8 : 1.0;
	const cassetteThick = Math.max(
		10,
		Math.round( 24 * scale * sizeMultiplier )
	);
	const railThick = Math.max( 6, Math.round( 14 * scale * sizeMultiplier ) );
	const trackThick = Math.max( 7, Math.round( 14 * scale * sizeMultiplier ) );

	const extendAsym = ( ax, ay, bx, by, startAmt, endAmt ) => {
		const dx = bx - ax,
			dy = by - ay;
		const len = Math.sqrt( dx * dx + dy * dy );
		if ( len < 1 ) {
			return { x1: ax, y1: ay, x2: bx, y2: by };
		}
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

	const drawTrack = ( x1, y1, x2, y2 ) => {
		const ext = extendAsym(
			x1,
			y1,
			x2,
			y2,
			cassetteThick * 0.6,
			trackThick * 0.4
		);
		drawEdgeBar(
			ctx,
			ext.x1,
			ext.y1,
			ext.x2,
			ext.y2,
			trackThick,
			FRAME_COLOR
		);
	};

	const drawBottomRail = ( x1, y1, x2, y2 ) => {
		const ext = extend( x1, y1, x2, y2, trackThick * 0.6 );
		drawEdgeBar(
			ctx,
			ext.x1,
			ext.y1,
			ext.x2,
			ext.y2,
			railThick,
			FRAME_COLOR
		);
	};

	const drawCassette = ( x1, y1, x2, y2 ) => {
		const ext = extend( x1, y1, x2, y2, trackThick * 0.6 );
		drawEdgeBar(
			ctx,
			ext.x1,
			ext.y1,
			ext.x2,
			ext.y2,
			cassetteThick,
			FRAME_COLOR
		);
	};

	if ( isMultiPanel ) {
		// Segmented mode: independent panels with their own frames

		// Draw pillars at divider positions (if any)
		if ( sortedDivs.length > 0 ) {
			const PILLAR_COLOR = '#9a948b';
			const pillarThick = Math.max( 16, Math.round( 34 * scale ) );

			sortedDivs.forEach( ( t ) => {
				const pTop = lerp( pts[ 0 ], pts[ 1 ], t );
				const pBot = lerp( pts[ 3 ], pts[ 2 ], t );
				const pExt = extendAsym(
					pTop.x,
					pTop.y,
					pBot.x,
					pBot.y,
					cassetteThick * 0.5,
					cassetteThick * 0.2
				);
				drawPillar(
					ctx,
					pExt.x1,
					pExt.y1,
					pExt.x2,
					pExt.y2,
					pillarThick,
					PILLAR_COLOR
				);
			} );
		}

		// Draw beam side bars (regular tracks at beam edges)
		sortedBeams.forEach( ( beam ) => {
			const leftTop = lerp( pts[ 0 ], pts[ 1 ], beam.left );
			const leftBot = lerp( pts[ 3 ], pts[ 2 ], beam.left );
			const rightTop = lerp( pts[ 0 ], pts[ 1 ], beam.right );
			const rightBot = lerp( pts[ 3 ], pts[ 2 ], beam.right );

			drawTrack( leftTop.x, leftTop.y, leftBot.x, leftBot.y );
			drawTrack( rightTop.x, rightTop.y, rightBot.x, rightBot.y );
		} );

		// Draw frame for each panel — skip beam gaps
		panelIdx = 0;
		for ( let i = 0; i < allBoundaries.length - 1; i++ ) {
			const tLeft = allBoundaries[ i ];
			const tRight = allBoundaries[ i + 1 ];

			if ( isBeamGap( tLeft, tRight ) ) {
				continue;
			}

			const r = getRetractLevel( panelIdx );
			const panelTL = lerp( pts[ 0 ], pts[ 1 ], tLeft );
			const panelTR = lerp( pts[ 0 ], pts[ 1 ], tRight );
			const panelBR = lerp( pts[ 3 ], pts[ 2 ], tRight );
			const panelBL = lerp( pts[ 3 ], pts[ 2 ], tLeft );
			const retBR = lerp( panelBR, panelTR, r );
			const retBL = lerp( panelBL, panelTL, r );

			drawCassette( panelTL.x, panelTL.y, panelTR.x, panelTR.y );
			drawTrack( panelTL.x, panelTL.y, panelBL.x, panelBL.y );
			drawTrack( panelTR.x, panelTR.y, panelBR.x, panelBR.y );
			if ( r < 0.98 ) {
				drawBottomRail( retBL.x, retBL.y, retBR.x, retBR.y );
			}
			panelIdx++;
		}
	} else {
		// Single panel mode: side tracks stay fixed, only bottom rail moves
		const r = getRetractLevel( 0 );

		const newBL = lerp( pts[ 3 ], pts[ 0 ], r );
		const newBR = lerp( pts[ 2 ], pts[ 1 ], r );

		drawCassette( pts[ 0 ].x, pts[ 0 ].y, pts[ 1 ].x, pts[ 1 ].y );
		drawTrack( pts[ 0 ].x, pts[ 0 ].y, pts[ 3 ].x, pts[ 3 ].y );
		drawTrack( pts[ 1 ].x, pts[ 1 ].y, pts[ 2 ].x, pts[ 2 ].y );
		if ( r < 0.98 ) {
			drawBottomRail( newBL.x, newBL.y, newBR.x, newBR.y );
		}
	}

	return canvas;
};
