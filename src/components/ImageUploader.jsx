/**
 * ImageUploader - Minimal drag and drop image upload component
 */
import { useState, useCallback, useEffect, useRef } from '@wordpress/element';

const ImageUploader = ({
    onImageUpload,
    onClearImage,
    currentImage,
    disabled = false,
    isDetecting = false,
    children = null,
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState(null);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [isCameraLoading, setIsCameraLoading] = useState(false);
    const [cameraError, setCameraError] = useState(null);
    const uploadInputRef = useRef(null);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);

    const validateFile = useCallback((file) => {
        const validTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/webp',
            'image/gif',
            'image/heic',
            'image/heif',
        ];
        if (!validTypes.includes(file.type)) {
            setError('Please upload a valid image file (JPG, PNG, WebP, GIF, HEIC, or HEIF)');
            return false;
        }

        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            setError('Image file must be smaller than 10MB');
            return false;
        }

        setError(null);
        return true;
    }, []);

    const handleFile = useCallback((file) => {
        if (!validateFile(file)) return;
        onImageUpload(file);
    }, [onImageUpload, validateFile]);

    const openCameraPicker = useCallback(() => {
        if (!disabled && !isDetecting) {
            setCameraError(null);
            setIsCameraOpen(true);
        }
    }, [disabled, isDetecting]);

    const openUploadPicker = useCallback(() => {
        if (!disabled && !isDetecting) {
            uploadInputRef.current?.click();
        }
    }, [disabled, isDetecting]);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setIsDragging(false);
        if (disabled || isDetecting) return;
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) handleFile(files[0]);
    }, [disabled, isDetecting, handleFile]);

    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        if (!disabled && !isDetecting) setIsDragging(true);
    }, [disabled, isDetecting]);

    const handleDragLeave = useCallback((e) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleFileInput = useCallback((e) => {
        const files = e.target.files;
        if (files && files.length > 0) handleFile(files[0]);
    }, [handleFile]);

    const handleDropZoneClick = useCallback(() => {
        openUploadPicker();
    }, [openUploadPicker]);

    const handleDropZoneKeyDown = useCallback((e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openUploadPicker();
        }
    }, [openUploadPicker]);

    const handleRemove = useCallback((e) => {
        e.stopPropagation();
        if (onClearImage) onClearImage();
    }, [onClearImage]);

    const stopCameraStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) videoRef.current.srcObject = null;
    }, []);

    const closeCameraCapture = useCallback(() => {
        stopCameraStream();
        setIsCameraOpen(false);
        setIsCameraLoading(false);
        setCameraError(null);
    }, [stopCameraStream]);

    useEffect(() => {
        if (!isCameraOpen) {
            stopCameraStream();
            return undefined;
        }

        let cancelled = false;

        const startCamera = async () => {
            if (!navigator.mediaDevices?.getUserMedia) {
                setCameraError('Camera capture is not supported in this browser.');
                setIsCameraLoading(false);
                return;
            }

            setIsCameraLoading(true);
            setCameraError(null);

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                    },
                    audio: false,
                });

                if (cancelled) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }

                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }
            } catch (err) {
                if (cancelled) return;
                console.error('Camera capture failed:', err);
                if (err?.name === 'NotAllowedError') {
                    setCameraError('Camera permission was denied.');
                } else if (err?.name === 'NotFoundError') {
                    setCameraError('No camera was found on this device.');
                } else {
                    setCameraError('Could not open the camera.');
                }
                stopCameraStream();
            } finally {
                if (!cancelled) setIsCameraLoading(false);
            }
        };

        startCamera();
        return () => {
            cancelled = true;
            stopCameraStream();
        };
    }, [isCameraOpen, stopCameraStream]);

    const captureCameraPhoto = useCallback(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (!video || !canvas) {
            setCameraError('Camera is not ready yet.');
            return;
        }

        if (!video.videoWidth || !video.videoHeight) {
            setCameraError('Camera is still starting. Please try again in a moment.');
            return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (!context) {
            setCameraError('Could not create a capture canvas.');
            return;
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
            if (!blob) {
                setCameraError('Could not capture the photo.');
                return;
            }
            const file = new File(
                [blob],
                `screen-visualizer-camera-${Date.now()}.jpg`,
                { type: 'image/jpeg' }
            );
            onImageUpload(file);
            closeCameraCapture();
        }, 'image/jpeg', 0.95);
    }, [closeCameraCapture, onImageUpload]);

    return (
        <div>
            {currentImage ? (
                <div className="image-preview-area relative">
                    {children ? (
                        <div className="relative">
                            {children}
                            {!isDetecting && onClearImage && (
                                <button
                                    onClick={handleRemove}
                                    className="remove-btn"
                                    aria-label="Remove image"
                                    type="button"
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="image-thumbnail drop-zone has-image relative overflow-hidden">
                            <img src={currentImage.url} alt={currentImage.name} className={isDetecting ? 'opacity-50' : ''} />

                            {isDetecting && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 z-10">
                                    <div className="spinner w-6 h-6 mb-2" />
                                    <p className="text-xs font-medium text-gray-700">Scanning...</p>
                                </div>
                            )}

                            {!isDetecting && onClearImage && (
                                <button
                                    onClick={handleRemove}
                                    className="remove-btn"
                                    aria-label="Remove image"
                                    type="button"
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <div
                    className={`drop-zone ${isDragging ? 'drag-over' : ''}`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={handleDropZoneClick}
                    onKeyDown={handleDropZoneKeyDown}
                    role="button"
                    tabIndex={0}
                    aria-label="Upload patio photo"
                >
                    <div className="flex flex-col items-center">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="w-8 h-8 text-gray-300 mb-2"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                        </svg>
                        <p className="text-gray-500 text-sm">
                            {isDragging ? 'Drop photo here' : 'Drag photo or click to browse'}
                        </p>
                        <p className="text-gray-300 text-xs mt-1">JPG, PNG up to 10MB</p>
                    </div>
                </div>
            )}

            <div className="mt-2 flex gap-2">
                <button
                    type="button"
                    onClick={openCameraPicker}
                    className="btn btn-secondary flex-1 text-xs"
                    disabled={disabled || isDetecting}
                >
                    Take Photo
                </button>
                <button
                    type="button"
                    onClick={openUploadPicker}
                    className="btn btn-primary flex-1 text-xs"
                    disabled={disabled || isDetecting}
                >
                    Upload
                </button>
            </div>

            {error && (
                <p className="text-red-600 text-xs mt-2">{error}</p>
            )}

            <input
                ref={uploadInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileInput}
                className="hidden"
                disabled={disabled}
            />

            {isCameraOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
                    <div className="w-full max-w-3xl overflow-hidden rounded-xl bg-white">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                            <h4 className="text-sm font-semibold text-gray-900">Camera</h4>
                            <button
                                type="button"
                                onClick={closeCameraCapture}
                                className="text-gray-500 hover:text-gray-900 text-sm"
                            >
                                Close
                            </button>
                        </div>

                        <div className="relative bg-black">
                            {isCameraLoading && !cameraError && (
                                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-white">
                                    <div className="spinner w-8 h-8 border-4 mb-3" />
                                    <p className="text-sm">Starting camera...</p>
                                </div>
                            )}

                            {cameraError ? (
                                <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 py-10 text-center text-white">
                                    <p className="text-sm">{cameraError}</p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            closeCameraCapture();
                                            openUploadPicker();
                                        }}
                                        className="btn btn-primary text-xs"
                                    >
                                        Upload Instead
                                    </button>
                                </div>
                            ) : (
                                <video
                                    ref={videoRef}
                                    className="h-[50vh] w-full object-contain"
                                    autoPlay
                                    playsInline
                                    muted
                                />
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100">
                            <button
                                type="button"
                                onClick={closeCameraCapture}
                                className="btn btn-secondary text-xs"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={captureCameraPhoto}
                                disabled={disabled || isDetecting || isCameraLoading || !!cameraError}
                                className="btn btn-primary text-xs"
                            >
                                Capture
                            </button>
                        </div>
                        <canvas ref={canvasRef} className="hidden" />
                    </div>
                </div>
            )}
        </div>
    );
};

export default ImageUploader;
