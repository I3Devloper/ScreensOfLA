/**
 * OpeningSelector - Canvas-based polygon editor for patio opening selection.
 */
import { useState, useEffect, useRef, useCallback } from '@wordpress/element';

const PIN_RADIUS = 8;
const PIN_HIT_RADIUS = 16;

const sortCorners = (pts) => {
    // Auto-sort 4 points into TL, TR, BR, BL based on geometry
    const sortedY = [...pts].sort((a, b) => a.y - b.y);
    const topTwo = sortedY.slice(0, 2).sort((a, b) => a.x - b.x);
    const bottomTwo = sortedY.slice(2, 4).sort((a, b) => a.x - b.x);
    return [
        { ...topTwo[0], label: 'TL' },
        { ...topTwo[1], label: 'TR' },
        { ...bottomTwo[1], label: 'BR' },
        { ...bottomTwo[0], label: 'BL' }
    ];
};

const getMousePos = (canvas, evt) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
};

const pct = (val, total) => (val / total) * 100;

const OpeningSelector = ({
    imageUrl,
    candidates = [],
    onChange,
    onAutoDetect,
    disabled = false,
    viewType = 'outside'
}) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [imgSize, setImgSize] = useState({ width: 0, height: 0 });
    const [pins, setPins] = useState([]);
    const [selectedCandidateId, setSelectedCandidateId] = useState(null);
    const [mode, setMode] = useState('empty'); // 'empty' | 'auto' | 'manual' | 'selected'
    const [draggingPin, setDraggingPin] = useState(null);
    const [manualStep, setManualStep] = useState(0);
    const imageRef = useRef(null);

    // Load image and set canvas size
    useEffect(() => {
        if (!imageUrl) return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            imageRef.current = img;
            const maxW = containerRef.current?.clientWidth || 800;
            const aspect = img.naturalWidth / img.naturalHeight;
            const width = Math.min(maxW, img.naturalWidth);
            const height = width / aspect;
            setImgSize({ width, height });
        };
        img.src = imageUrl;
    }, [imageUrl]);

    // When candidates arrive from auto-detect
    useEffect(() => {
        if (candidates.length > 0) {
            const best = candidates[0];
            setPins(best.corners);
            setSelectedCandidateId(best.id);
            setMode('auto');
            onChange(best.corners);
        }
    }, [candidates]);

    // Draw canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !imageRef.current) return;
        canvas.width = imgSize.width;
        canvas.height = imgSize.height;
        const ctx = canvas.getContext('2d');

        // Clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw image
        ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height);

        // Draw all candidate polygons (semi-transparent)
        candidates.forEach((cand) => {
            const isSelected = cand.id === selectedCandidateId;
            ctx.save();
            ctx.beginPath();
            cand.corners.forEach((c, i) => {
                const x = (c.x / 100) * canvas.width;
                const y = (c.y / 100) * canvas.height;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.closePath();
            ctx.strokeStyle = isSelected ? '#2563eb' : '#9ca3af';
            ctx.lineWidth = isSelected ? 3 : 1.5;
            ctx.setLineDash(isSelected ? [] : [5, 5]);
            ctx.stroke();
            if (isSelected) {
                ctx.fillStyle = 'rgba(37, 99, 235, 0.08)';
                ctx.fill();
            }
            ctx.restore();

            // Label
            const first = cand.corners[0];
            const lx = (first.x / 100) * canvas.width;
            const ly = (first.y / 100) * canvas.height;
            ctx.save();
            ctx.fillStyle = isSelected ? '#2563eb' : '#6b7280';
            ctx.font = '12px sans-serif';
            ctx.fillText(`${cand.type} (${Math.round(cand.confidence * 100)}%)`, lx + 8, ly - 8);
            ctx.restore();
        });

        // Draw selected polygon pins
        if (pins.length === 4) {
            pins.forEach((pin, index) => {
                const x = (pin.x / 100) * canvas.width;
                const y = (pin.y / 100) * canvas.height;

                // Pin circle
                ctx.beginPath();
                ctx.arc(x, y, PIN_RADIUS, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
                ctx.strokeStyle = '#111827';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Label
                ctx.fillStyle = '#111827';
                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(pin.label, x, y);
            });
        }
    }, [imgSize, pins, candidates, selectedCandidateId]);

    const handleMouseDown = useCallback((e) => {
        if (disabled) return;
        if (!canvasRef.current || imgSize.width === 0) return;

        const pos = getMousePos(canvasRef.current, e);
        const { width, height } = imgSize;

        // Check if clicking a pin (only when 4 pins exist)
        if (pins.length === 4) {
            for (let i = 0; i < pins.length; i++) {
                const px = (pins[i].x / 100) * width;
                const py = (pins[i].y / 100) * height;
                const dist = Math.hypot(pos.x - px, pos.y - py);
                if (dist <= PIN_HIT_RADIUS) {
                    setDraggingPin(i);
                    return;
                }
            }
        }

        // Manual mode: place next pin
        if (pins.length < 4) {
            const newPin = { x: pct(pos.x, width), y: pct(pos.y, height) };
            const nextPins = [...pins, newPin];
            if (nextPins.length === 4) {
                const sorted = sortCorners(nextPins);
                setPins(sorted);
                setMode('manual');
                setManualStep(4);
                onChange(sorted);
            } else {
                setPins(nextPins);
                setManualStep(nextPins.length);
            }
            return;
        }

        // Click on a candidate polygon (when 4 pins exist and not dragging)
        if (candidates.length > 0) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            for (const cand of candidates) {
                ctx.beginPath();
                cand.corners.forEach((c, i) => {
                    const x = (c.x / 100) * width;
                    const y = (c.y / 100) * height;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                });
                ctx.closePath();
                if (ctx.isPointInPath(pos.x, pos.y)) {
                    setSelectedCandidateId(cand.id);
                    setPins(cand.corners);
                    onChange(cand.corners);
                    return;
                }
            }
        }
    }, [disabled, mode, pins, manualStep, imgSize, candidates, onChange]);

    const handleMouseMove = useCallback((e) => {
        if (draggingPin === null) return;
        const pos = getMousePos(canvasRef.current, e);
        const { width, height } = imgSize;
        const clampedX = Math.max(0, Math.min(100, pct(pos.x, width)));
        const clampedY = Math.max(0, Math.min(100, pct(pos.y, height)));
        const newPins = [...pins];
        newPins[draggingPin] = {
            ...newPins[draggingPin],
            x: clampedX,
            y: clampedY
        };
        setPins(newPins);
        onChange(newPins);
    }, [draggingPin, pins, imgSize, onChange]);

    const handleMouseUp = useCallback(() => {
        setDraggingPin(null);
    }, []);

    const handleAutoDetect = useCallback(() => {
        setMode('empty');
        setPins([]);
        setManualStep(0);
        onAutoDetect();
    }, [onAutoDetect]);

    const handleReset = useCallback(() => {
        setPins([]);
        setSelectedCandidateId(null);
        setMode('empty');
        setManualStep(0);
        onChange([]);
    }, [onChange]);

    const handleClearManual = useCallback(() => {
        setPins([]);
        setManualStep(0);
        setMode('empty');
        onChange([]);
    }, [onChange]);

    const stepLabels = ['Click top-left', 'Click top-right', 'Click bottom-right', 'Click bottom-left'];

    return (
        <div className="opening-selector" ref={containerRef}>
            <div className="opening-selector-toolbar">
                <button
                    type="button"
                    className="btn btn-secondary text-xs"
                    onClick={handleAutoDetect}
                    disabled={disabled}
                >
                    Auto Detect
                </button>
                <button
                    type="button"
                    className="btn btn-secondary text-xs"
                    onClick={handleClearManual}
                    disabled={disabled || pins.length === 0}
                >
                    Clear
                </button>
                <button
                    type="button"
                    className="btn btn-secondary text-xs"
                    onClick={handleReset}
                    disabled={disabled}
                >
                    Reset All
                </button>
            </div>

            {(mode === 'manual' || mode === 'empty') && manualStep < 4 && (
                <p className="opening-selector-hint">
                    {stepLabels[manualStep] || 'Click 4 corners of the patio opening'}
                </p>
            )}

            {candidates.length > 0 && (
                <div className="opening-selector-candidates">
                    {candidates.map((cand) => (
                        <button
                            key={cand.id}
                            type="button"
                            className={`candidate-chip ${selectedCandidateId === cand.id ? 'active' : ''}`}
                            onClick={() => {
                                setSelectedCandidateId(cand.id);
                                setPins(cand.corners);
                                setMode('auto');
                                onChange(cand.corners);
                            }}
                        >
                            <span className="candidate-type">{cand.type.replace(/_/g, ' ')}</span>
                            <span className="candidate-confidence">{Math.round(cand.confidence * 100)}%</span>
                        </button>
                    ))}
                </div>
            )}

            <div className="opening-selector-canvas-wrap">
                <canvas
                    ref={canvasRef}
                    className="opening-selector-canvas"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onTouchStart={handleMouseDown}
                    onTouchMove={handleMouseMove}
                    onTouchEnd={handleMouseUp}
                    style={{ width: '100%', height: 'auto', cursor: draggingPin !== null ? 'grabbing' : 'crosshair' }}
                />
            </div>
        </div>
    );
};

export default OpeningSelector;
