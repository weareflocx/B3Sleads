// El Eclipse Scan: la versión de captación del análisis B3S. De un scan
// completo se destilan tres cosas que un founder puede leer en diez segundos:
// el score, lo que brilla y lo que se eclipsa. El análisis entero no se
// regala aquí: es lo que llega después por email y lo que abre conversación.
import { storedScanReport, type ScanDimension } from './scan-report';
import { cardBand, cardSentence, pareceCaptura } from './brand-card';
import { canonDimension, DIMENSION_LABELS } from './scan-versions';

export interface EclipseResult {
  score: number;
  banda: string;
  brilla: { label: string; frase: string };
  eclipsa: { label: string; frase: string };
  demo?: boolean;
}

// Frase de una dimensión, con los mismos filtros de la tarjeta: nada de
// capturas en crudo ni de gritos. Esto se enseña a un desconocido.
// El hallazgo se corta con puntos suspensivos si no cabe, y cortado a media
// idea no dice nada. Estos topes son generosos a propósito: la tarjeta crece
// hacia abajo sin romperse, y el founder prefiere leer la frase entera.
function frase(d: ScanDimension, max = 240): string | null {
  const cita = pareceCaptura(d.quote) ? null : cardSentence(d.quote, max);
  return cita ?? cardSentence(d.analysis, max) ?? cardSentence(d.verdict, max);
}

// Qué dimensión duele más si falta: el porqué antes que el cómo. Es el orden
// del hueco que se cuenta, no el de la rúbrica.
const PESO_HUECO = [
  'purpose',
  'vision',
  'mission',
  'magnetism',
  'brand-idea',
  'personality',
  'values',
  'value-prop',
  'attributes',
];

export function eclipseResultFromRaw(
  raw: Record<string, unknown> | null,
  score: number | null,
): EclipseResult | null {
  if (score == null) return null;
  const report = storedScanReport(raw);
  if (!report) return null;

  const dims = report.dimensions.map((d) => ({ d, key: canonDimension(d.name) }));

  // Lo que brilla: la dimensión detectada con mejor proporción que además
  // tenga una frase limpia que enseñar.
  const detectadas = dims
    .filter(({ d }) => !d.missing && d.score != null && d.score > 0 && d.ratio != null)
    .sort((a, b) => (b.d.ratio ?? 0) - (a.d.ratio ?? 0));
  let brilla: EclipseResult['brilla'] | null = null;
  for (const { d, key } of detectadas) {
    const f = frase(d);
    if (f) {
      brilla = { label: DIMENSION_LABELS[key] ?? d.name, frase: f };
      break;
    }
  }

  // Lo que se eclipsa: primero un hueco de verdad (no detectado), por peso
  // narrativo; si todo se detectó, la dimensión más floja.
  const huecos = dims
    .filter(({ d }) => d.missing || d.score === 0 || d.score == null)
    .sort((a, b) => PESO_HUECO.indexOf(a.key) - PESO_HUECO.indexOf(b.key));
  let eclipsa: EclipseResult['eclipsa'] | null = null;
  if (huecos.length) {
    const { key } = huecos[0];
    eclipsa = {
      label: DIMENSION_LABELS[key] ?? huecos[0].d.name,
      frase: 'Sin rastro en tu huella digital. Quien te descubre hoy no puede leerlo.',
    };
  } else {
    const flojas = [...detectadas].reverse();
    for (const { d, key } of flojas) {
      const f = frase(d, 220);
      if (f) {
        eclipsa = { label: DIMENSION_LABELS[key] ?? d.name, frase: f };
        break;
      }
    }
  }

  if (!brilla || !eclipsa) return null;
  return { score: Math.round(score), banda: cardBand(score), brilla, eclipsa };
}

// Resultado de demostración para desarrollo local, cuando no hay token del
// Scanner. Determinista por dominio (misma marca, mismo resultado) y marcado
// como demo: nunca se hace pasar por un análisis real.
export function demoEclipseResult(domain: string): EclipseResult {
  let h = 0;
  for (const c of domain) h = (h * 31 + c.charCodeAt(0)) % 997;
  const score = 38 + (h % 35); // 38-72: la banda real donde caen las marcas
  const brillan = [
    { label: 'Propuesta de valor', frase: 'Se entiende qué vendes y a quién en la primera pantalla.' },
    { label: 'Atributos', frase: 'Tus atributos son concretos y verificables, no adjetivos de relleno.' },
    { label: 'Personalidad', frase: 'Hay una voz reconocible: no suena a plantilla del sector.' },
  ];
  const eclipsan = [
    { label: 'Visión', frase: 'Sin rastro en tu huella digital. Quien te descubre hoy no puede leerlo.' },
    { label: 'Propósito', frase: 'Tu web cuenta qué haces, pero no por qué importa. Eso te hace intercambiable.' },
    { label: 'Magnetismo', frase: 'La promesa funciona, pero no retiene: falta la historia que haga quedarse.' },
  ];
  return {
    score,
    banda: cardBand(score),
    brilla: brillan[h % brillan.length],
    eclipsa: eclipsan[(h >> 3) % eclipsan.length],
    demo: true,
  };
}

export function normalizarDominio(raw: string): string | null {
  const d = raw
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0];
  // Un dominio de verdad: algo.tld, sin espacios.
  if (!/^[a-z0-9][a-z0-9.-]{1,60}\.[a-z]{2,}$/.test(d)) return null;
  return d;
}

export function emailValido(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim());
}
