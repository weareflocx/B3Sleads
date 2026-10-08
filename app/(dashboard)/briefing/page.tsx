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
import { Invitaciones, VuelvenAlRadar } from './invitaciones';
import { invitacionesPendientes, vuelvenAlRadar } from '@/lib/invitacion';
import { AnadirComoLead } from './anadir-como-lead';
import { companyLabel } from '@/lib/types';
import { fechaAnuncio, fechaCorta, senalDeRonda } from '@/lib/senal-ronda';
import { titularesDelDia, type Titular } from '@/lib/ecosystem';
import { EtiquetaRonda } from '../etiqueta-ronda';
import { CompanyLogo } from '../company-logo';
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
  // La invitación de LinkedIn: quien aceptó espera el mensaje (va antes que
  // nada: el canal está abierto) y quien no, se revisa a mano.
  const conectados = leads.filter((l) => l.lead.stage === 'connected' && l.company);
  const invitaciones = invitacionesPendientes(leads);
  const porRevisar = invitaciones.filter((i) => i.activa).length;
  // Aparcados porque no aceptaron, con una señal nueva desde la pausa.
  const vuelven = vuelvenAlRadar(leads);

  const frase = resumen({
    cola: cola.length,
    novedades: cambios.length,
    seguimientos: pendientes.length,
    caducan: caducan.length,
    conectados: conectados.length,
    invitaciones: porRevisar,
    vuelven: vuelven.length,
  });

  // Rondas de la semana: las cerradas que se anunciaron en los últimos 7 días
  // y ya están en la base, y las de la prensa que aún no lo están.
  const SEMANA = 7 * 86_400_000;
  const ahora = Date.now();
  const rondasSemana = leads
    .filter((bl) => bl.company)
    .map((bl) => {
      const cerradas = bl.signals.filter(
        (s) => s.type === 'funding_round' && ahora - new Date(fechaAnuncio(s)).getTime() <= SEMANA,
      );
      return cerradas.length ? { bl, senal: senalDeRonda(cerradas)! } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .filter((x, i, arr) => arr.findIndex((y) => y.bl.company!.domain === x.bl.company!.domain) === i)
    .sort((a, b) => b.senal.fecha.localeCompare(a.senal.fecha));
  let titulares: Titular[] = [];
  try {
    titulares = await titularesDelDia();
  } catch {
    // Sin buscador configurado o caído: el bloque se queda con lo de la base.
  }
  // Una noticia que nombra una marca que ya tenemos no es nueva.
  const nombres = leads
    .filter((bl) => bl.company)
    .map((bl) => companyLabel(bl.company!.name, bl.company!.domain).toLowerCase())
    .filter((n) => n.length >= 4);
  const fueraDeLaBase = titulares.filter((t) => {
    const texto = `${t.headline} ${t.detail ?? ''}`.toLowerCase();
    return !nombres.some((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(texto));
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

      {/* Rondas de la semana: lo que ya está en la base y lo que no. */}
      {(rondasSemana.length > 0 || fueraDeLaBase.length > 0) && (
        <section id="rondas" className="mb-8">
          <SectionTitle count={rondasSemana.length + fueraDeLaBase.length}>Rondas de la semana</SectionTitle>
          <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            {rondasSemana.map(({ bl, senal }) => (
              <li key={bl.company!.domain} className="flex items-center gap-3 px-4 py-2.5">
                <CompanyLogo
                  domain={bl.company!.domain}
                  name={companyLabel(bl.company!.name, bl.company!.domain)}
                  size={26}
                  src={bl.company!.logo_url}
                />
                <div className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-sm font-medium">
                      {companyLabel(bl.company!.name, bl.company!.domain)}
                    </span>
                    <EtiquetaRonda senal={senal} />
                  </span>
                  <span className="font-mono text-xs text-[var(--muted)]">
                    {[senal.importe, fechaCorta(senal.fecha)].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <Link
                  href={`/companies/${bl.company!.domain}`}
                  className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-medium transition-colors hover:border-[var(--muted)]"
                >
                  Ver ficha
                </Link>
              </li>
            ))}
            {fueraDeLaBase.map((t) => (
              <li key={t.url} className="flex items-start gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <a href={t.url} target="_blank" rel="noreferrer" className="text-sm hover:underline">
                    {t.headline}
                  </a>
                  <span className="block font-mono text-xs text-[var(--muted)]">
                    {[t.host, t.published ? fechaCorta(t.published) : null, 'aún no está en la base'].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <AnadirComoLead fuente={t.url} fecha={t.published} />
              </li>
            ))}
          </ul>
        </section>
      )}

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

      {/* Aceptaron la invitación: el canal está abierto y el mensaje, listo. */}
      {conectados.length > 0 && (
        <section id="conectados" className="mb-8">
          <SectionTitle count={conectados.length}>Aceptaron tu invitación · envía el mensaje</SectionTitle>
          <div className="space-y-4">
            {conectados.map((bl) => (
              <LeadCard key={bl.lead.id} initial={bl} modo="conectado" />
            ))}
          </div>
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

      {/* Invitaciones sin aceptar: se miran en LinkedIn y se marcan aquí. */}
      {invitaciones.length > 0 && (
        <section id="invitaciones" className="mb-8">
          <SectionTitle count={invitaciones.length}>Invitaciones pendientes</SectionTitle>
          <Invitaciones pendientes={invitaciones} />
        </section>
      )}

      {/* No aceptaron, pero la marca se ha movido: motivo nuevo para invitar. */}
      {vuelven.length > 0 && (
        <section id="vuelven" className="mb-8">
          <SectionTitle count={vuelven.length}>Vuelven al radar</SectionTitle>
          <VuelvenAlRadar items={vuelven} />
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
