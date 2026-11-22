import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { searchCrm } from '@/lib/search';

// Búsqueda global del CRM: marcas, contactos, inversores y notas. GET ?q=texto
export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const q = req.nextUrl.searchParams.get('q') ?? '';
  if (q.trim().length < 2) return NextResponse.json({ hits: [] });
  try {
    return NextResponse.json({ hits: await searchCrm(q) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
