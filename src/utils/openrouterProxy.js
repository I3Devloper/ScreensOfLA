const getOpenRouterProxyUrl = () => {
    if (typeof window !== 'undefined' && window.screenVisualizerConfig?.openrouterProxyUrl) {
        return window.screenVisualizerConfig.openrouterProxyUrl;
    }

    if (typeof window !== 'undefined' && window.wpApiSettings?.root) {
        return new URL('screen-visualizer/v1/openrouter', window.wpApiSettings.root).toString();
    }

    if (typeof document !== 'undefined') {
        const apiRootLink = document.querySelector('link[rel="https://api.w.org/"]');

        if (apiRootLink?.href) {
            return new URL('screen-visualizer/v1/openrouter', apiRootLink.href).toString();
        }
    }

    if (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null') {
        return new URL('/wp-json/screen-visualizer/v1/openrouter', window.location.origin).toString();
    }

    return null;
};

export const postToOpenRouterProxy = async (payload) => {
    const proxyUrl = getOpenRouterProxyUrl();

    if (!proxyUrl) {
        throw new Error('Screen Visualizer proxy URL is not configured and the WordPress REST root could not be detected.');
    }

    const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Screen Visualizer API error: ${response.status} - ${errorText}`);
    }

    return response.json();
};
