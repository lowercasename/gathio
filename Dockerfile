FROM node:18-alpine
WORKDIR /app
RUN apk add --no-cache python3 build-base
ADD package.json pnpm-lock.yaml /app/
RUN npm install -g pnpm
RUN pnpm install
COPY . /app/
RUN cp config/config.example.toml config/config.toml
CMD pnpm run build
CMD pnpm run start
