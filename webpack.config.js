var path = require('path');
var webpack = require('webpack');
var BundleTracker = require('webpack-bundle-tracker');

module.exports = {
  context: __dirname,
  entry: "./Client/js/index.tsx",
  devtool: "inline-source-map",
  mode: "development",
  output: {
    path: path.resolve(__dirname, "./webpack_bundles/"),
    filename: "[name].js", //-[hash]
    //chunkFilename: "[name].bundle.js",
  },
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

  plugins: [
    new BundleTracker({
      filename: "./webpack-stats.json",
      path: __dirname,
    }),
  ]/**
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
