/**
 * Applies public.enrolments + public.flyers DDL using Postgres (not PostgREST).
 * Set DATABASE_URL in backend/.env from Supabase → Settings → Database → URI (use port 5432 / direct if DDL fails on pooler).
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!connectionString) {
  console.error(
    "Missing DATABASE_URL (or SUPABASE_DB_URL) in backend/.env.\n" +
      "Copy the connection string from Supabase → Project Settings → Database.\n" +
      "Alternatively, paste backend/supabase/tables_enrolments_flyers.sql into the SQL Editor and run it."
  );
  process.exit(1);
}

const sqlPath = path.join(__dirname, "..", "supabase", "tables_enrolments_flyers.sql");

async function main() {
  const client = new Client({
    connectionString: connectionString,
    ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  const sql = fs.readFileSync(sqlPath, "utf8");
  await client.query(sql);
  await client.end();
  console.log("Applied schema from:", sqlPath);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
