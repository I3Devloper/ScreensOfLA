/**
 * Screen Visualizer - Main App Component
 * Deterministic Canvas Render — no AI. Pixel-perfect screen placement.
 */
import { useState, useCallback, useRef, useEffect } from '@wordpress/element';
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

/**
 * Calculate the number of screen panels from dividers and beams.
 */
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
			( beam ) => tLeft >= beam.left - 0.001 && tRight <= beam.right + 0.001
		);
		if ( ! isBeamGap ) count++;
	}
	return Math.max( 1, count );
};

/**
 * Sync retractLevels array length to match panel count.
 * Preserves existing values, fills new slots with 1 (fully closed).
 */
const syncRetractLevels = ( currentLevels, panelCount ) => {
	const levels = [ ...( currentLevels || [] ) ];
	while ( levels.length < panelCount ) levels.push( 1 );
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

	// Throttled re-render refs
	const reloadTimersRef = useRef( { outside: null, inside: null } );

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
				retractLevels: [ 1 ],
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
				retractLevels: [ 1 ],
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

	/**
	 * Regenerate the preview with current retract levels (throttled).
	 */
	const handleRetractChange = useCallback(
		( viewType, newLevels ) => {
			const isOutside = viewType === 'outside';
			const view = isOutside ? outside : inside;
			const key = isOutside ? 'outside' : 'inside';

			// Update state immediately for UI responsiveness
			view.update( { retractLevels: newLevels } );

			// Skip if no result yet
			if ( ! view.state.result || ! view.state.workingUrl ) return;

			// Throttle re-render
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
					const compositeUrl = await bakeOverlay( workingUrl, overlayUrl );
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
			const retractLevels = syncRetractLevels( view.state.retractLevels, panelCount );

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

			view.update( { isGenerating: true, error: null, result: null, retractLevels } );
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

	/**
	 * Vertical Panel Slider Component
	 */
	const PanelSliders = ( { levels, onChange, view } ) => {
		if ( ! activeResult || levels.length === 0 ) return null;

		return (
			<div className="sv-panel-sliders">
				{ levels.map( ( level, idx ) => (
					<div key={ idx } className="sv-panel-slider">
						<span className="sv-panel-slider-label">
							Panel { idx + 1 }
						</span>
						<div className="sv-panel-slider-track">
							<input
								type="range"
								min="0"
								max="100"
								value={ Math.round( level * 100 ) }
								onChange={ ( e ) => {
									const newLevels = [ ...levels ];
									newLevels[ idx ] = Number( e.target.value ) / 100;
									onChange( view, newLevels );
								} }
								className="sv-panel-slider-input"
								orient="vertical"
							/>
						</div>
						<span className="sv-panel-slider-value">
							{ Math.round( level * 100 ) }%
						</span>
					</div>
				) ) }
			</div>
		);
	};

	const renderEditorPanel = ( view, viewType, onUpload, onClear ) => (
		<div className="sv-editor-panel">
			<div className="sv-editor-header">
				<div className="sv-editor-header-left">
					<div className="sv-editor-icon">
						{ viewType === 'outside' ? (
							<svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={ 2 }>
								<path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 20.25h18M12.75 6.75h.008v.008h-.008V6.75z" />
							</svg>
						) : (
							<svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={ 2 }>
								<path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
							</svg>
						) }
					</div>
					<div>
						<h2 className="sv-editor-title">
							{ viewType === 'outside' ? 'Exterior' : 'Interior' } Photo
						</h2>
						<p className="sv-editor-subtitle">
							{ viewType === 'outside' ? 'View from outside' : 'View from inside' }
						</p>
					</div>
				</div>
				{ view.state.result && (
					<span className="sv-ready-badge">
						<svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={ 3 }>
							<path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
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
								const panelCount = calcPanelCount( d || [], b || [] );
								const newLevels = syncRetractLevels( view.state.retractLevels, panelCount );
								view.update( {
									corners: c,
									dividers: d || [],
									beams: b || [],
									retractLevels: newLevels,
								} );
							} }
							disabled={ view.state.isGenerating }
							viewType={ viewType }
						/>
					) }
				</ImageUploader>

				{ view.state.image && (
					<button
						onClick={ () => handleGenerate( viewType ) }
						className={ `sv-generate-btn ${
							( viewType === 'outside' ? canGenerateOutside : canGenerateInside ) &&
							! view.state.isGenerating &&
							! view.state.result
								? 'sv-generate-btn--active'
								: ''
						}` }
						disabled={
							! ( viewType === 'outside' ? canGenerateOutside : canGenerateInside ) ||
							view.state.isGenerating
						}
					>
						{ view.state.isGenerating ? (
							<>
								<div className="sv-spinner w-4 h-4 border-white/30 border-t-white" />
								Applying screen…
							</>
						) : (
							<>Generate { viewType === 'outside' ? 'Exterior' : 'Interior' } Preview</>
						) }
					</button>
				) }

				{ view.state.error && (
					<div className="sv-error-msg">
						<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={ 2 }>
							<path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
						</svg>
						{ view.state.error }
					</div>
				) }
			</div>
		</div>
	);

	return (
		<div className="screen-visualizer">
			{ /* Header */ }
			<div className="sv-header">
				<h1 className="sv-header-title">Screen Visualizer</h1>
				<p className="sv-header-desc">
					Upload interior and exterior photos, mark your patio opening, and preview how a custom motorized screen will look on your home.
				</p>
			</div>

			{ /* Settings Bar */ }
			<div className="sv-settings-bar">
				<div className="sv-settings-group">
					<label className="sv-settings-label">Screen Frame Color</label>
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
									screenColor.toLowerCase() === color.name.toLowerCase()
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
							onChange={ ( e ) => setScreenColor( e.target.value ) }
							placeholder="e.g. #336699 or forest green"
							className="sv-custom-input"
						/>
					) }
				</div>
				<div className="sv-settings-group">
					<label htmlFor="interior-visibility" className="sv-settings-label">
						Interior See-Through
					</label>
					<select
						id="interior-visibility"
						value={ interiorVisibility }
						onChange={ ( e ) => setInteriorVisibility( Number( e.target.value ) ) }
						className="sv-select"
					>
						<option value={ 90 }>90% Visible (Light Tint)</option>
						<option value={ 95 }>95% Visible (Barely There)</option>
					</select>
				</div>
			</div>

			{ /* Tabbed Content */ }
			<div className="sv-tabbed-content">
				{ /* Tab Switcher */ }
				<div className="sv-tab-bar">
					<button
						onClick={ () => setActiveView( 'outside' ) }
						className={ `sv-tab ${ activeView === 'outside' ? 'sv-tab--active' : '' }` }
					>
						<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={ 2 }>
							<path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 20.25h18M12.75 6.75h.008v.008h-.008V6.75z" />
						</svg>
						Exterior
					</button>
					<button
						onClick={ () => setActiveView( 'inside' ) }
						className={ `sv-tab ${ activeView === 'inside' ? 'sv-tab--active' : '' }` }
					>
						<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={ 2 }>
							<path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
						</svg>
						Interior
					</button>
				</div>

				{ /* Tab Content */ }
				<div className="sv-tab-content">
					{ /* Editor Panel */ }
					<div className="sv-editor-col">
						{ activeView === 'outside'
							? renderEditorPanel( outside, 'outside', handleUploadOutside, handleClearOutside )
							: renderEditorPanel( inside, 'inside', handleUploadInside, handleClearInside )
						}
					</div>

					{ /* Preview Panel */ }
					<div className="sv-preview-col">
						<div className="sv-preview-stage">
							{ activeIsGenerating ? (
								<div className="sv-preview-empty">
									<div className="sv-spinner w-10 h-10" />
									<p className="sv-preview-empty-text">Applying screen overlay…</p>
									<p className="sv-preview-empty-sub">This may take a few seconds</p>
								</div>
							) : activeResult ? (
								<>
									<div className="sv-preview-image-wrap">
										<img
											src={ activeResult }
											className="sv-preview-image"
											alt={ `${ activeView === 'outside' ? 'Exterior' : 'Interior' } screen preview` }
										/>
									</div>
									<PanelSliders
										levels={ activeRetractLevels }
										onChange={ handleRetractChange }
										view={ activeView }
									/>
								</>
							) : (
								<div className="sv-preview-empty">
									<div className="sv-preview-empty-icon">
										<svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={ 1.5 }>
											<path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 20.25h18M12.75 6.75h.008v.008h-.008V6.75z" />
										</svg>
									</div>
									<p className="sv-preview-empty-text">
										{ activeView === 'outside'
											? 'Upload an exterior photo and generate a preview'
											: 'Upload an interior photo and generate a preview' }
									</p>
									<p className="sv-preview-empty-sub">
										Drag the corner pins to match your opening, then click Generate
									</p>
								</div>
							) }
						</div>

						{ /* Action Buttons */ }
						{ activeResult && (
							<div className="sv-preview-actions">
								{ isRecording ? (
									<div className="sv-recording-status">
										<div className="sv-spinner w-4 h-4" />
										Recording… { Math.round( recordingProgress * 100 ) }%
									</div>
								) : (
									<button
										onClick={ () => handleExportVideo( activeView ) }
										disabled={ isRecording }
										className="sv-action-btn sv-action-btn--secondary"
									>
										<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={ 2 }>
											<path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
										</svg>
										Export Video
									</button>
								) }
								<button
									onClick={ () => downloadImage( activeResult, `${ activeView }-mockup.png` ) }
									className="sv-action-btn sv-action-btn--primary"
								>
									<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={ 2 }>
										<path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 12.75l3-3m0 0l-3-3m3 3H9" transform="rotate(180 12 12)" />
									</svg>
									Download { activeView === 'outside' ? 'Exterior' : 'Interior' }
								</button>
							</div>
						) }
					</div>
				</div>
			</div>

			{ /* Video Preview Modal */ }
			{ videoPreviewUrl && (
				<div className="sv-modal-overlay">
					<div className="sv-modal">
						<div className="sv-modal-header">
							<h4 className="sv-modal-title">Video Preview</h4>
							<button
								type="button"
								onClick={ () => {
									URL.revokeObjectURL( videoPreviewUrl );
									setVideoPreviewUrl( null );
									setVideoPreviewFilename( '' );
								} }
								className="sv-modal-close"
							>
								Close
							</button>
						</div>
						<div className="sv-modal-video">
							<video
								src={ videoPreviewUrl }
								className="sv-modal-video-player"
								controls
								autoPlay
								playsInline
							/>
						</div>
						<div className="sv-modal-footer">
							<button
								type="button"
								onClick={ () => {
									URL.revokeObjectURL( videoPreviewUrl );
									setVideoPreviewUrl( null );
									setVideoPreviewFilename( '' );
								} }
								className="sv-modal-btn sv-modal-btn--secondary"
							>
								Close
							</button>
							<button
								type="button"
								onClick={ () => {
									const a = document.createElement( 'a' );
									a.href = videoPreviewUrl;
									a.download = videoPreviewFilename;
									document.body.appendChild( a );
									a.click();
									document.body.removeChild( a );
								} }
								className="sv-modal-btn sv-modal-btn--primary"
							>
								<svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={ 2 }>
									<path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 12.75l3-3m0 0l-3-3m3 3H9" transform="rotate(180 12 12)" />
								</svg>
								Download Video
							</button>
						</div>
					</div>
				</div>
			) }
		</div>
	);
}

export default App;
