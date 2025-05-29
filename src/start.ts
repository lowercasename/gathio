// src/start.ts
import { PrismaClient } from "@prisma/client";
import { getConfig } from "./lib/config.js";
import app from "./app.js";

const config = getConfig();
const prisma = new PrismaClient();

async function start() {
  try {
    await prisma.$connect();
    console.log("Prisma connected to database!");
  } catch (err) {
    console.error("Unable to connect to database:", err);
    process.exit(1);
  }

  const port = parseInt(config.general.port, 10) || 3000;
  app.listen(port, () => {
    console.log(
      `Welcome to gathio! The app is now running on http://localhost:${port}`
    );
  });
}

// Gracefully disconnect Prisma on termination signals
process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

start();
