/**
 * Image Compositor Utility
 * Composites screen overlays and stamps the brand logo on final images.
 */

import logoSrc from '../assets/SCREENS-OF-LOUISIANA-logo.png';

export const loadImage = ( src ) => {
	return new Promise( ( resolve, reject ) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve( img );
		img.onerror = ( err ) => reject( err );
		img.src = src;
	} );
};

let logoPromise = null;
export const LOGO_HEIGHT = 32;
const PADDING_X = 20;
const PADDING_Y = 20;

export const getLogo = () => {
	if ( ! logoPromise ) {
		logoPromise = loadImage( logoSrc );
	}
	return logoPromise;
};

export const drawWatermark = ( ctx, width, height, logoImg ) => {
	const logoWidth =
		( logoImg.naturalWidth / logoImg.naturalHeight ) * LOGO_HEIGHT;

	ctx.save();
	ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
	ctx.shadowOffsetX = 2;
	ctx.shadowOffsetY = 2;
	ctx.shadowBlur = 4;
	ctx.drawImage(
		logoImg,
		PADDING_X,
		height - PADDING_Y - LOGO_HEIGHT,
		logoWidth,
		LOGO_HEIGHT
	);
	ctx.restore();
};

/**
 * Adds watermark to the AI-generated result image.
 * For refinement workflow, no polygon masking is needed — Gemini already blended correctly.
 *
 * @param {string} aiUrl - URL of the AI-generated image
 * @returns {Promise<string>} - Data URL with watermark
 */
export const addWatermark = async ( aiUrl ) => {
	const [ aiImg, logoImg ] = await Promise.all( [
		loadImage( aiUrl ),
		getLogo(),
	] );
	const width = aiImg.naturalWidth;
	const height = aiImg.naturalHeight;

	const canvas = document.createElement( 'canvas' );
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext( '2d' );

	ctx.drawImage( aiImg, 0, 0, width, height );
	drawWatermark( ctx, width, height, logoImg );

	return canvas.toDataURL( 'image/png' );
};

/**
 * Places an AI-enhanced selected-opening crop back into the original image.
 * The crop is clipped to the user's full-image polygon to prevent rectangular bleed.
 *
 * @param {string} originalUrl - Working original image URL
 * @param {string} aiCropUrl - Gemini-enhanced crop URL
 * @param {Object} cropInfo - Result from cropToSelectedOpening
 * @returns {Promise<string>} - Full-size data URL with AI crop and watermark
 */
export const compositeAiCrop = async ( originalUrl, aiCropUrl, cropInfo ) => {
	const [ originalImg, aiCropImg, logoImg ] = await Promise.all( [
		loadImage( originalUrl ),
		loadImage( aiCropUrl ),
		getLogo(),
	] );

	const width = originalImg.naturalWidth;
	const height = originalImg.naturalHeight;
	const canvas = document.createElement( 'canvas' );
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext( '2d' );

	ctx.drawImage( originalImg, 0, 0, width, height );

	const sourceCorners = cropInfo?.sourceCorners;
	const crop = cropInfo?.crop;
	if (
		! Array.isArray( sourceCorners ) ||
		sourceCorners.length !== 4 ||
		! crop
	) {
		ctx.drawImage( aiCropImg, 0, 0, width, height );
		drawWatermark( ctx, width, height, logoImg );
		return canvas.toDataURL( 'image/png' );
	}

	ctx.save();
	ctx.beginPath();
	sourceCorners.forEach( ( corner, index ) => {
		const x = ( corner.x / 100 ) * width;
		const y = ( corner.y / 100 ) * height;
		if ( index === 0 ) ctx.moveTo( x, y );
		else ctx.lineTo( x, y );
	} );
	ctx.closePath();
	ctx.clip();
	ctx.drawImage( aiCropImg, crop.x, crop.y, crop.width, crop.height );
	ctx.restore();

	drawWatermark( ctx, width, height, logoImg );

	return canvas.toDataURL( 'image/png' );
};

/**
 * Blends the deterministic overlay with Gemini's enhanced result inside the polygon.
 * Outside the polygon: 100% Gemini (walls/posts untouched).
 * Inside the polygon: 70% Gemini realism + 30% overlay geometry guide.
 * This gives photorealistic texture while locking the screen to the exact coordinates.
 *
 * @param {string} aiUrl - Gemini-enhanced image URL
 * @param {string} overlayUrl - Deterministic screen overlay data URL
 * @param {Array} corners - [{x%, y%, label}, ...]
 * @returns {Promise<string>} - Data URL with blended result + watermark
 */
export const recompositeOverlay = async ( aiUrl, overlayUrl, corners ) => {
	const [ aiImg, overlayImg, logoImg ] = await Promise.all( [
		loadImage( aiUrl ),
		loadImage( overlayUrl ),
		getLogo(),
	] );

	const width = aiImg.naturalWidth;
	const height = aiImg.naturalHeight;

	const canvas = document.createElement( 'canvas' );
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext( '2d' );

	// 1. Draw Gemini's enhanced result as base (everything)
	ctx.drawImage( aiImg, 0, 0, width, height );

	// 2. Inside the polygon only, blend our overlay as a geometry guide.
	ctx.save();
	ctx.beginPath();
	corners.forEach( ( corner, index ) => {
		const x = ( corner.x / 100 ) * width;
		const y = ( corner.y / 100 ) * height;
		if ( index === 0 ) ctx.moveTo( x, y );
		else ctx.lineTo( x, y );
	} );
	ctx.closePath();
	ctx.clip();

	// Draw overlay at 30% opacity — enough to pull geometry back to the pins
	// without drowning out Gemini's photorealistic texture.
	ctx.globalAlpha = 0.3;
	ctx.drawImage( overlayImg, 0, 0, width, height );
	ctx.globalAlpha = 1.0;
	ctx.restore();

	// 3. Watermark
	drawWatermark( ctx, width, height, logoImg );

	return canvas.toDataURL( 'image/png' );
};

/**
 * Legacy polygon compositing for backward compatibility.
 * Only use this if the AI returned a patch that needs masking.
 */
export const compositeScreenImage = async ( originalUrl, aiUrl, corners ) => {
	if ( ! Array.isArray( corners ) || corners.length !== 4 ) {
		throw new Error(
			'Invalid corners: expected an array of 4 corner points.'
		);
	}

	const [ originalImg, aiImg, logoImg ] = await Promise.all( [
		loadImage( originalUrl ),
		loadImage( aiUrl ),
		getLogo(),
	] );

	const width = originalImg.naturalWidth;
	const height = originalImg.naturalHeight;

	const canvas = document.createElement( 'canvas' );
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext( '2d' );

	// 1. Draw the original photo as the base layer
	ctx.drawImage( originalImg, 0, 0, width, height );

	// 2. Build the polygon clip path from percentage-based corners
	ctx.save();
	ctx.beginPath();
	corners.forEach( ( corner, index ) => {
		const x = ( corner.x / 100 ) * width;
		const y = ( corner.y / 100 ) * height;
		if ( index === 0 ) {
			ctx.moveTo( x, y );
		} else {
			ctx.lineTo( x, y );
		}
	} );
	ctx.closePath();
	ctx.clip();

	// 3. Draw the AI-generated image on top
	ctx.drawImage( aiImg, 0, 0, width, height );
	ctx.restore();

	// 4. Draw watermark
	drawWatermark( ctx, width, height, logoImg );

	return canvas.toDataURL( 'image/png' );
};

/**
 * CORS-safe wrapper.
 */
export const compositeScreenImageSafe = async (
	originalUrl,
	aiUrl,
	corners
) => {
	try {
		// For refinement workflow: if original and AI are same size-ish, just watermark
		// Otherwise fall back to legacy compositing
		const dataUrl = await addWatermark( aiUrl );
		return dataUrl;
	} catch ( error ) {
		console.warn(
			'Watermark failed. Falling back to raw AI image.',
			error
		);
		return aiUrl;
	}
};
