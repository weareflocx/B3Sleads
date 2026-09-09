import { NextRequest, NextResponse } from 'next/server';
import { medirImagen, type MedidaImagen } from '@/lib/imagen';

// El logo de una marca por su dominio, elegido entre varias fuentes y cacheado.
//
// Antes cada tarjeta probaba las fuentes en cascada desde el navegador:
// DuckDuckGo primero, y si no, Google. DuckDuckGo devuelve muchas veces un
// favicon de 16 o 32 píxeles cuando Google tiene uno de 128, y ese orden
// hacía que la mitad de los logos salieran borrosos. Además, cada 404 de la
// cascada ensuciaba la consola y cada tarjeta pagaba dos o tres peticiones a
// dominios externos.
//
// Aquí se piden TODAS las fuentes a la vez, se mide cada imagen por su
// cabecera y gana la mayor. La respuesta se cachea en el CDN una semana, así
// que a partir de la segunda vez el logo no cuesta nada y sale siempre igual.
//
// Fuentes, medidas hoy sobre las 115 marcas del catálogo:
//   · el propio sitio (apple-touch-icon / icon con tamaño): la mejor cuando existe
//   · Google s2 a 128px: 66 de 115 a 128×128
//   · DuckDuckGo ip3: 96 responden, pero muchas a 16 o 32 píxeles
export const runtime = 'nodejs';

const DOMINIO = /^(?=.{3,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const MAX_BYTES = 1_500_000;
// Por debajo de esto es un sello, no un logo: mejor las iniciales.
const MINIMO = 24;

interface Candidata {
  origen: string;
  bytes: Uint8Array;
  medida: MedidaImagen;
}

async function traer(url: string, ms: number): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(ms),
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'image/*,*/*;q=0.8' },
    });
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    return buf.length && buf.length <= MAX_BYTES ? buf : null;
  } catch {
    return null;
  }
}

async function candidata(origen: string, url: string, ms: number): Promise<Candidata | null> {
  const bytes = await traer(url, ms);
  if (!bytes) return null;
  const medida = medirImagen(bytes);
  return medida ? { origen, bytes, medida } : null;
}

// Los iconos que declara la propia web. Solo la cabecera del HTML: con los
// primeros 200 KB basta, y una home de 5 MB no debe costar el logo.
async function iconosDelSitio(dominio: string): Promise<{ url: string; tam: number }[]> {
  try {
    const r = await fetch(`https://${dominio}/`, {
      signal: AbortSignal.timeout(3500),
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'text/html' },
    });
    if (!r.ok || !r.body) return [];
    const reader = r.body.getReader();
    const trozos: Uint8Array[] = [];
    let total = 0;
    while (total < 200_000) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      trozos.push(value);
      total += value.length;
    }
    reader.cancel().catch(() => {});
    const html = new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(trozos));
    const base = r.url || `https://${dominio}/`;
    const out: { url: string; tam: number }[] = [];
    for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
      const tag = m[0];
      const rel = /\brel=["']?([^"'>]+)/i.exec(tag)?.[1]?.toLowerCase() ?? '';
      const href = /\bhref=["']?([^"'\s>]+)/i.exec(tag)?.[1];
      if (!href || !/\bicon\b/.test(rel)) continue;
      const sizes = /\bsizes=["']?(\d+)x(\d+)/i.exec(tag);
      const esApple = rel.includes('apple-touch-icon');
      const esSvg = /\.svg(\?|$)/i.test(href) || /image\/svg/i.test(tag);
      // apple-touch-icon sin tamaño es 180 por convención; un icono sin
      // tamaño es probablemente el favicon pequeño.
      const tam = esSvg ? 1024 : sizes ? Math.min(Number(sizes[1]), Number(sizes[2])) : esApple ? 180 : 32;
      try {
        out.push({ url: new URL(href, base).toString(), tam });
      } catch {
        // href inválido: se ignora
      }
    }
    // Las mayores primero, sin repetir URL. Se prueban dos como mucho.
    const vistas = new Set<string>();
    return out
      .sort((a, b) => b.tam - a.tam)
      .filter((c) => (vistas.has(c.url) ? false : (vistas.add(c.url), true)))
      .filter((c) => c.tam >= MINIMO)
      .slice(0, 2);
  } catch {
    return [];
  }
}

// Cuánto vale una candidata. Cuenta el lado menor; un ICO vale menos que un
// PNG del mismo tamaño porque fuera del navegador (el SVG exportado) no se
// abre en todas partes.
function valor(c: Candidata): number {
  const lado = Math.min(c.medida.ancho, c.medida.alto);
  return c.medida.tipo === 'ico' ? lado * 0.75 : lado;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const dominio = decodeURIComponent(domain).trim().toLowerCase();
  if (!DOMINIO.test(dominio)) {
    return NextResponse.json({ error: 'Dominio no válido' }, { status: 400 });
  }

  const delSitio = iconosDelSitio(dominio).then((iconos) =>
    Promise.all(iconos.map((i) => candidata('sitio', i.url, 3000))),
  );
  // Además de lo que declara el HTML, las rutas por convención: muchos
  // sitios tienen /apple-touch-icon.png sin enlazarlo, y hay webs que no
  // sirven su HTML a un robot pero sí sus imágenes.
  const [sitio, appleTouch, favicon, google, gstatic, ddg] = await Promise.all([
    delSitio,
    candidata('sitio', `https://${dominio}/apple-touch-icon.png`, 3500),
    candidata('sitio', `https://${dominio}/favicon.ico`, 3500),
    candidata('google', `https://www.google.com/s2/favicons?sz=128&domain=${dominio}`, 4000),
    candidata(
      'gstatic',
      `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${dominio}&size=128`,
      4000,
    ),
    candidata('duckduckgo', `https://icons.duckduckgo.com/ip3/${dominio}.ico`, 4000),
  ]);

  const candidatas = [...sitio, appleTouch, favicon, google, gstatic, ddg]
    .filter((c): c is Candidata => c != null)
    .filter((c) => Math.min(c.medida.ancho, c.medida.alto) >= MINIMO)
    .sort((a, b) => valor(b) - valor(a));

  const cabeceras = {
    // Un día en el navegador, una semana en el CDN, y se sirve el viejo
    // mientras se renueva. Un logo cambia poco.
    'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
    'Netlify-CDN-Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=2592000, durable',
  };

  const mejor = candidatas[0];
  if (!mejor) {
    // Sin logo: 204 y no 404. La imagen no carga igual (el <img> dispara
    // onError y quedan las iniciales), pero un 404 pinta un error en la
    // consola por cada marca sin logo y eso entierra los errores de verdad.
    // Caché corta, para que un sitio nuevo se recoja en una hora.
    return new NextResponse(null, {
      status: 204,
      headers: { ...cabeceras, 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
    });
  }

  return new NextResponse(Buffer.from(mejor.bytes), {
    status: 200,
    headers: {
      ...cabeceras,
      'Content-Type': mejor.medida.contentType,
      'Content-Length': String(mejor.bytes.length),
      'X-Logo-Origen': `${mejor.origen} ${mejor.medida.ancho}x${mejor.medida.alto}`,
      // Se sirve como imagen y nada más: un SVG ajeno no ejecuta nada.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
