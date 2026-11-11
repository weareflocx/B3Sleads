import { NextRequest, NextResponse } from 'next/server';
import offer from '@/config/floc-offer.json';
import { requireUser } from '@/lib/auth';
import { claudeConfigurado, promptCopiable, readReply } from '@/lib/claude';
import { registraRespuesta } from '@/lib/data';
import { getServiceSupabase, isDemoMode } from '@/lib/supabase';
import { anotaEnBitacora } from '@/lib/bitacora';
import { contextoRespuesta, notaDeLectura, notaDeRespuesta, parseLectura } from '@/lib/seguimiento';
import { materialDeLead } from '@/lib/seguimiento-lead';

// Una respuesta de LinkedIn pegada entera cabe de sobra; más es un error de
// pegado (una página entera) y no se manda al modelo.
const MAX_RESPUESTA = 6000;

// POST { leadId, respuesta, modo? }
//
// Sergio pega lo que le ha contestado el founder en LinkedIn. La respuesta
// se guarda en la bitácora tal cual y se lee: clase, qué revela, etapa que
// se propone y un borrador de contestación.
//
//  - modo 'leer' (por defecto): la guarda en la bitácora y la lee Claude
//    API. Sin clave, la guarda igual y avisa (503).
//  - modo 'prompt': devuelve el prompt para pegarlo en el Claude de Sergio.
//    No escribe nada.
//
// La etapa NO se cambia aquí: la ficha la propone y Sergio la confirma. Y la
// contestación la envía él a mano por LinkedIn (spec §9).
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    const { leadId, respuesta, modo = 'leer' } = await req.json();
    if (!leadId || typeof respuesta !== 'string' || !respuesta.trim()) {
      return NextResponse.json({ error: 'leadId y respuesta requeridos' }, { status: 400 });
    }
    if (respuesta.length > MAX_RESPUESTA) {
      return NextResponse.json(
        { error: `La respuesta pasa de ${MAX_RESPUESTA} caracteres. Pega solo el mensaje del founder.` },
        { status: 400 },
      );
    }

    const material = await materialDeLead(leadId);
    if (!material) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });
    const { bl, lead } = material;

    const contexto = contextoRespuesta({
      lead,
      enviados: material.enviados,
      notas: material.notas,
      respuesta,
      posicionamiento: offer.positioning,
      agenda: { minutos: offer.call.minutes, enlace: offer.call.booking_url.trim() || null },
    });

    // El modo prompt solo lee: no escribe nada en la base de datos. Así se
    // puede probar con leads reales sin tocar su bitácora.
    if (modo === 'prompt') {
      return NextResponse.json({ guardada: false, prompt: promptCopiable('respuesta', contexto) });
    }

    // Primero se guarda: lo que contestó es un hecho, se lea o no después.
    const nueva = await registraRespuesta({
      leadId,
      companyId: bl.company?.id ?? null,
      contactId: bl.contact?.id ?? null,
      nota: notaDeRespuesta(lead.contactName, respuesta),
    });
    if (!claudeConfigurado()) {
      return NextResponse.json(
        {
          guardada: true,
          error: 'Respuesta guardada en la bitácora. No hay clave de Claude en el servidor: copia el prompt y pégalo en tu Claude.',
        },
        { status: 503 },
      );
    }

    const lectura = parseLectura(await readReply(contexto), bl.lead.stage);
    if (!lectura) {
      return NextResponse.json(
        { guardada: true, error: 'Respuesta guardada, pero no se ha podido leer. Vuelve a intentarlo o copia el prompt.' },
        { status: 502 },
      );
    }

    // La cualificación queda en la bitácora una vez por respuesta, no una
    // por cada relectura.
    if (nueva && bl.company && !isDemoMode()) {
      await anotaEnBitacora(getServiceSupabase()!, bl.company.id, leadId, notaDeLectura(lectura));
    }
    return NextResponse.json({ guardada: true, lectura });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
