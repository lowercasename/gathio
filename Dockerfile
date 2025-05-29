# Stage 1: install dependencies, generate Prisma client, and build
FROM node:18-alpine AS build

WORKDIR /app

# Install build tools for native modules & Prisma engines
RUN apk add --no-cache python3 build-base

# Copy lockfiles and install all dependencies
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm
RUN pnpm install

# Copy the rest of the source, generate Prisma client, and build
COPY . .
RUN pnpm prisma generate
RUN pnpm run build

# Stage 2: production image
FROM node:20-alpine

WORKDIR /app

# Only production environment
ENV NODE_ENV=production

# Copy built assets and node_modules from build stage
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

# Expose the port the app runs on
EXPOSE 3000

# Start the app
CMD ["node", "dist/start.js"]
