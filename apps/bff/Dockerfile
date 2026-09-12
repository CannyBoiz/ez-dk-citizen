FROM node:26-alpine AS development

WORKDIR /workspace

RUN npm install --global pnpm@11.24.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/bff/package.json apps/bff/package.json
COPY packages/api-contracts/package.json packages/api-contracts/package.json
RUN pnpm install --frozen-lockfile

COPY --chown=node:node apps/bff apps/bff
COPY --chown=node:node packages/api-contracts packages/api-contracts
RUN pnpm --filter @ez-dk-citizen/api-contracts build

USER node

CMD ["pnpm", "--filter", "@ez-dk-citizen/bff", "dev"]

FROM development AS builder

USER root

RUN pnpm --filter @ez-dk-citizen/bff build
RUN pnpm --filter @ez-dk-citizen/bff deploy --prod /bff

FROM node:26-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder --chown=node:node /bff ./

USER node
EXPOSE 3000

CMD ["node", "dist/index.js"]
