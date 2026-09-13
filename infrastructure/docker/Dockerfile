FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps ./apps
COPY database ./database
RUN npm ci --no-audit --no-fund \
  && npm run build -w @learntrack/domain -w @learntrack/contracts -w @learntrack/web -w @learntrack/api

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/database ./database
# 前端静态资源由 API 同源提供（也可改用独立 Nginx 容器）
RUN mkdir -p /app/apps/api/src && echo ok
EXPOSE 8787
WORKDIR /app/apps/api
CMD ["node", "dist/app/server.js"]
