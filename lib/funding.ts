// Importe de una ronda. En la BD conviven dos representaciones:
//  - `amount`: la cadena que se enseña y que ya usan el pitch y los prompts
//    ("6M€"). Es lo que había antes y no se rompe.
//  - `amount_eur`: el importe normalizado en euros. Es lo que permitirá
//    ordenar y sumar rondas (ranking de VC, tamaño medio de ticket).

export type AmountUnit = 'K' | 'M';

export interface AmountParts {
  value: string; // lo que se teclea, sin separadores
  unit: AmountUnit;
}

const UNIT_FACTOR: Record<AmountUnit, number> = { K: 1_000, M: 1_000_000 };

// "6M€", "2.4 M EUR", "750K" → { value, unit }. Si no hay nada legible,
// devuelve vacío en vez de inventarse un número.
export function parseAmount(raw: unknown): AmountParts {
  if (typeof raw !== 'string' || !raw.trim()) return { value: '', unit: 'M' };
  const m = raw.replace(',', '.').match(/(\d+(?:\.\d+)?)\s*([KkMm])?/);
  if (!m) return { value: '', unit: 'M' };
  const unit = (m[2]?.toUpperCase() as AmountUnit) || 'M';
  return { value: m[1], unit };
}

export function formatAmount(value: string, unit: AmountUnit): string | null {
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Sin ceros de más: 6 en vez de 6.0
  return `${String(n)}${unit}€`;
}

export function amountToEur(value: string, unit: AmountUnit): number | null {
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * UNIT_FACTOR[unit]);
}

// Lista de inversores desde el input de texto separado por comas.
export function parseInvestors(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  if (typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Fecha ISO → valor para <input type="date"> sin desfase de zona horaria.
export function dateInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
