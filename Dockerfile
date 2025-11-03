## -------- Build stage ----------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci
RUN npm install lightningcss-linux-x64-musl

COPY . .
RUN npm run build

##
## -------- Runtime stage --------------------------------------------------
##
FROM node:22-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

COPY --from=builder /app/.next/standalone        ./
COPY --from=builder /app/.next/static            ./.next/static
COPY --from=builder /app/public                  ./public

EXPOSE 3000
CMD ["node", "server.js"]
