import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { claudeConfigurado, generateFollowUp, promptCopiable } from '@/lib/claude';
import { registraEnvio } from '@/lib/data';
import { contextoSeguimiento, filaDeEnvio } from '@/lib/seguimiento';
import { materialDeLead } from '@/lib/seguimiento-lead';

// POST { leadId, modo?, texto?, original?, como? }
//
//  - modo 'borrador' (por defecto): redacta el seguimiento que toca con
//    Claude API. No se guarda: es un borrador hasta que se envía.
//  - modo 'prompt': devuelve el prompt autocontenido para pegarlo en el
//    Claude de Sergio (cero coste, y la vía cuando no hay clave de API).
//  - modo 'enviado': Sergio ya lo ha mandado por LinkedIn. Se guarda el
//    texto final como mensaje enviado y se anota en la bitácora.
//    `original` es el borrador que propuso la app (va a `draft`; lo enviado
//    va a `edited_final`), para medir cuánto se reescribe.
//    `como: 'respuesta'` lo anota como contestación, no como seguimiento.
//
// Aquí no se envía nada a LinkedIn: el envío es siempre humano (spec §9).
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    const { leadId, modo = 'borrador', texto, original, como } = await req.json();
    if (!leadId) return NextResponse.json({ error: 'leadId requerido' }, { status: 400 });

    const material = await materialDeLead(leadId);
    if (!material) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });
    const { plan, lead } = material;

    if (modo === 'enviado') {
      if (typeof texto !== 'string' || !texto.trim()) {
        return NextResponse.json({ error: 'Falta el texto que has enviado' }, { status: 400 });
      }
      // Una contestación a lo que dijo el founder no es un toque. Reactivar sí
      // es un seguimiento, pero con conversación no se cuentan toques
      // (planSeguimiento), así que nunca lleva a "aparcar tras 3".
      const kind = como === 'respuesta' ? 'reply' : 'followup';
      const fila = filaDeEnvio({ texto, original: typeof original === 'string' ? original : null, kind });
      const base =
        como === 'respuesta'
          ? 'Contestación enviada por LinkedIn.'
          : plan.tipo === 'reactivar'
            ? 'Seguimiento enviado por LinkedIn para reactivar la conversación.'
            : `Seguimiento enviado por LinkedIn (mensaje n.º ${plan.numero}).`;
      const nota = fila.sin_borrador ? `${base} Texto escrito fuera de la app.` : base;
      await registraEnvio({ leadId, lang: lead.lang, fila, nota });
      return NextResponse.json({ ok: true });
    }

    // Tres mensajes sin respuesta: no se redacta un cuarto.
    if (plan.tipo === 'pausar') return NextResponse.json({ plan });

    const contexto = contextoSeguimiento(material);
    if (modo === 'prompt') {
      return NextResponse.json({ plan, prompt: promptCopiable('seguimiento', contexto) });
    }
    if (!claudeConfigurado()) {
      return NextResponse.json(
        { plan, error: 'No hay clave de Claude en el servidor. Copia el prompt y pégalo en tu Claude.' },
        { status: 503 },
      );
    }
    const borrador = await generateFollowUp(contexto, plan.max!);
    return NextResponse.json({ plan, borrador });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
