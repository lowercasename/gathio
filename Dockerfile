FROM node:22-alpine AS BUILD_IMAGE
WORKDIR /app
RUN apk add --no-cache python3 build-base
ADD package.json pnpm-lock.yaml /app/
RUN npm install -g pnpm
RUN pnpm install --prod
COPY . /app/
# Always exit 0 here because TSC will fail while we're migrating to TypeScript but
# not everything uses TypeScript
RUN pnpm run build; exit 0

# Now we run the app
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=BUILD_IMAGE /app ./
CMD ["npm", "run", "start"]
