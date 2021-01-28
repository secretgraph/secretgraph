const path = require('path')
const { SourceMapDevToolPlugin } = require('webpack')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')
const { WebpackManifestPlugin, D } = require('webpack-manifest-plugin')
const TsGraphQLPlugin = require('ts-graphql-plugin/webpack')

module.exports = (env, options) => {
    const tsgqlPlugin = new TsGraphQLPlugin({
        /* plugin options */
    })

    const plugins = [
        // remove outdated
        new CleanWebpackPlugin(),
        new WebpackManifestPlugin(),
        tsgqlPlugin,
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
        output: {
            publicPath: '/webpack_bundles/',
            path: path.resolve(__dirname, './webpack_bundles/'),
        },
        watchOptions: {
            ignored: /node_modules/,
        },
        entry: {
            main: './assets/js/Client/index.tsx',
            'editor-cluster': './assets/js/Client/editors/cluster.tsx',
        },
        module: {
            rules: [
                {
                    test: /\.(ts|js)x?$/i,
                    loader: 'ts-loader',
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
        },
        plugins,
        optimization: {
            runtimeChunk: 'single',
            splitChunks: {
                chunks: 'all',
            },
        },
    }
}
