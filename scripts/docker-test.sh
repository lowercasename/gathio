#!/usr/bin/env bash

# A Docker-based test script. It builds the Docker image, starts the container,
# and then waits for the server to be ready. Once the server is ready, it
# makes a request to the server and then kills the container. A 200 response
# code is expected.

set -eux -o pipefail

cleanup() {
  docker-compose kill
}
trap cleanup 0

docker-compose up --build &

while [[ "$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/)" -ne "200" ]]; do sleep 5; done
curl -v http://localhost:3000/new

cleanup