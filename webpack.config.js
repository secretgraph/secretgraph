const path = require('path')
const fs = require('fs')
const { SourceMapDevToolPlugin, ProvidePlugin } = require('webpack')
const { WebpackManifestPlugin } = require('webpack-manifest-plugin')
const TsGraphQLPlugin = require('ts-graphql-plugin/webpack')

module.exports = (env, options) => {
    const tsgqlPlugin = new TsGraphQLPlugin({})

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
            loader: './assets/js/loader.tsx',
            suneditorstyle: {
                import: './node_modules/suneditor/dist/css/suneditor.min.css',
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
        },
    }
}
