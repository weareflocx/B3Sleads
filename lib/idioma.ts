// En qué idioma se escribe a una empresa, según su país.
//
// Antes eran dos reglas distintas: el redactor usaba /spain|españa|es\b/ sobre
// el país en minúsculas, y "united stat-ES", "wal-ES", "philippin-ES" o
// "united arab emirat-ES" casaban con el `es\b`, así que salían borradores en
// español a empresas de EE. UU. El nocturno solo miraba "spain" y dejaba en
// inglés a México o Argentina. Ahora se compara la palabra entera o el código
// ISO, y los dos caminos usan esta función.

const HISPANOS = new Set([
  'spain', 'españa', 'espana', 'es', 'esp',
  'mexico', 'méxico', 'mx', 'mex',
  'argentina', 'ar', 'arg',
  'colombia', 'co', 'col',
  'chile', 'cl', 'chl',
  'peru', 'perú', 'pe', 'per',
  'uruguay', 'uy', 'ury',
  'paraguay', 'py', 'pry',
  'bolivia', 'bo', 'bol',
  'ecuador', 'ec', 'ecu',
  'venezuela', 've', 'ven',
  'guatemala', 'gt', 'gtm',
  'honduras', 'hn', 'hnd',
  'nicaragua', 'ni', 'nic',
  'panama', 'panamá', 'pa', 'pan',
  'cuba', 'cu', 'cub',
  'dominicana', 'do', 'dom',
  'salvador', 'sv', 'slv',
  'rica', 'cr', 'cri',
]);

export type Idioma = 'es' | 'en';

export function idiomaDePais(pais: string | null | undefined): Idioma {
  const texto = (pais ?? '').trim().toLowerCase();
  if (!texto) return 'en';
  if (HISPANOS.has(texto)) return 'es';
  // "Madrid, Spain", "Costa Rica", "República Dominicana": vale cualquier
  // palabra del país, nunca un trozo de palabra. Los códigos de dos letras
  // solo cuentan si son TODO el campo: "co" o "pe" sueltos dentro de una
  // frase no dicen nada.
  const palabras = texto.split(/[^\p{L}]+/u).filter((p) => p.length > 3);
  return palabras.some((p) => HISPANOS.has(p)) ? 'es' : 'en';
}
