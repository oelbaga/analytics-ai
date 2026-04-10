import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import pool from '@/lib/mysql';
import { getSessionFromRequest } from '@/lib/auth';
import { checkQueryValue } from '@/lib/guards';
import { MAX_EXPORT_ROWS } from '@/lib/limits';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toTitleCase(str: string | null | undefined): string {
  if (!str) return '';
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(dt: string | null | undefined): string {
  if (!dt) return '';
  const d = new Date(dt);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

// ─── GET /api/leads/export ────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Auth
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const clientName = searchParams.get('client') ?? '';
  const startDate  = searchParams.get('start_date') ?? '';
  const endDate    = searchParams.get('end_date') ?? '';

  // All three params are required
  if (!clientName || !startDate || !endDate) {
    return NextResponse.json(
      { error: 'client, start_date, and end_date are all required.' },
      { status: 400 }
    );
  }

  // Guard against injection
  const guard = checkQueryValue(clientName, 'client name');
  if (guard.blocked) {
    return NextResponse.json({ error: guard.reason }, { status: 400 });
  }

  // Resolve client
  const term = `%${clientName}%`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [clientRows] = await pool.execute<any[]>(
    `SELECT id, list_name FROM lists WHERE list_name LIKE ? OR domain LIKE ? ORDER BY id ASC`,
    [term, term]
  );

  if (clientRows.length === 0) {
    return NextResponse.json(
      { error: `No client found matching "${clientName}".` },
      { status: 404 }
    );
  }

  const startTs = `${startDate} 00:00:00`;
  const endTs   = `${endDate} 23:59:59`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRows: any[] = [];

  for (const client of clientRows) {
    const table = `list_${client.id}`;

    try {
      // Check which optional export columns exist in this table
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [colRows] = await pool.execute<any[]>(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [table]
      );
      const existing = new Set(colRows.map((r: any) => r.COLUMN_NAME as string));

      const optionalSelect = [
        existing.has('keywords') ? 'keywords' : null,
        existing.has('comments') ? 'LEFT(comments, 51) as comments' : null,
      ].filter(Boolean).join(', ');

      const selectCols = [
        'name', 'email', 'phone', 'dt as submitted_at',
        `LOWER(REPLACE(REPLACE(source, '_', ' '), '-', ' ')) as source`,
        `LOWER(REPLACE(REPLACE(medium, '_', ' '), '-', ' ')) as medium`,
        ...(optionalSelect ? [optionalSelect] : []),
      ].join(', ');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [rows] = await pool.execute<any[]>(
        `SELECT ${selectCols} FROM \`${table}\`
         WHERE id IN (
           SELECT MAX(id) FROM \`${table}\`
           WHERE dt >= ? AND dt <= ?
             AND (email NOT LIKE '%@newworldgroup.com' OR email IS NULL)
           GROUP BY IFNULL(LOWER(TRIM(email)), CAST(id AS CHAR))
         )
         ORDER BY dt DESC
         LIMIT ${MAX_EXPORT_ROWS}`,
        [startTs, endTs]
      );

      allRows.push(...rows);
    } catch {
      // Table may not exist — skip
    }
  }

  // Sort by most recent first
  allRows.sort((a, b) => {
    const aDate = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
    const bDate = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
    return bDate - aDate;
  });

  // Cross-list dedup by email
  const seen = new Set<string>();
  const deduped = allRows.filter(row => {
    const key = row.email ? row.email.toLowerCase().trim() : null;
    if (key === null) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const capped = deduped.slice(0, MAX_EXPORT_ROWS);
  const wasCapped = deduped.length > MAX_EXPORT_ROWS;

  // Only include optional columns if at least one record has a value
  const hasKeywords = capped.some(r => r.keywords != null && r.keywords !== '');
  const hasComments = capped.some(r => r.comments != null && r.comments !== '');

  // ─── Build Excel ────────────────────────────────────────────────────────────

  const headers = ['Name', 'Email', 'Phone', 'Date', 'Source', 'Medium'];
  if (hasKeywords) headers.push('Keywords');
  if (hasComments) headers.push('Comments');

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Leads');

  // Column definitions with widths
  const columns: ExcelJS.Column[] = [
    { header: 'Name',   key: 'name',   width: 25 },
    { header: 'Email',  key: 'email',  width: 35 },
    { header: 'Phone',  key: 'phone',  width: 18 },
    { header: 'Date',   key: 'date',   width: 14 },
    { header: 'Source', key: 'source', width: 22 },
    { header: 'Medium', key: 'medium', width: 22 },
  ] as ExcelJS.Column[];
  if (hasKeywords) columns.push({ header: 'Keywords', key: 'keywords', width: 25 } as ExcelJS.Column);
  if (hasComments) columns.push({ header: 'Comments', key: 'comments', width: 40 } as ExcelJS.Column);
  ws.columns = columns;

  // Bold header row
  ws.getRow(1).font = { bold: true };

  // If capped, add a note row before data
  if (wasCapped) {
    const noteRow = ws.addRow([`Note: Results capped at ${MAX_EXPORT_ROWS} records. Narrow your date range to see more.`]);
    noteRow.font = { italic: true, color: { argb: 'FF888888' } };
  }

  // Data rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  capped.forEach((r: any) => {
    const row: Record<string, string> = {
      name:   r.name        ?? '',
      email:  r.email       ?? '',
      phone:  r.phone       ?? '',
      date:   formatDate(r.submitted_at),
      source: toTitleCase(r.source),
      medium: toTitleCase(r.medium),
    };
    if (hasKeywords) row.keywords = r.keywords ?? '';
    if (hasComments) {
      const raw = r.comments ?? '';
      row.comments = raw.length > 50 ? raw.slice(0, 50) + '…' : raw;
    }
    ws.addRow(row);
  });

  const buffer = await wb.xlsx.writeBuffer();

  // Filename: client-name-leads-YYYY-MM-DD-YYYY-MM-DD.xlsx
  const clientSlug = clientRows[0].list_name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  const filename = `${clientSlug}-leads-${startDate}-${endDate}.xlsx`;

  return new NextResponse(buffer as Buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
