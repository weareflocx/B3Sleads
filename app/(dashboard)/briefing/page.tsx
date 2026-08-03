import Link from 'next/link';
import { PAGE } from '@/app/(dashboard)/page-width';
import { getBriefingLeads } from '@/lib/data';
import { computeRadar } from '@/lib/radar';
import {
  caducidades,
  diasLabel,
  fechaBriefing,
  frescura,
  novedades,
  resumen,
  seguimientos,
} from '@/lib/briefing';
import { displayName } from '@/lib/types';
import { LeadCard } from './lead-card';
import { ImportBox } from '../import-box';

export const dynamic = 'force-dynamic';

// El título de cada bloque del briefing, con su cuenta. El mismo registro
// tipográfico que las secciones de la ficha.
function SectionTitle({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
      {children}
      {count != null && <span className="ml-2 font-mono text-[var(--soft)]">{count}</span>}
    </h2>
  );
}

// Briefing de las 9:00. No es una lista: es la respuesta a tres preguntas.
// ¿Qué ha cambiado desde ayer? ¿Qué toca hacer hoy? ¿Qué se está escapando?
// Todo se deriva de datos que ya existen, así que cambia solo con los días.
export default async function BriefingPage() {
  const leads = await getBriefingLeads();
  const cualificados = leads.filter(
    (l) => ['detected', 'briefed'].includes(l.lead.stage) && l.company,
  );

  // La cola: leads con señal viva, por radar; a igual radar, la señal más
  // fresca primero (eso también reordena la cola de un día a otro).
  const conRadar = cualificados.map((bl) => ({ bl, radar: computeRadar(bl, bl.signals) }));
  const activos = conRadar.filter((r) => r.radar.state === 'activo');
  const cola = [...activos]
    .sort(
      (a, b) =>
        (b.radar.score ?? 0) - (a.radar.score ?? 0) || frescura(b.bl) - frescura(a.bl),
    )
    .map((r) => r.bl);
  const enReserva = conRadar.filter((r) => r.radar.state !== 'activo').length;

  // Las otras dos preguntas del briefing.
  const cambios = novedades(leads);
  const pendientes = seguimientos(leads);
  const caducan = caducidades(activos);

  const frase = resumen({
    cola: cola.length,
    novedades: cambios.length,
    seguimientos: pendientes.length,
    caducan: caducan.length,
  });

  const conversaciones = leads.filter((l) =>
    ['conversation', 'call', 'proposal'].includes(l.lead.stage),
  ).length;

  const stats: { n: number; label: string; href: string }[] = [
    { n: cola.length, label: 'en cola hoy', href: '#cola' },
    { n: cambios.length, label: 'novedades 48h', href: '#novedades' },
    { n: pendientes.length, label: 'seguimientos', href: '#seguimientos' },
    { n: conversaciones, label: 'conversaciones', href: '/pipeline' },
  ];

  return (
    <main className={PAGE}>
      {/* La cabecera es la lectura del día, no un título genérico. */}
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Briefing</h1>
        <span className="font-mono text-xs uppercase tracking-wider text-[var(--muted)]">
          {fechaBriefing()}
        </span>
      </div>
      <p className="mb-6 text-sm text-[var(--muted)]">{frase}</p>

      {/* El pulso en cuatro números. Cada uno lleva a su sección. */}
      <div className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 transition-colors hover:border-[var(--muted)]"
          >
            <span className={`block font-mono text-2xl ${s.n === 0 ? 'text-[var(--soft)]' : ''}`}>
              {s.n}
            </span>
            <span className="block text-xs text-[var(--muted)]">{s.label}</span>
          </Link>
        ))}
      </div>

      {/* ¿Qué ha cambiado? Señales detectadas y scans terminados en 48h. */}
      {cambios.length > 0 && (
        <section id="novedades" className="mb-8">
          <SectionTitle count={cambios.length}>Desde ayer</SectionTitle>
          <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            {cambios.map((n, i) => (
              <li key={i}>
                <Link
                  href={`/companies/${n.domain}`}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--surface-2)]"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      background: n.kind === 'señal' ? 'var(--accent)' : 'var(--cta)',
                    }}
                  />
                  <span className="font-medium">{n.company}</span>
                  <span className="min-w-0 flex-1 truncate text-[var(--muted)]">{n.text}</span>
                  <span className="shrink-0 font-mono text-xs text-[var(--soft)]">
                    {diasLabel(Math.floor((Date.now() - new Date(n.at).getTime()) / 86_400_000))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ¿Qué se está escapando? Contactados sin respuesta y conversaciones
          enfriándose. Es la sección que más dinero recupera: el fallo típico
          no es contactar mal, es no volver a aparecer. */}
      {pendientes.length > 0 && (
        <section id="seguimientos" className="mb-8">
          <SectionTitle count={pendientes.length}>Seguimientos que tocan</SectionTitle>
          <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            {pendientes.map(({ bl, days, reason }) => (
              <li key={bl.lead.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Link
                  href={`/companies/${bl.company!.domain}`}
                  className="font-medium hover:underline"
                >
                  {bl.company!.name}
                </Link>
                {bl.contact && (
                  <span className="truncate text-[var(--muted)]">
                    {displayName(bl.contact.full_name)}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-xs text-[var(--muted)]">
                  {reason === 'sin_respuesta'
                    ? `contactado ${diasLabel(days)}, sin respuesta`
                    : `conversación parada ${diasLabel(days)}`}
                </span>
                {bl.contact?.linkedin_url && (
                  <a
                    href={bl.contact.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Abrir LinkedIn de ${displayName(bl.contact.full_name)}`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--linkedin)]/40 font-sans text-[13px] font-bold text-[var(--linkedin)] transition-colors hover:border-[var(--linkedin)] hover:bg-[var(--linkedin)]/10"
                  >
                    in
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Señales cruzando un escalón del decay esta semana: el argumento para
          contactar HOY y no la semana que viene. */}
      {caducan.length > 0 && (
        <section className="mb-8">
          <SectionTitle count={caducan.length}>Señales que pierden fuerza</SectionTitle>
          <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            {caducan.map(({ bl, label, daysLeft, from, to }) => (
              <li key={bl.lead.id}>
                <Link
                  href={`/companies/${bl.company!.domain}`}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--surface-2)]"
                >
                  <span className="font-medium">{bl.company!.name}</span>
                  <span className="min-w-0 flex-1 truncate text-[var(--muted)]">{label}</span>
                  <span className="shrink-0 font-mono text-xs text-[var(--accent)]">
                    {daysLeft === 0 ? 'hoy' : daysLeft === 1 ? 'mañana' : `en ${daysLeft} días`} ·{' '}
                    {Math.round(from * 100)}% → {Math.round(to * 100)}%
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ¿Qué toca hacer? La cola de contacto de siempre, con su evidencia. */}
      <section id="cola">
        <SectionTitle count={cola.length}>En cola para contactar</SectionTitle>
        {cola.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--border)] p-10 text-center text-sm text-[var(--muted)]">
            Ningún lead con señal viva hoy. No se rellena la cola con leads sin timing: registra
            una señal en una ficha o espera al pipeline nocturno.
          </p>
        ) : (
          <div className="space-y-4">
            {cola.map((bl) => (
              <LeadCard key={bl.lead.id} initial={bl} />
            ))}
          </div>
        )}
      </section>

      {/* El sistema no los ha perdido: están esperando señal. */}
      {enReserva > 0 && (
        <p className="mt-6 text-center font-mono text-xs text-[var(--soft)]">
          {enReserva} {enReserva === 1 ? 'lead en reserva esperando' : 'leads en reserva esperando'}{' '}
          señal
        </p>
      )}

      {/* El alta en lote sigue aquí, pero al final: el briefing abre con el
          trabajo del día, no con un formulario. El alta rápida vive en el menú. */}
      <div className="mt-10 border-t border-[var(--border)] pt-8">
        <SectionTitle>Añadir al radar</SectionTitle>
        <ImportBox />
      </div>
    </main>
  );
}
