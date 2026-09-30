// PrismaClient singleton shared by routes + bot + seed (Pitfall 3:
// module re-evaluation under dev HMR would otherwise exhaust connections).
//
// Prisma 7 surface notes (verified against installed prisma@7.10.0):
// - `prisma-client` generator emits importable TS at generated/prisma/;
//   the documented main import is `generated/prisma/client`.
// - The client requires a driver adapter — `DATABASE_URL` in
//   prisma7.config.ts serves the CLI (migrations) only. Runtime uses
//   PrismaPg here, fed by the fail-fast zod env (single validation point).
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "./env";
import { PrismaClient } from "../generated/prisma/client";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
