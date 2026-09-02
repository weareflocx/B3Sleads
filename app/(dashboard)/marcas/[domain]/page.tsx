import { PAGE_XL } from '@/app/(dashboard)/page-width';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCorpusBrand, getCorpusBrands, getStartups } from '@/lib/data';
import { companyLabel } from '@/lib/types';
import {
  compara,
  huecosDeCategoria,
  parseGrupos,
  perfilDeMarca,
  ultimoPublicable,
  type PerfilMarca,
} from '@/lib/benchmark';
import { CompanyLogo } from '../../company-logo';
import { GrupoEstudio, type MarcaEnGrupo } from './grupo-estudio';
import { Matriz } from './matriz';
import { NuevoGrupo } from './nuevo-grupo';

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
  const grupos = parseGrupos(sp.g);

  const dominios = grupos.flatMap((g) => g.dominios);
  const [cliente, marcas, corpus] = await Promise.all([
    getCorpusBrand(dom),
    getCorpusBrands(dominios),
    getStartups(),
  ]);
  if (!cliente) notFound();

  const perfilCliente = perfilDeMarca(cliente);
  const nombre = companyLabel(cliente.company.name, cliente.company.domain);
  const porDominio = new Map(marcas.map((m) => [m.company.domain, m]));

  const vista = (d: string): MarcaEnGrupo => {
    const m = porDominio.get(d);
    if (!m) return { domain: d, name: d, logoUrl: null, score: null, estado: 'sin-scan', scanId: null, detectados: 0 };
    const p = perfilDeMarca(m);
    const ultimo = m.scans[m.scans.length - 1] ?? null;
    const estado: MarcaEnGrupo['estado'] = m.activo
      ? 'escaneando'
      : ultimoPublicable(m)
        ? 'listo'
        : ultimo
          ? 'retenido'
          : 'sin-scan';
    return {
      domain: d,
      name: p.name,
      logoUrl: m.company.logo_url,
      score: p.score,
      estado,
      scanId: m.activo?.id ?? null,
      detectados: p.detectados,
    };
  };

  const grupitos = grupos.map((g) => ({
    nombre: g.nombre,
    perfiles: g.dominios
      .map((d) => porDominio.get(d))
      .filter((m): m is NonNullable<typeof m> => Boolean(m && ultimoPublicable(m)))
      .map(perfilDeMarca) as PerfilMarca[],
  }));
  const filas = compara(perfilCliente, grupitos);
  const hayComparables = grupitos.some((g) => g.perfiles.length);
  const huecos = hayComparables ? huecosDeCategoria(filas) : [];

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
        {cliente.lead && (
          <Link href={`/companies/${dom}`} className="shrink-0 text-sm text-[var(--muted)] hover:underline">
            ver ficha ↗
          </Link>
        )}
      </div>

      {perfilCliente.detectados < 8 && (
        <p className="mt-5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-xs text-[var(--muted)]">
          El scan de {nombre} solo detectó {perfilCliente.detectados} de 10 componentes. Las
          comparaciones de los que faltan no son concluyentes.
        </p>
      )}

      {/* Los grupos, cada uno con sus marcas y su propio alta. */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {grupos.map((g) => (
          <GrupoEstudio
            key={g.nombre}
            grupo={g}
            marcas={g.dominios.map(vista)}
            grupos={grupos}
            candidatas={candidatas}
            hrefBase={`/marcas/${dom}`}
          />
        ))}
        <NuevoGrupo grupos={grupos} />
      </div>

      {grupos.length === 0 && (
        <p className="mt-6 rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
          Empieza por un grupo. Conviene separarlos por lo que responden: los competidores
          directos dicen contra qué narrativa compites, y los referentes de modelo dicen cómo se
          cuenta lo que hacéis cuando funciona.
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
            <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Componente a componente</h2>
            <Matriz filas={filas} cliente={nombre} grupos={grupitos} />
          </section>
        </>
      )}
    </main>
  );
}
