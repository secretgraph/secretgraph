const path = require("path");
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const ManifestPlugin = require('webpack-manifest-plugin');
const TsGraphQLPlugin = require('ts-graphql-plugin/webpack');

const tsgqlPlugin = new TsGraphQLPlugin({
  /* plugin options */
});


module.exports = {
  context: __dirname,
  devtool: "source-map",
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
