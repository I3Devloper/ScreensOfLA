/**
 * Screen Visualizer - Main App Component (Option B)
 * Deterministic Canvas Render — no AI. Pixel-perfect screen placement.
 */
import { useState, useCallback } from '@wordpress/element';
import ImageUploader from './components/ImageUploader';
import OpeningSelector from './components/OpeningSelector';
import { detectAllOpenings } from './utils/aiDetector';
import { createWorkingImage, bakeOverlay } from './utils/aiGenerator';
import { addWatermark } from './utils/imageCompositor';
import { renderScreenOverlay } from './utils/screenRenderer';

const revokePreviewUrl = (image) => {
    if (image?.url && image.url.startsWith('blob:')) {
        URL.revokeObjectURL(image.url);
    }
};

const downloadImage = async (dataUrl, filename) => {
    try {
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
    } catch {
        window.open(dataUrl, '_blank');
    }
};

function App() {
    const [outsideImage, setOutsideImage] = useState(null);
    const [outsideResult, setOutsideResult] = useState(null);
    const [isGeneratingOutside, setIsGeneratingOutside] = useState(false);
    const [outsideError, setOutsideError] = useState(null);
    const [outsideCandidates, setOutsideCandidates] = useState([]);
    const [outsideCorners, setOutsideCorners] = useState([]);
    const [outsideDividers, setOutsideDividers] = useState([]);
    const [isDetectingOutside, setIsDetectingOutside] = useState(false);
    const [outsideWorkingUrl, setOutsideWorkingUrl] = useState(null);

    const [insideImage, setInsideImage] = useState(null);
    const [insideResult, setInsideResult] = useState(null);
    const [isGeneratingInside, setIsGeneratingInside] = useState(false);
    const [insideError, setInsideError] = useState(null);
    const [insideCandidates, setInsideCandidates] = useState([]);
    const [insideCorners, setInsideCorners] = useState([]);
    const [insideDividers, setInsideDividers] = useState([]);
    const [isDetectingInside, setIsDetectingInside] = useState(false);
    const [insideWorkingUrl, setInsideWorkingUrl] = useState(null);

    const [screenColor, setScreenColor] = useState('');
    const [interiorVisibility, setInteriorVisibility] = useState(90);
    const [activeView, setActiveView] = useState('outside');

    const handleUploadOutside = useCallback(async (file) => {
        revokePreviewUrl(outsideImage);
        const blobUrl = URL.createObjectURL(file);
        setOutsideImage({ file, url: blobUrl, name: file.name });
        setOutsideResult(null);
        setOutsideError(null);
        setOutsideCandidates([]);
        setOutsideCorners([]);
        setOutsideDividers([]);
        setActiveView('outside');
        // Create working image (max 1024px) for consistent canvas dimensions
        try {
            const workingUrl = await createWorkingImage(blobUrl);
            setOutsideWorkingUrl(workingUrl);
        } catch {
            setOutsideWorkingUrl(blobUrl);
        }
    }, [outsideImage]);

    const handleUploadInside = useCallback(async (file) => {
        revokePreviewUrl(insideImage);
        const blobUrl = URL.createObjectURL(file);
        setInsideImage({ file, url: blobUrl, name: file.name });
        setInsideResult(null);
        setInsideError(null);
        setInsideCandidates([]);
        setInsideCorners([]);
        setInsideDividers([]);
        setActiveView('inside');
        try {
            const workingUrl = await createWorkingImage(blobUrl);
            setInsideWorkingUrl(workingUrl);
        } catch {
            setInsideWorkingUrl(blobUrl);
        }
    }, [insideImage]);

    const handleClearOutside = useCallback(() => {
        revokePreviewUrl(outsideImage);
        revokePreviewUrl({ url: outsideWorkingUrl });
        setOutsideImage(null);
        setOutsideResult(null);
        setOutsideError(null);
        setOutsideCandidates([]);
        setOutsideCorners([]);
        setOutsideDividers([]);
        setOutsideWorkingUrl(null);
    }, [outsideImage, outsideWorkingUrl]);

    const handleClearInside = useCallback(() => {
        revokePreviewUrl(insideImage);
        revokePreviewUrl({ url: insideWorkingUrl });
        setInsideImage(null);
        setInsideResult(null);
        setInsideError(null);
        setInsideCandidates([]);
        setInsideCorners([]);
        setInsideDividers([]);
        setInsideWorkingUrl(null);
    }, [insideImage, insideWorkingUrl]);

    const handleAutoDetectOutside = useCallback(async () => {
        if (!outsideImage) return;
        setIsDetectingOutside(true);
        setOutsideError(null);
        try {
            const candidates = await detectAllOpenings(outsideImage.file);
            if (candidates && candidates.length > 0) {
                setOutsideCandidates(candidates);
                setOutsideCorners(candidates[0].corners);
                setOutsideDividers([]);
            } else {
                setOutsideError('Could not detect openings. Try manually selecting the area.');
            }
        } catch (err) {
            console.error(err);
            setOutsideError('Detection failed. Try manual selection.');
        } finally {
            setIsDetectingOutside(false);
        }
    }, [outsideImage]);

    const handleAutoDetectInside = useCallback(async () => {
        if (!insideImage) return;
        setIsDetectingInside(true);
        setInsideError(null);
        try {
            const candidates = await detectAllOpenings(insideImage.file);
            if (candidates && candidates.length > 0) {
                setInsideCandidates(candidates);
                setInsideCorners(candidates[0].corners);
                setInsideDividers([]);
            } else {
                setInsideError('Could not detect openings. Try manually selecting the area.');
            }
        } catch (err) {
            console.error(err);
            setInsideError('Detection failed. Try manual selection.');
        } finally {
            setIsDetectingInside(false);
        }
    }, [insideImage]);

    const handleGenerate = useCallback(async (viewType) => {
        const isOutside = viewType === 'outside';
        const targetImage = isOutside ? outsideImage : insideImage;
        const corners = isOutside ? outsideCorners : insideCorners;
        const dividers = isOutside ? outsideDividers : insideDividers;
        const workingUrl = isOutside ? outsideWorkingUrl : insideWorkingUrl;

        if (!targetImage || !Array.isArray(corners) || corners.length !== 4) {
            if (isOutside) setOutsideError('Please select the patio opening first.');
            else setInsideError('Please select the patio opening first.');
            return;
        }

        if (!workingUrl) {
            if (isOutside) setOutsideError('Image is still processing. Please wait a moment.');
            else setInsideError('Image is still processing. Please wait a moment.');
            return;
        }

        if (isOutside) {
            setIsGeneratingOutside(true);
            setOutsideError(null);
            setOutsideResult(null);
        } else {
            setIsGeneratingInside(true);
            setInsideError(null);
            setInsideResult(null);
        }
        setActiveView(viewType);

        try {
            // 1. Get working image dimensions (already max 1024px)
            const getImgDims = () => new Promise((res) => {
                const img = new Image();
                img.onload = () => res({ width: img.naturalWidth, height: img.naturalHeight });
                img.src = workingUrl;
            });
            const dims = await getImgDims();

            // 2. Render deterministic screen overlay at WORKING image dimensions
            const overlayCanvas = renderScreenOverlay({
                width: dims.width,
                height: dims.height,
                corners,
                dividers,
                viewType,
                screenColor,
                interiorVisibility: isOutside ? undefined : interiorVisibility
            });
            const overlayUrl = overlayCanvas.toDataURL('image/png');

            // 3. Bake overlay onto working image — screen is now pixel-perfect
            const compositeUrl = await bakeOverlay(workingUrl, overlayUrl);

            // 4. Add watermark and we're done — no AI call needed
            const watermarkedUrl = await addWatermark(compositeUrl);
            if (isOutside) setOutsideResult(watermarkedUrl);
            else setInsideResult(watermarkedUrl);

        } catch (err) {
            console.error(err);
            if (isOutside) setOutsideError('Generation failed. Please try again.');
            else setInsideError('Generation failed. Please try again.');
        } finally {
            if (isOutside) setIsGeneratingOutside(false);
            else setIsGeneratingInside(false);
        }
    }, [outsideImage, insideImage, outsideCorners, insideCorners, outsideDividers, insideDividers, outsideWorkingUrl, insideWorkingUrl, screenColor, interiorVisibility]);

    const canGenerateOutside = outsideImage && Array.isArray(outsideCorners) && outsideCorners.length === 4;
    const canGenerateInside = insideImage && Array.isArray(insideCorners) && insideCorners.length === 4;

    return (
        <div className="screen-visualizer">
            <div className="mb-10">
                <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Screen Visualizer</h1>
                <p className="text-gray-500 mt-1 text-sm">Upload interior and exterior photos to preview your patio screen.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                <div>
                    <label htmlFor="screen-color" className="block text-sm font-medium text-gray-700 mb-1.5">Screen Color</label>
                    <input
                        id="screen-color"
                        type="text"
                        value={screenColor}
                        onChange={(e) => setScreenColor(e.target.value)}
                        placeholder="e.g. dark bronze, black, white"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-400"
                    />
                </div>
                <div>
                    <label htmlFor="interior-visibility" className="block text-sm font-medium text-gray-700 mb-1.5">Interior See-Through</label>
                    <select
                        id="interior-visibility"
                        value={interiorVisibility}
                        onChange={(e) => setInteriorVisibility(Number(e.target.value))}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-400"
                    >
                        <option value={90}>90% Visible (Light Tint)</option>
                        <option value={95}>95% Visible (Barely There)</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-4 space-y-8">
                    {/* Outside */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Exterior</h2>
                            {outsideResult && <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">Ready</span>}
                        </div>
                        <ImageUploader
                            onImageUpload={handleUploadOutside}
                            onClearImage={handleClearOutside}
                            currentImage={outsideImage}
                            disabled={isGeneratingOutside}
                            isDetecting={isDetectingOutside}
                        >
                            {outsideImage && outsideWorkingUrl && (
                                <OpeningSelector
                                    imageUrl={outsideWorkingUrl}
                                    candidates={outsideCandidates}
                                    onChange={(c, d) => { setOutsideCorners(c); setOutsideDividers(d || []); }}
                                    onAutoDetect={handleAutoDetectOutside}
                                    disabled={isDetectingOutside || isGeneratingOutside}
                                    viewType="outside"
                                />
                            )}
                        </ImageUploader>
                        {outsideImage && (
                            <button
                                onClick={() => handleGenerate('outside')}
                                className="btn btn-primary w-full mt-3"
                                disabled={!canGenerateOutside || isGeneratingOutside}
                            >
                                {isGeneratingOutside ? (
                                    <><span className="spinner" />Generating...</>
                                ) : (
                                    'Generate Exterior'
                                )}
                            </button>
                        )}
                        {outsideError && <p className="text-red-600 text-xs mt-2">{outsideError}</p>}
                    </div>

                    <div className="border-t border-gray-100" />

                    {/* Inside */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Interior</h2>
                            {insideResult && <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">Ready</span>}
                        </div>
                        <ImageUploader
                            onImageUpload={handleUploadInside}
                            onClearImage={handleClearInside}
                            currentImage={insideImage}
                            disabled={isGeneratingInside}
                            isDetecting={isDetectingInside}
                        >
                            {insideImage && insideWorkingUrl && (
                                <OpeningSelector
                                    imageUrl={insideWorkingUrl}
                                    candidates={insideCandidates}
                                    onChange={(c, d) => { setInsideCorners(c); setInsideDividers(d || []); }}
                                    onAutoDetect={handleAutoDetectInside}
                                    disabled={isDetectingInside || isGeneratingInside}
                                    viewType="inside"
                                />
                            )}
                        </ImageUploader>
                        {insideImage && (
                            <button
                                onClick={() => handleGenerate('inside')}
                                className="btn btn-primary w-full mt-3"
                                disabled={!canGenerateInside || isGeneratingInside}
                            >
                                {isGeneratingInside ? (
                                    <><span className="spinner" />Generating...</>
                                ) : (
                                    'Generate Interior'
                                )}
                            </button>
                        )}
                        {insideError && <p className="text-red-600 text-xs mt-2">{insideError}</p>}
                    </div>
                </div>

                <div className="lg:col-span-8">
                    <div className="sticky top-6">
                        <div className="flex items-center gap-1 mb-4">
                            <button
                                onClick={() => setActiveView('outside')}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${activeView === 'outside' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
                            >
                                Exterior
                            </button>
                            <button
                                onClick={() => setActiveView('inside')}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${activeView === 'inside' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
                            >
                                Interior
                            </button>
                        </div>

                        <div className="bg-gray-100 rounded-lg overflow-hidden min-h-[400px] flex items-center justify-center">
                            {activeView === 'outside' && (
                                isGeneratingOutside ? (
                                    <div className="flex flex-col items-center gap-3 py-20">
                                        <div className="spinner w-8 h-8 border-4" />
                                        <p className="text-sm text-gray-600">Applying screen...</p>
                                    </div>
                                ) : outsideResult ? (
                                    <div className="w-full">
                                        <img src={outsideResult} className="w-full h-full object-contain" alt="Exterior preview" />
                                    </div>
                                ) : (
                                    <div className="text-center py-20">
                                        <p className="text-gray-400 text-sm">Upload an exterior photo to get started.</p>
                                    </div>
                                )
                            )}
                            {activeView === 'inside' && (
                                isGeneratingInside ? (
                                    <div className="flex flex-col items-center gap-3 py-20">
                                        <div className="spinner w-8 h-8 border-4" />
                                        <p className="text-sm text-gray-600">Applying screen...</p>
                                    </div>
                                ) : insideResult ? (
                                    <div className="w-full">
                                        <img src={insideResult} className="w-full h-full object-contain" alt="Interior preview" />
                                    </div>
                                ) : (
                                    <div className="text-center py-20">
                                        <p className="text-gray-400 text-sm">Upload an interior photo to get started.</p>
                                    </div>
                                )
                            )}
                        </div>

                        {activeView === 'outside' && outsideResult && (
                            <div className="mt-4 flex justify-end">
                                <button onClick={() => downloadImage(outsideResult, 'exterior-mockup.png')} className="btn btn-secondary text-sm">Download Exterior</button>
                            </div>
                        )}
                        {activeView === 'inside' && insideResult && (
                            <div className="mt-4 flex justify-end">
                                <button onClick={() => downloadImage(insideResult, 'interior-mockup.png')} className="btn btn-secondary text-sm">Download Interior</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;
