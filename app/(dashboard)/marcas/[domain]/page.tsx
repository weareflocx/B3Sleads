import { PAGE_XL } from '@/app/(dashboard)/page-width';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCorpusBrand, getCorpusBrands, getEstudio, getStartups } from '@/lib/data';
import { companyLabel } from '@/lib/types';
import {
  compara,
  fusionaNotas,
  huecosDeCategoria,
  parseGrupos,
  perfilDeMarca,
  posicionMadurez,
  ultimoPublicable,
  visibles,
  type PerfilMarca,
} from '@/lib/benchmark';
import { CompanyLogo } from '../../company-logo';
import { type DatosMarca } from './grupo-estudio';
import { ROL_LABEL, verificacionDerivada } from '@/lib/battle-cards';
import { Matriz } from './matriz';
import { EstudioProvider } from './estudio-estado';
import { GruposDelEstudio } from './grupos-del-estudio';
import { TablaClasificacion } from './tabla-clasificacion';
import { SeccionEjes } from './seccion-ejes';
import { Mapa, type PuntoMapa } from './mapa';
import { PestanasEstudio } from './pestanas-estudio';
import { Vocabulario } from './vocabulario';

export const dynamic = 'force-dynamic';

// El estudio de marca: donde una marca deja de ser un lead y pasa a ser un
// proyecto. La ficha responde "¿le escribo?"; esta página responde "¿qué le
// contamos?". Por eso vive en otra ruta y no en otra pestaña de la ficha.
//
// El estudio se define en la URL (?g=Grupo:dominio,dominio;Otro:...). Sin
// tabla nueva: se comparte pegando el enlace y se itera sobre el formato sin
// migraciones. Las marcas del estudio salen del corpus, pasen o no por leads.
type Props = {
  params: Promise<{ domain: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function EstudioPage({ params, searchParams }: Props) {
  const { domain } = await params;
  const dom = decodeURIComponent(domain);
  const sp = await searchParams;
  const cliente = await getCorpusBrand(dom);
  if (!cliente) notFound();

  // El estudio guardado es la fuente de verdad. La URL sigue mandando cuando
  // viene explícita, para poder compartir un estado concreto o volver a uno
  // anterior, y al llegar así se guarda: compartir un enlace y abrirlo deja
  // el estudio como lo mandó quien lo compartió.
  const guardado = await getEstudio(cliente.company.id);
  // Las notas nunca viajan en la URL: se funden desde lo guardado, por
  // dominio, para que sigan a la marca aunque cambie de grupo.
  const grupos = fusionaNotas(
    sp.g !== undefined ? parseGrupos(sp.g) : (guardado?.grupos ?? []),
    guardado?.grupos,
  );

  const dominios = grupos.flatMap((g) => g.dominios);
  const [marcas, corpus] = await Promise.all([getCorpusBrands(dominios), getStartups()]);

  const perfilCliente = perfilDeMarca(cliente);
  const nombre = companyLabel(cliente.company.name, cliente.company.domain);
  const porDominio = new Map(marcas.map((m) => [m.company.domain, m]));

  // Los datos del servidor van por dominio y sin orden: la composición del
  // estudio (grupo, posición, ocultas) la lleva el cliente, y así tocarla se
  // ve en el acto en vez de esperar a que el servidor vuelva a pintar.
  const datos: Record<string, DatosMarca> = {};
  for (const d of new Set(dominios)) {
    const m = porDominio.get(d);
    if (!m) {
      datos[d] = {
        domain: d, name: d, logoUrl: null, score: null,
        estado: 'sin-scan', scanId: null, detectados: 0,
        verificacionAuto: 'no_source',
      };
      continue;
    }
    const p = perfilDeMarca(m);
    const ultimo = m.scans[m.scans.length - 1] ?? null;
    const estado: DatosMarca['estado'] = m.activo
      ? 'escaneando'
      : ultimoPublicable(m)
        ? 'listo'
        : ultimo
          ? 'retenido'
          : 'sin-scan';
    datos[d] = {
      domain: d,
      name: p.name,
      logoUrl: m.company.logo_url,
      score: p.score,
      estado,
      scanId: m.activo?.id ?? null,
      detectados: p.detectados,
      // Valor de partida de la verificación. Lo que alguien fije a mano manda
      // sobre esto; guardarlo en la migración habría dejado a las marcas
      // nuevas naciendo en un estado que nadie eligió.
      verificacionAuto: verificacionDerivada({
        conScanPublicable: ultimoPublicable(m) != null,
        conScanRetenido: ultimo != null,
      }),
    };
  }

  // A la comparación van solo las visibles: ocultar una marca la saca de la
  // matriz, de las medias y del hueco de categoría, sin sacarla del grupo.
  const grupitos = grupos.map((g) => ({
    nombre: g.nombre,
    perfiles: visibles(g, guardado?.marcas)
      .map((d) => porDominio.get(d))
      .filter((m): m is NonNullable<typeof m> => Boolean(m && ultimoPublicable(m)))
      .map(perfilDeMarca) as PerfilMarca[],
  }));
  const filas = compara(perfilCliente, grupitos);
  const hayComparables = grupitos.some((g) => g.perfiles.length);
  const huecos = hayComparables ? huecosDeCategoria(filas) : [];

  // El mapa de madurez sale del scan, así que se calcula aquí. Las marcas sin
  // lectura suficiente entran igual pero marcadas: se pintan huecas y no
  // cuentan para leer un cuadrante.
  const puntosMadurez: PuntoMapa[] = [];
  for (const d of new Set(dominios)) {
    const m = porDominio.get(d);
    if (!m || !ultimoPublicable(m)) continue;
    const perfil = perfilDeMarca(m);
    const pos = posicionMadurez(perfil);
    if (!pos) continue;
    const ficha = guardado?.marcas?.[d];
    puntosMadurez.push({
      dominio: d,
      nombre: perfil.name,
      score: perfil.score,
      x: pos.x / 10,
      y: pos.y / 100,
      capa: ficha?.layer ?? null,
      rol: ficha?.role ? ROL_LABEL[ficha.role] : null,
      nota: ficha?.note ?? null,
      flojo: !pos.suficiente,
      motivoFlojo: pos.suficiente
        ? null
        : `lectura insuficiente: ${pos.usadosSignificado} de 3 componentes de significado y ${pos.usadosFuncional} de 2 de lo funcional`,
    });
  }
  const posCliente = posicionMadurez(perfilCliente);
  const clienteMadurez =
    posCliente && posCliente.suficiente ? { x: posCliente.x / 10, y: posCliente.y / 100 } : null;

  const yaElegidas = new Set(dominios);
  const candidatas = corpus
    .filter((x) => x.company && x.company.domain !== dom && !yaElegidas.has(x.company.domain))
    .map((x) => ({ domain: x.company!.domain, name: companyLabel(x.company!.name, x.company!.domain) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className={PAGE_XL}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <CompanyLogo domain={dom} name={nombre} size={54} src={cliente.company.logo_url} />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">Estudio de marca</p>
            <h1 className="text-2xl font-bold tracking-tight">{nombre}</h1>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          {/* B3S es la fuente de los datos; el análisis se escribe en Notion y
              la síntesis en Figma. Por eso exporta y no importa. */}
          <a
            href={`/api/estudio/export/csv?domain=${encodeURIComponent(dom)}${sp.g ? `&g=${encodeURIComponent(sp.g)}` : ''}`}
            className="font-mono text-[11px] uppercase tracking-wider text-[var(--muted)] hover:text-[var(--text)]"
            title="Una fila por marca con score, componentes, clasificación y ejes"
          >
            csv ↓
          </a>
          <a
            href={`/api/estudio/export/json?domain=${encodeURIComponent(dom)}${sp.g ? `&g=${encodeURIComponent(sp.g)}` : ''}`}
            className="font-mono text-[11px] uppercase tracking-wider text-[var(--muted)] hover:text-[var(--text)]"
            title="El estudio entero, para automatizaciones"
          >
            json ↓
          </a>
          {cliente.lead && (
            <Link href={`/companies/${dom}`} className="text-sm text-[var(--muted)] hover:underline">
              ver ficha ↗
            </Link>
          )}
        </div>
      </div>

      {perfilCliente.detectados < 8 && (
        <p className="mt-5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-xs text-[var(--muted)]">
          El scan de {nombre} solo detectó {perfilCliente.detectados} de 10 componentes. Las
          comparaciones de los que faltan no son concluyentes.
        </p>
      )}

      {/* Los grupos, cada uno con sus marcas y su propio alta. Todos comparten
          un solo estado de cliente: sin él, dos acciones seguidas se pisaban. */}
      <EstudioProvider
        dominio={dom}
        inicial={grupos}
        marcasIniciales={guardado?.marcas ?? {}}
        ejesIniciales={guardado?.axes ?? []}
        posicionesIniciales={guardado?.client_positions ?? {}}
        queryInicial={sp.g ?? null}
      >
        <PestanasEstudio
          pestanas={[
            {
              clave: 'montaje',
              etiqueta: 'Montaje',
              nota: `${dominios.length}`,
              contenido: (
                <>
                  <GruposDelEstudio
                    datos={datos}
                    candidatas={candidatas}
                    hrefBase={`/marcas/${dom}`}
                    cliente={dom}
                  />
                  {grupos.length === 0 && (
                    <p className="mt-6 rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
                      Empieza por un grupo. Conviene separarlos por lo que responden: los
                      competidores directos dicen contra qué narrativa compites, y los referentes de
                      modelo dicen cómo se cuenta lo que hacéis cuando funciona.
                    </p>
                  )}
                </>
              ),
            },
            {
              clave: 'clasificacion',
              etiqueta: 'Clasificación',
              contenido: (
                <>
                  <TablaClasificacion datos={datos} hrefBase={`/marcas/${dom}`} />
                  <SeccionEjes datos={datos} />
                </>
              ),
            },
            {
              clave: 'mapas',
              etiqueta: 'Mapas',
              contenido: (
                <Mapa
                  madurez={puntosMadurez}
                  clienteMadurez={clienteMadurez}
                  clienteNombre={nombre}
                />
              ),
            },
            {
              clave: 'vocabulario',
              etiqueta: 'Vocabulario',
              contenido: (
                <Vocabulario cliente={dom} clienteNombre={nombre} query={sp.g ?? null} />
              ),
            },
            {
              clave: 'comparacion',
              etiqueta: 'Comparación',
              contenido: (
                <>
                  {!hayComparables && (
                    <p className="mt-6 rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
                      Todavía no hay marcas con scan publicable en los grupos. En cuanto las haya,
                      aquí sale la comparación componente a componente.
                    </p>
                  )}
                  {hayComparables && (
                    <>
          {huecos.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">El hueco de la categoría</h2>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
                <p className="text-sm leading-relaxed text-[var(--muted)]">
                  Ningún grupo del estudio domina estos componentes. Es territorio libre, y por eso el más barato de ocupar.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {huecos.map((h) => (
                    <span key={h.key} className="rounded-md border border-[var(--cta)] px-2.5 py-1 text-sm text-[var(--cta)]">
                      {h.label}
                      <span className="ml-2 font-mono text-xs opacity-70">{Math.round(h.mediaGeneral * 100)}%</span>
                    </span>
                  ))}
                </div>
              </div>
            </section>
          )}
                      <section className="mt-8">
                        <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                          Componente a componente
                        </h2>
                        <Matriz filas={filas} cliente={nombre} clienteDominio={dom} grupos={grupitos} />
                      </section>
                    </>
                  )}
                </>
              ),
            },
          ]}
        />
      </EstudioProvider>
    </main>
  );
}
