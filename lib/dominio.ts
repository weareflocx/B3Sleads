// Un dominio limpio, o null si lo que llega no es un dominio.
//
// Había cinco copias de esta normalización repartidas por la app, y ninguna
// comprobaba el resultado: por una de ellas entró una empresa con dominio
// "vig sec drone", que luego rompía el logo, la ficha y el scan. Acepta
// protocolo, www y ruta; devuelve solo el host, en minúsculas.
export function normalizarDominio(raw: string | null | undefined): string | null {
  const d = (raw ?? '')
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0]
    .replace(/[.,;]+$/, '')
    .trim();
  // Un dominio de verdad: etiquetas válidas, TLD alfabético, sin espacios.
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/.test(d)) {
    return null;
  }
  return d;
}
