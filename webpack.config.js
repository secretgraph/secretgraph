const path = require("path");
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const ManifestPlugin = require('webpack-manifest-plugin');
const TsGraphQLPlugin = require('ts-graphql-plugin/webpack');

const tsgqlPlugin = new TsGraphQLPlugin({
  /* plugin options */
});


module.exports = (env, options) => ({
  context: __dirname,
  devtool: options.mode === "development" ? "source-map" : false,
  output: {
    publicPath: "webpack_bundles/",
    path: path.resolve(__dirname, "./webpack_bundles/"),
  },
  watchOptions: {
    ignored: /node_modules/
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
    ]
  },
  resolve: {
    extensions: [".tsx", ".jsx", ".ts", ".js", '.wasm', '.mjs', '.json'],
    fallback: {
      "buffer": false
    },
  },
  plugins: [
    // remove outdated
    new CleanWebpackPlugin(),
    new ManifestPlugin(),
    tsgqlPlugin,
  ],
  optimization: {
    runtimeChunk: true,
    splitChunks: {
      chunks: "all",
    },
  },
});
