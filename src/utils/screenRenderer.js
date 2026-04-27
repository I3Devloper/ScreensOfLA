/**
 * Screen Renderer Utility
 * Deterministically renders a screen overlay onto a canvas.
 * Output: HTMLCanvasElement with transparent background containing only the screen.
 */

const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const normalizeColor = (colorName) => {
    const map = {
        'dark bronze': '#5C4033',
        'bronze': '#8C7853',
        'black': '#1a1a1a',
        'white': '#f5f5f5',
        'gray': '#808080',
        'grey': '#808080',
        'silver': '#C0C0C0',
        'beige': '#F5F5DC',
        'brown': '#654321',
    };
    const cleaned = (colorName || 'dark bronze').toLowerCase().trim();
    return map[cleaned] || '#5C4033';
};

/**
 * Renders a deterministic screen overlay.
 *
 * @param {Object} params
 * @param {number} params.width - canvas width
 * @param {number} params.height - canvas height
 * @param {Array} params.corners - [{x%, y%, label}, ...]
 * @param {string} params.viewType - 'inside' | 'outside'
 * @param {string} params.screenColor - e.g. 'dark bronze'
 * @param {number} params.interiorVisibility - 90 or 95
 * @returns {HTMLCanvasElement}
 */
export const renderScreenOverlay = ({
    width,
    height,
    corners,
    viewType,
    screenColor,
    interiorVisibility
}) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const color = normalizeColor(screenColor);
    const isInside = viewType === 'inside';
    const visibility = interiorVisibility || 90;

    // Convert percentage corners to pixel coordinates
    const pts = corners.map(c => ({
        x: (c.x / 100) * width,
        y: (c.y / 100) * height
    }));

    // Define polygon clip path
    ctx.save();
    ctx.beginPath();
    pts.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.clip();

    if (isInside) {
        // INTERIOR: Semi-transparent fine mesh + visible frame bars
        const meshOpacity = 1 - (visibility / 100); // 90% visible = 0.1 opacity
        const meshColor = hexToRgba(color, meshOpacity);

        // Fill with tinted color
        ctx.fillStyle = hexToRgba(color, meshOpacity * 0.3);
        ctx.fillRect(0, 0, width, height);

        // Fine crosshatch weave
        ctx.strokeStyle = meshColor;
        ctx.lineWidth = 0.5;
        const gridSize = 3;
        for (let x = 0; x <= width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let y = 0; y <= height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Frame bars — VISIBLE from interior (slightly thinner than exterior but still prominent)
        // Top cassette (thickest)
        ctx.strokeStyle = color;
        ctx.lineWidth = 10;
        ctx.lineCap = 'square';
        ctx.stroke();

        // Side tracks
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[3].x, pts[3].y);
        ctx.moveTo(pts[1].x, pts[1].y);
        ctx.lineTo(pts[2].x, pts[2].y);
        ctx.lineWidth = 5;
        ctx.stroke();

        // Bottom rail
        ctx.beginPath();
        ctx.moveTo(pts[3].x, pts[3].y);
        ctx.lineTo(pts[2].x, pts[2].y);
        ctx.lineWidth = 7;
        ctx.stroke();

        // Subtle shadow under hardware
        ctx.shadowColor = 'rgba(0,0,0,0.2)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
        ctx.stroke();
        ctx.shadowColor = 'transparent';

    } else {
        // EXTERIOR: Opaque woven fabric + visible hardware
        // Base fabric fill
        ctx.fillStyle = hexToRgba(color, 0.92);
        ctx.fillRect(0, 0, width, height);

        // Woven crosshatch pattern (thicker than interior)
        ctx.strokeStyle = hexToRgba(color, 0.6);
        ctx.lineWidth = 1;
        const weaveSize = 6;
        for (let x = 0; x <= width; x += weaveSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let y = 0; y <= height; y += weaveSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Light variation for fabric realism
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        for (let i = 0; i < 20; i++) {
            const rx = Math.random() * width;
            const ry = Math.random() * height;
            const rw = 30 + Math.random() * 80;
            const rh = 30 + Math.random() * 80;
            ctx.fillRect(rx, ry, rw, rh);
        }

        // Hardware frame (visible on exterior)
        // Top cassette (thickest)
        ctx.strokeStyle = color;
        ctx.lineWidth = 12;
        ctx.lineCap = 'square';
        ctx.stroke();

        // Side tracks
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[3].x, pts[3].y);
        ctx.moveTo(pts[1].x, pts[1].y);
        ctx.lineTo(pts[2].x, pts[2].y);
        ctx.lineWidth = 6;
        ctx.stroke();

        // Bottom rail
        ctx.beginPath();
        ctx.moveTo(pts[3].x, pts[3].y);
        ctx.lineTo(pts[2].x, pts[2].y);
        ctx.lineWidth = 8;
        ctx.stroke();

        // Subtle shadow under hardware
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 3;
        ctx.stroke();
        ctx.shadowColor = 'transparent';
    }

    ctx.restore();

    return canvas;
};
