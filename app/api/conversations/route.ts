import { NextResponse } from 'next/server';
import { createConversation } from '@/lib/neon';

// POST /api/conversations — creates a new empty conversation and returns its ID
export async function POST() {
  try {
    const id = await createConversation();
    return NextResponse.json({ conversationId: id });
  } catch (err) {
    console.error('[/api/conversations]', err);
    return NextResponse.json(
      { error: 'Could not create conversation.' },
      { status: 500 }
    );
  }
}
