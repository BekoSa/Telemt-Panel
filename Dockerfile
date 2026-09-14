FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine
WORKDIR /app

# Non-root user
RUN addgroup -g 1001 -S panel && adduser -u 1001 -S panel -G panel

COPY --from=deps /app/node_modules ./node_modules

# Copy all project files (public/ included, .env excluded via .dockerignore)
COPY . .

# Ensure required directories exist even if empty
RUN mkdir -p public && chown -R panel:panel /app

USER panel

ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/healthz >/dev/null || exit 1

CMD ["node", "server.js"]
