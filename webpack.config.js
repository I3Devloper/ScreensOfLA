const defaultConfig = require( '@wordpress/scripts/config/webpack.config' );
const path = require( 'path' );

module.exports = {
	...defaultConfig,
	entry: {
		index: path.resolve( process.cwd(), 'src', 'index.js' ),
	},
	output: {
		path: path.resolve( process.cwd(), 'assets', 'build' ),
		filename: '[name].js',
	},
	module: {
		...defaultConfig.module,
		rules: [
			...defaultConfig.module.rules,
			{
				test: /\.(?:js|jsx)$/,
				exclude: /node_modules/,
				use: {
					loader: 'babel-loader',
					options: {
						presets: [ '@wordpress/babel-preset-default' ],
					},
				},
			},
		],
	},
	resolve: {
		...defaultConfig.resolve,
		alias: {
			...defaultConfig.resolve.alias,
			'@components': path.resolve( __dirname, 'src/components' ),
			'@hooks': path.resolve( __dirname, 'src/hooks' ),
			'@utils': path.resolve( __dirname, 'src/utils' ),
			'@styles': path.resolve( __dirname, 'src/styles' ),
		},
	},
};
