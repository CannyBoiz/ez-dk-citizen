FROM node:26-alpine AS builder

WORKDIR /workspace

RUN npm install --global pnpm@11.24.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/data/package.json apps/data/package.json
COPY packages/api-contracts/package.json packages/api-contracts/package.json
RUN pnpm install --frozen-lockfile

COPY apps/data apps/data
COPY packages/api-contracts packages/api-contracts
RUN pnpm --filter @ez-dk-citizen/api-contracts build
RUN pnpm --filter @ez-dk-citizen/data build
RUN pnpm --filter @ez-dk-citizen/data deploy --prod /data-service

FROM node:26-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder --chown=node:node /data-service ./

USER node
EXPOSE 3000

CMD ["node", "dist/src/index.js"]
