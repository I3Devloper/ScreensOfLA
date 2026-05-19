/**
 * OpeningSelector - Canvas-based polygon editor for patio opening selection.
 *
 * Supports splits (single dividers) and beams (structural gaps with independent edges).
 * Beams use {left, right} structure for independent edge control.
 */
import { useState, useEffect, useRef, useCallback } from '@wordpress/element';

const PIN_RADIUS = 10;
const SPLIT_HIT_DIST = 12;
const BEAM_EDGE_HIT_DIST = 14;
const DEFAULT_BEAM_LEFT = 0.47;
const DEFAULT_BEAM_RIGHT = 0.53;

const isTouchDevice = () =>
	typeof window !== 'undefined' &&
	window.matchMedia( '(pointer: coarse)' ).matches;

const getHitRadiusMultiplier = () => ( isTouchDevice() ? 2.2 : 1 );

const lerp = ( p1, p2, t ) => ( {
	x: p1.x + ( p2.x - p1.x ) * t,
	y: p1.y + ( p2.y - p1.y ) * t,
} );

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

const projectToFraction = ( px, py, tl, tr ) => {
	const dx = tr.x - tl.x,
		dy = tr.y - tl.y;
	const lenSq = dx * dx + dy * dy;
	if ( lenSq === 0 ) return 0.5;
	return ( ( px - tl.x ) * dx + ( py - tl.y ) * dy ) / lenSq;
};

const getPointerPos = ( canvas, evt ) => {
	const rect = canvas.getBoundingClientRect();
	const dpr = window.devicePixelRatio || 1;
	const scaleX = canvas.width / dpr / rect.width;
	const scaleY = canvas.height / dpr / rect.height;

	let clientX, clientY;
	if ( evt.touches && evt.touches.length > 0 ) {
		clientX = evt.touches[ 0 ].clientX;
		clientY = evt.touches[ 0 ].clientY;
	} else if ( evt.changedTouches && evt.changedTouches.length > 0 ) {
		clientX = evt.changedTouches[ 0 ].clientX;
		clientY = evt.changedTouches[ 0 ].clientY;
	} else {
		clientX = evt.clientX;
		clientY = evt.clientY;
	}

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
} ) => {
	const canvasRef = useRef( null );
	const containerRef = useRef( null );
	const [ imgSize, setImgSize ] = useState( { width: 0, height: 0 } );
	const [ pins, setPins ] = useState( [] );
	const [ dividers, setDividers ] = useState( [] );
	const [ beams, setBeams ] = useState( [] );
	const [ dragging, setDragging ] = useState( null );
	const [ isTouch, setIsTouch ] = useState( false );
	const imageRef = useRef( null );
	const onChangeRef = useRef( onChange );
	onChangeRef.current = onChange;

	useEffect( () => {
		setIsTouch( isTouchDevice() );
	}, [] );

	const emitChange = useCallback( ( newPins, newDividers, newBeams ) => {
		if ( newPins.length === 4 ) {
			onChangeRef.current( newPins, newDividers || [], newBeams || [] );
		}
	}, [] );

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

			const defaultPins = [
				{ x: 25, y: 15, label: 'TL' },
				{ x: 75, y: 15, label: 'TR' },
				{ x: 75, y: 85, label: 'BR' },
				{ x: 25, y: 85, label: 'BL' },
			];
			setPins( defaultPins );
			setDividers( [] );
			setBeams( [] );
			onChangeRef.current( defaultPins, [], [] );
		};
		img.src = imageUrl;
		return () => {
			cancelled = true;
		};
	}, [ imageUrl ] );

	useEffect( () => {
		if ( ! imageRef.current || ! containerRef.current ) return;
		const observer = new ResizeObserver( () => {
			const maxW = containerRef.current?.clientWidth || 800;
			const aspect = imageRef.current.naturalWidth / imageRef.current.naturalHeight;
			const width = Math.min( maxW, imageRef.current.naturalWidth );
			const height = width / aspect;
			setImgSize( ( prev ) => {
				if ( Math.abs( prev.width - width ) < 1 ) return prev;
				return { width, height };
			} );
		} );
		observer.observe( containerRef.current );
		return () => observer.disconnect();
	}, [ imageUrl ] );

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

		const hitMult = getHitRadiusMultiplier();

		ctx.save();
		ctx.beginPath();
		p.forEach( ( pt, i ) => {
			if ( i === 0 ) ctx.moveTo( pt.x, pt.y );
			else ctx.lineTo( pt.x, pt.y );
		} );
		ctx.closePath();
		ctx.strokeStyle = '#339966';
		ctx.lineWidth = 2.5;
		ctx.setLineDash( [] );
		ctx.stroke();
		ctx.fillStyle = 'rgba(51, 153, 102, 0.04)';
		ctx.fill();
		ctx.restore();

		const sortedDivs = [ ...dividers ].sort( ( a, b ) => a - b );
		sortedDivs.forEach( ( t, idx ) => {
			const top = lerp( p[ 0 ], p[ 1 ], t );
			const bottom = lerp( p[ 3 ], p[ 2 ], t );
			const isDraggingThis =
				dragging?.type === 'split' && dragging.index === idx;

			ctx.save();
			ctx.beginPath();
			ctx.moveTo( top.x, top.y );
			ctx.lineTo( bottom.x, bottom.y );
			ctx.strokeStyle = isDraggingThis ? '#dc2626' : '#f59e0b';
			ctx.lineWidth = isDraggingThis ? 3 : 2.5;
			ctx.setLineDash( [ 8, 5 ] );
			ctx.stroke();
			ctx.restore();

			const mid = lerp( top, bottom, 0.5 );
			const handleRadius = 8 * hitMult;
			ctx.beginPath();
			ctx.arc( mid.x, mid.y, handleRadius, 0, Math.PI * 2 );
			ctx.fillStyle = isDraggingThis ? '#dc2626' : '#f59e0b';
			ctx.fill();
			ctx.strokeStyle = '#fff';
			ctx.lineWidth = 2.5;
			ctx.stroke();

			ctx.fillStyle = '#fff';
			ctx.font = `bold ${ Math.round( 10 * hitMult ) }px sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText( '⇔', mid.x, mid.y );
		} );

		const sortedBeams = [ ...beams ].sort( ( a, b ) => a.left - b.left );
		sortedBeams.forEach( ( beam, idx ) => {
			const leftTop = lerp( p[ 0 ], p[ 1 ], beam.left );
			const leftBot = lerp( p[ 3 ], p[ 2 ], beam.left );
			const rightTop = lerp( p[ 0 ], p[ 1 ], beam.right );
			const rightBot = lerp( p[ 3 ], p[ 2 ], beam.right );
			const isDraggingLeft =
				dragging?.type === 'beamLeft' && dragging.index === idx;
			const isDraggingRight =
				dragging?.type === 'beamRight' && dragging.index === idx;

			ctx.save();
			ctx.beginPath();
			ctx.moveTo( leftTop.x, leftTop.y );
			ctx.lineTo( leftBot.x, leftBot.y );
			ctx.strokeStyle = isDraggingLeft ? '#dc2626' : '#ef4444';
			ctx.lineWidth = isDraggingLeft ? 3 : 2.5;
			ctx.setLineDash( [ 6, 4 ] );
			ctx.stroke();
			ctx.restore();

			ctx.save();
			ctx.beginPath();
			ctx.moveTo( rightTop.x, rightTop.y );
			ctx.lineTo( rightBot.x, rightBot.y );
			ctx.strokeStyle = isDraggingRight ? '#dc2626' : '#ef4444';
			ctx.lineWidth = isDraggingRight ? 3 : 2.5;
			ctx.setLineDash( [ 6, 4 ] );
			ctx.stroke();
			ctx.restore();

			ctx.save();
			ctx.beginPath();
			ctx.moveTo( leftTop.x, leftTop.y );
			ctx.lineTo( rightTop.x, rightTop.y );
			ctx.lineTo( rightBot.x, rightBot.y );
			ctx.lineTo( leftBot.x, leftBot.y );
			ctx.closePath();
			ctx.fillStyle = 'rgba(239, 68, 68, 0.06)';
			ctx.fill();
			ctx.restore();

			const leftMid = lerp( leftTop, leftBot, 0.5 );
			const handleRadius = 8 * hitMult;
			ctx.beginPath();
			ctx.arc( leftMid.x, leftMid.y, handleRadius, 0, Math.PI * 2 );
			ctx.fillStyle = isDraggingLeft ? '#dc2626' : '#ef4444';
			ctx.fill();
			ctx.strokeStyle = '#fff';
			ctx.lineWidth = 2.5;
			ctx.stroke();
			ctx.fillStyle = '#fff';
			ctx.font = `bold ${ Math.round( 9 * hitMult ) }px sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText( '◀', leftMid.x, leftMid.y );

			const rightMid = lerp( rightTop, rightBot, 0.5 );
			ctx.beginPath();
			ctx.arc( rightMid.x, rightMid.y, handleRadius, 0, Math.PI * 2 );
			ctx.fillStyle = isDraggingRight ? '#dc2626' : '#ef4444';
			ctx.fill();
			ctx.strokeStyle = '#fff';
			ctx.lineWidth = 2.5;
			ctx.stroke();
			ctx.fillStyle = '#fff';
			ctx.font = `bold ${ Math.round( 9 * hitMult ) }px sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText( '▶', rightMid.x, rightMid.y );
		} );

		pins.forEach( ( pin ) => {
			const x = ( pin.x / 100 ) * W,
				y = ( pin.y / 100 ) * H;
			const isDraggingThis =
				dragging?.type === 'pin' && pins[ dragging.index ] === pin;
			const pinRadius = PIN_RADIUS * hitMult;

			ctx.beginPath();
			ctx.arc( x, y, pinRadius, 0, Math.PI * 2 );
			ctx.fillStyle = isDraggingThis ? '#339966' : '#ffffff';
			ctx.fill();
			ctx.strokeStyle = '#1e293b';
			ctx.lineWidth = 2;
			ctx.stroke();

			if ( isDraggingThis ) {
				ctx.beginPath();
				ctx.arc( x, y, pinRadius + 4, 0, Math.PI * 2 );
				ctx.strokeStyle = 'rgba(51, 153, 102, 0.4)';
				ctx.lineWidth = 2;
				ctx.stroke();
			}

			ctx.fillStyle = isDraggingThis ? '#fff' : '#1e293b';
			ctx.font = `bold ${ Math.round( 10 * hitMult ) }px sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText( pin.label, x, y );
		} );
	}, [ imgSize, pins, dividers, beams, dragging ] );

	const handlePointerDown = useCallback(
		( e ) => {
			if ( e.touches && e.touches.length > 1 ) return;
			e.preventDefault();
			if (
				disabled ||
				! canvasRef.current ||
				imgSize.width === 0 ||
				pins.length !== 4
			)
				return;

			const pos = getPointerPos( canvasRef.current, e );
			const { width, height } = imgSize;
			const p = pins.map( ( pin ) => ( {
				x: ( pin.x / 100 ) * width,
				y: ( pin.y / 100 ) * height,
			} ) );

			const hitMult = getHitRadiusMultiplier();
			const pinHitRadius = 20 * hitMult;
			const splitHitDist = SPLIT_HIT_DIST * hitMult;
			const beamHitDist = BEAM_EDGE_HIT_DIST * hitMult;

			for ( let i = 0; i < 4; i++ ) {
				if (
					Math.hypot( pos.x - p[ i ].x, pos.y - p[ i ].y ) <=
					pinHitRadius
				) {
					setDragging( { type: 'pin', index: i } );
					return;
				}
			}

			const sortedBeams = [ ...beams ].sort(
				( a, b ) => a.left - b.left
			);
			for ( let i = 0; i < sortedBeams.length; i++ ) {
				const beam = sortedBeams[ i ];
				const leftTop = lerp( p[ 0 ], p[ 1 ], beam.left );
				const leftBot = lerp( p[ 3 ], p[ 2 ], beam.left );
				const rightTop = lerp( p[ 0 ], p[ 1 ], beam.right );
				const rightBot = lerp( p[ 3 ], p[ 2 ], beam.right );

				const leftDist = pointToSegDist(
					pos.x,
					pos.y,
					leftTop.x,
					leftTop.y,
					leftBot.x,
					leftBot.y
				);
				if ( leftDist <= beamHitDist ) {
					setDragging( { type: 'beamLeft', index: i } );
					return;
				}

				const rightDist = pointToSegDist(
					pos.x,
					pos.y,
					rightTop.x,
					rightTop.y,
					rightBot.x,
					rightBot.y
				);
				if ( rightDist <= beamHitDist ) {
					setDragging( { type: 'beamRight', index: i } );
					return;
				}
			}

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
				if ( dist <= splitHitDist ) {
					setDragging( { type: 'split', index: i } );
					return;
				}
			}
		},
		[ disabled, pins, dividers, beams, imgSize ]
	);

	const handlePointerMove = useCallback(
		( e ) => {
			if ( e.touches && e.touches.length > 1 ) return;
			e.preventDefault();
			if ( ! dragging || ! canvasRef.current ) return;
			const pos = getPointerPos( canvasRef.current, e );
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
				emitChange( newPins, dividers, beams );
			}

			if ( dragging.type === 'split' ) {
				const p = pins.map( ( pin ) => ( {
					x: ( pin.x / 100 ) * width,
					y: ( pin.y / 100 ) * height,
				} ) );
				let t = projectToFraction( pos.x, pos.y, p[ 0 ], p[ 1 ] );

				const sortedDivs = [ ...dividers ].sort( ( a, b ) => a - b );
				const origIdx = dragging.index;
				const staticBoundaries = [
					0,
					...sortedDivs.filter( ( _, i ) => i !== origIdx ),
					...beams.map( ( b ) => b.left ),
					...beams.map( ( b ) => b.right ),
					1,
				].sort( ( a, b ) => a - b );

				for ( let i = 0; i < staticBoundaries.length - 1; i++ ) {
					if (
						t >= staticBoundaries[ i ] &&
						t <= staticBoundaries[ i + 1 ]
					) {
						t = Math.max(
							staticBoundaries[ i ] + 0.03,
							Math.min( staticBoundaries[ i + 1 ] - 0.03, t )
						);
						break;
					}
				}
				t = Math.max( 0.03, Math.min( 0.97, t ) );

				const newDividers = [ ...sortedDivs ];
				newDividers[ origIdx ] = t;
				setDividers( newDividers );
				emitChange( pins, newDividers, beams );
			}

			if ( dragging.type === 'beamLeft' ) {
				const p = pins.map( ( pin ) => ( {
					x: ( pin.x / 100 ) * width,
					y: ( pin.y / 100 ) * height,
				} ) );
				let t = projectToFraction( pos.x, pos.y, p[ 0 ], p[ 1 ] );

				const sortedBeams = [ ...beams ].sort(
					( a, b ) => a.left - b.left
				);
				const origIdx = dragging.index;
				const beam = sortedBeams[ origIdx ];
				const staticBoundaries = [
					0,
					...dividers,
					...sortedBeams
						.filter( ( _, i ) => i !== origIdx )
						.map( ( b ) => b.left ),
					...sortedBeams
						.filter( ( _, i ) => i !== origIdx )
						.map( ( b ) => b.right ),
					beam.right,
					1,
				].sort( ( a, b ) => a - b );

				for ( let i = 0; i < staticBoundaries.length - 1; i++ ) {
					if (
						t >= staticBoundaries[ i ] &&
						t <= staticBoundaries[ i + 1 ]
					) {
						t = Math.max(
							staticBoundaries[ i ] + 0.03,
							Math.min( staticBoundaries[ i + 1 ] - 0.03, t )
						);
						break;
					}
				}
				t = Math.max( 0.03, Math.min( beam.right - 0.03, t ) );

				const newBeams = [ ...sortedBeams ];
				newBeams[ origIdx ] = { ...beam, left: t };
				setBeams( newBeams );
				emitChange( pins, dividers, newBeams );
			}

			if ( dragging.type === 'beamRight' ) {
				const p = pins.map( ( pin ) => ( {
					x: ( pin.x / 100 ) * width,
					y: ( pin.y / 100 ) * height,
				} ) );
				let t = projectToFraction( pos.x, pos.y, p[ 0 ], p[ 1 ] );

				const sortedBeams = [ ...beams ].sort(
					( a, b ) => a.left - b.left
				);
				const origIdx = dragging.index;
				const beam = sortedBeams[ origIdx ];
				const staticBoundaries = [
					0,
					...dividers,
					...sortedBeams
						.filter( ( _, i ) => i !== origIdx )
						.map( ( b ) => b.left ),
					...sortedBeams
						.filter( ( _, i ) => i !== origIdx )
						.map( ( b ) => b.right ),
					beam.left,
					1,
				].sort( ( a, b ) => a - b );

				for ( let i = 0; i < staticBoundaries.length - 1; i++ ) {
					if (
						t >= staticBoundaries[ i ] &&
						t <= staticBoundaries[ i + 1 ]
					) {
						t = Math.max(
							staticBoundaries[ i ] + 0.03,
							Math.min( staticBoundaries[ i + 1 ] - 0.03, t )
						);
						break;
					}
				}
				t = Math.max( beam.left + 0.03, Math.min( 0.97, t ) );

				const newBeams = [ ...sortedBeams ];
				newBeams[ origIdx ] = { ...beam, right: t };
				setBeams( newBeams );
				emitChange( pins, dividers, newBeams );
			}
		},
		[ dragging, pins, dividers, beams, imgSize, emitChange ]
	);

	const handlePointerUp = useCallback( ( e ) => {
		if ( e ) e.preventDefault();
		setDragging( null );
	}, [] );

	const handleAddSplit = useCallback( () => {
		const allBoundaries = [
			0,
			...dividers,
			...beams.map( ( b ) => b.left ),
			...beams.map( ( b ) => b.right ),
			1,
		].sort( ( a, b ) => a - b );
		let maxGap = 0,
			maxIdx = 0;
		for ( let i = 0; i < allBoundaries.length - 1; i++ ) {
			const gap = allBoundaries[ i + 1 ] - allBoundaries[ i ];
			if ( gap > maxGap ) {
				maxGap = gap;
				maxIdx = i;
			}
		}
		const newT =
			( allBoundaries[ maxIdx ] + allBoundaries[ maxIdx + 1 ] ) / 2;
		const newDividers = [ ...dividers, newT ].sort( ( a, b ) => a - b );
		setDividers( newDividers );
		emitChange( pins, newDividers, beams );
	}, [ dividers, beams, pins, emitChange ] );

	const handleAddBeam = useCallback( () => {
		const allBoundaries = [
			0,
			...dividers,
			...beams.map( ( b ) => b.left ),
			...beams.map( ( b ) => b.right ),
			1,
		].sort( ( a, b ) => a - b );
		let maxGap = 0,
			maxIdx = 0;
		for ( let i = 0; i < allBoundaries.length - 1; i++ ) {
			const gap = allBoundaries[ i + 1 ] - allBoundaries[ i ];
			if ( gap > maxGap ) {
				maxGap = gap;
				maxIdx = i;
			}
		}
		const centerT =
			( allBoundaries[ maxIdx ] + allBoundaries[ maxIdx + 1 ] ) / 2;
		const gapWidth = allBoundaries[ maxIdx + 1 ] - allBoundaries[ maxIdx ];
		const halfBeam = Math.min(
			( DEFAULT_BEAM_RIGHT - DEFAULT_BEAM_LEFT ) / 2,
			gapWidth * 0.4
		);
		const newBeam = {
			left: centerT - halfBeam,
			right: centerT + halfBeam,
		};
		const newBeams = [ ...beams, newBeam ].sort(
			( a, b ) => a.left - b.left
		);
		setBeams( newBeams );
		emitChange( pins, dividers, newBeams );
	}, [ dividers, beams, pins, emitChange ] );

	const handleRemoveSplit = useCallback( () => {
		if ( dividers.length === 0 ) return;
		const newDividers = dividers.slice( 0, -1 );
		setDividers( newDividers );
		emitChange( pins, newDividers, beams );
	}, [ dividers, beams, pins, emitChange ] );

	const handleRemoveBeam = useCallback( () => {
		if ( beams.length === 0 ) return;
		const newBeams = beams.slice( 0, -1 );
		setBeams( newBeams );
		emitChange( pins, dividers, newBeams );
	}, [ beams, dividers, pins, emitChange ] );

	const handleReset = useCallback( () => {
		const defaultPins = [
			{ x: 25, y: 15, label: 'TL' },
			{ x: 75, y: 15, label: 'TR' },
			{ x: 75, y: 85, label: 'BR' },
			{ x: 25, y: 85, label: 'BL' },
		];
		setPins( defaultPins );
		setDividers( [] );
		setBeams( [] );
		emitChange( defaultPins, [], [] );
	}, [ emitChange ] );

	const hint = isTouch
		? 'Tap and drag the corner pins to match your patio opening'
		: 'Drag the corner pins to match your patio opening';

	return (
		<div className="opening-selector" ref={ containerRef }>
			<div className="opening-selector-toolbar">
				<div className="sv-tool-group">
					<button
						type="button"
						onClick={ handleAddSplit }
						disabled={ disabled || pins.length !== 4 }
						className="sv-btn sv-btn-split"
					>
						<span className="sv-btn-icon">＋</span>
						<span className="sv-btn-label">Split</span>
					</button>
					<button
						type="button"
						onClick={ handleAddBeam }
						disabled={ disabled || pins.length !== 4 }
						className="sv-btn sv-btn-beam"
					>
						<span className="sv-btn-icon">＋</span>
						<span className="sv-btn-label">Beam</span>
					</button>
					{ dividers.length > 0 && (
						<button
							type="button"
							onClick={ handleRemoveSplit }
							disabled={ disabled }
							className="sv-btn sv-btn-split sv-btn-remove"
						>
							<span className="sv-btn-icon">−</span>
							<span className="sv-btn-label">Split</span>
						</button>
					) }
					{ beams.length > 0 && (
						<button
							type="button"
							onClick={ handleRemoveBeam }
							disabled={ disabled }
							className="sv-btn sv-btn-beam sv-btn-remove"
						>
							<span className="sv-btn-icon">−</span>
							<span className="sv-btn-label">Beam</span>
						</button>
					) }
				</div>
				<button
					type="button"
					onClick={ handleReset }
					disabled={ disabled }
					className="sv-btn sv-btn-reset"
				>
					Reset
				</button>
			</div>

			<p className="opening-selector-hint">
				{ pins.length === 4 ? hint : 'Loading…' }
			</p>

			{ ( dividers.length > 0 || beams.length > 0 ) && (
				<p
					className="opening-selector-hint sv-hint-secondary"
					style={ { fontSize: '11px', marginTop: '-4px' } }
				>
					{ dividers.length > 0 && (
						<span>
							{ dividers.length } split
							{ dividers.length > 1 ? 's' : '' }{ ' ' }
						</span>
					) }
					{ beams.length > 0 && (
						<span>
							{ beams.length } beam{ beams.length > 1 ? 's' : '' }{ ' ' }
						</span>
					) }
					— { isTouch ? 'tap and drag' : 'drag' } handles to
					reposition edges
				</p>
			) }

			<div className="opening-selector-canvas-wrap">
				<canvas
					ref={ canvasRef }
					className="opening-selector-canvas"
					onMouseDown={ handlePointerDown }
					onMouseMove={ handlePointerMove }
					onMouseUp={ handlePointerUp }
					onMouseLeave={ handlePointerUp }
					onTouchStart={ handlePointerDown }
					onTouchMove={ handlePointerMove }
					onTouchEnd={ handlePointerUp }
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
