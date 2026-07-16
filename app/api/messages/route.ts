import { NextRequest, NextResponse } from 'next/server';
import { saveEditedMessage } from '@/lib/data';

// PATCH { messageId, editedFinal } — guarda lo que Sergio realmente envió (feedback loop)
export async function PATCH(req: NextRequest) {
  try {
    const { messageId, editedFinal } = await req.json();
    if (!messageId || typeof editedFinal !== 'string') {
      return NextResponse.json({ error: 'messageId y editedFinal requeridos' }, { status: 400 });
    }
    await saveEditedMessage(messageId, editedFinal);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
