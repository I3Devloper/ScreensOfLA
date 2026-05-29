/**
 * ImageUploader - Modern drag-and-drop image upload with camera capture
 */
import { useState, useCallback, useEffect, useRef } from '@wordpress/element';

const ImageUploader = ( {
	onImageUpload,
	onClearImage,
	currentImage,
	disabled = false,
	children = null,
	isProcessing = false,
} ) => {
	const [ isDragging, setIsDragging ] = useState( false );
	const [ error, setError ] = useState( null );
	const [ isCameraOpen, setIsCameraOpen ] = useState( false );
	const [ isCameraLoading, setIsCameraLoading ] = useState( false );
	const [ cameraError, setCameraError ] = useState( null );
	const uploadInputRef = useRef( null );
	const videoRef = useRef( null );
	const canvasRef = useRef( null );
	const streamRef = useRef( null );

	const validateFile = useCallback( ( file ) => {
		const validTypes = [
			'image/jpeg',
			'image/jpg',
			'image/png',
			'image/webp',
			'image/gif',
			'image/heic',
			'image/heif',
		];
		if ( ! validTypes.includes( file.type ) ) {
			setError(
				'Please upload a valid image file (JPG, PNG, WebP, GIF, HEIC, or HEIF)'
			);
			return false;
		}

		const maxSize = 10 * 1024 * 1024;
		if ( file.size > maxSize ) {
			setError( 'Image file must be smaller than 10MB' );
			return false;
		}

		setError( null );
		return true;
	}, [] );

	const handleFile = useCallback(
		( file ) => {
			if ( ! validateFile( file ) ) {
				return;
			}
			onImageUpload( file );
		},
		[ onImageUpload, validateFile ]
	);

	const openCameraPicker = useCallback( () => {
		if ( ! disabled ) {
			setCameraError( null );
			setIsCameraOpen( true );
		}
	}, [ disabled ] );

	const openUploadPicker = useCallback( () => {
		if ( ! disabled ) {
			uploadInputRef.current?.click();
		}
	}, [ disabled ] );

	const handleDrop = useCallback(
		( e ) => {
			e.preventDefault();
			setIsDragging( false );
			if ( disabled ) {
				return;
			}
			const files = Array.from( e.dataTransfer.files );
			if ( files.length > 0 ) {
				handleFile( files[ 0 ] );
			}
		},
		[ disabled, handleFile ]
	);

	const handleDragOver = useCallback(
		( e ) => {
			e.preventDefault();
			if ( ! disabled ) {
				setIsDragging( true );
			}
		},
		[ disabled ]
	);

	const handleDragLeave = useCallback( ( e ) => {
		e.preventDefault();
		setIsDragging( false );
	}, [] );

	const handleFileInput = useCallback(
		( e ) => {
			const files = e.target.files;
			if ( files && files.length > 0 ) {
				handleFile( files[ 0 ] );
			}
		},
		[ handleFile ]
	);

	const handleDropZoneClick = useCallback( () => {
		openUploadPicker();
	}, [ openUploadPicker ] );

	const handleDropZoneKeyDown = useCallback(
		( e ) => {
			if ( e.key === 'Enter' || e.key === ' ' ) {
				e.preventDefault();
				openUploadPicker();
			}
		},
		[ openUploadPicker ]
	);

	const handleRemove = useCallback(
		( e ) => {
			e.stopPropagation();
			if ( onClearImage ) {
				onClearImage();
			}
		},
		[ onClearImage ]
	);

	const stopCameraStream = useCallback( () => {
		if ( streamRef.current ) {
			streamRef.current.getTracks().forEach( ( track ) => track.stop() );
			streamRef.current = null;
		}
		if ( videoRef.current ) {
			videoRef.current.srcObject = null;
		}
	}, [] );

	const closeCameraCapture = useCallback( () => {
		stopCameraStream();
		setIsCameraOpen( false );
		setIsCameraLoading( false );
		setCameraError( null );
	}, [ stopCameraStream ] );

	useEffect( () => {
		if ( ! isCameraOpen ) {
			stopCameraStream();
			return undefined;
		}

		let cancelled = false;

		const startCamera = async () => {
			if ( ! navigator.mediaDevices?.getUserMedia ) {
				setCameraError(
					'Camera capture is not supported in this browser.'
				);
				setIsCameraLoading( false );
				return;
			}

			setIsCameraLoading( true );
			setCameraError( null );

			try {
				const stream = await navigator.mediaDevices.getUserMedia( {
					video: {
						facingMode: { ideal: 'environment' },
						width: { ideal: 1920 },
						height: { ideal: 1080 },
					},
					audio: false,
				} );

				if ( cancelled ) {
					stream.getTracks().forEach( ( track ) => track.stop() );
					return;
				}

				streamRef.current = stream;
				if ( videoRef.current ) {
					videoRef.current.srcObject = stream;
					await videoRef.current.play();
				}
			} catch ( err ) {
				if ( cancelled ) {
					return;
				}
				console.error( 'Camera capture failed:', err );
				if ( err?.name === 'NotAllowedError' ) {
					setCameraError( 'Camera permission was denied.' );
				} else if ( err?.name === 'NotFoundError' ) {
					setCameraError( 'No camera was found on this device.' );
				} else {
					setCameraError( 'Could not open the camera.' );
				}
				stopCameraStream();
			} finally {
				if ( ! cancelled ) {
					setIsCameraLoading( false );
				}
			}
		};

		startCamera();
		return () => {
			cancelled = true;
			stopCameraStream();
		};
	}, [ isCameraOpen, stopCameraStream ] );

	const captureCameraPhoto = useCallback( () => {
		const video = videoRef.current;
		const canvas = canvasRef.current;

		if ( ! video || ! canvas ) {
			setCameraError( 'Camera is not ready yet.' );
			return;
		}

		if ( ! video.videoWidth || ! video.videoHeight ) {
			setCameraError(
				'Camera is still starting. Please try again in a moment.'
			);
			return;
		}

		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		const context = canvas.getContext( '2d' );
		if ( ! context ) {
			setCameraError( 'Could not create a capture canvas.' );
			return;
		}

		context.drawImage( video, 0, 0, canvas.width, canvas.height );
		canvas.toBlob(
			( blob ) => {
				if ( ! blob ) {
					setCameraError( 'Could not capture the photo.' );
					return;
				}
				const file = new File(
					[ blob ],
					`screen-visualizer-camera-${ Date.now() }.jpg`,
					{ type: 'image/jpeg' }
				);
				onImageUpload( file );
				closeCameraCapture();
			},
			'image/jpeg',
			0.95
		);
	}, [ closeCameraCapture, onImageUpload ] );

	return (
		<div>
			{ currentImage ? (
				<div className="sv-image-preview">
					{ children ? (
						<div className="relative">
							{ children }
							{ onClearImage && (
								<button
									onClick={ handleRemove }
									className="sv-remove-btn"
									aria-label="Remove image"
									type="button"
								>
									×
								</button>
							) }
							{ isProcessing && (
								<div className="absolute inset-0 bg-white/70 flex flex-col items-center justify-center z-10">
									<div className="sv-spinner w-6 h-6 mb-2" />
									<span className="text-xs text-slate-600 font-medium">
										Preparing image…
									</span>
								</div>
							) }
						</div>
					) : (
						<div className="sv-image-thumbnail relative">
							<img
								src={ currentImage.url }
								alt={ currentImage.name }
							/>
							{ onClearImage && (
								<button
									onClick={ handleRemove }
									className="sv-remove-btn"
									aria-label="Remove image"
									type="button"
								>
									×
								</button>
							) }
							{ isProcessing && (
								<div className="absolute inset-0 bg-white/70 flex flex-col items-center justify-center z-10">
									<div className="sv-spinner w-6 h-6 mb-2" />
									<span className="text-xs text-slate-600 font-medium">
										Preparing image…
									</span>
								</div>
							) }
						</div>
					) }
				</div>
			) : (
				<div
					className={ `sv-drop-zone ${
						isDragging ? 'drag-over' : ''
					}` }
					onDrop={ handleDrop }
					onDragOver={ handleDragOver }
					onDragLeave={ handleDragLeave }
					onClick={ handleDropZoneClick }
					onKeyDown={ handleDropZoneKeyDown }
					role="button"
					tabIndex={ 0 }
					aria-label="Upload patio photo"
				>
					<div className="flex flex-col items-center">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							className="w-9 h-9 text-slate-300 mb-2.5 transition-colors duration-200"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={ 1.5 }
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 20.25h18M12.75 6.75h.008v.008h-.008V6.75z"
							/>
						</svg>
						<p className="text-slate-500 text-sm font-medium">
							{ isDragging
								? 'Drop photo here'
								: 'Drag photo or click to browse' }
						</p>
						<p className="text-slate-400 text-xs mt-1">
							JPG, PNG up to 10MB
						</p>
					</div>
				</div>
			) }

			<div className="mt-3 flex gap-2">
				<button
					type="button"
					onClick={ openCameraPicker }
					className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-3 rounded-lg text-sm font-medium border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed sm:text-xs sm:py-2"
					disabled={ disabled }
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						className="w-3.5 h-3.5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={ 2 }
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
						/>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"
						/>
					</svg>
					Take Photo
				</button>
				<button
					type="button"
					onClick={ openUploadPicker }
					className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-3 rounded-lg text-sm font-medium bg-brand-600 text-white transition hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed sm:text-xs sm:py-2"
					disabled={ disabled }
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						className="w-3.5 h-3.5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={ 2 }
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
						/>
					</svg>
					Upload
				</button>
			</div>

			{ error && (
				<p className="text-red-600 text-xs mt-2.5 bg-red-50 px-2.5 py-1.5 rounded-md border border-red-100">
					{ error }
				</p>
			) }

			<input
				ref={ uploadInputRef }
				type="file"
				accept="image/*"
				onChange={ handleFileInput }
				className="hidden"
				disabled={ disabled }
			/>

			{ isCameraOpen && (
				<div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4">
					<div className="w-full max-h-[95vh] overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl sm:max-w-3xl flex flex-col">
						<div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
							<h4 className="text-sm font-semibold text-slate-900">
								Camera
							</h4>
							<button
								type="button"
								onClick={ closeCameraCapture }
								className="text-slate-400 hover:text-slate-700 transition-colors p-1"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									className="w-5 h-5"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									strokeWidth={ 2 }
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</button>
						</div>

						<div className="relative bg-black flex-1 min-h-0">
							{ isCameraLoading && ! cameraError && (
								<div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-white">
									<div className="sv-spinner w-8 h-8 mb-3 border-white/30 border-t-white" />
									<p className="text-sm">Starting camera…</p>
								</div>
							) }

							{ cameraError ? (
								<div className="flex min-h-[40vh] sm:min-h-[50vh] flex-col items-center justify-center gap-3 px-6 py-10 text-center text-white">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										className="w-10 h-10 text-white/60 mb-1"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										strokeWidth={ 1.5 }
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
										/>
									</svg>
									<p className="text-sm">{ cameraError }</p>
									<button
										type="button"
										onClick={ () => {
											closeCameraCapture();
											openUploadPicker();
										} }
										className="mt-1 inline-flex items-center px-4 py-2.5 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 transition sm:text-xs sm:py-2"
									>
										Upload Instead
									</button>
								</div>
							) : (
								<video
									ref={ videoRef }
									className="h-[40vh] sm:h-[50vh] w-full object-contain"
									autoPlay
									playsInline
									muted
								/>
							) }
						</div>

						<div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-100">
							<button
								type="button"
								onClick={ closeCameraCapture }
								className="inline-flex items-center px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition sm:text-xs sm:px-3 sm:py-2"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={ captureCameraPhoto }
								disabled={
									disabled ||
									isCameraLoading ||
									!! cameraError
								}
								className="inline-flex items-center px-4 py-2.5 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 transition disabled:opacity-40 disabled:cursor-not-allowed sm:text-xs sm:px-3 sm:py-2"
							>
								Capture
							</button>
						</div>
						<canvas ref={ canvasRef } className="hidden" />
					</div>
				</div>
			) }
		</div>
	);
};

export default ImageUploader;
