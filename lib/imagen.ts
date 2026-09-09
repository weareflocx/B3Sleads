// Qué es y cuánto mide una imagen, leyendo solo su cabecera. Sirve para
// elegir el mejor logo entre varias fuentes sin decodificar nada: un favicon
// de 16×16 estirado a 40 píxeles se ve peor que unas iniciales.
export type TipoImagen = 'png' | 'jpg' | 'gif' | 'webp' | 'ico' | 'svg';

export interface MedidaImagen {
  tipo: TipoImagen;
  ancho: number;
  alto: number;
  contentType: string;
}

const CONTENT_TYPE: Record<TipoImagen, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
};

export function medirImagen(buf: Uint8Array): MedidaImagen | null {
  const b = buf;
  const n = b.length;
  const u16le = (i: number) => b[i] | (b[i + 1] << 8);
  const u32be = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const u32le = (i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
  const listo = (tipo: TipoImagen, ancho: number, alto: number) =>
    ancho > 0 && alto > 0 ? { tipo, ancho, alto, contentType: CONTENT_TYPE[tipo] } : null;

  if (n >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return listo('png', u32be(16), u32be(20));
  }
  if (n >= 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return listo('gif', u16le(6), u16le(8));
  }
  if (n >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    // JPEG: se recorren los segmentos hasta un SOF, que lleva las medidas.
    let i = 2;
    while (i + 9 < n) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = (b[i + 2] << 8) | b[i + 3];
      const esSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (esSOF) return listo('jpg', (b[i + 7] << 8) | b[i + 8], (b[i + 5] << 8) | b[i + 6]);
      i += 2 + len;
    }
    return null;
  }
  if (n >= 30 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) {
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (chunk === 'VP8 ') return listo('webp', u16le(26) & 0x3fff, u16le(28) & 0x3fff);
    if (chunk === 'VP8L') {
      const bits = u32le(21);
      return listo('webp', (bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
    }
    if (chunk === 'VP8X') {
      return listo('webp', 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), 1 + (b[27] | (b[28] << 8) | (b[29] << 16)));
    }
    return null;
  }
  if (n >= 6 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) {
    // ICO: varias imágenes dentro; cuenta la mayor. 0 significa 256.
    const cuantas = u16le(4);
    let mejor = 0;
    for (let k = 0; k < cuantas && 6 + k * 16 + 2 <= n; k++) {
      const w = b[6 + k * 16] || 256;
      const h = b[7 + k * 16] || 256;
      mejor = Math.max(mejor, Math.min(w, h));
    }
    return listo('ico', mejor, mejor);
  }
  // SVG: texto. Se mira el principio por si lleva BOM o una declaración XML.
  const cabeza = new TextDecoder('utf-8', { fatal: false }).decode(b.subarray(0, Math.min(n, 512))).trimStart();
  if (cabeza.startsWith('<svg') || (cabeza.startsWith('<?xml') && cabeza.includes('<svg'))) {
    // Vectorial: escala a cualquier tamaño. Se le da una medida grande para
    // que gane a cualquier mapa de bits.
    return { tipo: 'svg', ancho: 1024, alto: 1024, contentType: CONTENT_TYPE.svg };
  }
  return null;
}
