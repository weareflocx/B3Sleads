// Reúne lo que necesitan el seguimiento y la lectura de respuestas de un
// lead concreto: la ficha, lo ya enviado y la bitácora. Server-only (lee de
// la BD); la lógica pura vive en lib/seguimiento.ts.
import { getLeadFiche, getLeadMessages, getLeadNotes } from './data';
import { draftInputFromLead } from './claude';
import { retencionDeScan, storedScanReport } from './scan-report';
import { displayName, esScanRetenido } from './types';
import type { BriefingLead } from './types';
import {
  enviosDe,
  haRespondido,
  motivoScanDudoso,
  planSeguimiento,
  textoEnviado,
  toquesDe,
  type ContextoLead,
  type PlanSeguimiento,
} from './seguimiento';

const DAY = 86_400_000;
// Con cinco notas hay contexto de sobra; más mete ruido de hace meses.
const NOTAS_EN_CONTEXTO = 5;

export interface MaterialLead {
  bl: BriefingLead;
  lead: ContextoLead;
  plan: PlanSeguimiento;
  // Días desde el último envío (o desde la última actividad, si no hay).
  dias: number;
  enviados: string[];
  notas: string[];
}

export async function materialDeLead(leadId: string, now = new Date()): Promise<MaterialLead | null> {
  const bl = await getLeadFiche(leadId);
  if (!bl) return null;
  const [messages, notes] = await Promise.all([getLeadMessages(leadId), getLeadNotes(leadId)]);
  const envios = enviosDe(messages);
  const input = draftInputFromLead(bl);
  const desde = envios.at(-1)?.sent_at ?? bl.lead.updated_at;
  const scanDudoso = motivoScanDudoso({
    scan: bl.scan ?? null,
    report: storedScanReport(bl.scan?.result_raw),
    retenido: esScanRetenido(bl.scan) || retencionDeScan(bl.scan?.result_raw) != null,
  });
  return {
    bl,
    lead: {
      companyName: input.companyName,
      domain: input.domain,
      contactName: displayName(bl.contact?.full_name) || null,
      signalSummary: input.signalSummary,
      scannerFindings: input.scannerFindings,
      scanDudoso,
      lang: input.lang,
    },
    plan: planSeguimiento(bl.lead.stage, toquesDe(envios).length, haRespondido(messages)),
    dias: Math.max(0, Math.floor((now.getTime() - new Date(desde).getTime()) / DAY)),
    enviados: envios.map(textoEnviado),
    notas: notes.slice(0, NOTAS_EN_CONTEXTO).map((n) => n.body),
  };
}
