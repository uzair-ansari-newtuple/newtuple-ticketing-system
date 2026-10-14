import { Pool } from "pg";

const globalForPool = globalThis as unknown as { __ticketingPool?: Pool };

/** Pooled Neon connection. Shared across hot reloads in dev so connections are not leaked. */
export function getPool(): Pool {
  if (!globalForPool.__ticketingPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set. Run `neon env pull`.");
    globalForPool.__ticketingPool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 30_000 });
  }
  return globalForPool.__ticketingPool;
}

export const toVector = (embedding: number[]) => `[${embedding.join(",")}]`;
