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
    // `npm start` serves dev/index.html, which fakes the mount contract so a
    // component can be worked on without a running cBioPortal. The bundle is
    // served from the root so the harness can load it exactly as the portal
    // would, by URL.
    devServer: {
        static: { directory: path.resolve(__dirname, 'dev') },
        port: 8081,
        open: false,
        hot: false,
        headers: { 'Access-Control-Allow-Origin': '*' },
        // The Prognosis tab talks to two things the harness does not host: a
        // cBioPortal REST API and the risk service. Proxying both onto this
        // origin reproduces the deployed arrangement, where the tab is
        // same-origin with the portal, and avoids CORS in development.
        //
        //   DEV_PORTAL=http://localhost:9090   to use a local portal instead
        //   DEV_RISK=http://localhost:8000     the risk service, `make serve`
        proxy: [
            {
                context: ['/api'],
                target: process.env.DEV_PORTAL || 'https://www.cbioportal.org',
                changeOrigin: true,
                secure: true,
            },
            {
                context: ['/risk'],
                target: process.env.DEV_RISK || 'http://localhost:8000',
                changeOrigin: true,
                pathRewrite: { '^/risk': '' },
            },
        ],
    },
    performance: { hints: false },
    devtool: 'source-map',
};
