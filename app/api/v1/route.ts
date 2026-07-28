import { agentApiConfigured, AGENT_SCOPES } from '@/lib/agent-api/auth';
import { publicAgentDocument } from '@/lib/agent-api/handler';
import { AGENT_RATE_LIMITS } from '@/lib/agent-api/rate-limit';

// Contrato de descubrimiento compatible con la API ya entregada a Hermes.
// Se amplía con scopes, cuotas, health y OpenAPI sin envolver la respuesta.
export async function GET(request: Request) {
  return publicAgentDocument(request, {
    service: 'B3S Leads API',
    version: 'v1',
    configured: agentApiConfigured(),
    documentation: '/api/v1/openapi.json',
    health: '/api/v1/health',
    auth: 'Authorization: Bearer <key>. x-api-key se mantiene solo por compatibilidad.',
    scopes: AGENT_SCOPES,
    rate_limits: Object.fromEntries(
      Object.entries(AGENT_RATE_LIMITS).map(([scope, rule]) => [
        scope,
        { limit: rule.limit, window_seconds: rule.windowSeconds },
      ]),
    ),
    rules: [
      'El envío a founders es SIEMPRE humano y por LinkedIn: no hay endpoints de mensajería.',
      'Toda señal exige evidencia y fecha en que ocurrió; sin eso, se rechaza.',
      'score_automatico ordena; score_consolidado lleva curación humana y no ordena nada.',
    ],
    endpoints: [
      { method: 'GET', path: '/api/v1/leads', desc: 'Cola con radar y evidencia.' },
      { method: 'POST', path: '/api/v1/leads', desc: 'Añadir un lead.' },
      { method: 'GET', path: '/api/v1/leads/{leadId}', desc: 'Detalle por ID.' },
      {
        method: 'PATCH',
        path: '/api/v1/leads/{leadId}',
        desc: 'Cambiar etapa o responsable.',
      },
      {
        method: 'POST',
        path: '/api/v1/leads/{leadId}/notes',
        desc: 'Añadir nota idempotente.',
      },
      {
        method: 'GET',
        path: '/api/v1/companies/{domain}',
        desc: 'Ficha completa de marca.',
      },
      {
        method: 'GET',
        path: '/api/v1/companies/{domain}/dossier',
        desc: 'Dossier para LLM.',
      },
      {
        method: 'GET',
        path: '/api/v1/companies/{domain}/brief',
        desc: 'Prompt del brief.',
      },
      {
        method: 'POST',
        path: '/api/v1/companies/{domain}/scans',
        desc: 'Lanzar scan idempotente.',
      },
      { method: 'POST', path: '/api/v1/notes', desc: 'Ruta compatible para notas.' },
      {
        method: 'POST',
        path: '/api/v1/signals',
        desc: 'Registrar señal con evidencia.',
      },
    ],
    safety: {
      outbound_messages_require_human: true,
      linkedin_browser_automation_allowed: false,
      linkedin_scraping_allowed: false,
    },
  });
}
