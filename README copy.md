for prisma with sqllite
pnpm install
pnpm exec prisma generate
pnpm prisma migrate dev --name finalize-migration
pnpm run dev  