#!/usr/bin/env node
// Seed admin user if not present

require("dotenv").config();
const { Client } = require("pg");
const crypto = require("crypto");

const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@sajaltech.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@Nano2024!";
const ADMIN_NAME = process.env.ADMIN_NAME || "Admin";

async function hashPassword(password) {
  // Use argon2 if available, fallback to pbkdf2
  try {
    const argon2 = require("@node-rs/argon2");
    return await argon2.hash(password);
  } catch {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto
      .pbkdf2Sync(password, salt, 100000, 64, "sha512")
      .toString("hex");
    return `pbkdf2:${salt}:${hash}`;
  }
}

async function seed() {
  const client = new Client({ connectionString: DATABASE_URL });

  let retries = 5;
  while (retries > 0) {
    try {
      await client.connect();
      break;
    } catch (err) {
      retries--;
      if (retries === 0) {
        console.error("[seed] Could not connect:", err.message);
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  try {
    const { rows } = await client.query(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      [ADMIN_EMAIL]
    );

    if (rows.length > 0) {
      console.log(`[seed] Admin already exists: ${ADMIN_EMAIL}`);
      return;
    }

    const passwordHash = await hashPassword(ADMIN_PASSWORD);
    const { v4: uuidv4 } = require("uuid");

    await client.query(
      `INSERT INTO users (id, email, name, role, password_hash, email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, 'admin', $4, true, NOW(), NOW())`,
      [uuidv4(), ADMIN_EMAIL, ADMIN_NAME, passwordHash]
    );

    console.log(`[seed] Admin created: ${ADMIN_EMAIL}`);
    console.log(`[seed] Password: ${ADMIN_PASSWORD}`);
    console.log(`[seed] IMPORTANT: Change the admin password after first login!`);
  } finally {
    await client.end();
  }
}

seed().catch((err) => {
  console.error("[seed] Error:", err);
  process.exit(1);
});
