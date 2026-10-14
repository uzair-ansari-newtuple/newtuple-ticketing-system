import pg from "pg";

process.loadEnvFile(".env");

const [username, email] = process.argv.slice(2);
if (!username || !email) throw new Error("Usage: node scripts/link-user.mjs <username> <state-machine-email>");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
await client.connect();
try {
  const res = await client.query("UPDATE users SET email = $2 WHERE username = $1", [username, email.toLowerCase()]);
  if (!res.rowCount) throw new Error(`No app user named ${username}`);
  console.log(`${username} is now linked to ${email}`);
} finally {
  await client.end();
}
