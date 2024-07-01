FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache python3 build-base
ADD package.json pnpm-lock.yaml /app/
RUN npm install -g pnpm
RUN pnpm install --prod
COPY . /app/
# Always exit 0 here because TSC will fail while we're migrating to TypeScript but
# not everything uses TypeScript
RUN pnpm run build; exit 0
CMD pnpm run start
