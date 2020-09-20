const path = require("path");
const webpack = require("webpack");
const BundleTracker = require("webpack-bundle-tracker");
const ServiceWorkerWebpackPlugin = require("serviceworker-webpack-plugin");
const TsGraphQLPlugin = require('ts-graphql-plugin/webpack');

const tsgqlPlugin = new TsGraphQLPlugin({
  /* plugin options */
});


module.exports = {
  context: __dirname,
  entry: "./assets/js/Client/index.tsx",
  devtool: "eval-source-map",
  mode: "development",
  output: {
    path: path.resolve(__dirname, "./webpack_bundles/"),
    filename: "[name].js", //-[hash]
  },
  module: {
    rules: [
      {
        test: /\.(ts|js)x?$/,
        loader: "ts-loader",
        exclude: /node_modules/,
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
    extensions: [".tsx", ".ts", ".js", ".jsx"],
    alias: {
      'fs': 'browserfs/dist/shims/fs.js',
      'buffer': 'browserfs/dist/shims/buffer.js',
      'path': 'browserfs/dist/shims/path.js',
      'processGlobal': 'browserfs/dist/shims/process.js',
      'bufferGlobal': 'browserfs/dist/shims/bufferGlobal.js',
      'bfsGlobal': require.resolve('browserfs')
    }
  },

  plugins: [
    new BundleTracker({
      filename: "./webpack-stats.json",
      path: __dirname,
    }),
    new webpack.ProvidePlugin({ BrowserFS: 'bfsGlobal', process: 'processGlobal', Buffer: 'bufferGlobal' }),
    tsgqlPlugin,
    new ServiceWorkerWebpackPlugin({ // should be last
      entry: "./assets/js/ServiceWorker/index.tsx",
    }),
  ] /**
  optimization: {
    splitChunks: {
      chunks: "all",
    },
  },
  externals: {
    react: "React",
    "react-dom": "ReactDOM",
  },*/,
};
