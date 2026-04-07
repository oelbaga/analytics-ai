// Creates the default user in Neon.
// Run after init-db.mjs:
//   node scripts/seed-user.mjs
//
// Reads DEFAULT_USERNAME and DEFAULT_PASSWORD from .env.local

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

const username    = process.env.DEFAULT_USERNAME?.trim().toLowerCase();
const password    = process.env.DEFAULT_PASSWORD?.trim();
const displayName = process.env.DEFAULT_DISPLAY_NAME?.trim() || null;

if (!username || !password) {
  console.error('❌  DEFAULT_USERNAME and DEFAULT_PASSWORD must be set in .env.local');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('❌  DATABASE_URL must be set in .env.local');
  process.exit(1);
}

const { neon }   = await import('@neondatabase/serverless');
const { default: bcrypt } = await import('bcryptjs');

const sql  = neon(process.env.DATABASE_URL);
const hash = await bcrypt.hash(password, 12);

try {
  const rows = await sql`
    INSERT INTO users (username, display_name, password_hash)
    VALUES (${username}, ${displayName}, ${hash})
    ON CONFLICT (username) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          display_name  = EXCLUDED.display_name
    RETURNING id, username, display_name
  `;

  console.log('✅  User created / updated successfully.');
  console.log(`    ID:           ${rows[0].id}`);
  console.log(`    Username:     ${rows[0].username}`);
  console.log(`    Display name: ${rows[0].display_name ?? '(not set)'}`);
} catch (err) {
  console.error('❌  Failed to seed user:', err.message);
  process.exit(1);
}
