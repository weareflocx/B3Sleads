import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { Logo } from './(dashboard)/logo';
import { ScannerFilm } from './scanner-film';

// Landing pública de B3S Leads.
//
// Inspirada en la estructura de doss.com, no en su marca: hero oscuro con el
// producto justo debajo del titular, una rejilla de arquitecto con las guías
// a la vista, filas de funcionalidad con una pieza pequeña de interfaz y
// cifras grandes. La pieza de producto es la animática de Jesús sobre cómo
// lee una marca B3S Scanner.
//
// Lo que se deja fuera a propósito: logos de clientes y testimonios. Doss los
// tiene y B3S Leads todavía no; inventarlos sería peor que no ponerlos.
//
// La paleta es fija, no sigue el tema de la app: es una página de un solo
// propósito, y el gris claro es el mismo de la película para que su franja
// empalme sin costura.
export const metadata = {
  title: 'B3S Leads — generación de leads de valor',
  description:
    'Detecta startups con momentum, lee su marca con B3S Scanner y abre conversaciones que responden. El envío es siempre humano.',
};

const PALETA = {
  '--l-ink': '#0b0d0e',
  '--l-ink-2': '#121615',
  '--l-ink-line': '#262d2b',
  '--l-ink-text': '#e7e4dc',
  '--l-ink-muted': '#9b968c',
  '--l-ink-soft': '#6c6862',
  '--l-blue-on-ink': '#5b6cff',
  '--l-paper': '#eeeeee',
  '--l-paper-2': '#f6f6f5',
  '--l-paper-line': '#d6d6d2',
  '--l-paper-text': '#161616',
  '--l-paper-muted': '#5f5b55',
  '--l-paper-soft': '#8c877f',
  '--l-red': '#ff0000',
  '--l-green': '#1a7f37',
  '--l-blue': '#0000ff',
} as CSSProperties;

const SCANNER = 'https://b3s.fly.dev';

// ---------- la rejilla ----------

// Una franja a todo lo ancho con su columna central. Los raíles de los lados
// son discontinuos y siguen de una franja a la siguiente: es la rejilla de
// arquitecto de Doss, y sale sola porque todas las franjas comparten ancho.
function Franja({
  tono,
  id,
  divisor = false,
  children,
  className = '',
}: {
  tono: 'ink' | 'paper';
  id?: string;
  // Una línea continua de lado a lado sobre la franja. Los raíles son
  // discontinuos; las divisiones, no: así se lee qué es guía y qué es corte.
  divisor?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const ink = tono === 'ink';
  return (
    <section
      id={id}
      className={`${ink ? 'bg-[var(--l-ink)] text-[var(--l-ink-text)]' : 'bg-[var(--l-paper)] text-[var(--l-paper-text)]'} ${
        divisor ? `border-t ${ink ? 'border-[var(--l-ink-line)]' : 'border-[var(--l-paper-line)]'}` : ''
      } scroll-mt-4`}
    >
      <div
        className={`relative mx-auto w-full max-w-[1200px] border-x border-dashed px-6 sm:px-12 ${
          ink ? 'border-[var(--l-ink-line)]' : 'border-[var(--l-paper-line)]'
        } ${className}`}
      >
        {/* Las marcas de las esquinas, donde el raíl cruza la línea de la
            franja. Un detalle de plano que ordena sin decir nada. */}
        <span
          aria-hidden="true"
          className={`absolute -left-[3px] top-0 hidden h-[5px] w-[5px] sm:block ${ink ? 'bg-[var(--l-ink-line)]' : 'bg-[var(--l-paper-line)]'}`}
        />
        <span
          aria-hidden="true"
          className={`absolute -right-[3px] top-0 hidden h-[5px] w-[5px] sm:block ${ink ? 'bg-[var(--l-ink-line)]' : 'bg-[var(--l-paper-line)]'}`}
        />
        {children}
      </div>
    </section>
  );
}

function Etiqueta({ children, tono }: { children: ReactNode; tono: 'ink' | 'paper' }) {
  return (
    <p
      className={`font-mono text-[11px] uppercase tracking-[0.18em] ${
        tono === 'ink' ? 'text-[var(--l-ink-soft)]' : 'text-[var(--l-paper-soft)]'
      }`}
    >
      {children}
    </p>
  );
}

// ---------- piezas pequeñas de interfaz ----------
//
// Fragmentos ilustrativos del producto, como las fichas de Doss con sus SKU.
// No son datos de nadie: enseñan la forma de lo que se ve dentro.

function PiezaSenal() {
  return (
    <div className="space-y-1.5">
      {[
        { tipo: 'Ronda', texto: 'Serie A · 5 M€', cuando: 'hace 2 d' },
        { tipo: 'Lanzamiento', texto: 'Web nueva', cuando: 'hace 6 d' },
      ].map((s) => (
        <div
          key={s.tipo}
          className="flex items-center gap-2 border border-[var(--l-paper-line)] bg-[var(--l-paper-2)] px-2 py-1.5 font-mono text-[10px]"
        >
          <span className="h-1.5 w-1.5 shrink-0 bg-[var(--l-red)]" />
          <span className="uppercase tracking-wider text-[var(--l-paper-soft)]">{s.tipo}</span>
          <span className="min-w-0 flex-1 truncate">{s.texto}</span>
          <span className="text-[var(--l-paper-soft)]">{s.cuando}</span>
        </div>
      ))}
      <p className="pt-1 text-right font-mono text-[10px] text-[var(--l-paper-soft)]">
        radar <span className="text-[var(--l-red)]">82</span>
      </p>
    </div>
  );
}

function PiezaAnalisis() {
  const filas: { nombre: string; encendidas: number; total: number }[] = [
    { nombre: 'Propósito', encendidas: 6, total: 10 },
    { nombre: 'Misión', encendidas: 2, total: 5 },
    { nombre: 'Visión', encendidas: 0, total: 5 },
  ];
  return (
    <div className="space-y-2 border border-[var(--l-paper-line)] bg-[var(--l-paper-2)] p-2.5">
      {filas.map((f) => (
        <div key={f.nombre} className="flex items-center gap-2 font-mono text-[10px]">
          <span className="w-[62px] shrink-0">{f.nombre}</span>
          <span className="flex gap-[3px]" aria-hidden="true">
            {Array.from({ length: f.total }, (_, i) => (
              <span
                key={i}
                className={`h-[7px] w-[7px] ${i < f.encendidas ? 'bg-[var(--l-green)]' : 'border border-[var(--l-paper-line)]'}`}
              />
            ))}
          </span>
          <span className="ml-auto text-[var(--l-paper-soft)]">
            {f.encendidas ? `${f.encendidas}/${f.total}` : 'sin rastro'}
          </span>
        </div>
      ))}
    </div>
  );
}

function PiezaConversacion() {
  return (
    <div className="border border-[var(--l-paper-line)] bg-[var(--l-paper-2)] p-2.5">
      <div className="space-y-1.5" aria-hidden="true">
        <span className="block h-1.5 w-[92%] bg-[var(--l-paper-line)]" />
        <span className="block h-1.5 w-[78%] bg-[var(--l-paper-line)]" />
        <span className="block h-1.5 w-[55%] bg-[var(--l-paper-line)]" />
      </div>
      <span className="mt-2.5 inline-flex items-center gap-1.5 bg-[var(--l-blue)] px-2 py-1 font-mono text-[10px] text-white">
        Copiar y abrir LinkedIn ↗
      </span>
    </div>
  );
}

const CANALES: { color: string; canal: string; titulo: string; texto: string; pieza: ReactNode }[] = [
  {
    color: 'var(--l-red)',
    canal: 'Señal',
    titulo: 'Startups con momentum, cada noche',
    texto:
      'Rondas, lanzamientos y equipos que crecen. El lead llega con la razón para hablar ahora, nunca en frío.',
    pieza: <PiezaSenal />,
  },
  {
    color: 'var(--l-green)',
    canal: 'Análisis',
    titulo: 'Su marca, leída componente a componente',
    texto:
      'El Scanner encuentra lo que la marca dice y lo que calla. De ahí sale un ángulo que solo sirve para esa startup.',
    pieza: <PiezaAnalisis />,
  },
  {
    color: 'var(--l-blue)',
    canal: 'Conversación',
    titulo: 'Un borrador, no un envío',
    texto:
      'Argumentario, mensaje y brief de llamada por founder. Lo copias, lo ajustas y lo mandas tú desde LinkedIn.',
    pieza: <PiezaConversacion />,
  },
];

// Las cifras del método, no del negocio: son las que se pueden comprobar en
// cualquier informe del Scanner.
const CIFRAS: { n: string; unidad: string; texto: string }[] = [
  {
    n: '10',
    unidad: 'componentes de marca',
    texto: 'De Propósito a Coherencia. Magnetismo y Coherencia pesan el doble.',
  },
  {
    n: '80',
    unidad: 'baldosas',
    texto: 'Cada una se enciende solo si hay una cita literal de la marca que la sostenga.',
  },
  {
    n: '100',
    unidad: 'puntos',
    texto: 'La nota es la suma de lo que se enciende. Se puede rastrear hasta la frase.',
  },
];

// ---------- la página ----------

const BTN =
  'inline-flex items-center justify-center rounded-[2px] px-5 py-2.5 text-sm font-medium transition-[transform,opacity,background-color,border-color] duration-150 active:scale-[0.97]';

export default function LandingPage() {
  return (
    <div style={PALETA} className="min-h-screen overflow-x-clip bg-[var(--l-ink)] font-sans text-[var(--l-ink-text)]">
      {/* El aviso de arriba, en el azul de B3S: lleva a la animática. */}
      <Link
        href="#como-funciona"
        className="group flex items-center justify-center gap-2 bg-[var(--l-blue)] px-4 py-2 text-center text-[13px] text-white"
      >
        <span>Así lee una marca B3S Scanner, en dos minutos</span>
        <span className="transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true">
          →
        </span>
      </Link>

      <header className="bg-[var(--l-ink)]">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between border-x border-dashed border-[var(--l-ink-line)] px-6 py-4 sm:px-12">
          <span className="flex items-center gap-2 text-[var(--l-ink-text)]">
            <Logo />
            <span className="font-mono text-xs font-semibold text-[var(--l-ink-muted)]">Leads</span>
          </span>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="#como-funciona" className="hidden text-[var(--l-ink-muted)] transition-colors hover:text-[var(--l-ink-text)] sm:inline">
              Cómo funciona
            </Link>
            <a
              href={SCANNER}
              target="_blank"
              rel="noreferrer"
              className="hidden text-[var(--l-ink-muted)] transition-colors hover:text-[var(--l-ink-text)] sm:inline"
            >
              El Scanner ↗
            </a>
            <Link href="/login" className={`${BTN} bg-[var(--l-ink-text)] px-4 py-2 text-[var(--l-ink)] hover:opacity-90`}>
              Entrar
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <Franja tono="ink" className="pb-14 pt-16 sm:pb-20 sm:pt-24">
        <Etiqueta tono="ink">Generación de leads de valor · por FLOC*</Etiqueta>
        {/* Dos tonos, como el titular de Doss: lo que se promete en claro y
            la otra mitad en gris. */}
        <h1 className="mt-6 text-[44px] font-medium leading-[1.02] tracking-[-0.035em] sm:text-[68px] lg:text-[80px]">
          <span className="block">Atrae founders.</span>
          <span className="block text-[var(--l-ink-soft)]">No los persigas.</span>
        </h1>
        <p className="mt-7 max-w-[46ch] text-[17px] leading-relaxed text-[var(--l-ink-muted)]">
          Detectamos startups con momentum, leemos su marca con B3S Scanner y te damos el ángulo
          exacto para abrir la conversación. El envío lo haces tú.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link href="/login" className={`${BTN} bg-[var(--l-ink-text)] text-[var(--l-ink)] hover:opacity-90`}>
            Empezar
          </Link>
          <Link
            href="#como-funciona"
            className={`${BTN} border border-[var(--l-ink-line)] text-[var(--l-ink-text)] hover:border-[var(--l-ink-muted)]`}
          >
            Ver cómo funciona ↓
          </Link>
        </div>
      </Franja>

      {/* ── La animática, bajo el titular ── */}
      <Franja tono="ink" id="como-funciona" divisor className="pb-24 pt-14 sm:pb-28">
        <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
          <div>
            <Etiqueta tono="ink">Cómo funciona</Etiqueta>
            <h2 className="mt-4 text-[32px] font-medium leading-[1.08] tracking-[-0.03em] text-balance sm:text-[44px]">
              Del dominio al informe, sin caja negra
            </h2>
          </div>
          <p className="max-w-[48ch] text-[15px] leading-relaxed text-[var(--l-ink-muted)]">
            El Scanner visita la web de la marca, guarda cada página con su fecha y su huella,
            ordena la evidencia en nueve bloques y la interpreta componente a componente. Cada punto
            de la nota lleva a la frase que lo sostiene.
          </p>
        </div>

        <ScannerFilm />

        <p className="mt-14 max-w-[70ch] font-mono text-[11px] leading-relaxed text-[var(--l-ink-soft)] sm:mt-16">
          Animática ilustrativa del equipo de Brand3. El escenario y los estados no son un scan
          real; el 68/100 es un ejemplo aritmético. Sin sonido.
        </p>
      </Franja>

      {/* ── El método, en cifras ── */}
      <Franja tono="paper" className="py-20 sm:py-24">
        <Etiqueta tono="paper">El método</Etiqueta>
        <h2 className="mt-4 max-w-[20ch] text-[32px] font-medium leading-[1.08] tracking-[-0.03em] text-balance sm:text-[44px]">
          Una nota que se puede auditar
        </h2>
        <div className="mt-12 grid border-y border-[var(--l-paper-line)] sm:grid-cols-3">
          {CIFRAS.map((c, i) => (
            <div
              key={c.unidad}
              className={`py-8 sm:px-8 sm:py-10 ${i > 0 ? 'border-t border-[var(--l-paper-line)] sm:border-l sm:border-t-0' : ''} ${i === 0 ? 'sm:pl-0' : ''}`}
            >
              <p className="text-[64px] font-medium leading-none tracking-[-0.04em] tabular-nums sm:text-[76px]">
                {c.n}
              </p>
              <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--l-paper-muted)]">
                {c.unidad}
              </p>
              <p className="mt-3 max-w-[30ch] text-sm leading-relaxed text-[var(--l-paper-muted)]">{c.texto}</p>
            </div>
          ))}
        </div>
      </Franja>

      {/* ── Los tres canales ── */}
      <Franja tono="paper" divisor className="py-20 sm:py-24">
        <Etiqueta tono="paper">De la señal a la conversación</Etiqueta>
        <h2 className="mt-4 max-w-[22ch] text-[32px] font-medium leading-[1.08] tracking-[-0.03em] text-balance sm:text-[44px]">
          Tres canales, un lead con contexto
        </h2>
        <div className="mt-12 divide-y divide-[var(--l-paper-line)] border-y border-[var(--l-paper-line)]">
          {CANALES.map((c) => (
            <div key={c.canal} className="grid gap-6 py-8 sm:grid-cols-[250px_1fr] sm:gap-10 sm:py-10">
              <div className="max-w-[280px]">{c.pieza}</div>
              <div>
                <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: c.color }}>
                  <span className="h-1.5 w-6" style={{ background: c.color }} aria-hidden="true" />
                  {c.canal}
                </p>
                <h3 className="mt-3 text-[22px] font-medium leading-snug tracking-[-0.02em] sm:text-[26px]">{c.titulo}</h3>
                <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-[var(--l-paper-muted)]">{c.texto}</p>
              </div>
            </div>
          ))}
        </div>
      </Franja>

      {/* ── El principio ──
          Donde Doss pone un testimonio a cuerpo grande, aquí va lo único que
          B3S Leads no negocia. No es una cita de nadie: es la regla. */}
      <Franja tono="paper" divisor className="py-24 sm:py-32">
        <blockquote>
          <p className="max-w-[18ch] text-[40px] font-medium leading-[1.05] tracking-[-0.035em] text-balance sm:text-[60px]">
            El envío es siempre humano.
          </p>
          <p className="mt-6 max-w-[52ch] text-[17px] leading-relaxed text-[var(--l-paper-muted)]">
            Nada de automatizar LinkedIn ni de mandar ráfagas. B3S Leads prepara el contexto y el
            borrador; la conversación la abres tú, founder a founder. Por eso responden.
          </p>
        </blockquote>
      </Franja>

      {/* ── Cierre ── */}
      <Franja tono="ink" className="py-24 sm:py-28">
        <h2 className="max-w-[18ch] text-[36px] font-medium leading-[1.05] tracking-[-0.035em] text-balance sm:text-[56px]">
          Tu próximo cliente ya levantó ronda.
        </h2>
        <p className="mt-6 max-w-[46ch] text-[17px] leading-relaxed text-[var(--l-ink-muted)]">
          Encuéntralo, entiende su marca mejor que él y ábrele una conversación que no pueda ignorar.
        </p>
        <Link href="/login" className={`${BTN} mt-9 bg-[var(--l-ink-text)] text-[var(--l-ink)] hover:opacity-90`}>
          Entrar en B3S Leads
        </Link>
      </Franja>

      <footer className="bg-[var(--l-ink)]">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-4 border-x border-t border-dashed border-[var(--l-ink-line)] px-6 py-6 font-mono text-xs text-[var(--l-ink-soft)] sm:px-12">
          <span className="flex items-center gap-2 text-[var(--l-ink-muted)]">
            <Logo />
            <span>Leads · por FLOC*</span>
          </span>
          <span className="flex flex-wrap items-center gap-5">
            <Link href="#como-funciona" className="transition-colors hover:text-[var(--l-ink-text)]">
              Cómo funciona
            </Link>
            <a href={SCANNER} target="_blank" rel="noreferrer" className="transition-colors hover:text-[var(--l-ink-text)]">
              B3S Scanner ↗
            </a>
            <a href="https://wearefloc.com" target="_blank" rel="noreferrer" className="transition-colors hover:text-[var(--l-ink-text)]">
              wearefloc.com ↗
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
