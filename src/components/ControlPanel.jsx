/**
 * ControlPanel - Controls for opacity, animation, and export
 */
import { useState, useCallback } from '@wordpress/element';

const ControlPanel = ({
    opacity,
    onOpacityChange,
    onAnimate,
    animationState,
    isAnimating,
    onExportVideo,
    onReset,
    disabled = false
}) => {
    const [isRecording, setIsRecording] = useState(false);
    const [exportOption, setExportOption] = useState('loop'); // 'down', 'up', 'loop', 'manual'

    const handleOpacityChange = useCallback((e) => {
        const value = parseFloat(e.target.value) / 100;
        onOpacityChange(value);
    }, [onOpacityChange]);

    const handleRollDown = useCallback(() => {
        onAnimate('down');
    }, [onAnimate]);

    const handleRollUp = useCallback(() => {
        onAnimate('up');
    }, [onAnimate]);

    const handleExport = useCallback(async () => {
        setIsRecording(true);
        try {
            await onExportVideo({
                duration: 5000,
                fps: 30,
                animationType: exportOption
            });
        } catch (error) {
            console.error('Export failed:', error);
            alert('Video export failed. Please try again.');
        } finally {
            setIsRecording(false);
        }
    }, [onExportVideo, exportOption]);

    return (
        <div className="bento-card control-section">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
                Controls
            </h3>

            {/* Opacity Slider */}
            <div className="control-row">
                <label htmlFor="opacity-slider" className="text-sm font-medium text-gray-700">
                    Screen Opacity
                </label>
                <span className="text-sm text-gray-500">
                    {Math.round(opacity * 100)}%
                </span>
            </div>
            <input
                id="opacity-slider"
                type="range"
                min="0"
                max="100"
                value={Math.round(opacity * 100)}
                onChange={handleOpacityChange}
                disabled={disabled}
                className="w-full mt-1"
            />

            {/* Animation Controls */}
            <div className="pt-2">
                <p className="text-sm font-medium text-gray-700 mb-2">
                    Screen Animation
                </p>
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={handleRollDown}
                        disabled={disabled || isAnimating}
                        className={`btn ${animationState === 'down' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                        Roll Down
                    </button>
                    <button
                        onClick={handleRollUp}
                        disabled={disabled || isAnimating}
                        className={`btn ${animationState === 'up' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        </svg>
                        Roll Up
                    </button>
                </div>
            </div>

            {/* Export Section */}
            <div className="pt-2 border-t border-gray-100">
                <p className="text-sm font-medium text-gray-700 mb-2">
                    Export Video
                </p>

                {/* Export Type Selection */}
                <div className="space-y-1.5 mb-3">
                    {[
                        { value: 'loop', label: 'Loop (Down → Up)' },
                        { value: 'down', label: 'Roll Down Only' },
                        { value: 'up', label: 'Roll Up Only' },
                    ].map((option) => (
                        <label
                            key={option.value}
                            className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                            <input
                                type="radio"
                                name="export-option"
                                value={option.value}
                                checked={exportOption === option.value}
                                onChange={(e) => setExportOption(e.target.value)}
                                disabled={disabled || isRecording}
                                className="w-4 h-4 text-primary-500"
                            />
                            <span className={disabled || isRecording ? 'text-gray-400' : 'text-gray-700'}>
                                {option.label}
                            </span>
                        </label>
                    ))}
                </div>

                <button
                    onClick={handleExport}
                    disabled={disabled || isAnimating || isRecording}
                    className={`btn ${isRecording ? 'btn-recording' : 'btn-success'} w-full`}
                >
                    {isRecording ? (
                        <>
                            <span className="spinner" />
                            Recording...
                        </>
                    ) : (
                        <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Export Video
                        </>
                    )}
                </button>
            </div>

            {/* Reset Button */}
            <div className="pt-2 border-t border-gray-100">
                <button
                    onClick={onReset}
                    disabled={disabled || isAnimating || isRecording}
                    className="btn btn-danger w-full"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Reset All
                </button>
            </div>

            {/* Instructions */}
            <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500 leading-relaxed">
                    <strong>Tip:</strong> Drag the corner pins to match your patio's
                    pillars/roof for a realistic perspective effect.
                </p>
            </div>
        </div>
    );
};

export default ControlPanel;
