import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { currentUserEmail } from '@/lib/auth';
import { DIMENSION_LABELS } from '@/lib/scan-versions';

// Curación por componente: guarda QUÉ versión de una dimensión refleja la
// realidad. Nunca edita el scan: apunta a él. La selección queda firmada
// (quién y cuándo) y con nota opcional del porqué, que es lo que permite
// medir después el sesgo de curación.
//
// POST   { companyId, dimension, scanId, note? } → selección manual
// DELETE { companyId, dimension }               → volver al automático

const MIGRATION_HINT =
  'Falta aplicar la migración 010 (component_selections). Pega supabase/migrations/010_component_selections.sql en el SQL Editor de Supabase y vuelve a intentarlo.';

function missingTable(message: string): boolean {
  return /component_selections|schema cache/i.test(message);
}

export async function POST(req: NextRequest) {
  try {
    const { companyId, dimension, scanId, note } = await req.json();
    if (!companyId || !dimension || !scanId) {
      return NextResponse.json(
        { error: 'companyId, dimension y scanId requeridos' },
        { status: 400 },
      );
    }
    if (!(dimension in DIMENSION_LABELS)) {
      return NextResponse.json({ error: `Dimensión desconocida: ${dimension}` }, { status: 400 });
    }
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    const db = getServiceSupabase()!;

    // La versión elegida tiene que existir y ser de esta empresa: una
    // selección colgando de un scan ajeno o borrado no es trazabilidad.
    const { data: scan } = await db
      .from('scans')
      .select('id, company_id, status, score')
      .eq('id', scanId)
      .maybeSingle();
    if (!scan || scan.company_id !== companyId) {
      return NextResponse.json({ error: 'Ese scan no es de esta empresa' }, { status: 400 });
    }
    if (scan.status !== 'ready' || scan.score == null || Number(scan.score) === 0) {
      return NextResponse.json(
        { error: 'Un run fallido no puede ser la versión elegida' },
        { status: 400 },
      );
    }

    const { error } = await db.from('component_selections').upsert(
      {
        company_id: companyId,
        dimension,
        scan_id: scanId,
        is_manual: true,
        selected_by_email: await currentUserEmail(),
        selected_at: new Date().toISOString(),
        note: typeof note === 'string' && note.trim() ? note.trim() : null,
      },
      { onConflict: 'company_id,dimension' },
    );
    if (error) {
      if (missingTable(error.message)) {
        return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { companyId, dimension } = await req.json();
    if (!companyId || !dimension) {
      return NextResponse.json({ error: 'companyId y dimension requeridos' }, { status: 400 });
    }
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    const db = getServiceSupabase()!;
    const { error } = await db
      .from('component_selections')
      .delete()
      .eq('company_id', companyId)
      .eq('dimension', dimension);
    if (error) {
      if (missingTable(error.message)) {
        return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
