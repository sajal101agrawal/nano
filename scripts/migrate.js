#!/usr/bin/env node
// Database migration runner — runs all SQL files in migrations/ in order

require("dotenv").config();
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[migrate] DATABASE_URL not set");
  process.exit(1);
}

async function runMigrations() {
  const client = new Client({ connectionString: DATABASE_URL });

  let retries = 10;
  while (retries > 0) {
    try {
      await client.connect();
      break;
    } catch (err) {
      retries--;
      if (retries === 0) {
        console.error("[migrate] Could not connect to database:", err.message);
        process.exit(1);
      }
      console.log(`[migrate] Waiting for database... (${retries} retries left)`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  try {
    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, "..", "migrations");
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const { rows } = await client.query(
        "SELECT id FROM _migrations WHERE name = $1",
        [file]
      );
      if (rows.length > 0) {
        console.log(`[migrate] Already applied: ${file}`);
        continue;
      }

      console.log(`[migrate] Applying: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`[migrate] Applied: ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`[migrate] Failed on ${file}:`, err.message);
        throw err;
      }
    }

    console.log("[migrate] All migrations applied successfully.");
  } finally {
    await client.end();
  }
}

runMigrations().catch((err) => {
  console.error("[migrate] Fatal error:", err);
  process.exit(1);
});
