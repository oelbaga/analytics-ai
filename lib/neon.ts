import { getSQL } from './neon-sql';

// ─── Conversations ────────────────────────────────────────────────────────────

export async function createConversation(): Promise<string> {
  const sql = getSQL();
  const rows = await sql`
    INSERT INTO conversations DEFAULT VALUES
    RETURNING id
  `;
  return rows[0].id as string;
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  const sql = getSQL();
  await sql`
    INSERT INTO messages (conversation_id, role, content)
    VALUES (${conversationId}, ${role}, ${content})
  `;
}

export async function getMessages(
  conversationId: string
): Promise<{ role: string; content: string }[]> {
  const sql = getSQL();
  const rows = await sql`
    SELECT role, content
    FROM messages
    WHERE conversation_id = ${conversationId}
    ORDER BY created_at ASC
  `;
  return rows as { role: string; content: string }[];
}
