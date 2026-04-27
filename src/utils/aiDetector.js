/**
 * AI Detector Utility
 * Detects all architectural openings, returns candidates for user selection.
 */

import { postToOpenRouterProxy } from './openrouterProxy';

const TARGET_MODEL = "z-ai/glm-4.6v";
const CORNER_LABELS = ['TL', 'TR', 'BR', 'BL'];
const MAX_DIM = 1024;

const compressImageToBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > MAX_DIM || height > MAX_DIM) {
                    if (width > height) {
                        height = Math.round((height *= MAX_DIM / width));
                        width = MAX_DIM;
                    } else {
                        width = Math.round((width *= MAX_DIM / height));
                        height = MAX_DIM;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                resolve(dataUrl);
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
};

export const isValidDetectedCorners = (corners) => {
    if (!Array.isArray(corners) || corners.length !== 4) return false;
    return corners.every((corner, index) => {
        const expectedLabel = CORNER_LABELS[index];
        const x = Number(corner?.x);
        const y = Number(corner?.y);
        return (
            corner?.label === expectedLabel &&
            Number.isFinite(x) && Number.isFinite(y) &&
            x >= 0 && x <= 100 && y >= 0 && y <= 100
        );
    });
};

const isOpeningReasonablySized = (corners) => {
    const [tl, tr, br, bl] = corners;
    const minX = Math.min(tl.x, bl.x);
    const maxX = Math.max(tr.x, br.x);
    const minY = Math.min(tl.y, tr.y);
    const maxY = Math.max(br.y, bl.y);
    const widthPercent = maxX - minX;
    const heightPercent = maxY - minY;
    if (widthPercent < 5 || heightPercent < 5) return false;
    if (minX <= 1 && maxX >= 99 && minY <= 1 && maxY >= 99) return false;
    return true;
};

const parseCandidate = (raw, index) => {
    const corners = [
        { x: Number(raw?.TL?.x), y: Number(raw?.TL?.y), label: 'TL' },
        { x: Number(raw?.TR?.x), y: Number(raw?.TR?.y), label: 'TR' },
        { x: Number(raw?.BR?.x), y: Number(raw?.BR?.y), label: 'BR' },
        { x: Number(raw?.BL?.x), y: Number(raw?.BL?.y), label: 'BL' }
    ];
    if (!isValidDetectedCorners(corners) || !isOpeningReasonablySized(corners)) {
        return null;
    }
    return {
        id: `opening_${index}`,
        type: raw.type || 'unknown',
        confidence: Number(raw.confidence) || 0.8,
        corners,
        reason: raw.reason || ''
    };
};

/**
 * Detects all architectural openings in the image.
 * Returns an array of candidate openings.
 * @param {File} file
 * @returns {Promise<Array|null>} candidates or null on failure
 */
export const detectAllOpenings = async (file) => {
    try {
        const base64Image = await compressImageToBase64(file);

        const prompt = `You are a precision architectural opening detection system for screensofla.com.

Your job is to analyze this patio/interior photo and identify ALL visible architectural openings.

For each opening, return:
- type: one of [main_patio_opening, porch_opening, pergola_opening, garage_opening, sliding_door, french_door, secondary_door, window, decorative_glass, unknown]
- confidence: 0.0 to 1.0
- TL, TR, BR, BL: corner coordinates as percentages (0-100, one decimal place)
- reason: brief explanation

IMPORTANT RULES:
- A main_patio_opening is a large walk-through void between structural posts/beams.
- A window is NOT a valid screen target. Mark windows separately.
- Do NOT include nearby windows inside a patio opening polygon.
- Keep polygons TIGHT around each opening.

Return ONLY this JSON format (no markdown, no backticks):
{
  "openings": [
    {"type":"main_patio_opening","confidence":0.93,"TL":{"x":10.0,"y":15.0},"TR":{"x":80.0,"y":15.0},"BR":{"x":80.0,"y":85.0},"BL":{"x":10.0,"y":85.0},"reason":"Largest central opening between posts"},
    {"type":"window","confidence":0.88,"TL":{"x":85.0,"y":20.0},"TR":{"x":95.0,"y":20.0},"BR":{"x":95.0,"y":50.0},"BL":{"x":85.0,"y":50.0},"reason":"Side window"}
  ]
}`;

        const data = await postToOpenRouterProxy({
            model: TARGET_MODEL,
            messages: [{
                role: "user",
                content: [
                    { type: "text", text: prompt },
                    { type: "image_url", image_url: { url: base64Image } }
                ]
            }],
        });

        const message = data?.choices?.[0]?.message;
        if (!message?.content) {
            console.error("Detection API returned empty content.", data);
            return null;
        }

        let jsonStr = message.content.trim();
        if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '');
        }

        const parsed = JSON.parse(jsonStr);
        const rawOpenings = Array.isArray(parsed?.openings) ? parsed.openings : [];

        const candidates = rawOpenings
            .map((raw, idx) => parseCandidate(raw, idx))
            .filter(Boolean)
            .sort((a, b) => b.confidence - a.confidence);

        console.log('Detected openings:', candidates);
        return candidates;

    } catch (error) {
        console.error("AI Detection failed:", error);
        return null;
    }
};

/**
 * Legacy single-opening detection for backward compatibility.
 * @param {File} file
 * @returns {Promise<Array|null>} single corners array or null
 */
export const detectScreenCorners = async (file) => {
    const candidates = await detectAllOpenings(file);
    if (!candidates || candidates.length === 0) return null;
    // Prefer main_patio_opening, then highest confidence
    const preferred = candidates.find(c => c.type === 'main_patio_opening') || candidates[0];
    return preferred.corners;
};
