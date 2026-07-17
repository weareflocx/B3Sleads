import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { priorityScore } from '@/lib/scoring';
import type { Company, Scan, Signal } from '@/lib/types';

// Alta manual de una ronda de financiación en la ficha. La señal recalcula
// la prioridad del lead (la recencia de ronda pesa un 40% del score).
// POST { companyId, leadId?, round, amount?, investors?, date?, sourceUrl? }
export async function POST(req: NextRequest) {
  try {
    const { companyId, leadId, round, amount, investors, date, sourceUrl } = await req.json();
    if (!companyId || !round) {
      return NextResponse.json({ error: 'companyId y round requeridos' }, { status: 400 });
    }
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    const db = getServiceSupabase()!;
    const detectedAt = date ? new Date(date).toISOString() : new Date().toISOString();

    const { data: signal, error } = await db
      .from('signals')
      .insert({
        company_id: companyId,
        type: 'funding_round',
        detail: {
          round,
          amount: amount || null,
          investors: investors
            ? String(investors)
                .split(',')
                .map((s: string) => s.trim())
                .filter(Boolean)
            : [],
          source_url: sourceUrl || null,
          manual: true,
        },
        detected_at: detectedAt,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Guardar el stage en la ficha y recalcular la prioridad del lead
    await db.from('companies').update({ funding_stage: round }).eq('id', companyId);

    if (leadId) {
      const [{ data: company }, { data: lead }] = await Promise.all([
        db.from('companies').select('*').eq('id', companyId).single(),
        db.from('leads').select('scan_id').eq('id', leadId).single(),
      ]);
      let scan: Scan | null = null;
      if (lead?.scan_id) {
        const { data } = await db.from('scans').select('*').eq('id', lead.scan_id).single();
        scan = data as Scan | null;
      }
      if (company) {
        await db
          .from('leads')
          .update({
            priority_score: priorityScore({
              company: company as Company,
              signal: signal as Signal,
              scan,
            }),
            updated_at: new Date().toISOString(),
          })
          .eq('id', leadId);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
