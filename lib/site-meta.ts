// Bio automática al dar de alta una marca: la meta descripción de su web,
// que casi siempre es la misma frase que ponen en LinkedIn. Es lo único que
// se puede extraer sin tocar LinkedIn (spec §9: allí nada programático).
//
// Mejor esfuerzo: si la web es una SPA sin metas o bloquea robots, se
// devuelve null y la bio queda para rellenar a mano. Nunca rompe el alta.

function decode(t: string): string {
  return t
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCodePoint(Number(n));
      } catch {
        return ' ';
      }
    })
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function metaContent(html: string, name: string): string | null {
  // El orden de atributos varía: <meta name=… content=…> o al revés.
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]?.trim()) return decode(m[1]);
  }
  return null;
}

export async function fetchSiteDescription(domain: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4_500);
  try {
    const res = await fetch(`https://${domain}`, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        'Accept-Language': 'es,en;q=0.8',
      },
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 200_000);
    const description =
      metaContent(html, 'description') ??
      metaContent(html, 'og:description') ??
      metaContent(html, 'twitter:description');
    if (!description || description.length < 20) return null;
    return description.slice(0, 320);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
