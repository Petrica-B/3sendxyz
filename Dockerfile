## -------- Build stage ----------------------------------------------------
FROM node:22-slim AS builder
WORKDIR /app

ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
ARG VERSION_HASH=unknown
ENV NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=${NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID}
ENV VERSION_HASH=${VERSION_HASH}
ENV NEXT_PUBLIC_VERSION_HASH=${VERSION_HASH}

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --include=optional

COPY . .
RUN npm run build

##
## -------- Runtime stage --------------------------------------------------
##
FROM node:22-slim AS runtime
WORKDIR /app

ARG VERSION_HASH=unknown

ENV NODE_ENV=production \
    PORT=3000

ENV VERSION_HASH=${VERSION_HASH} \
    NEXT_PUBLIC_VERSION_HASH=${VERSION_HASH}

COPY --from=builder /app/.next/standalone        ./
COPY --from=builder /app/.next/static            ./.next/static
COPY --from=builder /app/public                  ./public

EXPOSE 3000
CMD ["node", "server.js"]
