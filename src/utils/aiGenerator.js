/**
 * AI Generator Utility
 * Uses Gemini to enhance a pre-composited screen image.
 * The screen is already baked into the input image, so Gemini cannot misplace it.
 */

import { postToOpenRouterProxy } from './openrouterProxy';
import { OUTSIDE_EXAMPLE, INSIDE_EXAMPLE } from './exampleImages';

const TARGET_MODEL = "sourceful/riverflow-v2-fast";
const MAX_DIM = 1024;

const normalizeScreenColor = (value) => {
    if (typeof value !== 'string') return 'dark bronze';
    const cleaned = value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    return cleaned.slice(0, 80) || 'dark bronze';
};

const loadImage = (src) => new Promise((res, rej) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
});

/**
 * Resizes an image to max MAX_DIM while preserving aspect ratio.
 * Returns a canvas element.
 */
const resizeImageToCanvas = async (src, maxDim = MAX_DIM) => {
    const img = await loadImage(src);
    let width = img.naturalWidth;
    let height = img.naturalHeight;

    if (width > maxDim || height > maxDim) {
        if (width > height) {
            height = Math.round(height * maxDim / width);
            width = maxDim;
        } else {
            width = Math.round(width * maxDim / height);
            height = maxDim;
        }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
};

/**
 * Creates a working copy of the original image at max 1024px.
 * All downstream processing uses this consistent resolution.
 */
export const createWorkingImage = async (imageUrl) => {
    const canvas = await resizeImageToCanvas(imageUrl, MAX_DIM);
    return canvas.toDataURL('image/jpeg', 0.85);
};

/**
 * Bakes the screen overlay onto the original image at full opacity.
 * Both images MUST already be at the SAME dimensions.
 * Returns a single composite data URL where the screen is already placed.
 */
export const bakeOverlay = async (originalUrl, overlayUrl) => {
    const [origImg, overlayImg] = await Promise.all([
        loadImage(originalUrl),
        loadImage(overlayUrl)
    ]);

    // Safety: if dimensions mismatch, log a warning but still draw
    if (origImg.naturalWidth !== overlayImg.naturalWidth ||
        origImg.naturalHeight !== overlayImg.naturalHeight) {
        console.warn(`Dimension mismatch in bakeOverlay: original=${origImg.naturalWidth}x${origImg.naturalHeight}, overlay=${overlayImg.naturalWidth}x${overlayImg.naturalHeight}`);
    }

    const canvas = document.createElement('canvas');
    canvas.width = origImg.naturalWidth;
    canvas.height = origImg.naturalHeight;
    const ctx = canvas.getContext('2d');

    // Draw original
    ctx.drawImage(origImg, 0, 0);
    // Draw overlay at full opacity, stretched to match canvas exactly
    ctx.drawImage(overlayImg, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/jpeg', 0.92);
};

/**
 * Crops the baked reference down to the selected opening.
 * The returned corners are remapped into crop-local percentages.
 */
export const cropToSelectedOpening = async (imageUrl, corners, paddingRatio = 0.08) => {
    const img = await loadImage(imageUrl);
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const points = corners.map((corner) => ({
        x: (corner.x / 100) * width,
        y: (corner.y / 100) * height,
        label: corner.label
    }));

    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const boxWidth = Math.max(1, maxX - minX);
    const boxHeight = Math.max(1, maxY - minY);
    const padX = Math.max(12, boxWidth * paddingRatio);
    const padY = Math.max(12, boxHeight * paddingRatio);

    const cropX = Math.max(0, Math.floor(minX - padX));
    const cropY = Math.max(0, Math.floor(minY - padY));
    const cropRight = Math.min(width, Math.ceil(maxX + padX));
    const cropBottom = Math.min(height, Math.ceil(maxY + padY));
    const cropWidth = cropRight - cropX;
    const cropHeight = cropBottom - cropY;

    const canvas = document.createElement('canvas');
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    const cropCorners = points.map((point) => ({
        x: ((point.x - cropX) / cropWidth) * 100,
        y: ((point.y - cropY) / cropHeight) * 100,
        label: point.label
    }));

    return {
        url: canvas.toDataURL('image/jpeg', 0.92),
        corners: cropCorners,
        sourceCorners: corners,
        crop: {
            x: cropX,
            y: cropY,
            width: cropWidth,
            height: cropHeight,
            sourceWidth: width,
            sourceHeight: height
        }
    };
};

const formatCornerCoordinates = (corners) => {
    if (!Array.isArray(corners) || corners.length !== 4) {
        return 'No corner coordinates were provided.';
    }

    const labels = ['TL', 'TR', 'BR', 'BL'];
    return corners.map((corner, index) => {
        const label = corner.label || labels[index];
        const x = Number.isFinite(corner.x) ? corner.x.toFixed(2) : String(corner.x);
        const y = Number.isFinite(corner.y) ? corner.y.toFixed(2) : String(corner.y);
        return `- ${label}: x=${x}%, y=${y}%`;
    }).join('\n');
};

const buildEnhancementPrompt = ({ viewType, screenColor, corners }) => {
    const color = normalizeScreenColor(screenColor);
    const isInside = viewType === 'inside';
    const coordinateList = formatCornerCoordinates(corners);

    const viewRules = isInside
        ? `INTERIOR VIEW:
- The screen mesh is semi-transparent. The outdoor scene behind it remains clearly visible.
- The mesh has a fine woven grid texture like insect screen material.
- Only a very light darkening tint is present. The exterior is NOT foggy or blurry.`
        : `EXTERIOR VIEW:
- The screen fabric is COMPLETELY OPAQUE. The interior behind it is 100% hidden.
- The fabric looks like a dense WOVEN PRIVACY SCREEN with a realistic crosshatch weave pattern.
- The fabric is NOT see-through in any way. Zero visibility through it.`;

    return `Create an image: This photograph contains a placement guide showing where a motorized retractable patio screen should be installed. The baked overlay in the image shows the GENERAL AREA of the opening. The polygon shape may be irregular because the user traced around obstacles (posts, pillars, furniture, plants). Your job is to render a realistic, properly installed rectangular screen in that area.

SCREEN AREA IN IMAGE PERCENT COORDINATES (approximate guide):
${coordinateList}

These coordinates indicate WHERE the screen should appear. The actual screen must be a proper rectangular panel.

RECTANGULAR SCREEN ENFORCEMENT:
- The screen MUST be a proper rectangular panel — exactly like a real motorized retractable screen.
- Top cassette: straight horizontal bar, LEVEL from left to right.
- Bottom rail: straight horizontal bar, LEVEL from left to right.
- Side tracks: straight vertical bars, PLUMB from top to bottom.
- Even if the baked reference shows a diagonal or irregular shape, the FINAL screen must be rectangular with straight, level, plumb frame bars.
- Do NOT create a diagonal shade, parallelogram screen, or slanted bottom rail.
- The screen should fill the architectural opening naturally from edge to edge.

OBSTACLE HANDLING:
- If obstacles (posts, pillars, furniture, plants, railings, columns) are visible within or overlapping the selected area, the screen must appear BEHIND them naturally — exactly as a real installed screen would.
- Do NOT erase, cover, or alter any obstacles. They must remain fully visible in front of the screen.
- The screen fabric/mesh is visible in the areas NOT blocked by obstacles.
- Do NOT reshape the screen to dodge obstacles. Keep the screen rectangular and let obstacles sit in front.

ABSOLUTE RULES:
- Do NOT relocate the screen to a different opening.
- Do NOT expand the screen beyond the architectural opening.
- Do NOT remove the screen.
- Do NOT modify walls, posts, doors, windows, floor, ceiling, furniture, or plants outside the screen area.
- Do NOT create a roll-down animation frame, partially lowered shade, or triangular shade.

FRAME BARS MUST REMAIN VISIBLE AND ENHANCED:
- TOP CASSETTE: a thick horizontal bar at the top edge of the opening.
- LEFT and RIGHT SIDE TRACKS: slim vertical bars at the sides.
- BOTTOM RAIL: a medium-thickness horizontal bar at the bottom edge.
- ALL bars are ${color} powder-coated metal.
- Do NOT let the frame bars disappear, fade, or become thin/small. Keep them prominent.
- The bottom rail must be straight and horizontal, connecting the bottom-left to bottom-right corners.

ZERO GAP ENFORCEMENT:
- The outer edges of the screen frame and mesh must sit FLUSH against surrounding posts, beams, walls, and floor.
- There must be ZERO visible gap, crack, or sliver of space.
- The screen must seal the opening completely edge-to-edge.

${viewRules}

REFERENCE EXAMPLE IMAGE:
You will receive TWO images in this message:
- IMAGE #1 (the photo to enhance): Contains the placement guide with the screen area indicated. This is the ONLY image you should modify.
- IMAGE #2 (style reference): Shows a completed, professionally installed screen for visual quality guidance. Do NOT copy its layout, dimensions, architecture, or surroundings. Use it ONLY as a target for:
  - Screen fabric/mesh texture realism and weave density.
  - Frame bar proportions (top cassette thickness, side track width, bottom rail height).
  - Shadow subtlety and lighting integration around the frame.
  - Overall photorealism of a real installed retractable patio screen.
- IMPORTANT: Match the screen COLOR to "${color}" as requested above, NOT the color shown in the reference example. The reference is for quality/style only.

ALLOWED IMPROVEMENTS ONLY:
- Blend screen into existing lighting.
- Add realistic woven fabric texture matching the reference example's quality.
- Add subtle shadow under frame bars like the reference example.
- Enhance metal material realism.
- Make the screen look as professionally installed as the reference example.

Return only the enhanced photograph.`;
};

const extractImageUrl = (data) => {
    const message = data?.choices?.[0]?.message;
    if (message) {
        if (message.images && message.images.length > 0) {
            const imgObj = message.images[0];
            if (imgObj.image_url && imgObj.image_url.url) return imgObj.image_url.url;
            if (imgObj.url) return imgObj.url;
        }
        if (message.content) {
            const urlMatch = message.content.match(/(https?:\/\/[^\s\)]+)/);
            if (urlMatch && urlMatch[1]) return urlMatch[1];
        }
    }
    const findUrl = (obj) => {
        if (!obj || typeof obj !== 'object') return null;
        if (obj.url && typeof obj.url === 'string' && (obj.url.startsWith('http') || obj.url.startsWith('data:image/'))) return obj.url;
        for (const key of Object.keys(obj)) {
            const found = findUrl(obj[key]);
            if (found) return found;
        }
        return null;
    };
    return findUrl(data);
};

/**
 * Enhances a pre-composited image where the screen is already baked in place.
 * @param {string} compositeUrl Data URL of original+overlay composite
 * @param {string} viewType 'outside' | 'inside'
 * @param {string} screenColor
 * @param {Array} corners [{x%, y%, label}, ...]
 * @returns {Promise<string|null>} enhanced image URL
 */
export const enhanceScreenImage = async (
    compositeUrl,
    viewType = 'outside',
    screenColor = '',
    corners = []
) => {
    try {
        const prompt = buildEnhancementPrompt({ viewType, screenColor, corners });
        const exampleDataUrl = viewType === 'inside' ? INSIDE_EXAMPLE : OUTSIDE_EXAMPLE;
        const content = [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: compositeUrl } },
            { type: "image_url", image_url: { url: exampleDataUrl } }
        ];

        const data = await postToOpenRouterProxy({
            model: TARGET_MODEL,
            modalities: ["image"],
            messages: [{
                role: "user",
                content
            }]
        });

        console.log("Full OpenRouter Response:", JSON.stringify(data, null, 2));

        const resultUrl = extractImageUrl(data);
        if (resultUrl) return resultUrl;

        throw new Error("Could not find generated image URL in the AI response.");
    } catch (error) {
        console.error("AI Enhancement failed:", error);
        return null;
    }
};

/**
 * Legacy export for backward compatibility.
 */
export const generateScreenImage = async (file, viewType = 'outside', options = {}) => {
    if (options.compositeUrl) {
        return enhanceScreenImage(
            options.compositeUrl,
            viewType,
            options.screenColor,
            options.corners
        );
    }
    console.error('generateScreenImage now requires options.compositeUrl. Bake the overlay first.');
    return null;
};
