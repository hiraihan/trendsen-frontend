# Multi-stage: Node builder → static runtime. The SPA is static files and nothing else:
# no database, no volume, no migration (T19).
FROM node:26-alpine AS builder
WORKDIR /app

# VITE_API_URL is a build arg: it is baked into the bundle at build time, not runtime.
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:26-alpine AS runtime
WORKDIR /app
RUN npm install -g serve@14 && serve --version
# Non-root user; serve binds 0.0.0.0:3000 and rewrites unknown paths to index.html
# (history-mode routing needs the single-page fallback).
USER node
EXPOSE 3000
COPY --from=builder --chown=node:node /app/dist ./dist
CMD ["serve", "--single", "--listen", "tcp://0.0.0.0:3000", "./dist"]
