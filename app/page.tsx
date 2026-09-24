import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { Logo } from './(dashboard)/logo';
import { ScannerFilm } from './scanner-film';
import { Revela, Tecleo } from './entradas';

// Landing pública de B3S Leads.
//
// Para quién: la persona que dirige una agencia de marketing, branding o
// publicidad, o lleva sus cuentas, y quiere conseguir los proyectos que le
// apetece hacer. B3S Leads no es un radar de startups: es inteligencia de
// marca basada en datos. Detecta marcas con las que trabajar, lee qué les
// falta y las compara con su competencia en B3S Studio.
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
  title: 'B3S Leads · Inteligencia de marca para agencias',
  description:
    'Detecta marcas con las que trabajar, lee qué les falta y compáralas con su competencia. El envío es siempre humano.',
};

const PALETA = {
  '--l-ink': '#0b0d0e',
  '--l-ink-2': '#121615',
  '--l-ink-line': '#262d2b',
  '--l-ink-text': '#e7e4dc',
  '--l-ink-muted': '#9b968c',
  '--l-ink-soft': '#6c6862',
  '--l-blue-on-ink': '#5b6cff',
  // RGB puro, el de los tres canales del logo.
  '--l-red-on-ink': '#ff0000',
  '--l-green-on-ink': '#00ff00',
  '--l-blue-pure': '#0000ff',
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

// El retardo de una pieza en la coreografía de entrada (ver globals.css).
const d = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

// ---------- la rejilla ----------

// Una franja a todo lo ancho con su columna central. Los raíles de los lados
// son discontinuos y siguen de una franja a la siguiente: es la rejilla de
// arquitecto de Doss, y sale sola porque todas las franjas comparten ancho.
function Franja({
  tono,
  id,
  divisor = false,
  transparente = false,
  children,
  className = '',
}: {
  tono: 'ink' | 'paper';
  id?: string;
  // Sin fondo propio: el hero deja ver el vídeo que tiene detrás.
  transparente?: boolean;
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
      className={`${transparente ? '' : ink ? 'bg-[var(--l-ink)]' : 'bg-[var(--l-paper)]'} ${ink ? 'text-[var(--l-ink-text)]' : 'text-[var(--l-paper-text)]'} ${
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

function Etiqueta({
  children,
  tono,
  className = '',
  style,
}: {
  children: ReactNode;
  tono: 'ink' | 'paper';
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <p
      style={style}
      className={`font-mono text-[11px] uppercase tracking-[0.18em] ${
        tono === 'ink' ? 'text-[var(--l-ink-soft)]' : 'text-[var(--l-paper-soft)]'
      } ${className}`}
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
        { tipo: 'Rebranding', texto: 'Nombre nuevo', cuando: 'hace 2 d' },
        { tipo: 'Web nueva', texto: 'Relanzada', cuando: 'hace 6 d' },
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

// Una categoría en un mapa: la marca que interesa, con su anillo, entre sus
// competidores. Es la forma de B3S Studio, sin datos de nadie. Apaisada y
// con puntos pequeños, para que pese lo mismo que las otras piezas.
function PiezaStudio() {
  const puntos: [number, number][] = [
    [18, 8], [31, 15], [44, 5.5], [60, 13.5], [71, 8.5], [83, 16], [26, 18.5], [56, 17.5], [88, 6],
  ];
  return (
    <div className="border border-[var(--l-paper-line)] bg-[var(--l-paper-2)] px-2.5 pb-2 pt-2.5">
      <svg viewBox="0 0 100 22" className="block w-full" aria-hidden="true">
        <line x1="50" y1="1" x2="50" y2="21" stroke="var(--l-paper-line)" strokeWidth="0.35" />
        <line x1="2" y1="11" x2="98" y2="11" stroke="var(--l-paper-line)" strokeWidth="0.35" />
        {puntos.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="1.1" fill="var(--l-paper-soft)" fillOpacity="0.55" />
        ))}
        <circle cx="38" cy="7" r="2.6" fill="none" stroke="var(--l-blue)" strokeWidth="0.35" />
        <circle cx="38" cy="7" r="1.3" fill="var(--l-blue)" />
      </svg>
      <p className="mt-1 flex justify-between font-mono text-[9px] uppercase tracking-wider text-[var(--l-paper-soft)]">
        <span>funcional</span>
        <span>emocional</span>
      </p>
    </div>
  );
}

const CANALES: { color: string; canal: string; titulo: string; texto: string; pieza: ReactNode }[] = [
  {
    color: 'var(--l-red)',
    canal: 'Señal',
    titulo: 'Marcas en movimiento',
    texto:
      'Rebrandings, cambios de nombre, webs nuevas, lanzamientos, rondas, expansión a otros mercados. Cada marca llega con una razón para hablar ahora.',
    pieza: <PiezaSenal />,
  },
  {
    color: 'var(--l-green)',
    canal: 'Diagnóstico',
    titulo: 'Qué le falta a cada marca',
    texto:
      'El Scanner lee la marca componente a componente: lo que dice, lo que dice igual que todos y lo que no dice. Cada hueco, con su prueba.',
    pieza: <PiezaAnalisis />,
  },
  {
    color: 'var(--l-blue)',
    canal: 'B3S Studio',
    titulo: 'Su categoría, en una sola vista',
    texto:
      'Pones la marca junto a sus competidores y los lees con el mismo método: mapas de posicionamiento, medias por dimensión, el vocabulario que comparten y quién promete lo que nadie demuestra.',
    pieza: <PiezaStudio />,
  },
  {
    color: 'var(--l-paper-text)',
    canal: 'Conversación',
    titulo: 'Un borrador, no un envío',
    texto:
      'Argumentario, mensaje y brief de llamada para cada marca. Lo copias, lo ajustas y lo mandas tú.',
    pieza: <PiezaConversacion />,
  },
];

// Lo que la web tiene que enseñar nada más entrar, en tres verbos: lo que
// hace el Scanner, lo que hace B3S Studio y lo que hace B3S Leads. El color
// de cada uno es el de su fila más abajo, para que se reconozcan.
const CAPACIDADES: { color: string; titulo: string; texto: string }[] = [
  {
    color: 'var(--l-green-on-ink)',
    titulo: 'Analiza su estado actual',
    texto: 'Qué comunica su marca, qué no y qué suena como la de todos. Cada punto, con la frase que lo demuestra.',
  },
  {
    color: 'var(--l-blue-pure)',
    titulo: 'Compara con su competencia',
    texto: 'Sus competidores, leídos con el mismo método en B3S Studio: posicionamiento, medias por categoría y qué promete cada uno.',
  },
  {
    color: 'var(--l-red-on-ink)',
    titulo: 'Gestiona la captación',
    texto: 'Señales, seguimientos y borradores de mensaje en un solo sitio. El envío lo haces tú.',
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

// ---------- el fondo del hero ----------

// El bucle de B3Scan detrás del titular, al 35 %: presente sin competir con
// el texto. Recodificado para la web: 1600 × 900, sin audio y 1,3 MB en vez de 10 (el original pesaba
// más que toda la página). Mientras carga se ve su primer fotograma; con
// «reducir movimiento» se queda solo el fotograma. Abajo se funde con el
// negro de la franja siguiente para que no haya corte.
function FondoHero() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/media/hero-b3scan.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-35"
      />
      <video
        className="absolute inset-0 h-full w-full object-cover opacity-35 motion-reduce:hidden"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster="/media/hero-b3scan.jpg"
      >
        <source src="/media/hero-b3scan.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-b from-transparent via-[var(--l-ink)]/60 to-[var(--l-ink)]" />
    </div>
  );
}

// ---------- la página ----------

const BTN =
  'inline-flex items-center justify-center rounded-[2px] px-5 py-2.5 text-sm font-medium transition-[transform,opacity,background-color,border-color] duration-150 active:scale-[0.97]';

export default function LandingPage() {
  return (
    <div style={PALETA} className="min-h-screen overflow-x-clip bg-[var(--l-ink)] font-sans text-[var(--l-ink-text)]">
      <noscript>
        <style
          dangerouslySetInnerHTML={{
            __html: '[data-espera] .l-linea,[data-espera] .l-sube,[data-espera] .l-letra,[data-espera].l-linea,[data-espera].l-sube{animation-play-state:running!important}',
          }}
        />
      </noscript>

      {/* El aviso de arriba: lleva a la animática. El degradado va en el
          orden del logo, rojo, azul, verde (el mismo de la barra de progreso
          del scan). Así el centro, donde está el texto, es azul puro y el
          blanco se lee; con el verde en medio no se leería. En móvil el
          texto se acorta para no llegar a los extremos. */}
      <Link
        href="#como-funciona"
        className="group flex items-center justify-center gap-2 px-4 py-2 text-center text-[13px] font-medium text-white"
        style={{ background: 'linear-gradient(90deg, #ff0000 0%, #0000ff 50%, #00ff00 100%)' }}
      >
        <span className="hidden sm:inline">Así lee una marca B3S Scanner, en dos minutos</span>
        <span className="sm:hidden">Así lee una marca B3S Scanner</span>
        <span className="transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true">
          →
        </span>
      </Link>

      {/* Cabecera y hero comparten fondo: el bucle de B3Scan, a pantalla
          completa y a media opacidad. */}
      <div className="relative isolate">
        <FondoHero />
      <header>
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
      <Franja tono="ink" transparente className="pb-14 pt-16 sm:pb-20 sm:pt-24">
        {/* Dos tonos, como el titular de Doss: lo que se promete en claro y
            la otra mitad en gris. */}
        <h1 className="[text-shadow:0_0_24px_rgba(11,13,14,0.85),0_0_2px_rgba(11,13,14,0.6)] text-[36px] font-medium leading-[1.04] tracking-[-0.035em] text-balance sm:text-[50px] lg:text-[62px]">
          <span className="l-linea block" style={d(0)}>Inteligencia de marca</span>
          <span className="l-linea block text-[var(--l-ink-muted)]" style={d(120)}>para ganar nuevos proyectos.</span>
        </h1>
        <p className="[text-shadow:0_0_24px_rgba(11,13,14,0.85),0_0_2px_rgba(11,13,14,0.6)] mt-7 max-w-[48ch] text-[17px] leading-relaxed text-[var(--l-ink-muted)]">
          <Tecleo
            texto="B3S Leads detecta las marcas con las que puedes trabajar señalando, con datos y evidencias, lo que necesitan mejorar."
            inicio={420}
            paso={11}
          />
        </p>
        <div className="l-sube mt-9 flex flex-wrap items-center gap-3" style={d(700)}>
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

        {/* La promesa, y debajo las tres formas de cumplirla. */}
        <p className="[text-shadow:0_0_24px_rgba(11,13,14,0.85),0_0_2px_rgba(11,13,14,0.6)] l-linea mt-20 max-w-[30ch] text-[22px] font-medium leading-snug tracking-[-0.02em] text-balance sm:text-[28px]" style={d(950)}>
          Imagina llegar a la primera reunión con las pruebas que necesita su negocio.
        </p>
        <ul className="[text-shadow:0_0_24px_rgba(11,13,14,0.85),0_0_2px_rgba(11,13,14,0.6)] l-sube mt-8 grid border-t border-[var(--l-ink-line)] sm:grid-cols-3" style={d(1050)}>
          {CAPACIDADES.map((c, i) => (
            <li
              key={c.titulo}
              style={d(1120 + i * 90)}
              className={`l-sube pt-6 sm:pb-2 ${i > 0 ? 'mt-6 border-t border-[var(--l-ink-line)] sm:mt-0 sm:border-l sm:border-t-0 sm:pl-8' : ''} ${i < 2 ? 'sm:pr-8' : ''}`}
            >
              <span className="block h-1 w-8" style={{ background: c.color }} aria-hidden="true" />
              <p className="mt-4 text-[17px] font-medium tracking-[-0.01em] lg:text-[18px]">{c.titulo}</p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--l-ink-muted)]">{c.texto}</p>
            </li>
          ))}
        </ul>
      </Franja>
      </div>

      {/* ── La animática, bajo el titular ── */}
      <Franja tono="ink" id="como-funciona" divisor className="pb-24 pt-14 sm:pb-28">
        <Revela>
        <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
          <div>
            <Etiqueta tono="ink" className="l-sube" style={d(0)}>Cómo funciona</Etiqueta>
            <h2 className="mt-4 text-[32px] font-medium leading-[1.08] tracking-[-0.03em] text-balance sm:text-[44px]">
              <span className="l-linea inline-block" style={d(60)}>De la huella pública</span>{' '}
              <span className="l-linea inline-block text-[var(--l-ink-soft)]" style={d(170)}>al diagnóstico.</span>
            </h2>
          </div>
          <p className="max-w-[48ch] text-[15px] leading-relaxed text-[var(--l-ink-muted)]">
            <Tecleo
              texto="El Scanner visita la web de la marca, guarda cada página con su fecha y su huella, ordena la evidencia en nueve bloques y la interpreta componente a componente. Cada punto de la nota lleva a la frase que lo sostiene."
              inicio={300}
              paso={6}
            />
          </p>
        </div>

        <div className="l-sube" style={d(380)}>
          <ScannerFilm />
        </div>

        <p style={d(560)} className="l-sube mt-14 max-w-[70ch] font-mono text-[11px] leading-relaxed text-[var(--l-ink-soft)] sm:mt-16">
          Animática ilustrativa del equipo FLOC*.
          <br />
          El escenario y los estados no son un scan real; el 68/100 es un ejemplo aritmético.
        </p>
        </Revela>
      </Franja>

      {/* ── El método, en cifras ── */}
      <Franja tono="paper" className="py-20 sm:py-24">
        <Revela>
        <Etiqueta tono="paper" className="l-sube" style={d(0)}>El método</Etiqueta>
        <h2 className="l-linea mt-4 max-w-[20ch] text-[32px] font-medium leading-[1.08] tracking-[-0.03em] text-balance sm:text-[44px]" style={d(60)}>
          Una nota que se puede auditar
        </h2>
        <div className="mt-12 grid border-y border-[var(--l-paper-line)] sm:grid-cols-3">
          {CIFRAS.map((c, i) => (
            <div
              key={c.unidad}
              style={d(220 + i * 90)}
              className={`l-sube py-8 sm:px-8 sm:py-10 ${i > 0 ? 'border-t border-[var(--l-paper-line)] sm:border-l sm:border-t-0' : ''} ${i === 0 ? 'sm:pl-0' : ''}`}
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
        </Revela>
      </Franja>

      {/* ── Los tres canales ── */}
      <Franja tono="paper" divisor className="py-20 sm:py-24">
        <Revela>
        <Etiqueta tono="paper" className="l-sube" style={d(0)}>De la señal a la conversación</Etiqueta>
        <h2 className="l-linea mt-4 max-w-[22ch] text-[32px] font-medium leading-[1.08] tracking-[-0.03em] text-balance sm:text-[44px]" style={d(60)}>
          Cuatro pasos, ninguno a ciegas
        </h2>
        </Revela>
        <div className="mt-12 divide-y divide-[var(--l-paper-line)] border-y border-[var(--l-paper-line)]">
          {CANALES.map((c) => (
            <Revela key={c.canal} className="grid gap-6 py-8 sm:grid-cols-[250px_1fr] sm:gap-10 sm:py-10">
              <div className="l-sube max-w-[280px]" style={d(0)}>{c.pieza}</div>
              <div className="l-sube" style={d(90)}>
                <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: c.color }}>
                  <span className="h-1.5 w-6" style={{ background: c.color }} aria-hidden="true" />
                  {c.canal}
                </p>
                <h3 className="mt-3 text-[22px] font-medium leading-snug tracking-[-0.02em] sm:text-[26px]">{c.titulo}</h3>
                <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-[var(--l-paper-muted)]">{c.texto}</p>
              </div>
            </Revela>
          ))}
        </div>
      </Franja>

      {/* ── El principio ──
          Donde Doss pone un testimonio a cuerpo grande, aquí va lo único que
          B3S Leads no negocia. No es una cita de nadie: es la regla. */}
      <Franja tono="paper" divisor className="py-24 sm:py-32">
        <Revela>
        <blockquote>
          <p className="l-linea max-w-[18ch] text-[40px] font-medium leading-[1.05] tracking-[-0.035em] text-balance sm:text-[60px]" style={d(0)}>
            El envío es siempre humano.
          </p>
          <p className="mt-6 max-w-[52ch] text-[17px] leading-relaxed text-[var(--l-paper-muted)]">
            <Tecleo
              texto="Nada de automatizar LinkedIn ni de mandar ráfagas. B3S Leads prepara el contexto y el borrador; la conversación la abres tú, persona a persona. Por eso responden."
              inicio={350}
              paso={8}
            />
          </p>
        </blockquote>
        </Revela>
      </Franja>

      {/* ── Cierre ── */}
      <Franja tono="ink" className="py-24 sm:py-28">
        <Revela>
        <h2 className="l-linea max-w-[18ch] text-[36px] font-medium leading-[1.05] tracking-[-0.035em] text-balance sm:text-[56px]" style={d(0)}>
          Tu próximo cliente ya tiene una marca que mejorar.
        </h2>
        <p className="mt-6 max-w-[46ch] text-[17px] leading-relaxed text-[var(--l-ink-muted)]">
          <Tecleo
            texto="Encuéntrala, entiende qué le falta mejor que nadie y ábrele una conversación que no pueda ignorar."
            inicio={300}
            paso={9}
          />
        </p>
        <div className="l-sube mt-9" style={d(700)}>
          <Link href="/login" className={`${BTN} bg-[var(--l-ink-text)] text-[var(--l-ink)] hover:opacity-90`}>
            Entrar en B3S Leads
          </Link>
        </div>
        </Revela>
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
