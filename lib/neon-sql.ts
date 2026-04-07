import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

// Shared lazy singleton — imported by both neon.ts and rate-limit.ts
let _sql: NeonQueryFunction<false, false> | null = null;

export function getSQL(): NeonQueryFunction<false, false> {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set.');
    }
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}
