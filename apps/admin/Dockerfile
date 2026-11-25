FROM node:26-alpine AS development

WORKDIR /workspace

RUN npm install --global pnpm@12.15.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin/package.json apps/admin/package.json
COPY packages/api-contracts/package.json packages/api-contracts/package.json
COPY packages/lesson-text/package.json packages/lesson-text/package.json
RUN pnpm install --frozen-lockfile

COPY --chown=node:node apps/admin apps/admin
COPY --chown=node:node packages/api-contracts packages/api-contracts
COPY --chown=node:node packages/lesson-text packages/lesson-text
# Vite writes its config bundle and dependency cache beside the app.
RUN pnpm --filter @ez-dk-citizen/api-contracts --filter @ez-dk-citizen/lesson-text build \
 && mkdir apps/admin/node_modules/.vite \
 && chown node:node apps/admin apps/admin/node_modules/.vite

USER node
EXPOSE 5173

CMD ["pnpm", "--filter", "@ez-dk-citizen/admin", "dev", "--host", "0.0.0.0"]
