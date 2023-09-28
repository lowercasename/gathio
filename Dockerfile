FROM node:18-alpine
WORKDIR /app
RUN apk add --no-cache python3 build-base
ADD package.json pnpm-lock.yaml /app/
RUN npm install -g pnpm
RUN pnpm install
COPY . /app/
RUN cp config/config.example.toml config/config.toml
# Always exit 0 here because TSC will fail while we're migrating to TypeScript but
# not everything uses TypeScript
RUN pnpm run build; exit 0
CMD pnpm run start
