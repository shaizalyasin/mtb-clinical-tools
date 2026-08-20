const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

// The bundle is loaded by cBioPortal's custom_tabs loader (little-loader) as a
// plain <script src>. It must therefore be a single self-executing file with no
// module system assumptions and no external runtime dependencies -- React is
// bundled in, deliberately, so the bundle is independent of whatever the host
// portal happens to ship.
module.exports = {
    // Pin the resolution root to this file's directory rather than cwd. Without
    // it, `npm run build` from a UNC path on Windows resolves ./src against
    // C:\Windows and fails.
    context: __dirname,
    entry: './src/index.tsx',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'mtb-tools.js',
        // Nothing should leak onto window except the mount callback we set
        // explicitly in src/index.tsx.
        iife: true,
        clean: true,
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: {
                    loader: 'ts-loader',
                    options: { compilerOptions: { noEmit: false } },
                },
                exclude: /node_modules/,
            },
            {
                test: /\.css$/,
                use: [MiniCssExtractPlugin.loader, 'css-loader'],
            },
        ],
    },
    plugins: [new MiniCssExtractPlugin({ filename: 'mtb-tools.css' })],
    optimization: {
        // custom_tabs loads exactly one script URL per entry in pathsToJs, so
        // code splitting would silently drop half the bundle.
        splitChunks: false,
        runtimeChunk: false,
    },
    performance: { hints: false },
    devtool: 'source-map',
};
