// Clears all chat/log data while leaving the users table completely untouched.
// Usage:
//   node scripts/reset-data.mjs

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

const { neon } = await import('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

try {
  await sql`TRUNCATE messages, conversations, request_log RESTART IDENTITY CASCADE`;
  console.log('✅  Cleared: messages, conversations, request_log');
  console.log('\nDone. DB is clean — users table untouched.');
} catch (err) {
  console.error('❌  Reset failed:', err.message);
  process.exit(1);
}
