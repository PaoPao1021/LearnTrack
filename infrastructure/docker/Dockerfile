FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY database ./database
RUN npm ci --no-audit --no-fund \
  && npm run build -w @learntrack/domain -w @learntrack/contracts -w @learntrack/web -w @learntrack/api

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
# Install only the API workspace's production dependency graph. This keeps Vite,
# Vitest, TypeScript, and browser-only dependencies out of the runtime image.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
RUN npm ci --omit=dev --workspace=@learntrack/api --include-workspace-root --no-audit --no-fund \
  && npm cache clean --force
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/database ./database
EXPOSE 8787
WORKDIR /app/apps/api
CMD ["node", "dist/app/server.js"]
