FROM node:18-alpine
WORKDIR /app
RUN apk add --no-cache python3 build-base
ADD package.json pnpm-lock.yaml /app/
RUN npm install -g pnpm
RUN pnpm install
COPY . /app/
RUN cp src/config/api-example.js src/config/api.js && cp src/config/domain-example.js src/config/domain.js && cp src/config/database-docker.js src/config/database.js
CMD pnpm run build
CMD pnpm run start
