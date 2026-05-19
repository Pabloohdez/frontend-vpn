# Producción: build SvelteKit + servidor Node (adapter-node)
FROM node:lts-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:lts-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=2346
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/scripts ./scripts
EXPOSE 2346
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
	CMD node scripts/smoke-health.mjs || exit 1
CMD ["node", "build"]
