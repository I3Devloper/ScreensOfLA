/**
 * VisualizerCanvas - Canvas with screen overlay and corner pin controls
 */
import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from '@wordpress/element';
import { gsap } from 'gsap';
import '../styles/app.scss';

const VisualizerCanvas = forwardRef(({
    patioImage,
    screenOpacity,
    cornerPositions,
    onCornerChange,
    animationState,
    isAnimating,
    onAnimationComplete
}, ref) => {
    const containerRef = useRef(null);
    const imageRef = useRef(null);
    const screenWrapperRef = useRef(null);
    const screenOverlayRef = useRef(null);
    const pinRefs = useRef([]);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const [currentClipPath, setCurrentClipPath] = useState('');

    // Calculate container size based on image aspect ratio
    useEffect(() => {
        if (!imageRef.current?.complete) return;

        const img = imageRef.current;
        const naturalWidth = img.naturalWidth;
        const naturalHeight = img.naturalHeight;
        const aspectRatio = naturalWidth / naturalHeight;

        // Get container width (max 800px or full width of parent)
        const parentWidth = containerRef.current?.offsetWidth || 800;
        const maxWidth = Math.min(parentWidth, 800);
        const height = maxWidth / aspectRatio;

        setContainerSize({ width: maxWidth, height });

        // Initialize corner positions if not set
        if (!cornerPositions) {
            const margin = Math.min(maxWidth, height) * 0.1;
            onCornerChange(0, { x: margin, y: margin, label: 'TL' });
            onCornerChange(1, { x: maxWidth - margin, y: margin, label: 'TR' });
            onCornerChange(2, { x: maxWidth - margin, y: height - margin, label: 'BR' });
            onCornerChange(3, { x: margin, y: height - margin, label: 'BL' });
        }
    }, [patioImage, cornerPositions, onCornerChange]);

    // Update clip-path based on corner positions
    useEffect(() => {
        if (!cornerPositions) return;

        const [tl, tr, br, bl] = cornerPositions;
        const clipPath = `polygon(${tl.x}% ${tl.y}%, ${tr.x}% ${tr.y}%, ${br.x}% ${br.y}%, ${bl.x}% ${bl.y}%)`;
        setCurrentClipPath(clipPath);
    }, [cornerPositions]);

    // Handle GSAP animation for roll effect
    useEffect(() => {
        if (!screenWrapperRef.current || !screenOverlayRef.current) return;

        const wrapper = screenWrapperRef.current;
        const screen = screenOverlayRef.current;

        // Determine animation direction
        const targetClipPath = animationState === 'down'
            ? 'inset(0% 0% 0% 0%)'
            : 'inset(100% 0% 0% 0%)';

        // Animate the wrapper with GSAP
        const tl = gsap.timeline({
            onComplete: onAnimationComplete
        });

        tl.to(wrapper, {
            clipPath: targetClipPath,
            duration: 1.5,
            ease: 'power2.inOut'
        });

        return () => {
            tl.kill();
        };
    }, [animationState, onAnimationComplete]);

    // Handle corner pin drag
    const handlePinDrag = (index, startX, startY) => {
        return (e) => {
            e.preventDefault();

            const handleMove = (moveEvent) => {
                const rect = containerRef.current.getBoundingClientRect();
                const clientX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
                const clientY = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY;

                let newX = ((clientX - rect.left) / rect.width) * 100;
                let newY = ((clientY - rect.top) / rect.height) * 100;

                // Clamp to container bounds
                newX = Math.max(0, Math.min(100, newX));
                newY = Math.max(0, Math.min(100, newY));

                onCornerChange(index, { x: newX, y: newY });
            };

            const handleUp = () => {
                document.removeEventListener('mousemove', handleMove);
                document.removeEventListener('mouseup', handleUp);
                document.removeEventListener('touchmove', handleMove);
                document.removeEventListener('touchend', handleUp);
            };

            document.addEventListener('mousemove', handleMove);
            document.addEventListener('mouseup', handleUp);
            document.addEventListener('touchmove', handleMove, { passive: false });
            document.addEventListener('touchend', handleUp);
        };
    };

    // Export video function exposed via ref
    useImperativeHandle(ref, () => ({
        exportVideo: async (options = {}) => {
            const {
                duration = 5000,
                fps = 30,
                animationType = 'loop' // 'down', 'up', 'loop'
            } = options;

            // Create an off-screen canvas for recording
            const canvas = document.createElement('canvas');
            canvas.width = containerSize.width;
            canvas.height = containerSize.height;
            const ctx = canvas.getContext('2d');

            // Set up MediaRecorder
            const stream = canvas.captureStream(fps);
            const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
                ? 'video/webm;codecs=vp9'
                : 'video/webm';
            const recorder = new MediaRecorder(stream, { mimeType });
            const chunks = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunks.push(e.data);
                }
            };

            const recordingPromise = new Promise((resolve) => {
                recorder.onstop = () => {
                    const blob = new Blob(chunks, { type: 'video/webm' });
                    resolve(blob);
                };
            });

            recorder.start();

            // Animation frames
            const totalFrames = (duration / 1000) * fps;
            let currentFrame = 0;

            const renderFrame = () => {
                // Draw background image
                const img = imageRef.current;
                ctx.drawImage(img, 0, 0, containerSize.width, containerSize.height);

                // Calculate animation progress
                const progress = currentFrame / totalFrames;
                let insetPercent;

                // Animate based on type
                if (animationType === 'loop') {
                    // Roll down then up
                    if (progress < 0.5) {
                        insetPercent = 100 - (progress * 2 * 100); // 100% to 0%
                    } else {
                        insetPercent = (progress - 0.5) * 2 * 100; // 0% to 100%
                    }
                } else if (animationType === 'down') {
                    insetPercent = 100 - (progress * 100);
                } else {
                    insetPercent = progress * 100;
                }

                // Draw screen overlay with clipping
                ctx.save();

                // Create polygon path from corner positions
                if (cornerPositions) {
                    const [tl, tr, br, bl] = cornerPositions;
                    const tlX = (tl.x / 100) * containerSize.width;
                    const tlY = (tl.y / 100) * containerSize.height;
                    const trX = (tr.x / 100) * containerSize.width;
                    const trY = (tr.y / 100) * containerSize.height;
                    const brX = (br.x / 100) * containerSize.width;
                    const brY = (br.y / 100) * containerSize.height;
                    const blX = (bl.x / 100) * containerSize.width;
                    const blY = (bl.y / 100) * containerSize.height;

                    ctx.beginPath();
                    ctx.moveTo(tlX, tlY);
                    ctx.lineTo(trX, trY);
                    ctx.lineTo(brX, brY);
                    ctx.lineTo(blX, blY);
                    ctx.closePath();
                    ctx.clip();
                }

                // Apply inset clipping for roll animation
                const insetHeight = (insetPercent / 100) * containerSize.height;
                ctx.rect(0, insetHeight, containerSize.width, containerSize.height - insetHeight);
                ctx.clip();

                // Draw semi-transparent screen overlay
                ctx.fillStyle = `rgba(0, 0, 0, ${screenOpacity * 0.5})`;
                ctx.fillRect(0, 0, containerSize.width, containerSize.height);

                // Draw mesh pattern
                ctx.strokeStyle = `rgba(0, 0, 0, ${screenOpacity * 0.3})`;
                ctx.lineWidth = 0.5;
                const gridSize = 20;

                for (let x = 0; x <= containerSize.width; x += gridSize) {
                    ctx.beginPath();
                    ctx.moveTo(x, insetHeight);
                    ctx.lineTo(x, containerSize.height);
                    ctx.stroke();
                }

                for (let y = insetHeight; y <= containerSize.height; y += gridSize) {
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(containerSize.width, y);
                    ctx.stroke();
                }

                ctx.restore();

                currentFrame++;

                if (currentFrame <= totalFrames) {
                    requestAnimationFrame(renderFrame);
                } else {
                    recorder.stop();
                }
            };

            // Start rendering
            renderFrame();

            // Wait for recording to complete
            const blob = await recordingPromise;

            // Create download link
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `screen-visualizer-${Date.now()}.webm`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            return blob;
        }
    }));

    return (
        <div
            ref={containerRef}
            className="canvas-container"
            style={{ width: '100%', height: 'auto' }}
        >
            {/* Background Patio Image */}
            <img
                ref={imageRef}
                src={patioImage.url}
                alt="Patio"
                className="w-full h-full object-contain"
                draggable={false}
            />

            {/* Screen Animation Wrapper (handles roll effect) */}
            <div
                ref={screenWrapperRef}
                className="screen-anim-wrapper"
                style={{
                    clipPath: animationState === 'down' ? 'inset(0% 0% 0% 0%)' : 'inset(100% 0% 0% 0%)'
                }}
            >
                {/* Screen Overlay with Perspective Warp */}
                <div
                    ref={screenOverlayRef}
                    className="screen-overlay"
                    style={{
                        clipPath: currentClipPath,
                        opacity: screenOpacity
                    }}
                />
            </div>

            {/* Corner Pin Controls */}
            {cornerPositions?.map((corner, index) => (
                <div key={index}>
                    <div
                        className="corner-label"
                        style={{
                            left: `${corner.x}%`,
                            top: `${corner.y}%`
                        }}
                    >
                        {corner.label}
                    </div>
                    <div
                        ref={(el) => (pinRefs.current[index] = el)}
                        className="corner-pin"
                        style={{
                            left: `${corner.x}%`,
                            top: `${corner.y}%`
                        }}
                        onMouseDown={handlePinDrag(index, corner.x, corner.y)}
                        onTouchStart={handlePinDrag(index, corner.x, corner.y)}
                    />
                </div>
            ))}
        </div>
    );
});

VisualizerCanvas.displayName = 'VisualizerCanvas';

export default VisualizerCanvas;
