// Run once to create the Neon DB schema:
//   node scripts/init-db.mjs

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local manually
const envPath = join(__dirname, '..', '.env.local');
const envLines = readFileSync(envPath, 'utf8').split('\n');
for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim();
  process.env[key] = val;
}

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('user:password')) {
  console.error('❌  DATABASE_URL is not set or still contains the placeholder value.');
  console.error('    Add your Neon connection string to .env.local and try again.');
  process.exit(1);
}

const { neon } = await import('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

try {
  console.log('Creating schema...');

  await sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`;

  // ── Users ──────────────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      username      VARCHAR(100) NOT NULL UNIQUE,
      display_name  VARCHAR(100),
      password_hash VARCHAR(255) NOT NULL,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      last_login    TIMESTAMPTZ
    )
  `;

  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(100)`;

  // ── Conversations ──────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS conversations (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID        REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Migration for existing deployments
  await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE`;

  // ── Messages ───────────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS messages (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role            VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
      content         TEXT        NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
      ON messages (conversation_id, created_at ASC)
  `;

  // ── Request log ────────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS request_log (
      id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID         REFERENCES users(id),
      ip            VARCHAR(45)  NOT NULL,
      input_tokens  INT          NOT NULL DEFAULT 0,
      output_tokens INT          NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `;

  // Migrations for tables created before schema updates
  await sql`ALTER TABLE request_log ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id)`;
  await sql`ALTER TABLE request_log DROP COLUMN IF EXISTS username`;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_request_log_user_created
      ON request_log (user_id, created_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_request_log_ip_created
      ON request_log (ip, created_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_request_log_created
      ON request_log (created_at DESC)
  `;

  console.log('✅  Neon DB schema created successfully.');
  console.log('    Tables: users, conversations, messages, request_log');
} catch (err) {
  console.error('❌  Failed to create schema:', err.message);
  process.exit(1);
}
