# Long-running real API (visitor mint/deposit). Do not bake secrets into the image.
FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @agent-town/shared build \
  && pnpm --filter @agent-town/ens build \
  && pnpm --filter @agent-town/circle build \
  && pnpm --filter @agent-town/graphclient build \
  && pnpm --filter @agent-town/api build
ENV PORT=3001 API_MODE=real ALLOW_VISITOR=true
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
