# Builds the bundle and serves dist/ as static files.
#
# The serving half is incidental -- any static host or CDN works. What matters
# is that the output is two plain files, mtb-tools.js and mtb-tools.css, at
# stable URLs that a custom_tabs entry can point at.

FROM node:22-alpine AS build
WORKDIR /build
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json webpack.config.js ./
COPY src ./src
RUN npm run typecheck && npm run build

FROM nginx:1.27-alpine
COPY --from=build /build/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
