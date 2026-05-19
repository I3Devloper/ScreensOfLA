/**
 * Video Exporter
 * Records a 60fps WebM video of the screen retracting/extending.
 * Returns a blob URL for in-browser preview playblack.
 */
import { renderScreenOverlay } from './screenRenderer';
import { loadImage, getLogo, drawWatermark } from './imageCompositor';

const FPS = 60;
const FRAME_INTERVAL = 1000 / FPS;
const HOLD_TIME = 0.5;
const ANIMATE_TIME = 2.0;
const TOTAL_DURATION =
	HOLD_TIME + ANIMATE_TIME + HOLD_TIME + ANIMATE_TIME + HOLD_TIME; // 5.5s
const TOTAL_FRAMES = Math.ceil( TOTAL_DURATION * FPS );

const easeInOut = ( t ) => ( t < 0.5 ? 2 * t * t : -1 + ( 4 - 2 * t ) * t );

const computeRetractLevel = ( elapsed ) => {
	const tElapsed = Math.min( elapsed, TOTAL_DURATION );

	if ( tElapsed < HOLD_TIME ) {
		return 0;
	}
	if ( tElapsed < HOLD_TIME + ANIMATE_TIME ) {
		const t = ( tElapsed - HOLD_TIME ) / ANIMATE_TIME;
		return easeInOut( t );
	}
	if ( tElapsed < HOLD_TIME + ANIMATE_TIME + HOLD_TIME ) {
		return 1;
	}
	if ( tElapsed < HOLD_TIME + ANIMATE_TIME + HOLD_TIME + ANIMATE_TIME ) {
		const t =
			( tElapsed - HOLD_TIME - ANIMATE_TIME - HOLD_TIME ) / ANIMATE_TIME;
		return 1 - easeInOut( t );
	}
	return 0;
};

const renderFrame = (
	ctx,
	width,
	height,
	baseImg,
	logoImg,
	overlayCanvas,
	params,
	retractLevel
) => {
	ctx.clearRect( 0, 0, width, height );
	ctx.drawImage( baseImg, 0, 0, width, height );

	// Build retractLevels array from single retractLevel for video animation
	// Recalculate panel count properly
	const sortedDivs = [ ...( params.dividers || [] ) ].sort(
		( a, b ) => a - b
	);
	const sortedBeams = [ ...( params.beams || [] ) ].sort(
		( a, b ) => a.left - b.left
	);
	const allBoundaries = [ 0, ...sortedDivs ];
	sortedBeams.forEach( ( beam ) => {
		allBoundaries.push( beam.left );
		allBoundaries.push( beam.right );
	} );
	allBoundaries.push( 1 );
	allBoundaries.sort( ( a, b ) => a - b );
	let count = 0;
	for ( let i = 0; i < allBoundaries.length - 1; i++ ) {
		const tLeft = allBoundaries[ i ];
		const tRight = allBoundaries[ i + 1 ];
		const isBeamGap = sortedBeams.some(
			( beam ) =>
				tLeft >= beam.left - 0.001 && tRight <= beam.right + 0.001
		);
		if ( ! isBeamGap ) {
			count++;
		}
	}
	const retractLevels = Array( Math.max( 1, count ) ).fill( retractLevel );

	renderScreenOverlay( {
		width,
		height,
		corners: params.corners,
		dividers: params.dividers,
		beams: params.beams || [],
		viewType: params.viewType,
		screenColor: params.screenColor,
		interiorVisibility: params.interiorVisibility,
		retractLevels,
		targetCanvas: overlayCanvas,
	} );

	ctx.drawImage( overlayCanvas, 0, 0, width, height );
	drawWatermark( ctx, width, height, logoImg );
};

export const exportVideo = async ( params ) => {
	const { workingUrl, onProgress } = params;

	if (
		! window.MediaRecorder ||
		! HTMLCanvasElement.prototype.captureStream
	) {
		throw new Error( 'Video export is not supported in this browser.' );
	}

	// 1. Preload assets
	const [ baseImg, logoImg ] = await Promise.all( [
		loadImage( workingUrl ),
		getLogo(),
	] );

	const width = baseImg.naturalWidth;
	const height = baseImg.naturalHeight;

	// 2. Recording canvas
	const recordCanvas = document.createElement( 'canvas' );
	recordCanvas.width = width;
	recordCanvas.height = height;
	const ctx = recordCanvas.getContext( '2d' );

	// 3. Reusable overlay canvas
	const overlayCanvas = document.createElement( 'canvas' );

	// 4. MediaRecorder setup
	const stream = recordCanvas.captureStream( FPS );
	const mimeType = window.MediaRecorder.isTypeSupported(
		'video/webm;codecs=vp9'
	)
		? 'video/webm;codecs=vp9'
		: 'video/webm';
	const recorder = new window.MediaRecorder( stream, { mimeType } );
	const chunks = [];

	recorder.ondataavailable = ( e ) => {
		if ( e.data.size > 0 ) {
			chunks.push( e.data );
		}
	};

	const recordingPromise = new Promise( ( resolve ) => {
		recorder.onstop = () => {
			const blob = new Blob( chunks, { type: 'video/webm' } );
			resolve( { blob, url: URL.createObjectURL( blob ) } );
		};
	} );

	// 5. Render initial frame before starting recorder
	renderFrame(
		ctx,
		width,
		height,
		baseImg,
		logoImg,
		overlayCanvas,
		params,
		0
	);

	// 6. Start recording and run animation loop
	recorder.start();

	let frame = 0;
	const interval = setInterval( () => {
		if ( frame >= TOTAL_FRAMES ) {
			clearInterval( interval );
			// Render final extended frame
			renderFrame(
				ctx,
				width,
				height,
				baseImg,
				logoImg,
				overlayCanvas,
				params,
				0
			);
			// Let the frame settle before stopping
			setTimeout( () => {
				recorder.stop();
			}, FRAME_INTERVAL );
			return;
		}

		const elapsed = frame / FPS;
		const r = computeRetractLevel( elapsed );
		renderFrame(
			ctx,
			width,
			height,
			baseImg,
			logoImg,
			overlayCanvas,
			params,
			r
		);

		frame++;

		if ( onProgress ) {
			onProgress( frame / TOTAL_FRAMES );
		}
	}, FRAME_INTERVAL );

	// 7. Wait for recording to finish
	return recordingPromise;
};
