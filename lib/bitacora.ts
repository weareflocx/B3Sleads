// Escribir en la bitácora de una ficha desde el servidor. Server-only.
//
// La bitácora cuelga del lead (la ficha la lee por lead_id). Si quien escribe
// no lo sabe, se busca el de la empresa; si la empresa no es lead (un
// competidor de un estudio), no hay bitácora que mostrar y no se escribe.
import type { SupabaseClient } from '@supabase/supabase-js';

export async function anotaEnBitacora(
  db: SupabaseClient,
  companyId: string,
  leadId: string | null | undefined,
  body: string,
): Promise<void> {
  let lead = leadId ?? null;
  if (!lead) {
    const { data } = await db.from('leads').select('id').eq('company_id', companyId).limit(1).maybeSingle();
    lead = (data?.id as string | undefined) ?? null;
  }
  if (!lead) return;
  const { error } = await db.from('notes').insert({ lead_id: lead, company_id: companyId, body, kind: 'note' });
  // La bitácora acompaña al cambio, no lo condiciona: si falla, se registra
  // en el log pero la señal ya está guardada.
  if (error) console.error('[bitácora]', error.message);
}
