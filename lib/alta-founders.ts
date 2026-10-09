import { normalizarDominio } from '@/lib/dominio';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { getBrandProfile } from '@/lib/brand3';
import { persistImportedScan } from '@/lib/b3s-scan-storage';
import { fetchSiteDescription } from '@/lib/site-meta';
import { priorityScore } from '@/lib/scoring';
import { parseLinkedInHandle, linkedInUrlFromHandle, humanizeHandle } from '@/lib/types';
import type { Company } from '@/lib/types';

// Alta manual de founders desde LinkedIn.
//
// IMPORTANTE (spec §9): esto NO lee LinkedIn. Sergio copia la URL del perfil
// que está viendo y la pega aquí. Cero automatización, cero cookies de sesión.
// El sistema solo estructura lo que él ya vio a ritmo humano.
//
// { entries: [...], warm?: boolean, replied?: boolean }
// warm    = interactuó con los posts de Sergio → source 'engaged' → +20 prioridad.
// replied = YA me respondió por privado. Es la señal más fuerte del embudo:
//           conversación abierta (la métrica de éxito del proyecto). Entra en
//           stage 'conversation' con prioridad máxima, no en outreach en frío.
//
// La usan /api/founders (el dashboard, con la sesión del usuario) y
// /api/v1/leads (la Agent API, sin sesión). addedBy es el email al que se
// atribuye el lead, o null.

export interface EntradaFounder {
  linkedin?: string;
  domain?: string;
  name?: string;
  company?: string;
  role?: string;
  headline?: string;
  note?: string;
}

export interface PeticionAlta {
  entries?: EntradaFounder[];
  warm?: boolean;
  replied?: boolean;
}

export interface ResultadoAlta {
  input: string;
  status: string;
  detail?: string;
  domain?: string; // para enlazar a la ficha desde el frontend
  name?: string;
}

export type RespuestaAlta =
  | { status: 200; body: { results: ResultadoAlta[] } }
  | { status: 400 | 500; body: { error: string } };

export async function altaDeFounders(
  peticion: PeticionAlta,
  addedBy: string | null,
): Promise<RespuestaAlta> {
  try {
    const { entries, warm, replied } = peticion;
    if (!Array.isArray(entries) || !entries.length) {
      return { status: 400, body: { error: 'entries requerido' } };
    }
    const isWarm = warm || replied;
    const companySource = isWarm ? 'engaged' : 'linkedin';
    const contactSource = isWarm ? 'engaged' : 'linkedin';
    const stage = replied ? 'conversation' : 'detected';

    const results: ResultadoAlta[] = [];
    const db = isDemoMode() ? null : getServiceSupabase();

    // Marcas nuevas de esta tanda: al final se les intenta rellenar la bio
    // con la meta descripción de su web (suele ser la misma frase que ponen
    // en LinkedIn). Ver lib/site-meta.ts.
    const newCompanies: { id: string; domain: string }[] = [];

    for (const e of entries) {
      const handle = parseLinkedInHandle(e.linkedin ?? '');
      // Un dominio que no lo es (un nombre con espacios, por ejemplo) no
      // entra: antes se guardaba tal cual y rompía logo, ficha y scan.
      if (e.domain?.trim() && !normalizarDominio(e.domain)) {
        results.push({
          input: e.domain,
          status: 'error',
          detail: 'Eso no es un dominio. Pon la web de la marca (marca.com).',
        });
        continue;
      }
      const domain = normalizarDominio(e.domain) ?? '';

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
          if (domain.includes('.')) newCompanies.push({ id: newCo.id, domain });
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
          // Presupuesto duro: el alta responde aunque el Scanner esté frío.
          // Sin scan, el lead se crea igual y el informe se importa después
          // desde la ficha.
          const profile = await Promise.race([
            getBrandProfile(domain),
            new Promise<null>((r) => setTimeout(() => r(null), 6_000)),
          ]);
          if (profile?.found && profile.scanId) {
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
      // Si la marca ya tiene un lead SIN founder (alta desde "Rondas de la
      // semana" o por dominio), el founder lo completa: crear otro duplicaba
      // la marca en la cola y el kanban.
      let completado = false;
      if (companyId && contactId) {
        const { data: huerfano } = await db
          .from('leads')
          .select('id, scan_id')
          .eq('company_id', companyId)
          .is('contact_id', null)
          .not('stage', 'in', '(discarded,won,lost)')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (huerfano) {
          const cambio: Record<string, unknown> = { contact_id: contactId, updated_at: new Date().toISOString() };
          if (scanId && !huerfano.scan_id) cambio.scan_id = scanId;
          // Te respondió por privado: el lead entra ya en conversación.
          if (replied) {
            cambio.stage = stage;
            cambio.priority_score = 100;
          }
          const { error } = await db.from('leads').update(cambio).eq('id', huerfano.id);
          completado = !error;
        }
      }
      if (!completado) {
        // created_by_email requiere la migración 004; si aún no está, reintenta sin él
        if (addedBy) leadRow.created_by_email = addedBy;
        const { error: leadErr } = await db.from('leads').insert(leadRow);
        if (leadErr && /created_by_email/.test(leadErr.message)) {
          delete leadRow.created_by_email;
          await db.from('leads').insert(leadRow);
        }
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

    if (newCompanies.length && db) {
      // En paralelo y con tope global de 3.5s: si una web no responde, la bio
      // queda vacía y se rellena a mano. El alta nunca espera de más.
      await Promise.race([
        Promise.all(
          newCompanies.map(async (c) => {
            const description = await fetchSiteDescription(c.domain);
            if (description) {
              await db.from('companies').update({ description }).eq('id', c.id).is('description', null);
            }
          }),
        ),
        new Promise((r) => setTimeout(r, 3_500)),
      ]);
    }

    return { status: 200, body: { results } };
  } catch (e) {
    return { status: 500, body: { error: String(e) } };
  }
}
