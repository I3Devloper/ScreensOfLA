/** @type {import('tailwindcss').Config} */
module.exports = {
	content: [ './src/**/*.{js,jsx,ts,tsx}', './src/styles/**/*.{css,scss}' ],
	theme: {
		extend: {
			colors: {
				brand: {
					50: '#ecf8f1',
					100: '#d1edde',
					200: '#a3dbc0',
					300: '#6cc29d',
					400: '#3fa57e',
					500: '#339966',
					600: '#2a7a52',
					700: '#236143',
					800: '#1f4d38',
					900: '#1a4030',
				},
				slate: {
					50: '#f8fafc',
					100: '#f1f5f9',
					200: '#e2e8f0',
					300: '#cbd5e1',
					400: '#94a3b8',
					500: '#64748b',
					600: '#475569',
					700: '#334155',
					800: '#1e293b',
					900: '#0f172a',
				},
			},
			boxShadow: {
				soft: '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
				card: '0 4px 24px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
				'card-hover':
					'0 8px 32px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.03)',
			},
			fontFamily: {
				sans: [
					'"Hanken Grotesk"',
					'system-ui',
					'-apple-system',
					'sans-serif',
				],
			},
		},
	},
	plugins: [],
};
