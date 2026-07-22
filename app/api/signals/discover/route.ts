import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { discoverRounds, extractFromPasted, searchConfigured } from '@/lib/funding-discovery';
import { reportMarkdown } from '@/lib/scan-report';
import type { Company, Scan } from '@/lib/types';

// Propone rondas para una empresa. NO escribe nada: devuelve candidatos con
// su frase y su fuente para que Sergio verifique y apruebe desde la ficha.
// POST { companyId, pastedText? }
//   - con pastedText: extrae de un texto que Sergio ha pegado (una nota de
//     prensa, un resultado de búsqueda). Es la vía que funciona sin claves.
//   - sin él: rastrea las fuentes propias (prensa que seguimos, informe B3S)
//     y, si hay SEARCH_API_KEY, también búsqueda web.
export async function POST(req: NextRequest) {
  try {
    const { companyId, pastedText } = await req.json();
    if (!companyId) return NextResponse.json({ error: 'companyId requerido' }, { status: 400 });
    if (isDemoMode()) return NextResponse.json({ proposals: [], demo: true });

    // Pegar texto no necesita ni empresa resuelta ni salir a la red.
    if (typeof pastedText === 'string' && pastedText.trim()) {
      const proposals = extractFromPasted(pastedText);
      return NextResponse.json({
        proposals,
        message: proposals.length
          ? null
          : 'No he sabido leer una ronda en ese texto. Pega el párrafo que menciona el importe o los inversores.',
      });
    }

    const db = getServiceSupabase()!;
    const { data: company } = await db
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .maybeSingle();
    if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });

    const co = company as Company;
    if (!co.domain || !co.domain.includes('.')) {
      return NextResponse.json({
        proposals: [],
        message: 'Esta ficha aún no tiene dominio. Añádelo y podré buscar su ronda.',
      });
    }

    // El informe del Scanner ya está en casa: se aprovecha antes de salir fuera.
    const { data: scan } = await db
      .from('scans')
      .select('result_raw')
      .eq('company_id', companyId)
      .eq('status', 'ready')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const proposals = await discoverRounds({
      domain: co.domain,
      name: co.name || co.domain,
      scanMarkdown: reportMarkdown((scan as Pick<Scan, 'result_raw'> | null)?.result_raw),
    });

    return NextResponse.json({
      proposals,
      searchConfigured: searchConfigured(),
      message: proposals.length
        ? null
        : searchConfigured()
          ? 'No he encontrado ninguna ronda. Puede que no hayan levantado o que no sea público.'
          : 'Sin rastro en la prensa que sigo. La búsqueda web está desactivada: pega abajo la noticia y la leo por ti.',
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
