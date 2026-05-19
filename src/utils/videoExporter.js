/**
 * Video Exporter
 * Records a 60fps WebM video of the screen retracting/extending.
 * Returns a blob URL for in-browser preview playback.
 */
import { renderScreenOverlay } from './screenRenderer';
import { loadImage, getLogo, drawWatermark } from './imageCompositor';

const FPS = 60;
const FRAME_INTERVAL = 1000 / FPS;
const HOLD_TIME = 0.5;
const ANIMATE_TIME = 2.0;
const TOTAL_DURATION =
	HOLD_TIME + ANIMATE_TIME + HOLD_TIME + ANIMATE_TIME + HOLD_TIME;
const TOTAL_FRAMES = Math.ceil( TOTAL_DURATION * FPS );

const easeInOut = ( t ) => ( t < 0.5 ? 2 * t * t : -1 + ( 4 - 2 * t ) * t );

const computeRetractLevel = ( elapsed ) => {
	const t = Math.min( elapsed, TOTAL_DURATION );

	if ( t < HOLD_TIME ) {
		return 0;
	}
	if ( t < HOLD_TIME + ANIMATE_TIME ) {
		return easeInOut( ( t - HOLD_TIME ) / ANIMATE_TIME );
	}
	if ( t < HOLD_TIME + ANIMATE_TIME + HOLD_TIME ) {
		return 1;
	}
	if ( t < HOLD_TIME + ANIMATE_TIME + HOLD_TIME + ANIMATE_TIME ) {
		return (
			1 - easeInOut( ( t - 2 * HOLD_TIME - ANIMATE_TIME ) / ANIMATE_TIME )
		);
	}
	return 0;
};

const countPanels = ( dividers, beams ) => {
	const sortedDivs = [ ...( dividers || [] ) ].sort( ( a, b ) => a - b );
	const sortedBeams = [ ...( beams || [] ) ].sort(
		( a, b ) => a.left - b.left
	);
	const boundaries = [ 0, ...sortedDivs ];
	sortedBeams.forEach( ( beam ) => {
		boundaries.push( beam.left, beam.right );
	} );
	boundaries.push( 1 );
	boundaries.sort( ( a, b ) => a - b );

	let count = 0;
	for ( let i = 0; i < boundaries.length - 1; i++ ) {
		const isGap = sortedBeams.some(
			( beam ) =>
				boundaries[ i ] >= beam.left - 0.001 &&
				boundaries[ i + 1 ] <= beam.right + 0.001
		);
		if ( ! isGap ) {
			count++;
		}
	}
	return Math.max( 1, count );
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

	const panelCount = countPanels( params.dividers, params.beams );
	const retractLevels = Array( panelCount ).fill( retractLevel );

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

	const [ baseImg, logoImg ] = await Promise.all( [
		loadImage( workingUrl ),
		getLogo(),
	] );

	const width = baseImg.naturalWidth;
	const height = baseImg.naturalHeight;

	const recordCanvas = document.createElement( 'canvas' );
	recordCanvas.width = width;
	recordCanvas.height = height;
	const ctx = recordCanvas.getContext( '2d' );

	const overlayCanvas = document.createElement( 'canvas' );

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

	recorder.start();

	let frame = 0;
	const interval = setInterval( () => {
		if ( frame >= TOTAL_FRAMES ) {
			clearInterval( interval );
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
			setTimeout( () => recorder.stop(), FRAME_INTERVAL );
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

	return recordingPromise;
};
