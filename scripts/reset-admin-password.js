#!/usr/bin/env node
// Reset admin password - run with: node scripts/reset-admin-password.js <new-password>

require("dotenv").config();
const { Client } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@sajaltech.com";
const NEW_PASSWORD = process.argv[2];

if (!NEW_PASSWORD) {
  console.error("Usage: node scripts/reset-admin-password.js <new-password>");
  process.exit(1);
}

async function hashPassword(password) {
  try {
    const argon2 = require("@node-rs/argon2");
    return await argon2.hash(password);
  } catch {
    const crypto = require("crypto");
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto
      .pbkdf2Sync(password, salt, 100000, 64, "sha512")
      .toString("hex");
    return `pbkdf2:${salt}:${hash}`;
  }
}

async function resetPassword() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const { rows } = await client.query(
      "SELECT id, email FROM users WHERE email = $1 LIMIT 1",
      [ADMIN_EMAIL]
    );

    if (rows.length === 0) {
      console.error(`[reset] No user found with email: ${ADMIN_EMAIL}`);
      process.exit(1);
    }

    const passwordHash = await hashPassword(NEW_PASSWORD);
    
    await client.query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE email = $2",
      [passwordHash, ADMIN_EMAIL]
    );

    console.log(`[reset] Password updated for: ${ADMIN_EMAIL}`);
    console.log(`[reset] New password: ${NEW_PASSWORD}`);
  } finally {
    await client.end();
  }
}

resetPassword().catch((err) => {
  console.error("[reset] Error:", err);
  process.exit(1);
});
