var path = require('path');
var webpack = require('webpack');
var BundleTracker = require('webpack-bundle-tracker');

module.exports = {
  context: __dirname,
  entry: "./client/js/index.tsx",
  devtool: "inline-source-map",
  output: {},
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  output: {
    path: path.resolve(__dirname, "./webpack_bundles/"),
    filename: "[name]-[hash].js",
  },

  plugins: [new BundleTracker({ filename: "./webpack-stats.json" })],
  externals: {
    "react": "React",
    "react-dom": "ReactDOM",
  },
};
