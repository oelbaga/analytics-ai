// Clears all chat/log data while preserving specific user accounts.
// Usage:
//   node scripts/reset-data.mjs
//
// Users listed in KEEP_USERNAMES will not be deleted.

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
  process.env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
}

if (!process.env.DATABASE_URL) {
  console.error('❌  DATABASE_URL must be set in .env.local');
  process.exit(1);
}

// ── Usernames to preserve (case-insensitive) ──────────────────────────────────
const KEEP_USERNAMES = ['oelbaga@newworldgroup.com'];

const { neon } = await import('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

try {
  // Show which users will be kept
  const kept = await sql`
    SELECT username, display_name FROM users
    WHERE lower(username) = ANY(${KEEP_USERNAMES.map(u => u.toLowerCase())})
  `;
  console.log(`Keeping ${kept.length} user(s):`);
  kept.forEach(u => console.log(`  • ${u.username}${u.display_name ? ` (${u.display_name})` : ''}`));

  // Truncate dependent tables first (CASCADE handles child rows)
  await sql`TRUNCATE messages, conversations, request_log RESTART IDENTITY CASCADE`;
  console.log('✅  Cleared: messages, conversations, request_log');

  // Delete all users except the preserved ones
  const deleted = await sql`
    DELETE FROM users
    WHERE lower(username) != ALL(${KEEP_USERNAMES.map(u => u.toLowerCase())})
    RETURNING username
  `;
  if (deleted.length > 0) {
    console.log(`✅  Removed ${deleted.length} user(s): ${deleted.map(u => u.username).join(', ')}`);
  } else {
    console.log('   No extra users to remove.');
  }

  console.log('\nDone. DB is clean — preserved users are intact.');
} catch (err) {
  console.error('❌  Reset failed:', err.message);
  process.exit(1);
}
