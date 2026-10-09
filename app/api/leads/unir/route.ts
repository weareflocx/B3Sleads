import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { unirLeadsDeMarca } from '@/lib/data';

// POST { companyId } — une los leads duplicados de una marca en uno.
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    const { companyId } = await req.json();
    if (!companyId) return NextResponse.json({ error: 'companyId requerido' }, { status: 400 });
    const unidos = await unirLeadsDeMarca(companyId);
    return NextResponse.json({ ok: true, unidos });
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
