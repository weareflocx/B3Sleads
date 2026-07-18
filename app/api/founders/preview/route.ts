import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { getBrandProfile } from '@/lib/brand3';
import { parseFounderLines, type ParsedEntry } from '@/lib/parse-founders';

// Analiza (sin escribir en BD) un pegado en lote de founders y devuelve, por
// línea, la info extra que se puede conseguir sin tocar LinkedIn (spec §9):
//  - scan de Brand3 por dominio (score + cuadrante + resumen)
//  - aviso de duplicado (contacto por handle, marca por dominio) ANTES de añadir
//
// POST { text: string } → { rows: PreviewRow[] }
export interface PreviewRow extends ParsedEntry {
  scanFound: boolean;
  score: number | null;
  quadrant: string | null;
  summary: string | null;
  dupContact: boolean;
  dupContactName: string | null;
  dupCompany: boolean;
  status: 'new' | 'dup' | 'invalid';
}

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'text requerido' }, { status: 400 });
    }

    const parsed = parseFounderLines(text);
    const db = isDemoMode() ? null : getServiceSupabase();

    // Cachés para no repetir llamadas: mismo dominio/handle una sola vez.
    const brandCache = new Map<string, Awaited<ReturnType<typeof getBrandProfile>> | null>();
    const contactCache = new Map<string, string | null>();
    // Por dominio: si la marca ya está en nuestra BD y su último scan (si lo hay).
    const companyCache = new Map<string, { exists: boolean; score: number | null }>();

    async function lookupCompany(domain: string): Promise<{ exists: boolean; score: number | null }> {
      if (companyCache.has(domain)) return companyCache.get(domain)!;
      let result = { exists: false, score: null as number | null };
      if (db) {
        const { data: company } = await db
          .from('companies')
          .select('id')
          .eq('domain', domain)
          .maybeSingle();
        if (company) {
          const { data: scan } = await db
            .from('scans')
            .select('score')
            .eq('company_id', company.id)
            .eq('status', 'ready')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          result = { exists: true, score: scan?.score ?? null };
        }
      }
      companyCache.set(domain, result);
      return result;
    }

    const rows: PreviewRow[] = await Promise.all(
      parsed.map(async (e): Promise<PreviewRow> => {
        const base: PreviewRow = {
          ...e,
          scanFound: false,
          score: null,
          quadrant: null,
          summary: null,
          dupContact: false,
          dupContactName: null,
          dupCompany: false,
          status: e.valid ? 'new' : 'invalid',
        };
        if (!e.valid) return base;

        // Scan por dominio. Primero nuestra propia BD (scans ya importados),
        // luego el Observatorio público de Brand3 (sin token) para marcas
        // que aún no tenemos.
        if (e.domain) {
          const own = await lookupCompany(e.domain);
          base.dupCompany = own.exists;
          if (own.exists && own.score != null) {
            base.scanFound = true;
            base.score = own.score;
          } else {
            if (!brandCache.has(e.domain)) {
              try {
                brandCache.set(e.domain, await getBrandProfile(e.domain));
              } catch {
                brandCache.set(e.domain, null);
              }
            }
            const profile = brandCache.get(e.domain) ?? null;
            if (profile?.found) {
              base.scanFound = true;
              base.score = profile.score;
              base.quadrant = profile.quadrant;
              base.summary = profile.tldr.summary || null;
            }
          }
        }

        // Duplicado de founder por handle
        if (db && e.handle) {
          if (!contactCache.has(e.handle)) {
            const { data } = await db
              .from('contacts')
              .select('full_name')
              .eq('linkedin_handle', e.handle)
              .maybeSingle();
            contactCache.set(e.handle, data?.full_name ?? null);
          }
          const name = contactCache.get(e.handle) ?? null;
          if (name) {
            base.dupContact = true;
            base.dupContactName = name;
          }
        }

        // Duplicado si el founder ya existe (handle). Una marca repetida sin
        // founder nuevo también es dup; con founder nuevo, sigue siendo alta.
        if (base.dupContact) base.status = 'dup';
        else if (base.dupCompany && !e.handle) base.status = 'dup';

        return base;
      }),
    );

    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
