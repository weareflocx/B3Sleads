// Sondeo del cruce de vocabulario (fase 7 de Battle Cards).
//
// NO es la función: es la comprobación previa de que el material da para
// hacerla. Imprime por consola los términos que comparten dos o más marcas de
// un grupo, con sus citas, para poder mirarlos y decidir. Si sale ruido, se
// dice y se replantea antes de construir nada.
//
//   npx tsx scripts/spike-vocabulario.mts [grupo]
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Palabras que no dicen nada de una marca por sí solas. En español y en
// italiano, porque el estudio tiene marcas de los dos mercados.
const VACIAS = new Set(`
a al algo ante antes aqui asi aun cada como con contra cual cuando de del desde donde dos e el ella
ellos en entre era eres es esa ese eso esta estan este esto ha hace hacia han hasta hay la las le
les lo los mas me mi mucho muy no nos o os otra otro para pero poco por porque que se sea segun ser
si sin sobre solo son su sus tambien tan te tener ti tiene todo todos tu un una uno unos ya y
e il lo la i gli le di a da in con su per tra fra che non piu anche come dove quando questo questa
sono ed nel della delle dei degli alla alle nella nelle un uno una del al
the and for with from that this you your our are was were has have will can all any
`.split(/\s+/).filter(Boolean));

// Genéricos de estas categorías: aparecen en todas y no distinguen a nadie.
const GENERICAS = new Set(`
servicio servicios cliente clientes empresa empresas producto productos oferta ofertas
web pagina sitio marca marcas usuario usuarios contenido informacion
energia luz gas fibra movil internet tarifa tarifas precio precios
`.split(/\s+/).filter(Boolean));

// Trozos de dirección y de marcado que sobreviven a la limpieza.
const URLESCAS = new Set('https http www com net org es it uk html php index png jpg svg assets img'.split(' '));

const limpia = (s: string) =>
  s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function ngramas(texto: string, min = 2, max = 4): Set<string> {
  const pal = limpia(texto).split(' ').filter(Boolean);
  const out = new Set<string>();
  for (let n = min; n <= max; n++) {
    for (let i = 0; i + n <= pal.length; i++) {
      const trozo = pal.slice(i, i + n);
      // Un n-grama que empieza o acaba en palabra vacía es un recorte, no una
      // expresión. Y si TODO son vacías o genéricas, no dice nada.
      if (VACIAS.has(trozo[0]) || VACIAS.has(trozo[n - 1])) continue;
      if (trozo.every((p) => VACIAS.has(p) || GENERICAS.has(p))) continue;
      if (trozo.some((p) => p.length < 3)) continue;
      // Restos de URL y de marcado: aparecen en todas y no son lenguaje.
      if (trozo.some((p) => URLESCAS.has(p))) continue;
      out.add(trozo.join(' '));
    }
  }
  return out;
}

const grupoPedido = process.argv[2] ?? 'Multinivel';

const { data: st } = await sb.from('studies').select('grupos').single();
const grupo = (st as any).grupos.find((g: any) => g.nombre === grupoPedido);
if (!grupo) { console.error('Grupo no encontrado:', grupoPedido); process.exit(1); }

const { data: comps } = await sb.from('companies').select('id,domain,name').in('domain', grupo.dominios);
const { data: scans } = await sb.from('scans').select('company_id,score,result_raw')
  .in('company_id', (comps ?? []).map((c: any) => c.id))
  .eq('status', 'ready').not('score', 'is', null).order('created_at');

// Una entrada por marca: su último scan publicado.
const ultimo = new Map<string, any>();
for (const s of scans ?? []) ultimo.set(s.company_id, s);

const porTermino = new Map<string, Map<string, string>>(); // termino -> marca -> cita
let marcasConTexto = 0;

for (const c of comps ?? []) {
  const s = ultimo.get(c.id);
  if (!s) continue;
  const raw = s.result_raw as any;
  // SOLO lo literal. detected_content NO vale: el sondeo lo incluía y sacaba
  // "idea central" o "se define por una cultura" compartidos por media
  // categoría, que no es vocabulario de las marcas sino la prosa con la que
  // el Scanner las describe. Cruzar eso mide al Scanner, no al mercado.
  const fragmentos: string[] = [];
  for (const comp of raw?.components ?? []) {
    for (const t of comp.tiles ?? []) if (typeof t.evidencia === 'string') fragmentos.push(t.evidencia);
    for (const r of comp.evidence_refs ?? []) if (typeof r.snippet === 'string') fragmentos.push(r.snippet);
  }
  if (!fragmentos.length) continue;
  marcasConTexto++;

  const vistos = new Set<string>();
  for (const f of fragmentos) {
    for (const g of ngramas(f)) {
      if (vistos.has(g)) continue;
      vistos.add(g);
      if (!porTermino.has(g)) porTermino.set(g, new Map());
      // Se guarda la frase de donde salió, recortada.
      porTermino.get(g)!.set(c.domain, f.replace(/\s+/g, ' ').trim().slice(0, 90));
    }
  }
}

// ---------- contraste contra el resto del corpus ----------
//
// Una lista de stopwords nunca acaba: "more than", "people who" o "long term"
// no son código de categoría, son inglés. Lo que sí los separa es dónde
// aparecen. Un término propio de la categoría se concentra en ella; una
// muletilla está en todas partes.
//
// Así que se cuenta cada término en las marcas de FUERA del grupo y se ordena
// por la diferencia. Sin diccionarios y sin mantenimiento.
const dentro = new Set((comps ?? []).map((c: any) => c.id));
const { data: fuera } = await sb.from('scans').select('company_id,result_raw')
  .eq('status', 'ready').not('score', 'is', null).limit(400);

const marcasFuera = new Map<string, any>();
for (const s of fuera ?? []) if (!dentro.has(s.company_id)) marcasFuera.set(s.company_id, s);

const frecuenciaFuera = new Map<string, number>();
for (const [, s] of marcasFuera) {
  const raw = s.result_raw as any;
  const frag: string[] = [];
  for (const comp of raw?.components ?? []) {
    for (const t of comp.tiles ?? []) if (typeof t.evidencia === 'string') frag.push(t.evidencia);
    for (const r of comp.evidence_refs ?? []) if (typeof r.snippet === 'string') frag.push(r.snippet);
  }
  const vistos = new Set<string>();
  for (const f of frag) for (const g of ngramas(f)) vistos.add(g);
  for (const g of vistos) frecuenciaFuera.set(g, (frecuenciaFuera.get(g) ?? 0) + 1);
}
const totalFuera = marcasFuera.size || 1;

const compartidos = [...porTermino.entries()]
  .filter(([, marcas]) => marcas.size >= 2)
  .map(([t, marcas]) => {
    const dentroPct = marcas.size / (marcasConTexto || 1);
    const fueraPct = (frecuenciaFuera.get(t) ?? 0) / totalFuera;
    return { t, marcas, dentroPct, fueraPct, delta: dentroPct - fueraPct };
  })
  .sort((a, b) => b.delta - a.delta)
  .map((x) => [x.t, x.marcas, x] as const);

console.log(`\nGRUPO ${grupoPedido} · ${comps?.length ?? 0} marcas, ${marcasConTexto} con texto literal`);
console.log(`n-gramas distintos: ${porTermino.size} · compartidos por 2+ marcas: ${compartidos.length}\n`);

console.log(`corpus de contraste: ${marcasFuera.size} marcas de fuera del grupo\n`);
console.log('  grupo   fuera   término');
for (const [termino, marcas, x] of compartidos.slice(0, 22)) {
  const g = `${marcas.size}/${marcasConTexto}`.padStart(6);
  const f = `${Math.round(x.fueraPct * 100)}%`.padStart(5);
  console.log(`${g}  ${f}   "${termino}"`);
}

const reparto = new Map<number, number>();
for (const [, m] of porTermino) reparto.set(m.size, (reparto.get(m.size) ?? 0) + 1);
console.log('\nreparto (marcas que comparten -> cuantos terminos):',
  [...reparto.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' '));
