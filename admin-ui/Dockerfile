FROM node:22-alpine AS web-build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY web ./web
RUN npm run build:web

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache curl
COPY package.json ./
RUN npm install --omit=dev
COPY server ./server
COPY scripts ./scripts
COPY --from=web-build /app/web/dist ./web/dist
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --retries=5 --start-period=30s \
  CMD curl -sf http://127.0.0.1:3000/healthz >/dev/null || exit 1
CMD ["node", "server/index.js"]
