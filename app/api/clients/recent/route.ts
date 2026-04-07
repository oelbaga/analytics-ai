import { NextResponse } from 'next/server';
import pool from '@/lib/mysql';
import type { RowDataPacket } from 'mysql2';

interface ListNameRow extends RowDataPacket {
  list_name: string;
}

export async function GET() {
  try {
    const [rows] = await pool.execute<ListNameRow[]>(
      `SELECT list_name
       FROM lists
       GROUP BY list_name
       ORDER BY MAX(id) DESC
       LIMIT 6`
    );

    const names = rows.map((r) => r.list_name);
    return NextResponse.json({ clients: names });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[/api/clients/recent]', message);
    return NextResponse.json({ clients: [] }, { status: 500 });
  }
}
