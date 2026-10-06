// Prisma 7 config surface (generated shape per installed prisma@7.10.0:
// `prisma7.config.ts` is the CLI's default config path).
// datasource url resolves from env only — never committed.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
