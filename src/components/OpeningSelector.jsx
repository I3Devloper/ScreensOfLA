/**
 * OpeningSelector - Canvas-based polygon editor for patio opening selection.
 *
 * Mobile-friendly: 4 pins pre-placed as a centered rectangle on image load.
 * User drags each pin to the correct corner.
 *
 * Split feature: "Add Split" inserts a vertical divider creating multi-panel screens.
 * Dividers are draggable horizontally. Each split adds another panel.
 */
import { useState, useEffect, useRef, useCallback } from '@wordpress/element';

const PIN_RADIUS = 10;
const PIN_HIT_RADIUS = 20;
const DIVIDER_HIT_DIST = 12;

// Linear interpolation between two points at fraction t
const lerp = ( p1, p2, t ) => ( {
	x: p1.x + ( p2.x - p1.x ) * t,
	y: p1.y + ( p2.y - p1.y ) * t,
} );

// Distance from point (px,py) to line segment (x1,y1)-(x2,y2)
const pointToSegDist = ( px, py, x1, y1, x2, y2 ) => {
	const dx = x2 - x1,
		dy = y2 - y1;
	const lenSq = dx * dx + dy * dy;
	if ( lenSq === 0 ) return Math.hypot( px - x1, py - y1 );
	const t = Math.max(
		0,
		Math.min( 1, ( ( px - x1 ) * dx + ( py - y1 ) * dy ) / lenSq )
	);
	return Math.hypot( px - ( x1 + t * dx ), py - ( y1 + t * dy ) );
};

// Project point onto TL→TR line to get fraction (for divider dragging)
const projectToFraction = ( px, py, tl, tr ) => {
	const dx = tr.x - tl.x,
		dy = tr.y - tl.y;
	const lenSq = dx * dx + dy * dy;
	if ( lenSq === 0 ) return 0.5;
	return ( ( px - tl.x ) * dx + ( py - tl.y ) * dy ) / lenSq;
};

const getMousePos = ( canvas, evt ) => {
	const rect = canvas.getBoundingClientRect();
	const dpr = window.devicePixelRatio || 1;
	const scaleX = canvas.width / dpr / rect.width;
	const scaleY = canvas.height / dpr / rect.height;
	const clientX = evt.touches ? evt.touches[ 0 ].clientX : evt.clientX;
	const clientY = evt.touches ? evt.touches[ 0 ].clientY : evt.clientY;
	return {
		x: ( clientX - rect.left ) * scaleX,
		y: ( clientY - rect.top ) * scaleY,
	};
};

const pct = ( val, total ) => ( val / total ) * 100;

const OpeningSelector = ( {
	imageUrl,
	onChange,
	disabled = false,
	viewType = 'outside',
} ) => {
	const canvasRef = useRef( null );
	const containerRef = useRef( null );
	const [ imgSize, setImgSize ] = useState( { width: 0, height: 0 } );
	const [ pins, setPins ] = useState( [] );
	const [ dividers, setDividers ] = useState( [] ); // array of fractions 0-1 (sorted)
	const [ dragging, setDragging ] = useState( null ); // { type: 'pin'|'divider', index }
	const imageRef = useRef( null );
	const onChangeRef = useRef( onChange );
	onChangeRef.current = onChange;

	// Emit changes to parent
	const emitChange = useCallback(
		( newPins, newDividers ) => {
			if ( newPins.length === 4 ) {
				onChangeRef.current( newPins, newDividers || [] );
			}
		},
		[]
	);

	// Load image and auto-place pins
	useEffect( () => {
		if ( ! imageUrl ) return;
		let cancelled = false;
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => {
			if ( cancelled ) return;
			imageRef.current = img;
			const maxW = containerRef.current?.clientWidth || 800;
			const aspect = img.naturalWidth / img.naturalHeight;
			const width = Math.min( maxW, img.naturalWidth );
			const height = width / aspect;
			setImgSize( { width, height } );

			// Auto-place 4 pins as a centered rectangle
			const defaultPins = [
				{ x: 25, y: 15, label: 'TL' },
				{ x: 75, y: 15, label: 'TR' },
				{ x: 75, y: 85, label: 'BR' },
				{ x: 25, y: 85, label: 'BL' },
			];
			setPins( defaultPins );
			setDividers( [] );
			onChangeRef.current( defaultPins, [] );
		};
		img.src = imageUrl;
		return () => {
			cancelled = true;
		};
	}, [ imageUrl ] );

	// ── Canvas drawing ────────────────────────────────────────────────

	useEffect( () => {
		const canvas = canvasRef.current;
		if ( ! canvas || ! imageRef.current ) return;

		const dpr = window.devicePixelRatio || 1;
		const logicalW = imgSize.width;
		const logicalH = imgSize.height;

		if (
			canvas.width !== logicalW * dpr ||
			canvas.height !== logicalH * dpr
		) {
			canvas.width = logicalW * dpr;
			canvas.height = logicalH * dpr;
		}

		const ctx = canvas.getContext( '2d' );
		ctx.setTransform( dpr, 0, 0, dpr, 0, 0 );

		const W = logicalW,
			H = logicalH;

		ctx.clearRect( 0, 0, W, H );
		ctx.drawImage( imageRef.current, 0, 0, W, H );

		if ( pins.length !== 4 ) return;

		const p = pins.map( ( pin ) => ( {
			x: ( pin.x / 100 ) * W,
			y: ( pin.y / 100 ) * H,
		} ) );

		// TL=0, TR=1, BR=2, BL=3

		// Draw polygon outline
		ctx.save();
		ctx.beginPath();
		p.forEach( ( pt, i ) => {
			if ( i === 0 ) ctx.moveTo( pt.x, pt.y );
			else ctx.lineTo( pt.x, pt.y );
		} );
		ctx.closePath();
		ctx.strokeStyle = '#339966';
		ctx.lineWidth = 2;
		ctx.setLineDash( [] );
		ctx.stroke();
		ctx.fillStyle = 'rgba(51, 153, 102, 0.06)';
		ctx.fill();
		ctx.restore();

		// Draw divider lines
		const sortedDivs = [ ...dividers ].sort( ( a, b ) => a - b );
		sortedDivs.forEach( ( t, idx ) => {
			const top = lerp( p[ 0 ], p[ 1 ], t );
			const bottom = lerp( p[ 3 ], p[ 2 ], t );
			const isDraggingThis =
				dragging?.type === 'divider' && dragging.index === idx;

			// Dashed guide line
			ctx.save();
			ctx.beginPath();
			ctx.moveTo( top.x, top.y );
			ctx.lineTo( bottom.x, bottom.y );
			ctx.strokeStyle = isDraggingThis ? '#dc2626' : '#f59e0b';
			ctx.lineWidth = isDraggingThis ? 3 : 2;
			ctx.setLineDash( [ 6, 4 ] );
			ctx.stroke();
			ctx.restore();

			// Grab handle (circle in the middle)
			const mid = lerp( top, bottom, 0.5 );
			ctx.beginPath();
			ctx.arc( mid.x, mid.y, 7, 0, Math.PI * 2 );
			ctx.fillStyle = isDraggingThis ? '#dc2626' : '#f59e0b';
			ctx.fill();
			ctx.strokeStyle = '#fff';
			ctx.lineWidth = 2;
			ctx.stroke();

			// Left/right arrows icon
			ctx.fillStyle = '#fff';
			ctx.font = 'bold 9px sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText( '⇔', mid.x, mid.y );
		} );

		// Draw pin circles
		pins.forEach( ( pin ) => {
			const x = ( pin.x / 100 ) * W,
				y = ( pin.y / 100 ) * H;
			const isDraggingThis =
				dragging?.type === 'pin' && pins[ dragging.index ] === pin;

			ctx.beginPath();
			ctx.arc( x, y, PIN_RADIUS, 0, Math.PI * 2 );
			ctx.fillStyle = isDraggingThis ? '#339966' : '#ffffff';
			ctx.fill();
			ctx.strokeStyle = '#1e293b';
			ctx.lineWidth = 2;
			ctx.stroke();

			ctx.fillStyle = isDraggingThis ? '#fff' : '#1e293b';
			ctx.font = 'bold 10px sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText( pin.label, x, y );
		} );
	}, [ imgSize, pins, dividers, dragging ] );

	// ── Mouse / touch handlers ────────────────────────────────────────

	const handleMouseDown = useCallback(
		( e ) => {
			e.preventDefault();
			if (
				disabled ||
				! canvasRef.current ||
				imgSize.width === 0 ||
				pins.length !== 4
			)
				return;

			const pos = getMousePos( canvasRef.current, e );
			const { width, height } = imgSize;
			const p = pins.map( ( pin ) => ( {
				x: ( pin.x / 100 ) * width,
				y: ( pin.y / 100 ) * height,
			} ) );

			// 1. Check pins first (highest priority)
			for ( let i = 0; i < 4; i++ ) {
				if (
					Math.hypot( pos.x - p[ i ].x, pos.y - p[ i ].y ) <=
					PIN_HIT_RADIUS
				) {
					setDragging( { type: 'pin', index: i } );
					return;
				}
			}

			// 2. Check dividers
			const sortedDivs = [ ...dividers ].sort( ( a, b ) => a - b );
			for ( let i = 0; i < sortedDivs.length; i++ ) {
				const t = sortedDivs[ i ];
				const top = lerp( p[ 0 ], p[ 1 ], t );
				const bottom = lerp( p[ 3 ], p[ 2 ], t );
				const dist = pointToSegDist(
					pos.x,
					pos.y,
					top.x,
					top.y,
					bottom.x,
					bottom.y
				);
				if ( dist <= DIVIDER_HIT_DIST ) {
					setDragging( { type: 'divider', index: i } );
					return;
				}
			}
		},
		[ disabled, pins, dividers, imgSize ]
	);

	const handleMouseMove = useCallback(
		( e ) => {
			e.preventDefault();
			if ( ! dragging || ! canvasRef.current ) return;
			const pos = getMousePos( canvasRef.current, e );
			const { width, height } = imgSize;

			if ( dragging.type === 'pin' ) {
				const clampedX = Math.max(
					0,
					Math.min( 100, pct( pos.x, width ) )
				);
				const clampedY = Math.max(
					0,
					Math.min( 100, pct( pos.y, height ) )
				);
				const newPins = [ ...pins ];
				newPins[ dragging.index ] = {
					...newPins[ dragging.index ],
					x: clampedX,
					y: clampedY,
				};
				setPins( newPins );
				emitChange( newPins, dividers );
			}

			if ( dragging.type === 'divider' ) {
				const p = pins.map( ( pin ) => ( {
					x: ( pin.x / 100 ) * width,
					y: ( pin.y / 100 ) * height,
				} ) );
				// Project cursor onto TL→TR line to get fraction
				let t = projectToFraction( pos.x, pos.y, p[ 0 ], p[ 1 ] );
				t = Math.max( 0.05, Math.min( 0.95, t ) );

				// Prevent crossing other dividers (maintain minimum gap of 0.05)
				const sortedDivs = [ ...dividers ].sort( ( a, b ) => a - b );
				const origIdx = dragging.index;
				if ( origIdx > 0 )
					t = Math.max( t, sortedDivs[ origIdx - 1 ] + 0.05 );
				if ( origIdx < sortedDivs.length - 1 )
					t = Math.min( t, sortedDivs[ origIdx + 1 ] - 0.05 );

				const newDividers = [ ...sortedDivs ];
				newDividers[ origIdx ] = t;
				setDividers( newDividers );
				emitChange( pins, newDividers );
			}
		},
		[ dragging, pins, dividers, imgSize, emitChange ]
	);

	const handleMouseUp = useCallback( ( e ) => {
		if ( e ) e.preventDefault();
		setDragging( null );
	}, [] );

	// ── Button handlers ───────────────────────────────────────────────

	const handleAddSplit = useCallback( () => {
		// Find the largest gap and insert a divider at its midpoint
		const sorted = [ ...dividers, 0, 1 ].sort( ( a, b ) => a - b );
		let maxGap = 0,
			maxIdx = 0;
		for ( let i = 0; i < sorted.length - 1; i++ ) {
			const gap = sorted[ i + 1 ] - sorted[ i ];
			if ( gap > maxGap ) {
				maxGap = gap;
				maxIdx = i;
			}
		}
		const newT = ( sorted[ maxIdx ] + sorted[ maxIdx + 1 ] ) / 2;
		const newDividers = [ ...dividers, newT ].sort( ( a, b ) => a - b );
		setDividers( newDividers );
		emitChange( pins, newDividers );
	}, [ dividers, pins, emitChange ] );

	const handleRemoveSplit = useCallback( () => {
		if ( dividers.length === 0 ) return;
		// Remove the last-added divider
		const newDividers = dividers.slice( 0, -1 );
		setDividers( newDividers );
		emitChange( pins, newDividers );
	}, [ dividers, pins, emitChange ] );

	const handleReset = useCallback( () => {
		// Re-place default pins
		const defaultPins = [
			{ x: 25, y: 15, label: 'TL' },
			{ x: 75, y: 15, label: 'TR' },
			{ x: 75, y: 85, label: 'BR' },
			{ x: 25, y: 85, label: 'BL' },
		];
		setPins( defaultPins );
		setDividers( [] );
		emitChange( defaultPins, [] );
	}, [ emitChange ] );

	return (
		<div className="opening-selector" ref={ containerRef }>
			<div className="opening-selector-toolbar">
				<button
					type="button"
					onClick={ handleAddSplit }
					disabled={ disabled || pins.length !== 4 }
					className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
				>
					<span aria-hidden="true">＋</span> Add Split
				</button>
				{ dividers.length > 0 && (
					<button
						type="button"
						onClick={ handleRemoveSplit }
						disabled={ disabled }
						className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
					>
						<span aria-hidden="true">−</span> Remove Split
					</button>
				) }
				<button
					type="button"
					onClick={ handleReset }
					disabled={ disabled }
					className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
				>
					Reset
				</button>
			</div>

			<p className="opening-selector-hint">
				{ pins.length === 4
					? 'Drag the corner pins to match your patio opening'
					: 'Loading…' }
			</p>

			{ dividers.length > 0 && (
				<p
					className="opening-selector-hint"
					style={ { fontSize: '11px', marginTop: '-4px' } }
				>
					{ dividers.length } split{ dividers.length > 1 ? 's' : '' }{ ' ' }
					— drag the yellow handle to reposition
				</p>
			) }

			<div className="opening-selector-canvas-wrap">
				<canvas
					ref={ canvasRef }
					className="opening-selector-canvas"
					onMouseDown={ handleMouseDown }
					onMouseMove={ handleMouseMove }
					onMouseUp={ handleMouseUp }
					onMouseLeave={ handleMouseUp }
					onTouchStart={ handleMouseDown }
					onTouchMove={ handleMouseMove }
					onTouchEnd={ handleMouseUp }
					style={ {
						width: '100%',
						height: 'auto',
						cursor: dragging ? 'grabbing' : 'grab',
						touchAction: 'none',
					} }
				/>
			</div>
		</div>
	);
};

export default OpeningSelector;
