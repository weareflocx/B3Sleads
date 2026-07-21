import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import type { Company, Investor } from '@/lib/types';

// Edición de la ficha de un fondo. El campo que más pesa es `website`:
// al fijarlo se materializa (o se reutiliza) su ficha de compañía, y desde
// ese momento el fondo se puede escanear con B3S como cualquier marca.
// PATCH { slug, name?, website?, thesis?, hq?, linkedinUrl?, notes?, logoUrl? }

function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .trim();
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const slug = String(body.slug || '').trim();
    if (!slug) return NextResponse.json({ error: 'slug requerido' }, { status: 400 });
    if (isDemoMode()) return NextResponse.json({ ok: true, demo: true });

    const db = getServiceSupabase()!;
    const { data: current } = await db
      .from('investors')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();
    if (!current) return NextResponse.json({ error: 'Fondo no encontrado' }, { status: 404 });

    const investor = current as Investor;
    const update: Record<string, unknown> = {};
    if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim();
    if (typeof body.thesis === 'string') update.thesis = body.thesis.trim() || null;
    if (typeof body.hq === 'string') update.hq = body.hq.trim() || null;
    if (typeof body.notes === 'string') update.notes = body.notes.trim() || null;
    if (typeof body.linkedinUrl === 'string') update.linkedin_url = body.linkedinUrl.trim() || null;
    if (typeof body.logoUrl === 'string') update.logo_url = body.logoUrl.trim() || null;

    if (typeof body.website === 'string') {
      const domain = normalizeDomain(body.website);
      update.website = domain || null;

      // Con web conocida, el fondo pasa a tener ficha de compañía propia.
      // Se reutiliza la que hubiera para ese dominio en vez de duplicarla.
      if (domain && !investor.company_id) {
        const { data: existing } = await db
          .from('companies')
          .select('*')
          .eq('domain', domain)
          .maybeSingle();

        let company = existing as Company | null;
        if (!company) {
          const { data: created } = await db
            .from('companies')
            .insert({
              name: (update.name as string) || investor.name,
              domain,
              source: 'manual',
              is_investor: true,
            })
            .select()
            .single();
          company = created as Company | null;
        } else {
          await db.from('companies').update({ is_investor: true }).eq('id', company.id);
        }
        if (company) update.company_id = company.id;
      }
    }

    if (!Object.keys(update).length) return NextResponse.json({ ok: true, unchanged: true });

    const { data, error } = await db
      .from('investors')
      .update(update)
      .eq('slug', slug)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, investor: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
