#!/bin/bash

SHORTHASH="$(git rev-parse --short HEAD)"
docker tag $IMAGE_NAME $DOCKER_REPO:$SHORTHASH
docker push $DOCKER_REPO:$SHORTHASH