import { NextRequest, NextResponse } from 'next/server';
import { createConversation } from '@/lib/neon';
import { getSessionFromRequest } from '@/lib/auth';

// POST /api/conversations — creates a new empty conversation and returns its ID
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
    const id = await createConversation(session.userId);
    return NextResponse.json({ conversationId: id });
  } catch (err) {
    console.error('[/api/conversations]', err);
    return NextResponse.json(
      { error: 'Could not create conversation.' },
      { status: 500 }
    );
  }
}
