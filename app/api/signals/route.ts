import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { priorityScore } from '@/lib/scoring';
import { parseInvestors } from '@/lib/funding';
import type { Company, Scan, Signal, SignalDetail } from '@/lib/types';

// Tras tocar una ronda, la prioridad del lead deja de ser válida: la recencia
// pesa un 40%. Se recalcula con la ronda más reciente que quede viva.
async function recalcLead(
  db: ReturnType<typeof getServiceSupabase>,
  leadId: string | null | undefined,
  companyId: string,
) {
  if (!db || !leadId) return;
  const [{ data: company }, { data: lead }, { data: latest }] = await Promise.all([
    db.from('companies').select('*').eq('id', companyId).single(),
    db.from('leads').select('scan_id').eq('id', leadId).single(),
    db
      .from('signals')
      .select('*')
      .eq('company_id', companyId)
      .eq('type', 'funding_round')
      .order('detected_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!company) return;

  let scan: Scan | null = null;
  if (lead?.scan_id) {
    const { data } = await db.from('scans').select('*').eq('id', lead.scan_id).single();
    scan = data as Scan | null;
  }
  await db
    .from('leads')
    .update({
      priority_score: priorityScore({
        company: company as Company,
        signal: (latest as Signal | null) ?? null,
        scan,
      }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId);

  // El stage de la ficha sigue a la ronda viva más reciente.
  const round = (latest as Signal | null)?.detail?.round;
  await db
    .from('companies')
    .update({ funding_stage: typeof round === 'string' ? round : null })
    .eq('id', companyId);
}

// Alta manual de una ronda de financiación en la ficha. La señal recalcula
// la prioridad del lead (la recencia de ronda pesa un 40% del score).
// POST { companyId, leadId?, round, amount?, investors?, date?, sourceUrl? }
export async function POST(req: NextRequest) {
  try {
    const { companyId, leadId, round, amount, amountEur, investors, date, sourceUrl } =
      await req.json();
    if (!companyId || !round) {
      return NextResponse.json({ error: 'companyId y round requeridos' }, { status: 400 });
    }
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    const db = getServiceSupabase()!;
    const detectedAt = date ? new Date(date).toISOString() : new Date().toISOString();

    const { error } = await db.from('signals').insert({
      company_id: companyId,
      type: 'funding_round',
      detail: {
        round,
        amount: amount || null,
        amount_eur: typeof amountEur === 'number' ? amountEur : null,
        investors: parseInvestors(investors),
        source_url: sourceUrl || null,
        manual: true,
      },
      detected_at: detectedAt,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await recalcLead(db, leadId, companyId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// Corregir una ronda ya registrada. Solo se tocan los campos enviados: el
// resto del detail (source_url, procedencia del pipeline) se conserva.
// PATCH { signalId, leadId?, round?, amount?, amountEur?, investors?, date? }
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { signalId, leadId } = body;
    if (!signalId) return NextResponse.json({ error: 'signalId requerido' }, { status: 400 });
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    const db = getServiceSupabase()!;
    const { data: current } = await db
      .from('signals')
      .select('*')
      .eq('id', signalId)
      .eq('type', 'funding_round')
      .single();
    if (!current) return NextResponse.json({ error: 'Ronda no encontrada' }, { status: 404 });

    const detail: SignalDetail = { ...((current.detail as SignalDetail) ?? {}) };
    if (body.round !== undefined) detail.round = body.round;
    if (body.amount !== undefined) detail.amount = body.amount || undefined;
    if (body.amountEur !== undefined) {
      detail.amount_eur = typeof body.amountEur === 'number' ? body.amountEur : undefined;
    }
    if (body.investors !== undefined) detail.investors = parseInvestors(body.investors);

    const update: Record<string, unknown> = { detail };
    if (body.date) update.detected_at = new Date(body.date).toISOString();

    const { error } = await db.from('signals').update(update).eq('id', signalId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await recalcLead(db, leadId, current.company_id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// Borrar una ronda mal registrada (duplicada o de otra empresa).
// DELETE { signalId, leadId? }
export async function DELETE(req: NextRequest) {
  try {
    const { signalId, leadId } = await req.json();
    if (!signalId) return NextResponse.json({ error: 'signalId requerido' }, { status: 400 });
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    const db = getServiceSupabase()!;
    const { data: current } = await db
      .from('signals')
      .select('company_id')
      .eq('id', signalId)
      .eq('type', 'funding_round')
      .single();
    if (!current) return NextResponse.json({ error: 'Ronda no encontrada' }, { status: 404 });

    const { error } = await db.from('signals').delete().eq('id', signalId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await recalcLead(db, leadId, current.company_id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
