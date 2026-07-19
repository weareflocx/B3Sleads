import Link from 'next/link';
import { Logo } from './(dashboard)/logo';

// Landing comercial de B3S Leads. Estructura tipo SaaS (hero → prueba →
// features → cómo funciona → principio → CTA) con la estética B3S:
// mono, bordes rectos, canales RGB del logo como sistema de color.
export const metadata = {
  title: 'B3S Leads — leads cualificados por análisis de marca',
  description:
    'Detecta startups con momentum, analiza su marca con Brand3 Scanner y abre conversaciones irrepetibles con sus founders. El envío es siempre humano.',
};

const FEATURES: { color: string; title: string; desc: string }[] = [
  {
    color: 'var(--accent)',
    title: 'Radar de founders',
    desc: 'Rondas y lanzamientos detectados cada noche por RSS + ICP. Los founders entran con nombre, marca y contexto, listos para trabajar.',
  },
  {
    color: 'var(--cta)',
    title: 'Brand3 Scanner',
    desc: 'Cada marca se analiza dimensión a dimensión: qué funciona, qué falta y el plan. Ese análisis es lo que hace irrepetible cada mensaje.',
  },
  {
    color: 'var(--linkedin)',
    title: 'Argumentario por lead',
    desc: 'Lectura de marca, ángulos para abrir conversación y el programa que encaja. Generado del scan, distinto para cada founder.',
  },
  {
    color: 'var(--warning)',
    title: 'Temperatura viva',
    desc: 'Cinco llamas que se calientan con las señales (respuesta, ronda, interacción) y se enfrían solas con la inactividad. Sabes a quién escribir hoy.',
  },
  {
    color: 'var(--cta)',
    title: 'Briefs de llamada',
    desc: 'Antes de cada call: inteligencia del lead, gancho, dolor por 5 porqués, secuencia de descubrimiento y manejo de objeciones.',
  },
  {
    color: 'var(--accent)',
    title: 'Pipeline completo',
    desc: 'De detectado a cerrado en un kanban. Notas con fecha, seguimiento, rondas y todo el contexto en la ficha de cada lead.',
  },
];

const STEPS: { n: string; title: string; desc: string }[] = [
  {
    n: '01',
    title: 'Detecta',
    desc: 'El radar encuentra startups con momentum: ronda reciente, lanzamiento, equipo pequeño. O añades tú al founder pegando su LinkedIn.',
  },
  {
    n: '02',
    title: 'Analiza',
    desc: 'El Scanner lee su marca y saca lo que nadie más ve: fortalezas reales, huecos concretos y por dónde abrir la conversación.',
  },
  {
    n: '03',
    title: 'Conversa',
    desc: 'Mensaje anclado en su marca, enviado por ti, a mano, por LinkedIn. Sin automatización, sin spam: conversaciones con fundamento.',
  },
];

export default function LandingPage() {
  return (
    <div className="mx-auto my-6 w-[min(1100px,calc(100%-32px))] border border-[var(--border)] bg-[var(--page-bg)] shadow-[var(--page-shadow)]">
      {/* Barra superior */}
      <header className="flex items-center justify-between border-b border-[var(--border)] px-7 py-3">
        <span className="flex items-center gap-2">
          <Logo />
          <span className="text-xs font-semibold text-[var(--muted)]">Leads</span>
        </span>
        <Link
          href="/login"
          className="rounded-md bg-[var(--cta)] px-3.5 py-1.5 text-sm font-medium text-[var(--cta-text)] transition-opacity hover:opacity-90"
        >
          Entrar
        </Link>
      </header>

      {/* Hero */}
      <section className="border-b border-[var(--border)] px-7 py-16 text-center sm:py-20">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
          Lead-gen para estudios de marca
        </p>
        <h1 className="mx-auto mt-4 max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
          Leads que se abren con un análisis,{' '}
          <span className="text-[var(--accent)]">no con una plantilla</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-[var(--muted)] sm:text-base">
          B3S Leads detecta startups con momentum, analiza su marca con Brand3 Scanner y te
          prepara la conversación con cada founder: argumentario, mensaje y brief de llamada.
          Tú decides y tú envías.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="rounded-md bg-[var(--cta)] px-5 py-2.5 text-sm font-medium text-[var(--cta-text)] transition-opacity hover:opacity-90"
          >
            Empezar →
          </Link>
          <a
            href="https://b3s.fly.dev"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-[var(--border)] px-5 py-2.5 text-sm font-medium transition-colors hover:border-[var(--muted)]"
          >
            Ver el Scanner ↗
          </a>
        </div>
        {/* Franja de prueba */}
        <div className="mx-auto mt-10 flex max-w-xl flex-wrap items-center justify-center gap-x-8 gap-y-2 font-mono text-xs text-[var(--soft)]">
          <span>60+ marcas construidas</span>
          <span>MetaMask · Eigen · Bankless · Rarible</span>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-[var(--border)] px-7 py-14">
        <h2 className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
          Qué hace por ti
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <span
                className="inline-block h-2 w-8 rounded-sm"
                style={{ background: f.color }}
                aria-hidden="true"
              />
              <h3 className="mt-3 text-sm font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="border-b border-[var(--border)] px-7 py-14">
        <h2 className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
          Cómo funciona
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n}>
              <div className="font-mono text-2xl font-bold text-[var(--soft)]">{s.n}</div>
              <h3 className="mt-2 text-sm font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Principio */}
      <section className="border-b border-[var(--border)] px-7 py-14 text-center">
        <blockquote className="mx-auto max-w-xl">
          <p className="text-lg font-semibold leading-relaxed sm:text-xl">
            «El envío es siempre humano.»
          </p>
          <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
            Nada de automatizar LinkedIn ni ráfagas de spam. B3S Leads prepara el contexto y el
            mensaje; la conversación la abres tú, founder a founder, 5-8 al día. Por eso
            responden.
          </p>
        </blockquote>
      </section>

      {/* CTA final */}
      <section className="px-7 py-14 text-center">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
          Tu próximo cliente ya levantó ronda
        </h2>
        <p className="mx-auto mt-2 max-w-md text-xs text-[var(--muted)] sm:text-sm">
          Encuéntralo, entiende su marca mejor que él, y ábrele una conversación que no pueda
          ignorar.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-md bg-[var(--cta)] px-6 py-2.5 text-sm font-medium text-[var(--cta-text)] transition-opacity hover:opacity-90"
        >
          Entrar en B3S Leads →
        </Link>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-7 py-4 text-xs text-[var(--soft)]">
        <span className="flex items-center gap-2">
          <Logo /> <span>Leads · por FLOC*</span>
        </span>
        <span>Brand3 · wearefloc.com</span>
      </footer>
    </div>
  );
}
