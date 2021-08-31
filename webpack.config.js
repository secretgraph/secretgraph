const path = require('path')
const { SourceMapDevToolPlugin, ProvidePlugin } = require('webpack')
const { WebpackManifestPlugin } = require('webpack-manifest-plugin')
const TsGraphQLPlugin = require('ts-graphql-plugin/webpack')
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin')

module.exports = (env, options) => {
    const tsgqlPlugin = new TsGraphQLPlugin({
        /* plugin options */
    })

    const plugins = [
        new WebpackManifestPlugin({
            writeToFileEmit: true,
            publicPath: 'webpack_bundles/',
        }),
        tsgqlPlugin,
        new ProvidePlugin({
            Buffer: ['buffer', 'Buffer'],
        }),
    ]
    if (options.mode == 'development') {
        plugins.push(
            new SourceMapDevToolPlugin({
                filename: null,
                exclude: [/node_modules/],
                test: /\.tsx?$/i,
            })
        )
    }
    return {
        context: __dirname,
        devtool: options.mode === 'development' ? 'inline-source-map' : false,
        devServer:
            options.mode === 'development'
                ? {
                      // doesn't work
                      hot: false,
                      port: '8080',
                      devMiddleware: {
                          writeToDisk: true,
                      },
                      headers: {
                          'Access-Control-Allow-Origin': '*',
                          'Access-Control-Allow-Headers':
                              'X-Requested-With, content-type, Authorization',
                      },
                  }
                : undefined,
        output: {
            publicPath: 'auto',
            filename: 'js/[name].[fullhash].js',
            chunkFilename: 'js/[name].[fullhash].js',
            path: path.resolve(__dirname, './webpack_bundles/'),
            clean: true,
        },
        watchOptions: {
            ignored: /node_modules/,
        },
        entry: {
            main: './assets/js/index.tsx',
        },
        module: {
            rules: [
                {
                    test: /\.(ts|js)x?$/i,
                    loader: 'ts-loader',
                    exclude: /node_modules/,
                    options: {
                        projectReferences: true,
                        getCustomTransformers: () => ({
                            before: [
                                tsgqlPlugin.getTransformer({
                                    /* transformer options */
                                }),
                            ],
                        }),
                    },
                },
                {
                    test: /\.css$/i,
                    use: ['style-loader', 'css-loader'],
                },
            ],
        },
        resolve: {
            extensions: [
                '.tsx',
                '.jsx',
                '.ts',
                '.js',
                '.wasm',
                '.mjs',
                '.json',
            ],
            fallback: {
                buffer: false,
            },
            plugins: [new TsconfigPathsPlugin()],
        },
        plugins,
        optimization: {
            runtimeChunk: 'single',
            splitChunks: {
                chunks: 'all',
                maxAsyncRequests: 100,
                cacheGroups: {
                    vendors: {
                        test: /[\\/]node_modules[\\/]/,
                        priority: -10,
                        reuseExistingChunk: true,
                        name(module) {
                            const packageName = module.context.match(
                                /[\\/]node_modules[\\/](.*?)([\\/]|$)/
                            )[1]

                            return `vendor.${packageName}`
                        },
                    },
                    default: {
                        minChunks: 4,
                        priority: -20,
                        reuseExistingChunk: true,

                        name(module) {
                            const moduleFileName = module
                                .identifier()
                                .split('/')
                                .reduceRight((item) => item)
                            return `default.${moduleFileName}`
                        },
                    },
                },
            },
        },
    }
}
