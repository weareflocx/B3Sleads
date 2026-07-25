import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { discoverBio } from '@/lib/bio-discovery';
import { extractSectors } from '@/lib/claude';
import { storedScanReport, reportDigest } from '@/lib/scan-report';
import type { Company, Scan } from '@/lib/types';

// Propone bios para una marca. NO escribe nada: devuelve candidatas con su
// fuente para que se apruebe una desde la ficha, igual que las rondas.
// POST { companyId }
export async function POST(req: NextRequest) {
  try {
    const { companyId } = await req.json();
    if (!companyId) return NextResponse.json({ error: 'companyId requerido' }, { status: 400 });
    if (isDemoMode()) return NextResponse.json({ proposals: [], demo: true });

    const db = getServiceSupabase()!;
    const { data: company } = await db
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .maybeSingle();
    if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });

    const co = company as Company;
    if (!co.domain?.includes('.')) {
      return NextResponse.json({
        proposals: [],
        message: 'Esta ficha aún no tiene dominio. Añádelo y podré buscar su bio.',
      });
    }

    const { data: scan } = await db
      .from('scans')
      .select('result_raw')
      .eq('company_id', companyId)
      .eq('status', 'ready')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const scanRaw = ((scan as Pick<Scan, 'result_raw'> | null)?.result_raw ?? null) as
      | Record<string, unknown>
      | null;

    const proposals = await discoverBio({
      domain: co.domain,
      name: co.name || co.domain,
      scanResultRaw: scanRaw,
    });

    // Tags de sector para filtrar marcas: se infieren de la bio y del scan.
    // No se guardan solas; se proponen y la persona elige (como la bio).
    const report = storedScanReport(scanRaw);
    const sectors = await extractSectors({
      name: co.name || co.domain,
      bio: [co.description, ...proposals.slice(0, 2).map((p) => p.text)]
        .filter(Boolean)
        .join(' · ')
        .slice(0, 800),
      scan: report ? reportDigest(report).slice(0, 800) : '',
    }).catch(() => []);

    return NextResponse.json({
      proposals,
      sectors,
      message: proposals.length
        ? null
        : 'No he encontrado una descripción util. Escanea la marca o escríbela a mano.',
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
