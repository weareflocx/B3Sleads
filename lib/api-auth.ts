// Autenticación de la API pública de B3S Leads (/api/v1): la puerta por la
// que entran los agentes (Hermes, OpenClaw…) sin sesión de navegador.
//
// B3SLEADS_API_KEYS lleva las claves separadas por comas, cada una con el
// nombre del agente delante: "hermes:sk_xxx,openclaw:sk_yyy". El nombre es lo
// que firma cada acción (notas, señales), así que una clave por agente: si un
// día hay que revocar a uno, se quita su entrada y los demás siguen.
import { timingSafeEqual } from 'node:crypto';

export interface ApiAgent {
  name: string;
}

function parseKeys(): { name: string; key: string }[] {
  const raw = process.env.B3SLEADS_API_KEYS?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const i = entry.indexOf(':');
      return i > 0
        ? { name: entry.slice(0, i).trim(), key: entry.slice(i + 1).trim() }
        : { name: 'agente', key: entry };
    })
    .filter((e) => e.key.length >= 16); // una clave corta no es una clave
}

// Comparación en tiempo constante: no filtrar por timing cuántos caracteres
// coinciden. Se iguala longitud con un hash implícito vía padding.
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// Devuelve el agente autenticado o null. Acepta "Authorization: Bearer <key>"
// (estándar) y "x-api-key: <key>" (comodidad para agentes).
export function apiAgent(req: Request): ApiAgent | null {
  const auth = req.headers.get('authorization') ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const candidate = bearer || (req.headers.get('x-api-key') ?? '').trim();
  if (!candidate) return null;
  for (const { name, key } of parseKeys()) {
    if (safeEqual(candidate, key)) return { name };
  }
  return null;
}

export function apiConfigured(): boolean {
  return parseKeys().length > 0;
}

// Respuesta 401 homogénea de toda la API.
export function unauthorized(): Response {
  return Response.json(
    {
      error: 'No autorizado. Manda tu clave en "Authorization: Bearer <key>".',
      docs: '/api/v1',
    },
    { status: 401 },
  );
}
