// Prisma 7 config. DATABASE_URL comes from runtime env (docker -e or env_file).
// For local dev, Prisma CLI auto-loads .env itself — không cần import "dotenv/config"
// (dotenv là devDependency, không có trong production runtime image).
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
