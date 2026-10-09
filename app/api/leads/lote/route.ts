import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { requireUser } from '@/lib/auth';
import { normalizarDominio } from '@/lib/dominio';
import { priorityScore } from '@/lib/scoring';
import { humanizeHandle, type Company, type Signal } from '@/lib/types';
import { AVISO_LINKEDIN, AVISO_NOMBRE, linkedinDePerfil, type FilaLote } from '@/lib/lote';

// Subida en lote de leads.
//
//   POST { accion: 'comprobar', dominios, handles }
//        qué dominios ya son lead (con enlace a su ficha) y qué fundadores ya
//        están en otra ficha. Alimenta la vista previa.
//   POST { accion: 'importar', filas, completar }
//        crea las nuevas; las duplicadas no se crean ni se sobrescriben (con
//        `completar`, solo se rellenan sus campos vacíos).
//
// NUNCA lanza un scan ni consulta el Scanner: el alta normal importa el
// último scan de B3S, esta no. Tampoco lee LinkedIn (spec §9): guarda las URLs
// que vienen en la tabla, y si una no es un perfil personal no se busca otra.
//
// El navegador manda las filas en tandas pequeñas: Netlify corta a los 10 s.

type Estado = 'alta' | 'duplicada' | 'completada' | 'error';
interface Resultado {
  n: number;
  dominio: string | null;
  estado: Estado;
  detalle: string;
  avisos?: string[];
}

const MAX_FILAS = 40;

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    const body = (await req.json()) as {
      accion?: string;
      dominios?: unknown;
      handles?: unknown;
      filas?: unknown;
      completar?: boolean;
      origen?: string;
    };
    if (isDemoMode()) return NextResponse.json({ error: 'En modo demo no se importa.' }, { status: 400 });
    const db = getServiceSupabase()!;

    if (body.accion === 'comprobar') {
      const dominios = [...new Set((Array.isArray(body.dominios) ? body.dominios : []).map((d) => normalizarDominio(String(d))).filter(Boolean) as string[])];
      const handles = [...new Set((Array.isArray(body.handles) ? body.handles : []).map((h) => String(h).toLowerCase()).filter(Boolean))];
      return NextResponse.json(await comprobar(db, dominios, handles));
    }

    if (body.accion === 'importar') {
      const filas = (Array.isArray(body.filas) ? body.filas : []) as FilaLote[];
      if (filas.length > MAX_FILAS) {
        return NextResponse.json({ error: `Como mucho ${MAX_FILAS} filas por petición.` }, { status: 400 });
      }
      const autor = auth.email;
      const hoy = new Date().toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' });
      const resultados: Resultado[] = [];
      // Fila a fila: un error no para el resto.
      for (const f of filas) {
        try {
          resultados.push(
            await importarFila(db, f, {
              completar: body.completar === true,
              autor,
              hoy,
              // Desde "Rondas de la semana" la bitácora lo dice así; el resto es lote.
              origen: body.origen === 'rondas' ? 'Alta desde Rondas de la semana' : 'Alta por lote',
            }),
          );
        } catch (e) {
          resultados.push({
            n: Number(f?.n) || 0,
            dominio: normalizarDominio(f?.dominioRaw ?? '') ?? null,
            estado: 'error',
            detalle: e instanceof Error ? e.message : 'Error desconocido',
          });
        }
      }
      return NextResponse.json({ resultados });
    }

    return NextResponse.json({ error: 'accion debe ser comprobar o importar' }, { status: 400 });
  } catch (e) {
    console.error('[leads/lote]', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------

async function porTandas<T>(lista: string[], fn: (trozo: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  // .in() con cientos de valores puede pasarse del largo de URL de PostgREST.
  for (let i = 0; i < lista.length; i += 150) out.push(...(await fn(lista.slice(i, i + 150))));
  return out;
}

async function comprobar(db: SupabaseClient, dominios: string[], handles: string[]) {
  const companies = await porTandas(dominios, async (t) => {
    const { data, error } = await db.from('companies').select('id, domain, name').in('domain', t);
    if (error) throw error;
    return data ?? [];
  });
  const ids = companies.map((c) => c.id as string);
  const leads = await porTandas(ids, async (t) => {
    const { data, error } = await db.from('leads').select('company_id').in('company_id', t);
    if (error) throw error;
    return data ?? [];
  });
  const conLead = new Set(leads.map((l) => l.company_id as string));
  const contactos = await porTandas(handles, async (t) => {
    const { data, error } = await db.from('contacts').select('linkedin_handle, companies(domain)').in('linkedin_handle', t);
    if (error) throw error;
    return data ?? [];
  });
  return {
    existentes: companies.map((c) => ({ dominio: c.domain as string, nombre: c.name as string, esLead: conLead.has(c.id as string) })),
    fundadoresExistentes: contactos.map((c) => ({
      handle: c.linkedin_handle as string,
      dominio: ((c.companies as { domain?: string } | null)?.domain ?? null) as string | null,
    })),
  };
}

// La fila se vuelve a validar aquí: lo que manda el navegador es una vista
// previa, no una garantía.
function revalida(f: FilaLote) {
  const dominio = normalizarDominio(f.dominioRaw ?? '');
  const fundadores = (Array.isArray(f.fundadores) ? f.fundadores : []).slice(0, 10).map((x) => {
    const perfil = x.linkedinRaw ? linkedinDePerfil(String(x.linkedinRaw)) : null;
    const nombre = (x.nombre ?? '').toString().trim().slice(0, 120) || null;
    return { raw: String(x.linkedinRaw ?? '').slice(0, 300), url: perfil?.url ?? null, handle: perfil?.handle ?? null, nombre };
  });
  const texto = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const fuente = texto(f.fuente, 500);
  return {
    n: Number(f.n) || 0,
    dominio,
    marca: texto(f.marca, 120),
    fundadores,
    sector: texto(f.sector, 80),
    pais: texto(f.pais, 80),
    ciudad: texto(f.ciudad, 80),
    fuente,
    fuenteUrl: fuente && /^https?:\/\/\S+\.\S+/i.test(fuente) ? fuente : null,
    ronda: f.ronda
      ? {
          importe: texto(f.ronda.importe, 60),
          fecha: texto(f.ronda.fecha, 10) && !Number.isNaN(Date.parse(f.ronda.fecha!)) ? f.ronda.fecha : null,
          tipo: texto(f.ronda.tipo, 40),
        }
      : null,
  };
}

async function importarFila(
  db: SupabaseClient,
  bruta: FilaLote,
  op: { completar: boolean; autor: string | null; hoy: string; origen: string },
): Promise<Resultado> {
  const f = revalida(bruta);
  if (!f.dominio) {
    return { n: f.n, dominio: null, estado: 'error', detalle: bruta.dominioRaw ? `«${bruta.dominioRaw}» no es un dominio (marca.com).` : 'Falta el dominio.' };
  }
  const avisos: string[] = [];
  if (!f.marca) avisos.push(AVISO_NOMBRE);
  if (!f.fundadores.some((x) => x.url) || f.fundadores.some((x) => x.raw && !x.url)) avisos.push(AVISO_LINKEDIN);

  // ¿Ya es lead? Se mira aquí, al escribir, y no solo en la vista previa: así
  // importar el mismo CSV dos veces no crea nada la segunda.
  const { data: existente, error: eCo } = await db.from('companies').select('*').eq('domain', f.dominio).maybeSingle();
  if (eCo) throw eCo;
  if (existente) {
    const { data: lead } = await db.from('leads').select('id, contact_id').eq('company_id', existente.id).limit(1).maybeSingle();
    if (lead) {
      if (!op.completar) {
        return { n: f.n, dominio: f.dominio, estado: 'duplicada', detalle: 'Ya es lead. No se ha tocado.' };
      }
      return completarDuplicada(db, f, existente as Company, lead as { id: string; contact_id: string | null }, op);
    }
  }

  // Alta. Si la empresa es nueva y algo falla a mitad, se deshace: una ficha
  // sin lead no se ve en ninguna pantalla y bloquearía el siguiente intento.
  let company = existente as Company | null;
  let nueva = false;
  if (!company) {
    const { data, error } = await db
      .from('companies')
      .insert({
        name: f.marca ?? f.dominio,
        domain: f.dominio,
        source: 'lote',
        sector: f.sector,
        hq_country: f.pais,
        city: f.ciudad,
      })
      .select()
      .single();
    if (error) {
      // Otra pestaña la creó a la vez: es una duplicada, no un error.
      if (error.code === '23505') return { n: f.n, dominio: f.dominio, estado: 'duplicada', detalle: 'Se acaba de crear desde otra pestaña.' };
      throw error;
    }
    company = data as Company;
    nueva = true;
  } else {
    // Marca que ya estaba en el corpus (un competidor de un estudio) pero sin
    // lead: entra como lead, y se rellenan solo sus campos vacíos.
    await rellenaVacios(db, company, f);
  }

  try {
    const { creados, yaEnOtra } = await creaFundadores(db, company.id, f.fundadores);
    const principal = creados.find((c) => c.conLinkedin) ?? creados[0] ?? null;
    const senal = await creaRonda(db, company.id, f);

    const leadRow: Record<string, unknown> = {
      company_id: company.id,
      contact_id: principal?.id ?? null,
      scan_id: null,
      stage: 'detected',
      priority_score: priorityScore({ company, signal: senal, scan: null }),
    };
    if (op.autor) leadRow.created_by_email = op.autor;
    const { data: lead, error: eLead } = await db.from('leads').insert(leadRow).select('id').single();
    if (eLead) throw eLead;

    const lineas = [`${op.origen} · ${op.hoy} · fuente: ${f.fuente ?? 'sin fuente'}`];
    if (avisos.includes(AVISO_NOMBRE)) lineas.push('Nombre por revisar: vino sin nombre de marca, se usa el dominio.');
    const raros = f.fundadores.filter((x) => x.raw && !x.url).map((x) => `«${x.raw}»`);
    if (raros.length) lineas.push(`LinkedIn por verificar: ${raros.join(', ')} no es un perfil personal (linkedin.com/in/…).`);
    else if (avisos.includes(AVISO_LINKEDIN)) lineas.push('LinkedIn por verificar: vino sin perfil del fundador.');
    if (yaEnOtra.length) lineas.push(`Fundadores que ya estaban en otra ficha (no se duplican): ${yaEnOtra.join(', ')}.`);
    const { error: eNota } = await db.from('notes').insert({ lead_id: lead.id, company_id: company.id, body: lineas.join('\n'), kind: 'note' });
    if (eNota) throw eNota;

    const partes = [
      creados.length ? `${creados.length} ${creados.length === 1 ? 'fundador' : 'fundadores'}` : 'sin fundadores',
      senal ? 'ronda registrada' : null,
      nueva ? null : 'la marca ya estaba en el corpus',
    ].filter(Boolean);
    return { n: f.n, dominio: f.dominio, estado: 'alta', detalle: partes.join(' · '), avisos };
  } catch (e) {
    if (nueva) await db.from('companies').delete().eq('id', company.id);
    throw e;
  }
}

async function rellenaVacios(db: SupabaseClient, c: Company, f: ReturnType<typeof revalida>): Promise<string[]> {
  const cambios: Record<string, string> = {};
  if (f.marca && (!c.name || c.name === c.domain)) cambios.name = f.marca;
  if (f.sector && !c.sector) cambios.sector = f.sector;
  if (f.pais && !c.hq_country) cambios.hq_country = f.pais;
  if (f.ciudad && !(c as Company & { city?: string | null }).city) cambios.city = f.ciudad;
  if (!Object.keys(cambios).length) return [];
  const { error } = await db.from('companies').update(cambios).eq('id', c.id);
  if (error) throw error;
  return Object.keys(cambios);
}

async function creaFundadores(db: SupabaseClient, companyId: string, fundadores: ReturnType<typeof revalida>['fundadores']) {
  const creados: { id: string; conLinkedin: boolean }[] = [];
  const yaEnOtra: string[] = [];
  for (const x of fundadores) {
    if (!x.url && !x.nombre) continue;
    if (x.handle) {
      // La identidad del fundador es su perfil: si ya está en otra ficha no
      // se duplica (y el índice único lo impediría igual).
      const { data: ya } = await db.from('contacts').select('id, company_id').eq('linkedin_handle', x.handle).maybeSingle();
      if (ya) {
        if (ya.company_id !== companyId) yaEnOtra.push(x.nombre ?? x.handle);
        else creados.push({ id: ya.id, conLinkedin: true });
        continue;
      }
    }
    const { data, error } = await db
      .from('contacts')
      .insert({
        company_id: companyId,
        full_name: x.nombre ?? (x.handle ? humanizeHandle(x.handle) : 'Fundador'),
        linkedin_url: x.url,
        linkedin_handle: x.handle,
        source: 'lote',
      })
      .select('id')
      .single();
    if (error) throw error;
    creados.push({ id: data.id, conLinkedin: Boolean(x.url) });
  }
  return { creados, yaEnOtra };
}

async function creaRonda(db: SupabaseClient, companyId: string, f: ReturnType<typeof revalida>): Promise<Signal | null> {
  if (!f.ronda || (!f.ronda.importe && !f.ronda.fecha)) return null;
  const { data, error } = await db
    .from('signals')
    .insert({
      company_id: companyId,
      type: 'funding_round',
      detail: {
        round: f.ronda.tipo ?? 'Ronda',
        amount: f.ronda.importe,
        investors: [],
        source_url: f.fuenteUrl,
        source: 'lote',
      },
      detected_at: f.ronda.fecha ? new Date(f.ronda.fecha).toISOString() : new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data as Signal;
}

// Duplicada con "completar campos vacíos": nunca se sobrescribe nada que ya
// tenga valor. Se rellenan los campos vacíos de la marca, se añaden los
// fundadores que no estaban y la ronda si la ficha no tenía ninguna.
async function completarDuplicada(
  db: SupabaseClient,
  f: ReturnType<typeof revalida>,
  company: Company,
  lead: { id: string; contact_id: string | null },
  op: { hoy: string },
): Promise<Resultado> {
  const campos = await rellenaVacios(db, company, f);
  const { data: actuales } = await db.from('contacts').select('linkedin_handle').eq('company_id', company.id);
  const tiene = new Set((actuales ?? []).map((c) => c.linkedin_handle).filter(Boolean));
  const nuevos = f.fundadores.filter((x) => x.handle && !tiene.has(x.handle));
  const { creados } = await creaFundadores(db, company.id, nuevos);
  if (!lead.contact_id && creados[0]) {
    const { error } = await db.from('leads').update({ contact_id: creados[0].id }).eq('id', lead.id);
    if (error) throw error;
  }
  let ronda = false;
  if (f.ronda) {
    const { count } = await db.from('signals').select('id', { count: 'exact', head: true }).eq('company_id', company.id).eq('type', 'funding_round');
    if (!count) ronda = Boolean(await creaRonda(db, company.id, f));
  }
  const hecho = [
    ...campos.map((c) => ({ name: 'nombre', sector: 'sector', hq_country: 'país', city: 'ciudad' })[c] ?? c),
    creados.length ? `${creados.length} ${creados.length === 1 ? 'fundador' : 'fundadores'}` : null,
    ronda ? 'ronda' : null,
  ].filter(Boolean) as string[];
  if (!hecho.length) return { n: f.n, dominio: f.dominio, estado: 'duplicada', detalle: 'Ya es lead. No había campos vacíos que completar.' };
  const { error } = await db.from('notes').insert({
    lead_id: lead.id,
    company_id: company.id,
    body: `Completado por lote · ${op.hoy} · fuente: ${f.fuente ?? 'sin fuente'}\nSe añadió: ${hecho.join(', ')}.`,
    kind: 'note',
  });
  if (error) throw error;
  return { n: f.n, dominio: f.dominio, estado: 'completada', detalle: `Ya era lead. Completado: ${hecho.join(', ')}.` };
}
