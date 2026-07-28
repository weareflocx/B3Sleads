// Términos cortos de un componente ("Competitivo · Directo · Físico").
//
// El Scanner NO los devuelve: no están en el JSON de la API ni en el informe
// markdown; el informe original los produce al renderizar. Aquí se destilan
// del texto que el propio Scanner sí da (su lectura y lo que detectó), así que
// no se inventa nada: se resume lo que ya dijo.
//
// Se cachean por scan y dimensión. Un scan es inmutable, así que se genera una
// vez por componente y ya no se vuelve a pagar.
import { unstable_cache } from 'next/cache';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

export interface ComponentTerms {
  terms: string[];
  // El componente no se detectó: los términos salen de la lectura del Scanner
  // sobre lo que la marca hace implícitamente. Hay que decirlo en la UI.
  implicit: boolean;
}

async function distill(dimension: string, text: string, implicit: boolean): Promise<string[]> {
  if (!process.env.ANTHROPIC_API_KEY || text.trim().length < 40) return [];
  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 120,
    system:
      `Destilas el componente "${dimension}" de un análisis de marca en 3 o 4 ` +
      'términos cortos, en español, en Title Case, una o dos palabras cada uno ' +
      '(p. ej. "Competitivo", "Directo", "Físico", "Desafiante"). Son adjetivos ' +
      'o sustantivos de marca, no una frase troceada ni una lista de features. ' +
      'Sal SOLO del texto que te dan: si algo no está ahí, no lo pongas. ' +
      'Responde únicamente con un array JSON de strings.',
    messages: [
      {
        role: 'user',
        content: `${implicit ? '(El componente no se detectó formalmente; destila lo implícito que describe el texto.)\n\n' : ''}${text.slice(0, 1200)}\n\nTérminos (array JSON):`,
      },
    ],
  });
  const block = res.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') return [];
  try {
    const arr = block.text.match(/\[[\s\S]*\]/)?.[0];
    const parsed = arr ? (JSON.parse(arr) as unknown[]) : [];
    return Array.isArray(parsed)
      ? parsed
          .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
          .map((s) => s.trim())
          .filter((s) => s.length <= 28 && s.split(/\s+/).length <= 2)
          .slice(0, 4)
      : [];
  } catch {
    return [];
  }
}

// Cacheado por (scanId, dimensión): el scan no cambia, así que no se regenera.
export function componentTerms(
  scanId: string,
  dimension: string,
  text: string,
  implicit: boolean,
): Promise<string[]> {
  return unstable_cache(
    () => distill(dimension, text, implicit),
    ['component-terms', scanId, dimension],
    { revalidate: false },
  )();
}
