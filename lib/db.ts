import { Prisma, PrismaClient } from "@prisma/client";
import { decryptResult, encryptArgs } from "./field-crypto";

// Encrypts sensitive health fields on the way in and decrypts them on the
// way out, so the rest of the app works with plain values. See
// lib/field-crypto.ts for which fields and why.
const fieldEncryption = Prisma.defineExtension({
  name: "field-encryption",
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        return decryptResult(await query(encryptArgs(args)));
      },
    },
  },
});

function createClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  }).$extends(fieldEncryption);
}

type DbClient = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as unknown as { prisma?: DbClient };

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
