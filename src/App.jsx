/**
 * Screen Visualizer - Main App Component
 * Deterministic Canvas Render — no AI. Pixel-perfect screen placement.
 */
import { useState, useCallback, useRef } from '@wordpress/element';
import ImageUploader from './components/ImageUploader';
import OpeningSelector from './components/OpeningSelector';
import { useViewState } from './hooks/useViewState';
import { createWorkingImage, bakeOverlay } from './utils/imageUtils';
import { addWatermark } from './utils/imageCompositor';
import { renderScreenOverlay } from './utils/screenRenderer';
import { exportVideo } from './utils/videoExporter';

const PRESET_COLORS = [
	{ name: 'Dark Bronze', hex: '#5C4033' },
	{ name: 'Black', hex: '#1a1a1a' },
	{ name: 'White', hex: '#f5f5f5' },
	{ name: 'Beige', hex: '#F5F5DC' },
	{ name: 'Slate', hex: '#708090' },
];

const RELOAD_THROTTLE_MS = 60;

const revokePreviewUrl = ( image ) => {
	if ( image?.url && image.url.startsWith( 'blob:' ) ) {
		URL.revokeObjectURL( image.url );
	}
};

const downloadImage = async ( dataUrl, filename ) => {
	try {
		const response = await fetch( dataUrl );
		const blob = await response.blob();
		const blobUrl = URL.createObjectURL( blob );
		const a = document.createElement( 'a' );
		a.href = blobUrl;
		a.download = filename;
		document.body.appendChild( a );
		a.click();
		document.body.removeChild( a );
		URL.revokeObjectURL( blobUrl );
	} catch {
		window.open( dataUrl, '_blank' );
	}
};

const calcPanelCount = ( dividers, beams ) => {
	const sortedDivs = [ ...dividers ].sort( ( a, b ) => a - b );
	const sortedBeams = [ ...beams ].sort( ( a, b ) => a.left - b.left );
	const allBoundaries = [ 0, ...sortedDivs ];
	sortedBeams.forEach( ( beam ) => {
		allBoundaries.push( beam.left );
		allBoundaries.push( beam.right );
	} );
	allBoundaries.push( 1 );
	allBoundaries.sort( ( a, b ) => a - b );

	let count = 0;
	for ( let i = 0; i < allBoundaries.length - 1; i++ ) {
		const tLeft = allBoundaries[ i ];
		const tRight = allBoundaries[ i + 1 ];
		const isBeamGap = sortedBeams.some(
			( beam ) =>
				tLeft >= beam.left - 0.001 && tRight <= beam.right + 0.001
		);
		if ( ! isBeamGap ) count++;
	}
	return Math.max( 1, count );
};

const syncRetractLevels = ( currentLevels, panelCount ) => {
	const levels = [ ...( currentLevels || [] ) ];
	while ( levels.length < panelCount ) levels.push( 0 );
	if ( levels.length > panelCount ) levels.length = panelCount;
	return levels;
};

function App() {
	const outside = useViewState();
	const inside = useViewState();

	const [ screenColor, setScreenColor ] = useState( 'Dark Bronze' );
	const [ isCustomColor, setIsCustomColor ] = useState( false );
	const [ interiorVisibility, setInteriorVisibility ] = useState( 90 );
	const [ activeView, setActiveView ] = useState( 'outside' );
	const [ isRecording, setIsRecording ] = useState( false );
	const [ recordingProgress, setRecordingProgress ] = useState( 0 );
	const [ videoPreviewUrl, setVideoPreviewUrl ] = useState( null );
	const [ videoPreviewFilename, setVideoPreviewFilename ] = useState( '' );
	const [ previewTab, setPreviewTab ] = useState( 'image' );

	const reloadTimersRef = useRef( { outside: null, inside: null } );
	const videoRef = useRef( null );

	const handleUploadOutside = useCallback(
		async ( file ) => {
			revokePreviewUrl( outside.state.image );
			const blobUrl = URL.createObjectURL( file );
			outside.update( {
				image: { file, url: blobUrl, name: file.name },
				result: null,
				error: null,
				corners: [],
				dividers: [],
				beams: [],
				retractLevels: [ 0 ],
				workingUrl: null,
			} );
			setActiveView( 'outside' );
			try {
				const workingUrl = await createWorkingImage( blobUrl );
				outside.update( { workingUrl } );
			} catch {
				outside.update( { workingUrl: blobUrl } );
			}
		},
		[ outside ]
	);

	const handleUploadInside = useCallback(
		async ( file ) => {
			revokePreviewUrl( inside.state.image );
			const blobUrl = URL.createObjectURL( file );
			inside.update( {
				image: { file, url: blobUrl, name: file.name },
				result: null,
				error: null,
				corners: [],
				dividers: [],
				beams: [],
				retractLevels: [ 0 ],
				workingUrl: null,
			} );
			setActiveView( 'inside' );
			try {
				const workingUrl = await createWorkingImage( blobUrl );
				inside.update( { workingUrl } );
			} catch {
				inside.update( { workingUrl: blobUrl } );
			}
		},
		[ inside ]
	);

	const handleClearOutside = useCallback( () => {
		if ( reloadTimersRef.current.outside ) {
			clearTimeout( reloadTimersRef.current.outside );
			reloadTimersRef.current.outside = null;
		}
		outside.reset();
	}, [ outside ] );

	const handleClearInside = useCallback( () => {
		if ( reloadTimersRef.current.inside ) {
			clearTimeout( reloadTimersRef.current.inside );
			reloadTimersRef.current.inside = null;
		}
		inside.reset();
	}, [ inside ] );

	const handleRetractChange = useCallback(
		( viewType, newLevels ) => {
			const isOutside = viewType === 'outside';
			const view = isOutside ? outside : inside;
			const key = isOutside ? 'outside' : 'inside';

			view.update( { retractLevels: newLevels } );

			if ( ! view.state.result || ! view.state.workingUrl ) return;

			if ( reloadTimersRef.current[ key ] ) {
				clearTimeout( reloadTimersRef.current[ key ] );
			}

			reloadTimersRef.current[ key ] = setTimeout( async () => {
				reloadTimersRef.current[ key ] = null;
				try {
					const workingUrl = view.state.workingUrl;
					const getImgDims = () =>
						new Promise( ( res ) => {
							const img = new Image();
							img.onload = () =>
								res( {
									width: img.naturalWidth,
									height: img.naturalHeight,
								} );
							img.src = workingUrl;
						} );
					const dims = await getImgDims();

					const overlayCanvas = renderScreenOverlay( {
						width: dims.width,
						height: dims.height,
						corners: view.state.corners,
						dividers: view.state.dividers,
						beams: view.state.beams || [],
						viewType,
						screenColor,
						interiorVisibility: isOutside
							? undefined
							: interiorVisibility,
						retractLevels: newLevels,
					} );
					const overlayUrl = overlayCanvas.toDataURL( 'image/png' );
					const compositeUrl = await bakeOverlay(
						workingUrl,
						overlayUrl
					);
					const watermarkedUrl = await addWatermark( compositeUrl );
					view.update( { result: watermarkedUrl } );
				} catch ( err ) {
					console.error( 'Retract re-render failed:', err );
				}
			}, RELOAD_THROTTLE_MS );
		},
		[ outside, inside, screenColor, interiorVisibility ]
	);

	const handleGenerate = useCallback(
		async ( viewType ) => {
			const isOutside = viewType === 'outside';
			const view = isOutside ? outside : inside;
			const targetImage = view.state.image;
			const corners = view.state.corners;
			const dividers = view.state.dividers;
			const beams = view.state.beams || [];
			const workingUrl = view.state.workingUrl;
			const panelCount = calcPanelCount( dividers, beams );
			const retractLevels = syncRetractLevels(
				view.state.retractLevels,
				panelCount
			);

			if (
				! targetImage ||
				! Array.isArray( corners ) ||
				corners.length !== 4
			) {
				view.update( {
					error: 'Please select the patio opening first.',
				} );
				return;
			}

			if ( ! workingUrl ) {
				view.update( {
					error: 'Image is still processing. Please wait a moment.',
				} );
				return;
			}

			view.update( {
				isGenerating: true,
				error: null,
				result: null,
				retractLevels,
			} );
			setActiveView( viewType );

			try {
				const getImgDims = () =>
					new Promise( ( res ) => {
						const img = new Image();
						img.onload = () =>
							res( {
								width: img.naturalWidth,
								height: img.naturalHeight,
							} );
						img.src = workingUrl;
					} );
				const dims = await getImgDims();

				const overlayCanvas = renderScreenOverlay( {
					width: dims.width,
					height: dims.height,
					corners,
					dividers,
					beams,
					viewType,
					screenColor,
					interiorVisibility: isOutside
						? undefined
						: interiorVisibility,
					retractLevels,
				} );
				const overlayUrl = overlayCanvas.toDataURL( 'image/png' );

				const compositeUrl = await bakeOverlay(
					workingUrl,
					overlayUrl
				);

				const watermarkedUrl = await addWatermark( compositeUrl );
				view.update( { result: watermarkedUrl, isGenerating: false } );
			} catch ( err ) {
				console.error( err );
				view.update( {
					error: 'Generation failed. Please try again.',
					isGenerating: false,
				} );
			}
		},
		[ outside, inside, screenColor, interiorVisibility ]
	);

	const handleExportVideo = useCallback(
		async ( viewType ) => {
			const isOutside = viewType === 'outside';
			const view = isOutside ? outside : inside;
			const workingUrl = view.state.workingUrl;

			if ( ! workingUrl ) return;

			setIsRecording( true );
			setRecordingProgress( 0 );

			try {
				const result = await exportVideo( {
					workingUrl,
					corners: view.state.corners,
					dividers: view.state.dividers,
					beams: view.state.beams || [],
					viewType,
					screenColor,
					interiorVisibility: isOutside
						? undefined
						: interiorVisibility,
					retractLevels: view.state.retractLevels || [],
					onProgress: ( p ) => setRecordingProgress( p ),
				} );
				setVideoPreviewUrl( result.url );
				setVideoPreviewFilename( `${ viewType }-screen-video.mp4` );
				setPreviewTab( 'video' );
			} catch ( err ) {
				console.error( 'Video export failed:', err );
				alert(
					'Video export failed. Please try again in a supported browser (Chrome, Edge, Firefox).'
				);
			} finally {
				setIsRecording( false );
				setRecordingProgress( 0 );
			}
		},
		[ outside, inside, screenColor, interiorVisibility ]
	);

	const canGenerateOutside =
		outside.state.image &&
		Array.isArray( outside.state.corners ) &&
		outside.state.corners.length === 4;
	const canGenerateInside =
		inside.state.image &&
		Array.isArray( inside.state.corners ) &&
		inside.state.corners.length === 4;

	const activeViewObj = activeView === 'outside' ? outside : inside;
	const activeIsGenerating = activeViewObj.state.isGenerating;
	const activeResult = activeViewObj.state.result;
	const activeRetractLevels = activeViewObj.state.retractLevels || [];

	const handlePreviewTabChange = useCallback( ( tab ) => {
		if ( tab === 'image' && videoRef.current ) {
			videoRef.current.pause();
		}
		setPreviewTab( tab );
	}, [] );

	const handleActiveViewChange = useCallback( ( view ) => {
		if ( videoRef.current ) videoRef.current.pause();
		if ( videoPreviewUrl ) {
			URL.revokeObjectURL( videoPreviewUrl );
			setVideoPreviewUrl( null );
			setVideoPreviewFilename( '' );
		}
		setPreviewTab( 'image' );
		setActiveView( view );
	}, [ videoPreviewUrl ] );

	const PanelSliders = ( { levels, onChange, viewType } ) => {
		if ( ! activeResult || levels.length === 0 ) return null;

		const stepSlider = ( idx, delta ) => {
			const level = levels[ idx ] ?? 0;
			const currentDisplay = Math.round( ( 1 - level ) * 100 );
			const nextDisplay = Math.max( 0, Math.min( 100, currentDisplay + delta ) );
			const newLevels = [ ...levels ];
			newLevels[ idx ] = 1 - nextDisplay / 100;
			onChange( viewType, newLevels );
		};

		return (
			<div className="sv-panel-sliders">
				<div className="sv-sliders-header">
					<span className="sv-sliders-title">Screen Position</span>
					<div className="sv-sliders-legend">
						<span className="sv-legend-item sv-legend-open">
							Open (0%)
						</span>
						<span className="sv-legend-item sv-legend-closed">
							Closed (100%)
						</span>
					</div>
				</div>
				<div className="sv-sliders-track">
					{ levels.map( ( level, idx ) => {
						const displayPct = Math.round( ( 1 - level ) * 100 );
						return (
							<div key={ idx } className="sv-panel-slider">
								<span className="sv-panel-slider-label">
									Panel { idx + 1 }
								</span>
								<div className="sv-slider-row">
									<button
										type="button"
										className="sv-slider-btn sv-slider-btn-minus"
										aria-label={ `Panel ${
											idx + 1
										} decrease` }
										disabled={ displayPct <= 0 }
										onClick={ () => stepSlider( idx, -1 ) }
									>
										&minus;
									</button>
									<div className="sv-slider-container">
										<input
											type="range"
											min="0"
											max="100"
											value={ displayPct }
											aria-label={ `Panel ${
												idx + 1
											} screen position: ${ displayPct }%` }
											aria-valuetext={ `${ displayPct }% closed` }
											onChange={ ( e ) => {
												const sliderVal =
													Number( e.target.value ) / 100;
												const newLevels = [ ...levels ];
												newLevels[ idx ] = 1 - sliderVal;
												onChange( viewType, newLevels );
											} }
											className="sv-panel-slider-input"
										/>
									</div>
									<button
										type="button"
										className="sv-slider-btn sv-slider-btn-plus"
										aria-label={ `Panel ${
											idx + 1
										} increase` }
										disabled={ displayPct >= 100 }
										onClick={ () => stepSlider( idx, 1 ) }
									>
										+
									</button>
								</div>
								<span className="sv-panel-slider-value">
									{ displayPct }%
								</span>
							</div>
						);
					} ) }
				</div>
			</div>
		);
	};

	const renderEditorPanel = ( view, viewType, onUpload, onClear ) => (
		<div className="sv-editor-panel">
			<div className="sv-editor-header">
				<div className="sv-editor-header-left">
					<div className="sv-editor-icon">
						{ viewType === 'outside' ? (
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
									d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 20.25h18M12.75 6.75h.008v.008h-.008V6.75z"
								/>
							</svg>
						) : (
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
									d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
								/>
							</svg>
						) }
					</div>
					<div>
						<h2 className="sv-editor-title">
							{ viewType === 'outside' ? 'Exterior' : 'Interior' }{ ' ' }
							Photo
						</h2>
						<p className="sv-editor-subtitle">
							{ viewType === 'outside'
								? 'View from outside'
								: 'View from inside' }
						</p>
					</div>
				</div>
				{ view.state.result && (
					<span className="sv-ready-badge">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							className="w-3.5 h-3.5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={ 3 }
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M4.5 12.75l6 6 9-13.5"
							/>
						</svg>
						Ready
					</span>
				) }
			</div>

			<div className="sv-editor-body">
				<ImageUploader
					onImageUpload={ onUpload }
					onClearImage={ onClear }
					currentImage={ view.state.image }
					disabled={ view.state.isGenerating }
					isProcessing={ view.state.image && ! view.state.workingUrl }
				>
					{ view.state.image && view.state.workingUrl && (
						<OpeningSelector
							imageUrl={ view.state.workingUrl }
							onChange={ ( c, d, b ) => {
								const panelCount = calcPanelCount(
									d || [],
									b || []
								);
								const newLevels = syncRetractLevels(
									view.state.retractLevels,
									panelCount
								);
								view.update( {
									corners: c,
									dividers: d || [],
									beams: b || [],
									retractLevels: newLevels,
								} );
							} }
							disabled={ view.state.isGenerating }
						/>
					) }
				</ImageUploader>

				{ view.state.image && (
					<button
						onClick={ () => handleGenerate( viewType ) }
						className={ `sv-generate-btn ${
							( viewType === 'outside'
								? canGenerateOutside
								: canGenerateInside ) &&
							! view.state.isGenerating &&
							! view.state.result
								? 'sv-generate-btn--active'
								: ''
						}` }
						disabled={
							! ( viewType === 'outside'
								? canGenerateOutside
								: canGenerateInside ) || view.state.isGenerating
						}
					>
						{ view.state.isGenerating ? (
							<>
								<div className="sv-spinner w-4 h-4 border-white/30 border-t-white" />
								Applying screen…
							</>
						) : (
							<>
								Generate{ ' ' }
								{ viewType === 'outside'
									? 'Exterior'
									: 'Interior' }{ ' ' }
								Preview
							</>
						) }
					</button>
				) }

				{ view.state.error && (
					<div className="sv-error-msg">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							className="w-4 h-4 shrink-0 mt-0.5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={ 2 }
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
							/>
						</svg>
						{ view.state.error }
					</div>
				) }
			</div>
		</div>
	);

	return (
		<div className="screen-visualizer">
			<div className="sv-header">
				<h1 className="sv-header-title">Screen Visualizer</h1>
				<p className="sv-header-desc">
					Upload interior and exterior photos, mark your patio
					opening, and preview how a custom motorized screen will look
					on your home.
				</p>
			</div>

			<div className="sv-settings-bar">
				<div className="sv-settings-group">
					<label className="sv-settings-label">
						Screen Frame Color
					</label>
					<div className="sv-color-swatches">
						{ PRESET_COLORS.map( ( color ) => (
							<button
								key={ color.name }
								onClick={ () => {
									setScreenColor( color.name );
									setIsCustomColor( false );
								} }
								className={ `sv-swatch ${
									! isCustomColor &&
									screenColor.toLowerCase() ===
										color.name.toLowerCase()
										? 'sv-swatch--active'
										: ''
								}` }
								style={ { backgroundColor: color.hex } }
								title={ color.name }
								aria-label={ `Select ${ color.name }` }
							/>
						) ) }
						<button
							onClick={ () => setIsCustomColor( true ) }
							className={ `sv-swatch-custom ${
								isCustomColor ? 'sv-swatch-custom--active' : ''
							}` }
						>
							Custom
						</button>
					</div>
					{ isCustomColor && (
						<input
							type="text"
							value={ screenColor }
							onChange={ ( e ) =>
								setScreenColor( e.target.value )
							}
							placeholder="e.g. #336699 or forest green"
							className="sv-custom-input"
						/>
					) }
				</div>
				<div className="sv-settings-group">
					<label
						htmlFor="interior-visibility"
						className="sv-settings-label"
					>
						Interior See-Through
					</label>
					<select
						id="interior-visibility"
						value={ interiorVisibility }
						onChange={ ( e ) =>
							setInteriorVisibility( Number( e.target.value ) )
						}
						className="sv-select"
					>
						<option value={ 90 }>90% Visible (Light Tint)</option>
						<option value={ 95 }>95% Visible (Barely There)</option>
					</select>
				</div>
			</div>

			<div className="sv-tabbed-content">
				<div className="sv-tab-bar">
					<button
						onClick={ () => handleActiveViewChange( 'outside' ) }
						className={ `sv-tab ${
							activeView === 'outside' ? 'sv-tab--active' : ''
						}` }
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							className="w-4 h-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={ 2 }
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 20.25h18M12.75 6.75h.008v.008h-.008V6.75z"
							/>
						</svg>
						<span className="hidden sm:inline">Exterior</span>
						<span className="sm:hidden">Outside</span>
					</button>
					<button
						onClick={ () => handleActiveViewChange( 'inside' ) }
						className={ `sv-tab ${
							activeView === 'inside' ? 'sv-tab--active' : ''
						}` }
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							className="w-4 h-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={ 2 }
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
							/>
						</svg>
						<span className="hidden sm:inline">Interior</span>
						<span className="sm:hidden">Inside</span>
					</button>
				</div>

				<div className="sv-tab-content">
					<div className="sv-editor-col">
						{ activeView === 'outside'
							? renderEditorPanel(
									outside,
									'outside',
									handleUploadOutside,
									handleClearOutside
							  )
							: renderEditorPanel(
									inside,
									'inside',
									handleUploadInside,
									handleClearInside
							  ) }
					</div>

				<div className="sv-preview-col">
					{ activeResult && (
						<div className="sv-preview-tab-bar">
							<button
								onClick={ () => handlePreviewTabChange( 'image' ) }
								className={ `sv-preview-tab ${
									previewTab === 'image'
										? 'sv-preview-tab--active'
										: ''
								}` }
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									className="w-4 h-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									strokeWidth={ 2 }
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 20.25h18M12.75 6.75h.008v.008h-.008V6.75z"
									/>
								</svg>
								Image
							</button>
							<button
								onClick={ () => handlePreviewTabChange( 'video' ) }
								className={ `sv-preview-tab ${
									previewTab === 'video'
										? 'sv-preview-tab--active'
										: ''
								}` }
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									className="w-4 h-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									strokeWidth={ 2 }
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
									/>
								</svg>
								Video
							</button>
						</div>
					) }
					<div className="sv-preview-stage">
							{ activeIsGenerating ? (
								<div className="sv-preview-empty">
									<div className="sv-spinner w-10 h-10" />
									<p className="sv-preview-empty-text">
										Applying screen overlay…
									</p>
									<p className="sv-preview-empty-sub">
										This may take a few seconds
									</p>
								</div>
							) : activeResult && previewTab === 'video' ? (
								<div className="sv-preview-video-area">
									{ videoPreviewUrl ? (
										<video
											ref={ videoRef }
											src={ videoPreviewUrl }
											className="sv-preview-video-player"
											controls
											autoPlay
											playsInline
										/>
									) : (
										<div className="sv-preview-empty">
											<div className="sv-preview-empty-icon">
												<svg
													xmlns="http://www.w3.org/2000/svg"
													className="w-8 h-8"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
													strokeWidth={ 1.5 }
												>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
													/>
												</svg>
											</div>
											<p className="sv-preview-empty-text">
												No video yet
											</p>
											<p className="sv-preview-empty-sub">
												Click Export Video below to
												record a screen animation
											</p>
										</div>
									) }
								</div>
							) : activeResult ? (
								<>
									<div className="sv-preview-image-wrap">
										<img
											src={ activeResult }
											className="sv-preview-image"
											alt={ `${
												activeView === 'outside'
													? 'Exterior'
													: 'Interior'
											} screen preview` }
										/>
									</div>
									<PanelSliders
										levels={ activeRetractLevels }
										onChange={ handleRetractChange }
										viewType={ activeView }
									/>
								</>
							) : (
								<div className="sv-preview-empty">
									<div className="sv-preview-empty-icon">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											className="w-8 h-8"
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
									</div>
									<p className="sv-preview-empty-text">
										{ activeView === 'outside'
											? 'Upload an exterior photo and generate a preview'
											: 'Upload an interior photo and generate a preview' }
									</p>
									<p className="sv-preview-empty-sub">
										Drag the corner pins to match your
										opening, then click Generate
									</p>
								</div>
							) }
						</div>

						{ activeResult && (
							<div className="sv-preview-actions">
								{ previewTab === 'video' && videoPreviewUrl ? (
									<>
										<button
											onClick={ () => {
												URL.revokeObjectURL(
													videoPreviewUrl
												);
												setVideoPreviewUrl( null );
												setVideoPreviewFilename( '' );
											} }
											className="sv-action-btn sv-action-btn--secondary"
										>
											Discard Video
										</button>
										<button
											onClick={ () => {
												const a =
													document.createElement(
														'a'
													);
												a.href = videoPreviewUrl;
												a.download =
													videoPreviewFilename;
												document.body.appendChild( a );
												a.click();
												document.body.removeChild( a );
											} }
											className="sv-action-btn sv-action-btn--primary"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												className="w-4 h-4"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
												strokeWidth={ 2 }
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 12.75l3-3m0 0l-3-3m3 3H9"
													transform="rotate(180 12 12)"
												/>
											</svg>
											Download Video
										</button>
									</>
								) : (
									<>
										{ isRecording ? (
											<div className="sv-recording-status">
												<div className="sv-spinner w-4 h-4" />
												Recording…{ ' ' }
												{ Math.round(
													recordingProgress * 100
												) }
												%
											</div>
										) : (
											<button
												onClick={ () =>
													handleExportVideo(
														activeView
													)
												}
												disabled={ isRecording }
												className="sv-action-btn sv-action-btn--secondary"
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													className="w-4 h-4"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
													strokeWidth={ 2 }
												>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
													/>
												</svg>
												Export Video
											</button>
										) }
										<button
											onClick={ () =>
												downloadImage(
													activeResult,
													`${ activeView }-mockup.png`
												)
											}
											className="sv-action-btn sv-action-btn--primary"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												className="w-4 h-4"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
												strokeWidth={ 2 }
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 12.75l3-3m0 0l-3-3m3 3H9"
													transform="rotate(180 12 12)"
												/>
											</svg>
											Download
										</button>
									</>
								) }
							</div>
						) }
					</div>
				</div>
			</div>
		</div>
	);
}

export default App;
