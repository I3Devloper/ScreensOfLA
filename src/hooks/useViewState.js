import { useState, useCallback, useMemo } from '@wordpress/element';

const revokeIfBlob = ( url ) => {
	if ( url && url.startsWith( 'blob:' ) ) {
		URL.revokeObjectURL( url );
	}
};

export function useViewState() {
	const [ state, setState ] = useState( {
		image: null,
		result: null,
		isGenerating: false,
		error: null,
		corners: [],
		dividers: [],
		workingUrl: null,
	} );

	const update = useCallback( ( updates ) => {
		setState( ( prev ) => ( { ...prev, ...updates } ) );
	}, [] );

	const reset = useCallback( () => {
		setState( ( prev ) => {
			revokeIfBlob( prev.image?.url );
			revokeIfBlob( prev.workingUrl );
			return {
				image: null,
				result: null,
				isGenerating: false,
				error: null,
				corners: [],
				dividers: [],
				workingUrl: null,
			};
		} );
	}, [] );

	return useMemo(
		() => ( { state, update, reset } ),
		[ state, update, reset ]
	);
}
