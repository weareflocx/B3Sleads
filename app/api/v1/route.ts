import { NextResponse } from 'next/server';
import { apiConfigured } from '@/lib/api-auth';

// Índice autodescriptivo de la API. Es lo primero que un agente debe leer:
// qué hay, cómo autenticarse y qué reglas aplican. Sin auth: descubrir la
// puerta no es abrirla.
export async function GET() {
  return NextResponse.json({
    service: 'B3S Leads API',
    version: 'v1',
    configured: apiConfigured(),
    auth: 'Authorization: Bearer <key> (o x-api-key). Claves por agente en B3SLEADS_API_KEYS.',
    rules: [
      'El envío a founders es SIEMPRE humano y por LinkedIn: no hay endpoints de mensajería.',
      'Toda señal exige evidencia y fecha en que ocurrió (occurred_at); sin eso, 400.',
      'score_automatico ordena; score_consolidado lleva curación humana y no ordena nada.',
    ],
    endpoints: [
      { method: 'GET', path: '/api/v1/leads', desc: 'La cola con radar (fit × timing) y la señal que sostiene cada número. Filtros: ?state=activo|reserva|no_escaneable&stage=&limit=' },
      { method: 'POST', path: '/api/v1/leads', desc: 'Añadir un lead: { linkedin?, name?, domain?, note? } (al menos linkedin o domain)' },
      { method: 'PATCH', path: '/api/v1/leads/{leadId}', desc: 'Cambiar etapa: { stage, discardReason? }' },
      { method: 'GET', path: '/api/v1/companies/{domain}', desc: 'Ficha completa: empresa, founder, radar, scan (automático + consolidado, componentes con lectura/cita), señales y bitácora' },
      { method: 'GET', path: '/api/v1/companies/{domain}/dossier', desc: 'El dossier del lead en texto plano, listo para dárselo a un LLM' },
      { method: 'GET', path: '/api/v1/companies/{domain}/brief', desc: 'El prompt completo del brief de llamada (instrucciones + dossier)' },
      { method: 'POST', path: '/api/v1/notes', desc: 'Anotar en la bitácora: { domain | leadId, body, kind? }' },
      { method: 'POST', path: '/api/v1/signals', desc: 'Registrar una señal del radar: { domain, type, occurredAt, evidence, sourceUrl? }' },
    ],
  });
}
