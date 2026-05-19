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
 * Adds watermark to an image.
 *
 * @param {string} aiUrl - Image URL
 * @return {Promise<string>} - Data URL with watermark
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
