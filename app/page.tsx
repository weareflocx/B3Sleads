import Link from 'next/link';
import { Logo } from './(dashboard)/logo';
import { GeoField } from './geo-field';

// Landing comercial de B3S Leads. Sintética: hero → 3 atributos (RGB) →
// principio → CTA. Geist para titulares y textos largos; el mono queda
// solo como acento técnico (eyebrows, footer). Los tres canales del logo
// son el sistema: rojo señal, verde análisis, azul conversación.
export const metadata = {
  title: 'B3S Leads — generación de leads de valor',
  description:
    'Detecta startups con momentum, lee su marca con Brand3 Scanner y abre conversaciones que responden. El envío es siempre humano.',
};

const ATTRIBUTES: { color: string; title: string; desc: string }[] = [
  {
    color: 'var(--accent)',
    title: 'Señal',
    desc: 'Startups con momentum, detectadas cada noche. Ronda, lanzamiento, equipo pequeño: el lead llega con contexto, nunca en frío.',
  },
  {
    color: 'var(--cta)',
    title: 'Análisis',
    desc: 'El Scanner lee su marca dimensión a dimensión y encuentra lo que nadie más ve. De ahí sale un mensaje irrepetible.',
  },
  {
    color: 'var(--linkedin)',
    title: 'Conversación',
    desc: 'Argumentario, mensaje y brief de llamada por founder. El envío es siempre humano: tú decides, tú escribes, ellos responden.',
  },
];

export default function LandingPage() {
  return (
    <div className="mx-auto my-6 w-[min(1100px,calc(100%-32px))] border border-[var(--border)] bg-[var(--page-bg)] font-sans shadow-[var(--page-shadow)]">
      {/* Barra superior */}
      <header className="flex items-center justify-between border-b border-[var(--border)] px-7 py-3">
        <span className="flex items-center gap-2">
          <Logo />
          <span className="font-mono text-xs font-semibold text-[var(--muted)]">Leads</span>
        </span>
        <Link
          href="/login"
          className="rounded-md bg-[var(--cta)] px-3.5 py-1.5 text-sm font-medium text-[var(--cta-text)] transition-opacity hover:opacity-90"
        >
          Entrar
        </Link>
      </header>

      {/* Hero */}
      <section className="relative border-b border-[var(--border)] px-7 py-20 text-center sm:py-28">
        <GeoField />
        <div className="relative">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
            Generación de leads de valor
          </p>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Atrae founders.
            <br />
            <span className="text-[var(--accent)]">No los persigas.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-[var(--muted)]">
            Leemos la marca de cada startup con momentum y te damos el ángulo exacto para abrir
            la conversación.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="rounded-md bg-[var(--cta)] px-6 py-2.5 text-sm font-medium text-[var(--cta-text)] transition-opacity hover:opacity-90"
            >
              Empezar →
            </Link>
            <a
              href="https://b3s.fly.dev"
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-[var(--border)] bg-[var(--surface)]/80 px-6 py-2.5 text-sm font-medium transition-colors hover:border-[var(--muted)]"
            >
              Ver el Scanner ↗
            </a>
          </div>
        </div>
      </section>

      {/* Tres atributos: rojo, verde, azul */}
      <section className="border-b border-[var(--border)] px-7 py-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {ATTRIBUTES.map((a) => (
            <div
              key={a.title}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6"
            >
              <span
                className="inline-block h-2 w-10 rounded-sm"
                style={{ background: a.color }}
                aria-hidden="true"
              />
              <h2 className="mt-4 text-xl font-semibold tracking-tight" style={{ color: a.color }}>
                {a.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{a.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Principio */}
      <section className="border-b border-[var(--border)] px-7 py-16 text-center">
        <blockquote className="mx-auto max-w-xl">
          <p className="text-xl font-semibold leading-relaxed tracking-tight sm:text-2xl">
            «El envío es siempre humano.»
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
            Nada de automatizar LinkedIn ni ráfagas de spam. B3S Leads prepara el contexto y el
            mensaje; la conversación la abres tú, founder a founder. Por eso responden.
          </p>
        </blockquote>
      </section>

      {/* CTA final */}
      <section className="px-7 py-16 text-center">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Tu próximo cliente ya levantó ronda
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[var(--muted)]">
          Encuéntralo, entiende su marca mejor que él, y ábrele una conversación que no pueda
          ignorar.
        </p>
        <Link
          href="/login"
          className="mt-7 inline-block rounded-md bg-[var(--cta)] px-6 py-2.5 text-sm font-medium text-[var(--cta-text)] transition-opacity hover:opacity-90"
        >
          Entrar en B3S Leads →
        </Link>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-7 py-4 font-mono text-xs text-[var(--soft)]">
        <span className="flex items-center gap-2">
          <Logo /> <span>Leads · por FLOC*</span>
        </span>
        <span>Brand3 · wearefloc.com</span>
      </footer>
    </div>
  );
}
