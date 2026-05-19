/**
 * Image Utilities
 * Standard image manipulation functions for the screen visualizer.
 */

const MAX_DIM = 1024;

const loadImage = ( src ) =>
	new Promise( ( res, rej ) => {
		const i = new Image();
		i.crossOrigin = 'anonymous';
		i.onload = () => res( i );
		i.onerror = rej;
		i.src = src;
	} );

/**
 * Resizes an image to max MAX_DIM while preserving aspect ratio.
 * Returns a canvas element.
 * @param src
 * @param maxDim
 */
const resizeImageToCanvas = async ( src, maxDim = MAX_DIM ) => {
	const img = await loadImage( src );
	let width = img.naturalWidth;
	let height = img.naturalHeight;

	if ( width > maxDim || height > maxDim ) {
		if ( width > height ) {
			height = Math.round( ( height * maxDim ) / width );
			width = maxDim;
		} else {
			width = Math.round( ( width * maxDim ) / height );
			height = maxDim;
		}
	}

	const canvas = document.createElement( 'canvas' );
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext( '2d' );
	ctx.drawImage( img, 0, 0, width, height );
	return canvas;
};

/**
 * Creates a working copy of the original image at max 1024px.
 * All downstream processing uses this consistent resolution.
 * @param imageUrl
 */
export const createWorkingImage = async ( imageUrl ) => {
	const canvas = await resizeImageToCanvas( imageUrl, MAX_DIM );
	return canvas.toDataURL( 'image/jpeg', 0.85 );
};

/**
 * Bakes the screen overlay onto the original image at full opacity.
 * Both images MUST already be at the SAME dimensions.
 * Returns a single composite data URL where the screen is already placed.
 * @param originalUrl
 * @param overlayUrl
 */
export const bakeOverlay = async ( originalUrl, overlayUrl ) => {
	const [ origImg, overlayImg ] = await Promise.all( [
		loadImage( originalUrl ),
		loadImage( overlayUrl ),
	] );

	// Safety: if dimensions mismatch, log a warning but still draw
	if (
		origImg.naturalWidth !== overlayImg.naturalWidth ||
		origImg.naturalHeight !== overlayImg.naturalHeight
	) {
		console.warn(
			`Dimension mismatch in bakeOverlay: original=${ origImg.naturalWidth }x${ origImg.naturalHeight }, overlay=${ overlayImg.naturalWidth }x${ overlayImg.naturalHeight }`
		);
	}

	const canvas = document.createElement( 'canvas' );
	canvas.width = origImg.naturalWidth;
	canvas.height = origImg.naturalHeight;
	const ctx = canvas.getContext( '2d' );

	// Draw original
	ctx.drawImage( origImg, 0, 0 );
	// Draw overlay at full opacity, stretched to match canvas exactly
	ctx.drawImage( overlayImg, 0, 0, canvas.width, canvas.height );

	return canvas.toDataURL( 'image/jpeg', 0.92 );
};
