const CopyWebpackPlugin = require('copy-webpack-plugin');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

const distPath = `${__dirname}/dist`;

module.exports = () => ({
	entry: {main:"./src/index.ts"},
	mode: "development",
	module: {rules:[{test:/\.tsx?$/, loader:"ts-loader"}]},
	optimization: {
		minimize: false
	},
	output: {path:distPath, filename:"index.js"},
	performance: {maxEntrypointSize:10000000, maxAssetSize:10000000},
	resolve: {
		extensions:[".ts"],
		plugins:[new TsconfigPathsPlugin({extensions: [".ts"]})],
	},
	plugins: [
		new CopyWebpackPlugin({patterns:[{from:'static'}]})
	],
	watch: true,
})