const path = require("path");
const webpack = require("webpack");
const BundleTracker = require("webpack-bundle-tracker");
const RelayCompilerLanguageTypescript = require("relay-compiler-language-typescript");
const RelayCompilerWebpackPlugin = require("relay-compiler-webpack-plugin");
const ServiceWorkerWebpackPlugin = require("serviceworker-webpack-plugin");

module.exports = {
  context: __dirname,
  entry: "./assets/js/Client/index.tsx",
  devtool: "inline-source-map",
  mode: "development",
  output: {
    path: path.resolve(__dirname, "./webpack_bundles/"),
    filename: "[name].js", //-[hash]
  },
  module: {
    rules: [
      {
        test: /\.(ts|js)x?$/,
        loader: "babel-loader",
        options: {
          rootMode: "root",
        },
        exclude: /node_modules/,
      },
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
    new RelayCompilerWebpackPlugin({
      schema: path.resolve(__dirname, "./schema.json"),
      src: path.resolve(__dirname, "./assets/js/"),
      artifactDirectory: "./assets/js/__generated__",
      languagePlugin: RelayCompilerLanguageTypescript.default,
    }),
    new BundleTracker({
      filename: "./webpack-stats.json",
      path: __dirname,
    }),
    new webpack.ProvidePlugin({ BrowserFS: 'bfsGlobal', process: 'processGlobal', Buffer: 'bufferGlobal' }),
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
