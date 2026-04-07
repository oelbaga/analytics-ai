import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { signToken, setSessionCookie } from '@/lib/auth';
import { getSQL } from '@/lib/neon-sql';

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username?.trim() || !password?.trim()) {
      return NextResponse.json(
        { error: 'Username and password are required.' },
        { status: 400 }
      );
    }

    const sql = getSQL();
    const rows = await sql`
      SELECT id, username, display_name, password_hash
      FROM users
      WHERE username = ${username.trim().toLowerCase()}
      LIMIT 1
    `;

    const user = rows[0];

    // Use a constant-time comparison even if user not found to prevent
    // timing attacks that could reveal valid usernames.
    // The dummy hash must be a valid 60-char bcrypt hash so bcrypt.compare
    // never throws when no user row exists.
    const dummyHash = '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234';
    const hashToCheck = user?.password_hash ?? dummyHash;

    let valid = false;
    try {
      valid = await bcrypt.compare(password, hashToCheck);
    } catch {
      // If the stored hash is somehow malformed, treat as invalid credentials
      valid = false;
    }

    if (!user || !valid) {
      return NextResponse.json(
        { error: 'Invalid username or password.' },
        { status: 401 }
      );
    }

    // Update last_login timestamp
    await sql`
      UPDATE users SET last_login = NOW() WHERE id = ${user.id}
    `;

    // Sign JWT and set httpOnly cookie
    const token = await signToken({ userId: user.id, username: user.username, displayName: user.display_name ?? null });
    await setSessionCookie(token);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[/api/auth/login]', message);
    return NextResponse.json(
      {
        error: 'Login failed. Please try again.',
        detail: process.env.NODE_ENV !== 'production' ? message : undefined,
      },
      { status: 500 }
    );
  }
}
