FROM node:26-bookworm-slim AS development

WORKDIR /workspace

RUN apt-get update \
 && apt-get install --no-install-recommends --yes ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && npm install --global pnpm@11.24.0

ARG AWS_SIGNING_HELPER_VERSION=1.8.5
ARG AWS_SIGNING_HELPER_SHA256=beec9ed1c492d93db809890f16713e3556353294b823c2184ad4e891f1b2b54d
RUN curl --fail --location --silent --show-error \
      "https://rolesanywhere.amazonaws.com/releases/${AWS_SIGNING_HELPER_VERSION}/X86_64/Linux/Amzn2023/aws_signing_helper" \
      --output /tmp/aws_signing_helper \
 && echo "${AWS_SIGNING_HELPER_SHA256}  /tmp/aws_signing_helper" | sha256sum --check --status \
 && install --mode 0555 /tmp/aws_signing_helper /usr/local/bin/aws_signing_helper \
 && rm /tmp/aws_signing_helper

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

FROM node:26-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
 && apt-get install --no-install-recommends --yes ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /bff ./
COPY --from=builder /usr/local/bin/aws_signing_helper /usr/local/bin/aws_signing_helper

USER node
EXPOSE 3000

CMD ["node", "dist/index.js"]
