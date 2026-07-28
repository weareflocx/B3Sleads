import { API_LEAD_STAGES } from './contracts';

const bearerSecurity = [{ bearerAuth: [] }];
const compatibleError = {
  description: 'Error compatible: error es texto y code/request_id son estables.',
  content: {
    'application/json': { schema: { $ref: '#/components/schemas/CompatibleError' } },
  },
};
const envelopeError = {
  description: 'Error con envelope estable y request_id.',
  content: {
    'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } },
  },
};
const commonCompatibleErrors = {
  '400': compatibleError,
  '401': compatibleError,
  '403': compatibleError,
  '409': compatibleError,
  '422': compatibleError,
  '429': compatibleError,
  '503': compatibleError,
};

export const agentOpenApi = {
  openapi: '3.1.0',
  info: {
    title: 'B3S Leads Agent API',
    version: '1.1.0',
    description:
      'API server-to-server para agentes LLM. Mantiene las respuestas v1 consumidas por Hermes y añade scopes, auditoría, idempotencia y endpoints de descubrimiento. El contacto con founders sigue siendo humano.',
  },
  servers: [{ url: '/api/v1' }],
  tags: [
    { name: 'Discovery' },
    { name: 'Leads' },
    { name: 'Companies' },
    { name: 'Notes' },
    { name: 'Signals' },
    { name: 'Scans' },
  ],
  'x-agent-scopes': [
    'leads:read',
    'leads:write',
    'notes:write',
    'signals:write',
    'scans:write',
  ],
  'x-agent-safety': {
    outbound_messages_require_human: true,
    linkedin_browser_automation_allowed: false,
    linkedin_scraping_allowed: false,
  },
  paths: {
    '/': {
      get: {
        tags: ['Discovery'],
        operationId: 'discoverAgentApi',
        summary: 'Descubre endpoints, scopes, cuotas y reglas',
        security: [],
        responses: {
          '200': {
            description: 'Documento JSON de descubrimiento sin envelope.',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
        },
      },
    },
    '/health': {
      get: {
        tags: ['Discovery'],
        operationId: 'getAgentApiHealth',
        summary: 'Comprueba el servicio sin autenticación',
        security: [],
        responses: {
          '200': {
            description: 'Estado dentro de un envelope data.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/SuccessEnvelope' } },
            },
          },
        },
      },
    },
    '/leads': {
      get: {
        tags: ['Leads'],
        operationId: 'listLeads',
        summary: 'Lista la cola ordenada por radar',
        description: 'Scope `leads:read`. Respuesta compatible `{count, leads, pagination}`.',
        security: bearerSecurity,
        parameters: [
          {
            name: 'state',
            in: 'query',
            schema: { type: 'string', enum: ['activo', 'reserva', 'no_escaneable'] },
          },
          { name: 'stage', in: 'query', schema: { $ref: '#/components/schemas/LeadStage' } },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 500, default: 200 },
          },
          {
            name: 'offset',
            in: 'query',
            schema: { type: 'integer', minimum: 0, maximum: 100000, default: 0 },
          },
        ],
        responses: {
          '200': {
            description: 'Página compatible de leads.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/LeadList' } },
            },
          },
          ...commonCompatibleErrors,
        },
      },
      post: {
        tags: ['Leads'],
        operationId: 'createLead',
        summary: 'Crea o deduplica un lead',
        description:
          'Scope `leads:write`. `Idempotency-Key` es opcional por compatibilidad y recomendable en todos los reintentos.',
        security: bearerSecurity,
        parameters: [{ $ref: '#/components/parameters/OptionalIdempotencyKey' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  linkedin: { type: 'string', maxLength: 500 },
                  name: { type: 'string', maxLength: 200 },
                  domain: { type: 'string', maxLength: 253 },
                  note: { type: 'string', maxLength: 5000 },
                },
                anyOf: [{ required: ['linkedin'] }, { required: ['domain'] }],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Resultado del alta/dedupe.', content: { 'application/json': {} } },
          ...commonCompatibleErrors,
        },
      },
    },
    '/leads/{leadId}': {
      get: {
        tags: ['Leads'],
        operationId: 'getLead',
        summary: 'Obtiene el detalle seguro de un lead',
        description: 'Scope `leads:read`. No expone email ni teléfono del contacto.',
        security: bearerSecurity,
        parameters: [{ $ref: '#/components/parameters/LeadId' }],
        responses: {
          '200': {
            description: 'Detalle dentro de un envelope data.',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/SuccessEnvelope' } },
            },
          },
          '401': envelopeError,
          '403': envelopeError,
          '404': envelopeError,
          '429': envelopeError,
          '503': envelopeError,
        },
      },
      patch: {
        tags: ['Leads'],
        operationId: 'updateLead',
        summary: 'Cambia etapa o responsable',
        description:
          'Scope `leads:write`. Acepta `discardReason` legado y `discard_reason` nuevo.',
        security: bearerSecurity,
        parameters: [{ $ref: '#/components/parameters/LeadId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  stage: { $ref: '#/components/schemas/LeadStage' },
                  discardReason: { type: 'string' },
                  discard_reason: { type: 'string' },
                  owner_email: { type: ['string', 'null'], format: 'email' },
                },
                anyOf: [{ required: ['stage'] }, { required: ['owner_email'] }],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Respuesta compatible `{ok, stage, owner_email}`.',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          ...commonCompatibleErrors,
        },
      },
    },
    '/leads/{leadId}/notes': {
      post: {
        tags: ['Notes'],
        operationId: 'createLeadNote',
        summary: 'Añade una nota idempotente',
        description: 'Scope `notes:write`. Esta ruta nueva exige `Idempotency-Key`.',
        security: bearerSecurity,
        parameters: [
          { $ref: '#/components/parameters/LeadId' },
          { $ref: '#/components/parameters/IdempotencyKey' },
        ],
        requestBody: { $ref: '#/components/requestBodies/Note' },
        responses: {
          '200': {
            description: 'Nota previamente creada.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } },
          },
          '201': {
            description: 'Nota creada.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } },
          },
          '400': envelopeError,
          '401': envelopeError,
          '403': envelopeError,
          '404': envelopeError,
          '409': envelopeError,
          '422': envelopeError,
          '429': envelopeError,
          '503': envelopeError,
        },
      },
    },
    '/companies/{domain}': {
      get: {
        tags: ['Companies'],
        operationId: 'getCompany',
        summary: 'Obtiene ficha, radar, scan, señales y bitácora',
        description: 'Scope `leads:read`. La ficha no expone email ni teléfono.',
        security: bearerSecurity,
        parameters: [{ $ref: '#/components/parameters/Domain' }],
        responses: {
          '200': { description: 'Ficha compatible.', content: { 'application/json': {} } },
          ...commonCompatibleErrors,
        },
      },
    },
    '/companies/{domain}/dossier': {
      get: {
        tags: ['Companies'],
        operationId: 'getCompanyDossier',
        summary: 'Obtiene el dossier textual para un LLM',
        security: bearerSecurity,
        parameters: [{ $ref: '#/components/parameters/Domain' }],
        responses: {
          '200': { description: '`{domain, dossier}`.', content: { 'application/json': {} } },
          ...commonCompatibleErrors,
        },
      },
    },
    '/companies/{domain}/brief': {
      get: {
        tags: ['Companies'],
        operationId: 'getCompanyBrief',
        summary: 'Obtiene el prompt maestro del brief',
        security: bearerSecurity,
        parameters: [{ $ref: '#/components/parameters/Domain' }],
        responses: {
          '200': { description: '`{domain, prompt}`.', content: { 'application/json': {} } },
          ...commonCompatibleErrors,
        },
      },
    },
    '/companies/{domain}/scans': {
      post: {
        tags: ['Scans'],
        operationId: 'launchCompanyScan',
        summary: 'Lanza un scan idempotente',
        description: 'Scope `scans:write`. Exige `Idempotency-Key`.',
        security: bearerSecurity,
        parameters: [
          { $ref: '#/components/parameters/Domain' },
          { $ref: '#/components/parameters/IdempotencyKey' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { lead_id: { type: 'string', minLength: 1 } },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Scan previo/activo reutilizado.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } },
          },
          '202': {
            description: 'Scan lanzado.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } },
          },
          '400': envelopeError,
          '401': envelopeError,
          '403': envelopeError,
          '404': envelopeError,
          '409': envelopeError,
          '422': envelopeError,
          '429': envelopeError,
          '503': envelopeError,
        },
      },
    },
    '/notes': {
      post: {
        tags: ['Notes'],
        operationId: 'createCompatibleNote',
        summary: 'Añade una nota por domain o leadId',
        description:
          'Scope `notes:write`. `Idempotency-Key` es opcional por compatibilidad y recomendable.',
        security: bearerSecurity,
        parameters: [{ $ref: '#/components/parameters/OptionalIdempotencyKey' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                allOf: [
                  { $ref: '#/components/schemas/NoteInput' },
                  { anyOf: [{ required: ['domain'] }, { required: ['leadId'] }] },
                ],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Nota creada o reutilizada.', content: { 'application/json': {} } },
          ...commonCompatibleErrors,
        },
      },
    },
    '/signals': {
      post: {
        tags: ['Signals'],
        operationId: 'createSignal',
        summary: 'Registra una señal con evidencia y fecha',
        description:
          'Scope `signals:write`. `Idempotency-Key` es opcional por compatibilidad y recomendable.',
        security: bearerSecurity,
        parameters: [{ $ref: '#/components/parameters/OptionalIdempotencyKey' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['domain', 'type', 'occurredAt', 'evidence'],
                properties: {
                  domain: { type: 'string' },
                  type: { type: 'string' },
                  occurredAt: { type: 'string', format: 'date' },
                  evidence: { type: 'string', minLength: 3, maxLength: 10000 },
                  sourceUrl: { type: 'string', format: 'uri' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Señal creada o reutilizada.', content: { 'application/json': {} } },
          ...commonCompatibleErrors,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'B3S agent key',
        description:
          'Clave server-to-server. `x-api-key` se acepta temporalmente para clientes v1.',
      },
    },
    parameters: {
      LeadId: {
        name: 'leadId',
        in: 'path',
        required: true,
        schema: { type: 'string', minLength: 1 },
      },
      Domain: {
        name: 'domain',
        in: 'path',
        required: true,
        schema: { type: 'string', minLength: 1, maxLength: 253 },
      },
      IdempotencyKey: {
        name: 'Idempotency-Key',
        in: 'header',
        required: true,
        schema: {
          type: 'string',
          minLength: 8,
          maxLength: 200,
          pattern: '^[a-zA-Z0-9._:-]+$',
        },
      },
      OptionalIdempotencyKey: {
        name: 'Idempotency-Key',
        in: 'header',
        required: false,
        description: 'Recomendada para reintentos seguros.',
        schema: {
          type: 'string',
          minLength: 8,
          maxLength: 200,
          pattern: '^[a-zA-Z0-9._:-]+$',
        },
      },
    },
    requestBodies: {
      Note: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/NoteInput' } },
        },
      },
    },
    schemas: {
      SuccessEnvelope: {
        type: 'object',
        required: ['data'],
        properties: { data: {}, meta: { type: 'object', additionalProperties: true } },
      },
      CompatibleError: {
        type: 'object',
        required: ['error', 'code', 'request_id'],
        properties: {
          error: { type: 'string' },
          code: { type: 'string' },
          details: {},
          request_id: { type: 'string' },
        },
      },
      ErrorEnvelope: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message', 'request_id'],
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: {},
              request_id: { type: 'string' },
            },
          },
        },
      },
      LeadStage: { type: 'string', enum: API_LEAD_STAGES },
      Pagination: {
        type: 'object',
        required: ['total', 'limit', 'offset', 'has_more'],
        properties: {
          total: { type: 'integer' },
          limit: { type: 'integer' },
          offset: { type: 'integer' },
          has_more: { type: 'boolean' },
        },
      },
      LeadList: {
        type: 'object',
        required: ['count', 'leads', 'pagination'],
        properties: {
          count: { type: 'integer' },
          leads: { type: 'array', items: { type: 'object' } },
          pagination: { $ref: '#/components/schemas/Pagination' },
        },
      },
      NoteInput: {
        type: 'object',
        required: ['body'],
        properties: {
          domain: { type: 'string' },
          leadId: { type: 'string' },
          body: { type: 'string', minLength: 1, maxLength: 10000 },
          kind: {
            type: 'string',
            enum: ['note', 'call_report', 'insight'],
            default: 'note',
          },
        },
      },
    },
  },
} as const;
