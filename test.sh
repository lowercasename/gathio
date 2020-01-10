#!/usr/bin/env bash

set -eux -o pipefail

cleanup() {
  docker-compose kill
}
trap cleanup 0

docker-compose up --build &

while [[ "$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/)" -ne "200" ]]; do sleep 5; done
curl -v http://localhost:3000/new/event/public

cleanup