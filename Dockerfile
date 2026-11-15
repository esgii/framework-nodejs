FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/framework/package.json packages/framework/
COPY apps/api/package.json apps/api/
RUN npm ci
COPY . .
RUN npm run typecheck && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV UPLOAD_DIR=/data/uploads
COPY package.json package-lock.json ./
COPY packages/framework/package.json packages/framework/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev && npm cache clean --force \
    && mkdir -p /data/uploads && chown -R node:node /data
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/v1/status || exit 1
CMD ["node", "--enable-source-maps", "dist/main.js"]
