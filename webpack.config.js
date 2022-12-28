const path = require('path')
const fs = require('fs')
const { SourceMapDevToolPlugin, ProvidePlugin } = require('webpack')
const { WebpackManifestPlugin } = require('webpack-manifest-plugin')
const TsGraphQLPlugin = require('ts-graphql-plugin/webpack')

module.exports = (env, options) => {
    const tsgqlPlugin = new TsGraphQLPlugin({
        tsconfigPath: path.resolve(
            __dirname,
            './js-packages/graphql-queries/tsconfig.json'
        ),
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
    const alias = {}
    fs.readdirSync(path.resolve(__dirname, './js-packages')).forEach(
        (package) => {
            alias[`@secretgraph/${package}`] = path.resolve(
                __dirname,
                'js-packages',
                package,
                'src'
            )
        }
    )
    return {
        stats: {
            errorDetails: true,
        },
        context: __dirname,
        devtool: options.mode === 'development' ? 'eval-source-map' : false,
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
                          'Service-Worker-Allowed': '/',
                      },
                  }
                : undefined,
        output: {
            publicPath: 'auto',
            path: path.resolve(__dirname, './webpack_bundles/'),
            chunkFilename: 'chunks/[name].[fullhash].js',
            filename: '[name].[fullhash].js',
            clean: true,
        },
        watchOptions: {
            ignored: /node_modules/,
        },
        entry: {
            loader: {
                import: './assets/js/loader.tsx',
            },
            serviceworker: {
                import: './assets/js/serviceworker.ts',
                filename: '[name].js',
                chunkLoading: false,
                runtime: false,
            },
            suneditorstyle: {
                import: './node_modules/suneditor/dist/css/suneditor.min.css',
                filename: '[name].js',
                chunkLoading: false,
                runtime: false,
            },
        },
        module: {
            rules: [
                {
                    test: /\.(ts|js)x?$/i,
                    loader: 'ts-loader',
                    exclude: /node_modules/,
                    options: {
                        projectReferences: true,
                        compilerOptions: {
                            jsx:
                                options.mode == 'development'
                                    ? 'react-jsxdev'
                                    : 'react-jsx',
                        },
                        getCustomTransformers: () => ({
                            before: [tsgqlPlugin.getTransformer({})],
                        }),
                    },
                },
                {
                    test: /\.min\.css$/i,
                    type: 'asset/resource',
                },
                {
                    test: /(?<!\.min)\.css$/i,
                    use: [
                        {
                            loader: 'style-loader',
                        },
                        {
                            loader: 'css-loader',
                        },
                    ],
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
            alias,
        },
        plugins,
        optimization: {
            chunkIds: 'size',
            runtimeChunk: {
                name: (entrypoint) => `chunks/runtime~${entrypoint.name}`,
            },
        },
    }
}
