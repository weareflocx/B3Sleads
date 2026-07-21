import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { getBrandProfile } from '@/lib/brand3';
import { persistImportedScan } from '@/lib/b3s-scan-storage';
import { currentUserEmail } from '@/lib/auth';
import { priorityScore } from '@/lib/scoring';
import { parseLinkedInHandle, linkedInUrlFromHandle, humanizeHandle } from '@/lib/types';
import type { Company } from '@/lib/types';

// Alta manual de founders desde LinkedIn.
//
// IMPORTANTE (spec §9): esto NO lee LinkedIn. Sergio copia la URL del perfil
// que está viendo y la pega aquí. Cero automatización, cero cookies de sesión.
// El sistema solo estructura lo que él ya vio a ritmo humano.
//
// POST { entries: [...], warm?: boolean, replied?: boolean }
// warm    = interactuó con los posts de Sergio → source 'engaged' → +20 prioridad.
// replied = YA me respondió por privado. Es la señal más fuerte del embudo:
//           conversación abierta (la métrica de éxito del proyecto). Entra en
//           stage 'conversation' con prioridad máxima, no en outreach en frío.
export async function POST(req: NextRequest) {
  try {
    const { entries, warm, replied } = await req.json();
    if (!Array.isArray(entries) || !entries.length) {
      return NextResponse.json({ error: 'entries requerido' }, { status: 400 });
    }
    const isWarm = warm || replied;
    const companySource = isWarm ? 'engaged' : 'linkedin';
    const contactSource = isWarm ? 'engaged' : 'linkedin';
    const stage = replied ? 'conversation' : 'detected';

    const results: {
      input: string;
      status: string;
      detail?: string;
      domain?: string; // para enlazar a la ficha desde el frontend
      name?: string;
    }[] = [];
    const db = isDemoMode() ? null : getServiceSupabase();
    // Atribución para el leaderboard: quién añade este lead
    const addedBy = await currentUserEmail();

    for (const e of entries) {
      const handle = parseLinkedInHandle(e.linkedin ?? '');
      const domain = (e.domain ?? '')
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0];

      // Vale con founder, con marca, o con ambos. Sin ninguno, error.
      if (!handle && !domain) {
        results.push({
          input: e.linkedin || e.domain || '(vacío)',
          status: 'error',
          detail: 'Hace falta el LinkedIn del founder o el dominio de la marca',
        });
        continue;
      }
      const linkedinUrl = handle ? linkedInUrlFromHandle(handle) : null;

      if (!db) {
        results.push({
          input: handle ?? domain,
          status: 'demo',
          detail: `Se registraría ${e.name || handle || domain} y se buscaría su scan en B3S`,
        });
        continue;
      }

      // Dedupe por handle: la identidad del founder sobrevive al cambio de empresa
      if (handle) {
        const { data: existing } = await db
          .from('contacts')
          .select('id, full_name')
          .eq('linkedin_handle', handle)
          .maybeSingle();
        if (existing) {
          results.push({ input: handle, status: 'dup', detail: `Ya existe: ${existing.full_name}` });
          continue;
        }
      }

      // Compañía: por dominio si lo hay, si no una ficha mínima por nombre
      let companyId: string | null = null;
      let companyRow: Company | null = null;

      let companyWasNew = false;
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
            results.push({ input: handle ?? domain, status: 'error', detail: error.message });
            continue;
          }
          companyId = newCo.id;
          companyRow = newCo as Company;
          companyWasNew = true;
        }
      }

      // Solo marca, sin founder, y la marca ya existía → nada nuevo que crear
      if (!handle && !companyWasNew) {
        results.push({ input: domain, status: 'dup', detail: 'Esa marca ya estaba en el radar' });
        continue;
      }

      // Contacto solo si hay founder. El nombre se humaniza desde el handle
      // (estilo LinkedIn: "javier-palomino" → "Javier Palomino").
      let contactId: string | null = null;
      if (handle) {
        const { data: contact, error: cErr } = await db
          .from('contacts')
          .insert({
            company_id: companyId,
            full_name: e.name || humanizeHandle(handle),
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
        contactId = contact.id;
      }

      // Importar el último scan del dominio mediante B3S Scanner API v1.
      let scanId: string | null = null;
      if (domain && companyId) {
        try {
          const profile = await getBrandProfile(domain);
          if (profile.found && profile.scanId) {
            const scanRow = await persistImportedScan(db, companyId, profile);
            scanId = scanRow?.id ?? null;
            // Nombre comercial real del Scanner si la ficha entró solo con dominio
            if (profile.brandName && (!e.company || companyRow?.name === domain)) {
              await db.from('companies').update({ name: profile.brandName }).eq('id', companyId);
            }
          }
        } catch (err) {
          console.error(`[founders] scan no importado para ${domain}: ${err}`);
        }
      }

      // Una respuesta por privado es la señal más fuerte: conversación abierta.
      // Registrarla deja rastro y contexto para el mensaje.
      if (replied && companyId) {
        await db.from('signals').insert({
          company_id: companyId,
          type: 'engagement',
          detail: { source: 'linkedin_dm', note: 'respondió por privado' },
        });
      }

      // SIEMPRE creamos el lead para que el founder aparezca. replied → entra
      // ya en 'conversation' con prioridad máxima (no es outreach en frío).
      const base = companyRow
        ? priorityScore({ company: companyRow, signal: null, scan: null })
        : 40;
      const leadRow: Record<string, unknown> = {
        company_id: companyId,
        contact_id: contactId,
        scan_id: scanId,
        stage,
        priority_score: replied ? 100 : base,
      };
      // created_by_email requiere la migración 004; si aún no está, reintenta sin él
      if (addedBy) leadRow.created_by_email = addedBy;
      const { error: leadErr } = await db.from('leads').insert(leadRow);
      if (leadErr && /created_by_email/.test(leadErr.message)) {
        delete leadRow.created_by_email;
        await db.from('leads').insert(leadRow);
      }

      const scanNote = domain
        ? scanId
          ? 'scan de B3S importado'
          : 'sin scan en B3S aún (pega la URL del informe en su ficha)'
        : 'añade el dominio de su marca para traer el scan';
      results.push({
        input: e.name || (handle ? humanizeHandle(handle) : domain),
        status: 'ok',
        domain: domain || undefined,
        name: e.name || (handle ? humanizeHandle(handle) : undefined),
        detail: replied
          ? `en conversación (te respondió por privado) · ${scanNote}`
          : handle
            ? `en la cola · ${scanNote}`
            : `marca en el radar · ${scanNote} · busca a su founder en LinkedIn`,
      });
    }

    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
