FROM node:13-alpine
WORKDIR /app
ADD package.json package-lock.json /app/
RUN npm install
COPY . /app/
RUN cp config/api-example.js config/api.js && cp config/domain-example.js config/domain.js && cp config/database-docker.js config/database.js
CMD npm start
