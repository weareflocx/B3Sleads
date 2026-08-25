import { PAGE } from '@/app/(dashboard)/page-width';
import Link from 'next/link';
import { getBriefingLeads, getStartups } from '@/lib/data';
import { platformStats, rondasRecientes, titularesDelDia } from '@/lib/ecosystem';
import { diasLabel, fraseAnimo, seguimientos } from '@/lib/briefing';
import { BTN_WHITE } from '../buttons';
import { Clock } from '../clock';

export const dynamic = 'force-dynamic';

// Fecha del titular en corto. Los proveedores la dan en formatos distintos
// (ISO en Tavily, RFC en Brave), así que se parsea y si no cuela no se enseña
// nada: mejor sin fecha que con una inventada.
function fechaCorta(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    timeZone: 'Europe/Madrid',
  }).format(new Date(t));
}

// Saludo por hora de Madrid. La home es la puerta: recibe, no exige.
function saludo(): string {
  const h = Number(
    new Intl.DateTimeFormat('es-ES', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Europe/Madrid',
    }).format(new Date()),
  );
  if (h >= 6 && h < 14) return 'Buenos días';
  if (h >= 14 && h < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
      {children}
    </h2>
  );
}

// Colores de las bandas de score, de peor a mejor: negro, rojo, azul, verde.
// El negro usa el token de máximo contraste (blanco en tema oscuro) y el
// resto es el rojo/azul/verde que ya habla en el producto (scan, alta).
const BANDA_TONES = ['var(--text)', 'var(--accent)', 'var(--linkedin-soft)', 'var(--cta)'];

// Home: la mirada general. Qué se mueve en el ecosistema, qué números tiene
// la plataforma y por dónde se entra. El trabajo del día (cola, seguimientos,
// novedades del usuario) vive en el Briefing: aquí no se repite.
export default async function HomePage() {
  const [leads, startups, titulares] = await Promise.all([
    getBriefingLeads(),
    getStartups(),
    titularesDelDia(),
  ]);

  const stats = platformStats(startups);
  const rondas = rondasRecientes(startups);

  const conversations = leads.filter((l) =>
    ['conversation', 'call', 'proposal'].includes(l.lead.stage),
  ).length;
  const contacted = leads.filter((l) => l.lead.stage === 'contacted').length;
  // La línea personalizada del banner: conversaciones por delante, luego
  // seguimientos, luego la cola. Cambia sola con el estado del pipeline.
  const animo = fraseAnimo({
    conversaciones: conversations,
    seguimientos: seguimientos(leads).length,
    senalViva: stats.conSenalViva,
  });
  const won = leads.filter((l) => l.lead.stage === 'won').length;
  const totalEscaneadas = stats.bandas.reduce((a, b) => a + b.count, 0);

  const sections = [
    {
      href: '/briefing',
      title: 'Briefing',
      label: 'el trabajo de hoy',
      hint: 'Novedades desde ayer, seguimientos que tocan y la cola con señal viva.',
    },
    {
      href: '/pipeline',
      title: 'Pipeline',
      label: `${contacted} contactados · ${won} cerrados`,
      hint: 'El embudo completo, arrastrando entre etapas.',
    },
    {
      href: '/founders',
      title: 'Founders',
      label: `${conversations} ${conversations === 1 ? 'conversación abierta' : 'conversaciones abiertas'}`,
      hint: 'Cola de LinkedIn y conversaciones en curso.',
    },
    {
      href: '/startups',
      title: 'Startups',
      label: `${stats.marcas} marcas`,
      hint: 'El catálogo brand-first: score B3S, sector y ronda.',
    },
  ];

  return (
    <main className={`${PAGE} space-y-8`}>
      {/* Bienvenida: saludo, reloj vivo, el estado en una frase y una línea
          personalizada que empuja a lo que toca hoy. */}
      <section className="relative overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] px-6 py-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-40 opacity-60"
          style={{
            background:
              'repeating-linear-gradient(135deg, var(--border) 0 1px, transparent 1px 8px)',
          }}
        />
        <div className="relative flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-bold leading-snug tracking-tight">{saludo()}.</h1>
            <p className="mt-1 text-base text-[var(--muted)]">
              {stats.marcas} marcas en el radar, {stats.conSenalViva} con señal viva.
            </p>
          </div>
          <Clock />
        </div>
        <p className="relative mt-4 max-w-md text-sm leading-relaxed">{animo}</p>
        <Link href="/briefing" className={`${BTN_WHITE} relative mt-5 inline-block`}>
          Ir al briefing de hoy
        </Link>
      </section>

      {/* El ecosistema: lo que ha visto el radar (rondas) y lo que cuenta la
          prensa (titulares, renovados cada día vía búsqueda cacheada). */}
      {(rondas.length > 0 || titulares.length > 0) && (
        <section>
          <SectionTitle>El ecosistema</SectionTitle>
          <div className="grid gap-3 lg:grid-cols-2">
            {rondas.length > 0 && (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                <p className="border-b border-[var(--border)] px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
                  Rondas en el radar · 14 días
                </p>
                <ul className="divide-y divide-[var(--border)]">
                  {rondas.slice(0, 5).map((r) => (
                    <li key={r.domain}>
                      <Link
                        href={`/companies/${r.domain}`}
                        className="flex items-baseline gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--surface-2)]"
                      >
                        <span className="shrink-0 font-medium">{r.company}</span>
                        <span className="min-w-0 flex-1 truncate text-xs text-[var(--muted)]">
                          {r.text}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-[var(--soft)]">
                          {diasLabel(
                            Math.floor((Date.now() - new Date(r.at).getTime()) / 86_400_000),
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {titulares.length > 0 && (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                <p className="border-b border-[var(--border)] px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
                  Titulares · se renuevan cada día
                </p>
                <ul className="divide-y divide-[var(--border)]">
                  {titulares.map((t) => (
                    <li key={t.url}>
                      <a
                        href={t.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block px-4 py-2.5 transition-colors hover:bg-[var(--surface-2)]"
                      >
                        <span className="block text-sm leading-snug">{t.headline}</span>
                        <span className="mt-0.5 block font-mono text-[10px] text-[var(--soft)]">
                          {t.host}
                          {/* La fecha a la vista: sin ella no hay forma de
                              notar que los titulares se han quedado quietos. */}
                          {t.published && ` · ${fechaCorta(t.published)}`} ↗
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Los números de la plataforma, no del usuario. */}
      <section>
        <SectionTitle>B3S en números</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { n: stats.marcas, label: 'marcas en radar' },
            { n: stats.escaneadas, label: 'con scan B3S' },
            { n: stats.scoreMedio ?? '—', label: 'score medio' },
            { n: stats.rondas90d, label: 'rondas en 90 días' },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
            >
              <span className="block font-mono text-2xl">{s.n}</span>
              <span className="block text-xs text-[var(--muted)]">{s.label}</span>
            </div>
          ))}
        </div>

        {/* La calidad de marca que ve el Scanner, en una barra: cuántas hay en
            cada banda. Es el argumento de negocio de FLOC* en un vistazo:
            cuanta más marca "por construir", más mercado. */}
        {totalEscaneadas > 0 && (
          <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <div className="flex h-2 w-full gap-px overflow-hidden rounded-full">
              {stats.bandas.map(
                (b, i) =>
                  b.count > 0 && (
                    <span
                      key={b.label}
                      style={{
                        width: `${(b.count / totalEscaneadas) * 100}%`,
                        background: BANDA_TONES[i],
                      }}
                    />
                  ),
              )}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
              {stats.bandas.map((b, i) => (
                <span key={b.label} className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: BANDA_TONES[i] }}
                  />
                  {b.label} <span className="font-mono">{b.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* La entrada a cada sección. */}
      <section>
        <SectionTitle>Secciones</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {sections.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--muted)]"
            >
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold">{s.title}</h3>
                <span className="text-xs text-[var(--soft)] transition-colors group-hover:text-[var(--text)]">
                  →
                </span>
              </div>
              <div className="mt-2 text-xs text-[var(--muted)]">{s.label}</div>
              <p className="mt-2.5 border-t border-[var(--border)] pt-2 text-[11px] leading-relaxed text-[var(--soft)]">
                {s.hint}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
