// Vocabulario de sectores. Tags limitados y reutilizables para poder filtrar
// marcas más adelante: una lista curada base (config/sectors.json, editable) a
// la que se suman los sectores que ya se han usado, para que "añadir uno nuevo"
// pase a formar parte del vocabulario sin tocar el config.
import fs from 'node:fs';
import path from 'node:path';

export function curatedSectors(): string[] {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'config', 'sectors.json'), 'utf-8');
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

// Sectores guardados en un campo `sector` (unidos por " · " o comas antiguas).
export function parseSectorList(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(/\s*·\s*|\s*,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Une curados + en uso sin duplicar (case-insensitive); la primera aparición
// gana el casing, así que los curados imponen su forma canónica.
export function mergeSectorVocabulary(inUse: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...curatedSectors(), ...inUse]) {
    const key = s.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(s);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, 'es'));
}
