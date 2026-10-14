import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";
import type { UserRole } from "@/lib/types";

export interface DbUser {
  id: string;
  username: string;
  role: UserRole;
  store_id: string | null;
  store_name: string;
}

const TOKEN_VERSION = "t1";
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const KEY_LENGTH = 32;

/** Signing key. Set AUTH_SECRET in production. Without it a key is derived from the database URL, which is already secret. */
function secret(): string {
  return process.env.AUTH_SECRET ?? createHash("sha256").update(process.env.DATABASE_URL ?? "dev-only-secret").digest("hex");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, KEY_LENGTH).toString("hex")}`;
}

function passwordMatches(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function signToken(userId: string): string {
  const payload = `${TOKEN_VERSION}.${userId}.${Date.now() + TOKEN_TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) return null;
  const payload = parts.slice(0, 3).join(".");
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(parts[3]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return Number(parts[2]) > Date.now() ? parts[1] : null;
}

export async function verifyLogin(pool: Pool, username: string, password: string): Promise<DbUser | null> {
  const { rows } = await pool.query<DbUser & { password_hash: string }>(`SELECT id, username, role, store_id, store_name, password_hash FROM users WHERE username = $1`, [username]);
  const row = rows[0];
  if (!row || !passwordMatches(password, row.password_hash)) return null;
  const { password_hash: _unused, ...user } = row;
  void _unused;
  return user;
}

export async function findUserById(pool: Pool, id: string): Promise<DbUser | null> {
  const { rows } = await pool.query<DbUser>(`SELECT id, username, role, store_id, store_name FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}
