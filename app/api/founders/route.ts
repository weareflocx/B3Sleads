import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { createScan } from '@/lib/brand3';
import { priorityScore } from '@/lib/scoring';
import { parseLinkedInHandle, linkedInUrlFromHandle } from '@/lib/types';
import type { Company } from '@/lib/types';

// Alta manual de founders desde LinkedIn.
//
// IMPORTANTE (spec §9): esto NO lee LinkedIn. Sergio copia la URL del perfil
// que está viendo y la pega aquí. Cero automatización, cero cookies de sesión.
// El sistema solo estructura lo que él ya vio a ritmo humano.
//
// POST { entries: [{ linkedin, name?, company?, domain?, note? }], warm?: boolean }
// warm = interactuó con los posts de Sergio → source 'engaged' → +20 de prioridad.
export async function POST(req: NextRequest) {
  try {
    const { entries, warm } = await req.json();
    if (!Array.isArray(entries) || !entries.length) {
      return NextResponse.json({ error: 'entries requerido' }, { status: 400 });
    }
    const companySource = warm ? 'engaged' : 'linkedin';
    const contactSource = warm ? 'engaged' : 'linkedin';

    const results: { input: string; status: string; detail?: string }[] = [];
    const db = isDemoMode() ? null : getServiceSupabase();

    for (const e of entries) {
      const handle = parseLinkedInHandle(e.linkedin ?? '');
      if (!handle) {
        results.push({ input: e.linkedin ?? '(vacío)', status: 'error', detail: 'URL de LinkedIn no válida' });
        continue;
      }
      const linkedinUrl = linkedInUrlFromHandle(handle);

      if (!db) {
        results.push({
          input: handle,
          status: 'demo',
          detail: `Se registraría ${e.name || handle}${e.domain ? ` (${e.domain})` : ''} y se lanzaría el Scanner`,
        });
        continue;
      }

      // Dedupe por handle: la identidad del founder sobrevive al cambio de empresa
      const { data: existing } = await db
        .from('contacts')
        .select('id, full_name')
        .eq('linkedin_handle', handle)
        .maybeSingle();
      if (existing) {
        results.push({ input: handle, status: 'dup', detail: `Ya existe: ${existing.full_name}` });
        continue;
      }

      // Compañía: por dominio si lo hay, si no una ficha mínima por nombre
      let companyId: string | null = null;
      let companyRow: Company | null = null;
      const domain = (e.domain ?? '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

      if (domain) {
        const { data: existingCo } = await db
          .from('companies')
          .select('*')
          .eq('domain', domain)
          .maybeSingle();
        if (existingCo) {
          companyId = existingCo.id;
          companyRow = existingCo as Company;
        } else {
          const { data: newCo, error } = await db
            .from('companies')
            .insert({ name: e.company || domain, domain, source: companySource })
            .select()
            .single();
          if (error) {
            results.push({ input: handle, status: 'error', detail: error.message });
            continue;
          }
          companyId = newCo.id;
          companyRow = newCo as Company;
        }
      }

      const { data: contact, error: cErr } = await db
        .from('contacts')
        .insert({
          company_id: companyId,
          full_name: e.name || handle,
          role: e.role || null,
          linkedin_url: linkedinUrl,
          linkedin_handle: handle,
          headline: e.headline || null,
          notes: e.note || null,
          source: contactSource,
        })
        .select()
        .single();
      if (cErr) {
        results.push({ input: handle, status: 'error', detail: cErr.message });
        continue;
      }

      // Lanzar el Scanner si tenemos dominio y aún no hay scan
      let scanId: string | null = null;
      if (domain && companyId) {
        try {
          const job = await createScan(`https://${domain}`);
          const { data: scanRow } = await db
            .from('scans')
            .insert({ company_id: companyId, scanner_job_id: job.id, status: job.status })
            .select()
            .single();
          scanId = scanRow?.id ?? null;
        } catch (err) {
          console.error(`[founders] scan falló para ${domain}: ${err}`);
        }
      }

      // SIEMPRE creamos el lead para que el founder aparezca en la cola,
      // tenga empresa o no. Sin empresa, priority_score se calcula neutro.
      await db.from('leads').insert({
        company_id: companyId,
        contact_id: contact.id,
        scan_id: scanId,
        stage: 'detected',
        priority_score: companyRow
          ? priorityScore({ company: companyRow, signal: null, scan: null })
          : 40,
      });

      results.push({
        input: handle,
        status: 'ok',
        detail: domain
          ? 'en la cola: ficha + Brand3 Scanner lanzado'
          : 'en la cola (añade el dominio de su empresa para escanear la marca)',
      });
    }

    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
