import { PAGE_XL } from '@/app/(dashboard)/page-width';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCompanyFiche, getStartups, getCompanyScans } from '@/lib/data';
import { companyLabel } from '@/lib/types';
import {
  compara,
  huecosDeCategoria,
  parseGrupos,
  perfilDeMarca,
  type PerfilMarca,
} from '@/lib/benchmark';
import { CompanyLogo } from '../../company-logo';
import { EditorEstudio } from './editor-estudio';
import { Matriz } from './matriz';

export const dynamic = 'force-dynamic';

// El estudio de marca: donde una marca deja de ser un lead y pasa a ser un
// proyecto. La ficha responde "¿le escribo?"; esta página responde "¿qué le
// contamos?". Por eso vive en otra ruta y no en otra pestaña de la ficha.
//
// El estudio se define en la URL (?g=Grupo:dominio,dominio;Otro:...). Sin
// tabla nueva: se comparte pegando el enlace y se puede iterar sobre el
// formato sin migraciones. Cuando el uso lo estabilice, mover a base es
// mecánico.
type Props = {
  params: Promise<{ domain: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function EstudioPage({ params, searchParams }: Props) {
  const { domain } = await params;
  const dom = decodeURIComponent(domain);
  const bl = await getCompanyFiche(dom);
  if (!bl?.company) notFound();

  const [todas, historia] = await Promise.all([getStartups(), getCompanyScans(bl.company.id)]);
  const cliente = perfilDeMarca(bl, historia as never[]);

  const sp = await searchParams;
  const grupos = parseGrupos(sp.g);

  // Cada marca del estudio sale del corpus ya escaneado: montar un estudio no
  // gasta scans. Añadir una marca nueva es un paso aparte y explícito.
  const porDominio = new Map(todas.filter((x) => x.company).map((x) => [x.company!.domain, x]));
  const grupitos = grupos.map((g) => ({
    nombre: g.nombre,
    perfiles: g.dominios
      .map((d) => porDominio.get(d))
      .map((x) => (x ? perfilDeMarca(x) : null))
      .filter(Boolean) as PerfilMarca[],
  }));

  const filas = compara(cliente, grupitos);
  const huecos = grupitos.length ? huecosDeCategoria(filas) : [];
  const nombre = companyLabel(bl.company.name, bl.company.domain);

  // Candidatas: todo lo escaneado menos la propia marca y las ya elegidas.
  const yaElegidas = new Set(grupos.flatMap((g) => g.dominios));
  const candidatas = todas
    .filter((x) => x.company && x.company.domain !== dom && !yaElegidas.has(x.company.domain))
    .filter((x) => x.scan?.score != null)
    .map((x) => ({
      domain: x.company!.domain,
      name: companyLabel(x.company!.name, x.company!.domain),
      score: Number(x.scan!.score),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className={PAGE_XL}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <CompanyLogo domain={dom} name={nombre} size={54} src={bl.company.logo_url} />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
              Estudio de marca
            </p>
            <h1 className="text-2xl font-bold tracking-tight">{nombre}</h1>
          </div>
        </div>
        <Link
          href={`/companies/${dom}`}
          className="shrink-0 text-sm text-[var(--muted)] hover:underline"
        >
          ver ficha ↗
        </Link>
      </div>

      {/* Fiabilidad antes que conclusiones: una marca leída a medias no se
          puede comparar, y decirlo evita vender como diferencia de marca lo
          que es diferencia de adquisición. */}
      {cliente && cliente.detectados < 8 && (
        <p className="mt-5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-xs text-[var(--muted)]">
          El scan de {nombre} solo detectó {cliente.detectados} de 10 componentes. Las
          comparaciones de los que faltan no son concluyentes.
        </p>
      )}

      <section className="mt-6">
        <EditorEstudio grupos={grupos} candidatas={candidatas} />
      </section>

      {/* La matriz aparece cuando hay algo que comparar. Con un grupo recien
          creado y todavia vacio, una tabla entera de "sin dato" es ruido: lo
          que toca en ese momento es elegir marcas. */}
      {!grupitos.some((g) => g.perfiles.length) ? (
        <p className="mt-8 rounded-lg border border-dashed border-[var(--border)] p-10 text-center text-sm text-[var(--muted)]">
          {grupos.length === 0
            ? 'Añade un grupo de referencia para empezar. Conviene separarlos por lo que responden: competidores directos dicen contra qué narrativa compites, y los referentes de modelo dicen cómo se cuenta lo que hacéis cuando funciona.'
            : 'Grupo creado. Ahora pulsa «añadir marcas» para elegir del corpus ya escaneado: en cuanto haya una, aparece la comparación.'}
        </p>
      ) : (
        <>
          {huecos.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                El hueco de la categoría
              </h2>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
                <p className="text-sm leading-relaxed text-[var(--muted)]">
                  Ningún grupo del estudio domina estos componentes. Es territorio libre, y por eso
                  el más barato de ocupar.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {huecos.map((h) => (
                    <span
                      key={h.key}
                      className="rounded-md border border-[var(--cta)] px-2.5 py-1 text-sm text-[var(--cta)]"
                    >
                      {h.label}
                      <span className="ml-2 font-mono text-xs opacity-70">
                        {Math.round(h.mediaGeneral * 100)}%
                      </span>
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
            <Matriz filas={filas} cliente={nombre} grupos={grupitos} />
          </section>
        </>
      )}
    </main>
  );
}
