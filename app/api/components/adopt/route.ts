import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { currentUserEmail } from '@/lib/auth';
import { storedScanReport } from '@/lib/scan-report';
import { canonDimension, DIMENSION_LABELS, hasReadings } from '@/lib/scan-versions';
import type { Scan } from '@/lib/types';

// Dar por buena una pasada entera. Es la curación de siempre, componente a
// componente, hecha diez veces de golpe: cada dimensión que ese run detectó
// pasa a apuntar a él. Nace para el run retenido (el Scanner leyó la marca y
// no publicó el número) pero sirve para cualquier pasada con lectura.
//
// POST   { companyId, scanId } → todas las dimensiones detectadas, a ese run
// DELETE { companyId, scanId } → quita las selecciones que apuntan a ese run
export async function POST(req: NextRequest) {
  try {
    const { companyId, scanId } = await req.json();
    if (!companyId || !scanId) {
      return NextResponse.json({ error: 'companyId y scanId requeridos' }, { status: 400 });
    }
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true, applied: 0 });

    const db = getServiceSupabase()!;
    const { data: scan } = await db
      .from('scans')
      .select('*')
      .eq('id', scanId)
      .maybeSingle();
    if (!scan || scan.company_id !== companyId) {
      return NextResponse.json({ error: 'Ese scan no es de esta empresa' }, { status: 400 });
    }
    if (!hasReadings(scan as Scan)) {
      return NextResponse.json({ error: 'Esa pasada no trae lectura que adoptar' }, { status: 400 });
    }

    const report = storedScanReport((scan as Scan).result_raw);
    // Solo lo detectado: adoptar un "sin rastro" no aporta lectura, y dejaría
    // la selección apuntando a un hueco.
    const dimensiones = (report?.dimensions ?? [])
      .filter((d) => !d.missing && d.score != null)
      .map((d) => canonDimension(d.name))
      .filter((k) => k in DIMENSION_LABELS);
    if (!dimensiones.length) {
      return NextResponse.json({ error: 'Esa pasada no detectó ningún componente' }, { status: 400 });
    }

    const email = await currentUserEmail();
    const ahora = new Date().toISOString();
    const { error } = await db.from('component_selections').upsert(
      dimensiones.map((dimension) => ({
        company_id: companyId,
        dimension,
        scan_id: scanId,
        is_manual: true,
        selected_by_email: email,
        selected_at: ahora,
        note: 'pasada adoptada entera',
      })),
      { onConflict: 'company_id,dimension' },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, applied: dimensiones.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { companyId, scanId } = await req.json();
    if (!companyId || !scanId) {
      return NextResponse.json({ error: 'companyId y scanId requeridos' }, { status: 400 });
    }
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    const db = getServiceSupabase()!;
    const { error } = await db
      .from('component_selections')
      .delete()
      .eq('company_id', companyId)
      .eq('scan_id', scanId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
