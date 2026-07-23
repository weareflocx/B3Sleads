import { NextRequest, NextResponse } from 'next/server';
import { getBriefingLeads } from '@/lib/data';
import { searchLeads } from '@/lib/search';

// Búsqueda global: startups y founders del radar. GET ?q=texto
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  if (q.trim().length < 2) return NextResponse.json({ hits: [] });
  try {
    const leads = await getBriefingLeads();
    return NextResponse.json({ hits: searchLeads(leads, q) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
