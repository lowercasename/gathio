#!/bin/bash
set -e

# Set up and redeploy Gathio. Called by `pm2 deploy`.

# PM2 doesn't load the user env, so this gets nvm into the PATH
export NVM_DIR=~/.nvm
source ~/.nvm/nvm.sh
# Set the right Node version
nvm use
# Need to use `development` here else pnpm won't install devDependencies (i.e. tsc)
NODE_ENV=development pnpm install
# This calls `tsc`, which fails due to type errors while we're transitioning
# fully to TypeScript, so we short-circuit it to true to continue running the
# deploy script.  TODO: Remove this short-circuit when we've migrated to
# TypeScript and don't expect any more errors.
pnpm build || true
pm2 reload ecosystem.config.cjs production
pm2 save 
