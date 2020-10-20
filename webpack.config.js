const path = require("path");
const webpack = require("webpack");
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const ManifestPlugin = require('webpack-manifest-plugin');
const TsGraphQLPlugin = require('ts-graphql-plugin/webpack');

const tsgqlPlugin = new TsGraphQLPlugin({
  /* plugin options */
});


module.exports = {
  context: __dirname,
  devtool: "eval-cheap-source-map",
  mode: "development",
  output: {
    publicPath: "webpack_bundles/",
    path: path.resolve(__dirname, "./webpack_bundles/"),
  },
  entry: {
    main: "./assets/js/Client/index.tsx"
  },
  module: {
    rules: [
      {
        test: /\.(ts|js)x?$/,
        loader: "ts-loader",
        exclude: /node_modules/,
        resolve: {
          fullySpecified: false // relax requirement
        },
        options: {
          getCustomTransformers: () => ({
            before: [
              tsgqlPlugin.getTransformer({
                /* transformer options */
              }),
            ],
          }),
        },
      }
    ],
    noParse: /browserfs\.js/
  },
  resolve: {
    extensions: [".tsx", ".jsx", ".ts", ".js", '.wasm', '.mjs', '.json'],
    alias: {
      'fs': 'browserfs/dist/shims/fs.js',
      'buffer': 'browserfs/dist/shims/buffer.js',
      'path': 'browserfs/dist/shims/path.js',
      'processGlobal': 'browserfs/dist/shims/process.js',
      'bufferGlobal': 'browserfs/dist/shims/bufferGlobal.js',
      'bfsGlobal': require.resolve('browserfs')
    },
    fallback: {
      "url": require.resolve("url/"),
      "stream": require.resolve("stream-browserify"),
      "os": require.resolve("os-browserify/browser"),
      "constants": require.resolve("constants-browserify"),
      "util": require.resolve("util/"),
      "querystring": require.resolve("querystring-es3"),
      "https": false,
      "assert": false
    }
  },

  plugins: [
    // remove outdated
    new CleanWebpackPlugin(),
    new ManifestPlugin(),
    new webpack.ProvidePlugin({ BrowserFS: 'bfsGlobal', process: 'processGlobal', Buffer: 'bufferGlobal' }),
    tsgqlPlugin,
  ],
  optimization: {
    splitChunks: {
      chunks: "all",
    },
  },
  /*
  externals: {
    react: "React",
    "react-dom": "ReactDOM",
  },*/
};
