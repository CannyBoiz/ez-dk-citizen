FROM node:26-alpine AS development

WORKDIR /workspace

RUN npm install --global pnpm@11.24.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin/package.json apps/admin/package.json
COPY packages/api-contracts/package.json packages/api-contracts/package.json
RUN pnpm install --frozen-lockfile

COPY --chown=node:node apps/admin apps/admin
COPY --chown=node:node packages/api-contracts packages/api-contracts
# Vite writes its config bundle and dependency cache beside the app.
RUN pnpm --filter @ez-dk-citizen/api-contracts build \
 && mkdir apps/admin/node_modules/.vite \
 && chown node:node apps/admin apps/admin/node_modules/.vite

USER node
EXPOSE 5173

CMD ["pnpm", "--filter", "@ez-dk-citizen/admin", "dev", "--host", "0.0.0.0"]
