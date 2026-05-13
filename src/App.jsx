/**
 * Screen Visualizer - Main App Component
 * Deterministic Canvas Render — no AI. Pixel-perfect screen placement.
 */
import { useState, useCallback } from '@wordpress/element';
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

function App() {
	const outside = useViewState();
	const inside = useViewState();

	const [ screenColor, setScreenColor ] = useState( 'Dark Bronze' );
	const [ isCustomColor, setIsCustomColor ] = useState( false );
	const [ interiorVisibility, setInteriorVisibility ] = useState( 90 );
	const [ activeView, setActiveView ] = useState( 'outside' );
	const [ isRecording, setIsRecording ] = useState( false );
	const [ recordingProgress, setRecordingProgress ] = useState( 0 );
	const [ useColumnGaps, setUseColumnGaps ] = useState( false );
	const [ videoPreviewUrl, setVideoPreviewUrl ] = useState( null );
	const [ videoPreviewFilename, setVideoPreviewFilename ] = useState( '' );

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
		outside.reset();
	}, [ outside ] );

	const handleClearInside = useCallback( () => {
		inside.reset();
	}, [ inside ] );

	const handleGenerate = useCallback(
		async ( viewType ) => {
			const isOutside = viewType === 'outside';
			const view = isOutside ? outside : inside;
			const targetImage = view.state.image;
			const corners = view.state.corners;
			const dividers = view.state.dividers;
			const workingUrl = view.state.workingUrl;

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

			view.update( { isGenerating: true, error: null, result: null } );
			setActiveView( viewType );

			try {
				// 1. Get working image dimensions (already max 1024px)
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

				// 2. Render deterministic screen overlay at WORKING image dimensions
				const overlayCanvas = renderScreenOverlay( {
					width: dims.width,
					height: dims.height,
					corners,
					dividers,
					viewType,
					screenColor,
					useColumnGaps,
					interiorVisibility: isOutside
						? undefined
						: interiorVisibility,
				} );
				const overlayUrl = overlayCanvas.toDataURL( 'image/png' );

				// 3. Bake overlay onto working image — screen is now pixel-perfect
				const compositeUrl = await bakeOverlay(
					workingUrl,
					overlayUrl
				);

				// 4. Add watermark and we're done — no AI call needed
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
		[ outside, inside, screenColor, interiorVisibility, useColumnGaps ]
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
					viewType,
					screenColor,
					interiorVisibility: isOutside
						? undefined
						: interiorVisibility,
					useColumnGaps,
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
		[ outside, inside, screenColor, interiorVisibility, useColumnGaps ]
	);

	const canGenerateOutside =
		outside.state.image &&
		Array.isArray( outside.state.corners ) &&
		outside.state.corners.length === 4;
	const canGenerateInside =
		inside.state.image &&
		Array.isArray( inside.state.corners ) &&
		inside.state.corners.length === 4;

	const activeResult =
		activeView === 'outside' ? outside.state.result : inside.state.result;
	const activeIsGenerating =
		activeView === 'outside'
			? outside.state.isGenerating
			: inside.state.isGenerating;

	return (
		<div className="screen-visualizer">
			{ /* Header */ }
			<div className="mb-8">
				<h1 className="text-3xl font-bold text-slate-900 tracking-tight">
					Screen Visualizer
				</h1>
				<p className="text-slate-500 mt-1.5 text-sm max-w-xl">
					Upload interior and exterior photos, mark your patio
					opening, and preview how a custom motorized screen will look
					on your home.
				</p>
			</div>

			{ /* Settings Bar */ }
			<div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8 p-5 bg-white rounded-2xl border border-slate-200 shadow-soft">
				<div>
					<label className="block text-sm font-semibold text-slate-800 mb-2.5">
						Screen Frame Color
					</label>
					<div className="flex flex-wrap items-center gap-2.5">
						{ PRESET_COLORS.map( ( color ) => (
							<button
								key={ color.name }
								onClick={ () => {
									setScreenColor( color.name );
									setIsCustomColor( false );
								} }
								className={ `w-9 h-9 rounded-full border-2 transition-all duration-200 shadow-sm ${
									! isCustomColor &&
									screenColor.toLowerCase() ===
										color.name.toLowerCase()
										? 'border-brand-500 scale-110 ring-2 ring-brand-200'
										: 'border-slate-200 hover:scale-105 hover:shadow-md'
								}` }
								style={ { backgroundColor: color.hex } }
								title={ color.name }
								aria-label={ `Select ${ color.name }` }
							/>
						) ) }
						<button
							onClick={ () => setIsCustomColor( true ) }
							className={ `px-3 py-1.5 text-xs font-semibold rounded-full border-2 transition-all duration-200 ${
								isCustomColor
									? 'border-brand-500 text-brand-700 bg-brand-50 ring-2 ring-brand-200'
									: 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:shadow-sm'
							}` }
						>
							Custom
						</button>
					</div>
					{ isCustomColor && (
						<div className="mt-3">
							<input
								id="screen-color"
								type="text"
								value={ screenColor }
								onChange={ ( e ) =>
									setScreenColor( e.target.value )
								}
								placeholder="e.g. #336699 or forest green"
								className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
							/>
						</div>
					) }
				</div>
				<div>
					<label
						htmlFor="interior-visibility"
						className="block text-sm font-semibold text-slate-800 mb-2.5"
					>
						Interior See-Through
					</label>
					<select
						id="interior-visibility"
						value={ interiorVisibility }
						onChange={ ( e ) =>
							setInteriorVisibility( Number( e.target.value ) )
						}
						className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
					>
						<option value={ 90 }>90% Visible (Light Tint)</option>
						<option value={ 95 }>95% Visible (Barely There)</option>
					</select>
				</div>
				<div>
					<label className="block text-sm font-semibold text-slate-800 mb-2.5">
						Multi-Panel Style
					</label>
					<label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
						<input
							type="checkbox"
							checked={ useColumnGaps }
							onChange={ ( e ) =>
								setUseColumnGaps( e.target.checked )
							}
							className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
						/>
						<span className="text-sm text-slate-700">
							Column gaps between panels
						</span>
					</label>
					<p className="text-xs text-slate-400 mt-1.5">
						Independent screens with structural columns
					</p>
				</div>
			</div>

			{ /* Main Content */ }
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
				{ /* Left Panel — Upload & Edit */ }
				<div className="lg:col-span-5 space-y-5 max-h-[calc(100vh-8rem)] overflow-y-auto pr-1">
					{ /* Exterior */ }
					<div className="bg-white rounded-2xl border border-slate-200 shadow-soft overflow-hidden transition-shadow duration-200 hover:shadow-card">
						<div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
							<div className="flex items-center gap-2.5">
								<div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										className="w-4 h-4 text-brand-600"
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
								</div>
								<div>
									<h2 className="text-sm font-bold text-slate-900">
										Exterior Photo
									</h2>
									<p className="text-xs text-slate-400">
										View from outside
									</p>
								</div>
							</div>
							{ outside.state.result && (
								<span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 bg-brand-50 px-2.5 py-1 rounded-full border border-brand-100">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										className="w-3 h-3"
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
						<div className="p-5">
							<ImageUploader
								onImageUpload={ handleUploadOutside }
								onClearImage={ handleClearOutside }
								currentImage={ outside.state.image }
								disabled={ outside.state.isGenerating }
								isProcessing={
									outside.state.image &&
									! outside.state.workingUrl
								}
							>
								{ outside.state.image &&
									outside.state.workingUrl && (
										<OpeningSelector
											imageUrl={
												outside.state.workingUrl
											}
											onChange={ ( c, d ) =>
												outside.update( {
													corners: c,
													dividers: d || [],
												} )
											}
											disabled={
												outside.state.isGenerating
											}
											viewType="outside"
										/>
									) }
							</ImageUploader>
							{ outside.state.image && (
								<button
									onClick={ () =>
										handleGenerate( 'outside' )
									}
									className={ `w-full mt-4 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed ${
										canGenerateOutside &&
										! outside.state.isGenerating &&
										! outside.state.result
											? 'shadow-lg hover:shadow-xl ring-2 ring-brand-300/50'
											: ''
									}` }
									disabled={
										! canGenerateOutside ||
										outside.state.isGenerating
									}
								>
									{ outside.state.isGenerating ? (
										<>
											<div className="sv-spinner w-4 h-4 border-white/30 border-t-white" />
											Applying screen…
										</>
									) : (
										<>Generate Exterior Preview</>
									) }
								</button>
							) }
							{ outside.state.error && (
								<div className="mt-3 flex items-start gap-2 text-red-700 text-xs bg-red-50 px-3 py-2.5 rounded-lg border border-red-100">
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
									{ outside.state.error }
								</div>
							) }
						</div>
					</div>

					{ /* Interior */ }
					<div className="bg-white rounded-2xl border border-slate-200 shadow-soft overflow-hidden transition-shadow duration-200 hover:shadow-card">
						<div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
							<div className="flex items-center gap-2.5">
								<div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										className="w-4 h-4 text-brand-600"
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
								</div>
								<div>
									<h2 className="text-sm font-bold text-slate-900">
										Interior Photo
									</h2>
									<p className="text-xs text-slate-400">
										View from inside
									</p>
								</div>
							</div>
							{ inside.state.result && (
								<span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 bg-brand-50 px-2.5 py-1 rounded-full border border-brand-100">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										className="w-3 h-3"
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
						<div className="p-5">
							<ImageUploader
								onImageUpload={ handleUploadInside }
								onClearImage={ handleClearInside }
								currentImage={ inside.state.image }
								disabled={ inside.state.isGenerating }
								isProcessing={
									inside.state.image &&
									! inside.state.workingUrl
								}
							>
								{ inside.state.image &&
									inside.state.workingUrl && (
										<OpeningSelector
											imageUrl={ inside.state.workingUrl }
											onChange={ ( c, d ) =>
												inside.update( {
													corners: c,
													dividers: d || [],
												} )
											}
											disabled={
												inside.state.isGenerating
											}
											viewType="inside"
										/>
									) }
							</ImageUploader>
							{ inside.state.image && (
								<button
									onClick={ () => handleGenerate( 'inside' ) }
									className={ `w-full mt-4 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed ${
										canGenerateInside &&
										! inside.state.isGenerating &&
										! inside.state.result
											? 'shadow-lg hover:shadow-xl ring-2 ring-brand-300/50'
											: ''
									}` }
									disabled={
										! canGenerateInside ||
										inside.state.isGenerating
									}
								>
									{ inside.state.isGenerating ? (
										<>
											<div className="sv-spinner w-4 h-4 border-white/30 border-t-white" />
											Applying screen…
										</>
									) : (
										<>Generate Interior Preview</>
									) }
								</button>
							) }
							{ inside.state.error && (
								<div className="mt-3 flex items-start gap-2 text-red-700 text-xs bg-red-50 px-3 py-2.5 rounded-lg border border-red-100">
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
									{ inside.state.error }
								</div>
							) }
						</div>
					</div>
				</div>

				{ /* Right Panel — Preview */ }
				<div className="lg:col-span-7">
					<div className="sticky top-6 max-h-[calc(100vh-6rem)] flex flex-col">
						{ /* Tab Switcher */ }
						<div className="flex items-center gap-1 mb-4 p-1 bg-white rounded-xl border border-slate-200 shadow-soft inline-flex">
							<button
								onClick={ () => setActiveView( 'outside' ) }
								className={ `inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
									activeView === 'outside'
										? 'bg-slate-900 text-white shadow-sm'
										: 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
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
								Exterior
							</button>
							<button
								onClick={ () => setActiveView( 'inside' ) }
								className={ `inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
									activeView === 'inside'
										? 'bg-slate-900 text-white shadow-sm'
										: 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
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
								Interior
							</button>
						</div>

						{ /* Preview Stage */ }
						<div className="flex-1 bg-slate-100 rounded-2xl border border-slate-200 min-h-[320px] flex items-center justify-center shadow-inner overflow-y-auto">
							{ activeIsGenerating ? (
								<div className="flex flex-col items-center gap-3 py-24">
									<div className="sv-spinner w-10 h-10" />
									<p className="text-sm text-slate-600 font-medium">
										Applying screen overlay…
									</p>
									<p className="text-xs text-slate-400">
										This may take a few seconds
									</p>
								</div>
							) : activeResult ? (
								<div className="w-full relative">
									<img
										src={ activeResult }
										className="w-full h-full object-contain"
										alt={ `${
											activeView === 'outside'
												? 'Exterior'
												: 'Interior'
										} screen preview` }
									/>
								</div>
							) : (
								<div className="text-center py-24 px-6">
									<div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 flex items-center justify-center mx-auto mb-4 shadow-soft">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											className="w-8 h-8 text-slate-300"
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
									<p className="text-slate-500 text-sm font-medium">
										{ activeView === 'outside'
											? 'Upload an exterior photo and generate a preview'
											: 'Upload an interior photo and generate a preview' }
									</p>
									<p className="text-slate-400 text-xs mt-1">
										Drag the corner pins to match your
										opening, then click Generate
									</p>
								</div>
							) }
						</div>

						<div className="flex-shrink-0">
							{ /* Download + Export Video */ }
							{ activeView === 'outside' && outside.state.result && (
							<div className="mt-4 flex justify-end gap-3">
								{ isRecording && activeView === 'outside' ? (
									<div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-100 text-slate-600 border border-slate-200">
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
											handleExportVideo( 'outside' )
										}
										disabled={ isRecording }
										className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300 transition shadow-soft disabled:opacity-50 disabled:cursor-not-allowed"
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
											outside.state.result,
											'exterior-mockup.png'
										)
									}
									className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300 transition shadow-soft"
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
									Download Exterior
								</button>
							</div>
						) }
						{ activeView === 'inside' && inside.state.result && (
							<div className="mt-4 flex justify-end gap-3">
								{ isRecording && activeView === 'inside' ? (
									<div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-100 text-slate-600 border border-slate-200">
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
											handleExportVideo( 'inside' )
										}
										disabled={ isRecording }
										className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300 transition shadow-soft disabled:opacity-50 disabled:cursor-not-allowed"
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
											inside.state.result,
											'interior-mockup.png'
										)
									}
									className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300 transition shadow-soft"
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
									Download Interior
								</button>
							</div>
						) }
						</div>
					</div>
				</div>
			</div>

			{ /* Video Preview Modal */ }
			{ videoPreviewUrl && (
				<div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4">
					<div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
						<div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
							<h4 className="text-sm font-semibold text-slate-900">
								Video Preview
							</h4>
							<button
								type="button"
								onClick={ () => {
									URL.revokeObjectURL( videoPreviewUrl );
									setVideoPreviewUrl( null );
									setVideoPreviewFilename( '' );
								} }
								className="text-slate-400 hover:text-slate-700 text-sm transition-colors"
							>
								Close
							</button>
						</div>

						<div className="bg-black">
							<video
								src={ videoPreviewUrl }
								className="w-full max-h-[60vh]"
								controls
								autoPlay
								playsInline
							/>
						</div>

						<div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-100">
							<button
								type="button"
								onClick={ () => {
									URL.revokeObjectURL( videoPreviewUrl );
									setVideoPreviewUrl( null );
									setVideoPreviewFilename( '' );
								} }
								className="inline-flex items-center px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition"
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
								className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-brand-600 text-white hover:bg-brand-700 transition"
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
										d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 12.75l3-3m0 0l-3-3m3 3H9"
										transform="rotate(180 12 12)"
									/>
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
