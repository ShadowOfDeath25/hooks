# ---- base: shared setup for every stage ----
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./


# ---- dev: full deps + hot reload ----
FROM base AS dev
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npx", "nodemon", "-L", "index.js"]


# ---- prod-deps: install only production dependencies ----
FROM base AS prod-deps
RUN npm ci --omit=dev


# ---- production: lean runtime image ----
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package*.json ./
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]