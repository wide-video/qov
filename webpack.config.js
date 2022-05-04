const CopyWebpackPlugin = require('copy-webpack-plugin');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

module.exports = () => ({
	entry: {
		demo:"./src/demo.ts",
		test:"./src/test.ts"
	},
	module: {rules:[{test:/\.tsx?$/, loader:"ts-loader"}]},
	optimization: {
		minimize: false
	},
	output: {
		path: `${__dirname}/dist`,
		filename:"[name].js"
	},
	performance: {maxEntrypointSize:10000000, maxAssetSize:10000000},
	resolve: {
		extensions:[".ts"],
		plugins:[new TsconfigPathsPlugin({extensions: [".ts"]})],
	},
	plugins: [
		new CopyWebpackPlugin({patterns:[{from:'static'}]})
	]
})