'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// La animática de Jesús sobre cómo lee una marca B3S Scanner, dentro de la
// landing.
//
// No es un vídeo: es un documento HTML (public/scanner/flujo.html) que pinta
// cualquier segundo de sus 2:15 con `B3SFlow.renderAt(t)`. Por eso se ve
// nítido a cualquier tamaño, pesa 88 KB y se puede saltar a un capítulo sin
// esperar a que cargue nada. Aquí solo se lleva el reloj: el dibujo lo hace
// la película.
//
// Se reproduce sola cuando está a la vista y se para cuando no. Con
// «reducir movimiento» no arranca: se queda en un fotograma que ya cuenta la
// historia, y se puede darle al play.

const ANCHO = 1920;
const ALTO = 1080;
const DURACION = 135;
// Tras el informe, una pausa antes de volver a empezar: sin ella, el final
// (lo que se lleva uno) desaparece en cuanto aparece.
const PAUSA_FINAL = 3;
// El fotograma que se enseña quieto: los nueve bloques, la imagen que mejor
// resume qué hace el Scanner.
const FOTOGRAMA_QUIETO = 60;

// Las nueve fases de la animática, con los mismos nombres que su propia barra
// de abajo. Así la pestaña activa dice lo mismo que la pantalla.
const FASES = [
  'URL',
  'Adquisición',
  'Evidencia',
  'Clasificar',
  'Interpretar',
  'Criterios',
  'Baldosas',
  'Score',
  'Informe',
];

interface Parada {
  t: number;
  phase: number;
}

// Cuándo empieza cada fase y en qué momento la cámara ya está en su primera
// estación (que es adonde se salta al pulsarla). Se calculan de las paradas
// de la película al cargar; estos son los de la versión actual, para que las
// pestañas funcionen antes de que cargue.
interface Tramo {
  inicio: number;
  estacion: number;
}
const TRAMOS_POR_DEFECTO: Tramo[] = [
  { inicio: 0, estacion: 0 },
  { inicio: 10.7, estacion: 14 },
  { inicio: 35.05, estacion: 40 },
  { inicio: 44.05, estacion: 49 },
  { inicio: 67.53, estacion: 69.4 },
  { inicio: 88.05, estacion: 93 },
  { inicio: 97.05, estacion: 102 },
  { inicio: 113.5, estacion: 119 },
  { inicio: 122.15, estacion: 126 },
];

// La fase que ENSEÑA la película en el instante t. Es la misma cuenta que
// hace ella para su marcador (su `interpolate`): entre dos paradas, la fase
// cambia al 45 % del tramo. Replicarla es lo que hace que la pestaña y la
// pantalla no se contradigan.
function faseEn(paradas: Parada[], t: number): number {
  if (paradas.length < 2) return 0;
  let j = 0;
  while (j < paradas.length - 2 && t > paradas[j + 1].t) j++;
  const a = paradas[j];
  const b = paradas[j + 1];
  const bruto = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
  return paradas[j + (bruto >= 0.45 ? 1 : 0)].phase;
}

function tramosDe(paradas: Parada[]): Tramo[] {
  return FASES.map((_, k) => {
    const s = paradas.findIndex((p) => p.phase === k);
    if (s <= 0) return { inicio: 0, estacion: 0 };
    const prev = paradas[s - 1];
    return { inicio: prev.t + 0.45 * (paradas[s].t - prev.t), estacion: paradas[s].t };
  });
}

type Pelicula = { B3SFlow?: { renderAt: (t: number) => void; data?: { stops?: Parada[] } } };

export function ScannerFilm() {
  const marco = useRef<HTMLDivElement>(null);
  const escenario = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const barras = useRef<(HTMLSpanElement | null)[]>([]);
  const paradas = useRef<Parada[]>([]);
  const tramos = useRef<Tramo[]>(TRAMOS_POR_DEFECTO);
  const tiempo = useRef(0);
  const ultimo = useRef(0);
  const enPausaFinal = useRef(0);
  const visible = useRef(false);
  // Si la persona pausó, no se vuelve a arrancar sola al hacer scroll.
  const pausadoAMano = useRef(false);

  const [lista, setLista] = useState(false);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [capitulo, setCapitulo] = useState(0);
  const [reducir, setReducir] = useState(false);

  // Dibuja un instante. El reloj y las barras de progreso se tocan en el DOM
  // directamente: son sesenta cambios por segundo y no merecen repintar React.
  const pinta = useCallback((t: number) => {
    tiempo.current = t;
    (iframe.current?.contentWindow as Pelicula | null)?.B3SFlow?.renderAt(t);
    const i = paradas.current.length ? faseEn(paradas.current, t) : 0;
    setCapitulo((c) => (c === i ? c : i));
    tramos.current.forEach((tr, k) => {
      const barra = barras.current[k];
      if (!barra) return;
      const fin = tramos.current[k + 1]?.inicio ?? DURACION;
      const p = t >= fin ? 1 : t <= tr.inicio ? 0 : (t - tr.inicio) / (fin - tr.inicio);
      barra.style.transform = `scaleX(${k === i ? p : k < i ? 1 : 0})`;
      barra.style.opacity = k === i ? '1' : '0';
    });
  }, []);

  // La película se diseñó a 1920 × 1080; aquí se encaja en el marco. En la
  // página el marco ya es 16:9 y basta el ancho; a pantalla completa la
  // pantalla puede no serlo, y entonces se encaja entera y centrada.
  useEffect(() => {
    const el = marco.current;
    if (!el) return;
    const ajusta = () => {
      const s = Math.min(el.clientWidth / ANCHO, el.clientHeight / ALTO);
      const x = (el.clientWidth - ANCHO * s) / 2;
      const y = (el.clientHeight - ALTO * s) / 2;
      if (escenario.current) escenario.current.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    };
    ajusta();
    const ro = new ResizeObserver(ajusta);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const lee = () => setReducir(mq.matches);
    lee();
    mq.addEventListener('change', lee);
    return () => mq.removeEventListener('change', lee);
  }, []);

  // Cuando la película avisa de que está lista, se pinta el primer fotograma.
  //
  // Hay tres formas de enterarse y hacen falta las tres. Si la película
  // termina de cargar ANTES de que React hidrate (pasa en cuanto la franja
  // queda cerca de la pantalla), ni el onLoad ni su mensaje llegan a nadie:
  // por eso, al montar, se pregunta directamente si ya está. Es lo mismo que
  // les pasaba a los logos (company-logo.tsx).
  useEffect(() => {
    if ((iframe.current?.contentWindow as Pelicula | null)?.B3SFlow) setLista(true);
    const alMensaje = (e: MessageEvent) => {
      if (e.source !== iframe.current?.contentWindow) return;
      if ((e.data as { source?: string; ready?: boolean })?.source === 'b3s-flow') setLista(true);
    };
    window.addEventListener('message', alMensaje);
    return () => window.removeEventListener('message', alMensaje);
  }, []);

  useEffect(() => {
    if (!lista) return;
    const stops = (iframe.current?.contentWindow as Pelicula | null)?.B3SFlow?.data?.stops;
    if (stops?.length) {
      paradas.current = stops;
      tramos.current = tramosDe(stops);
    }
    pinta(reducir ? FOTOGRAMA_QUIETO : tiempo.current);
  }, [lista, reducir, pinta]);

  // A la vista, se reproduce; fuera de ella, se para. Con reducir movimiento,
  // nunca arranca sola.
  useEffect(() => {
    const el = marco.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        visible.current = e.intersectionRatio >= 0.4;
        if (!visible.current) setReproduciendo(false);
        else if (!pausadoAMano.current && !reducir && lista) setReproduciendo(true);
      },
      { threshold: [0, 0.4, 0.8] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [lista, reducir]);

  // El reloj.
  useEffect(() => {
    if (!reproduciendo) return;
    let id = 0;
    ultimo.current = 0;
    const tic = (ahora: number) => {
      const dt = ultimo.current ? (ahora - ultimo.current) / 1000 : 0;
      ultimo.current = ahora;
      let t = tiempo.current + dt;
      if (t >= DURACION) {
        // Se queda en el informe un momento y vuelve a empezar.
        enPausaFinal.current += dt;
        t = DURACION;
        if (enPausaFinal.current >= PAUSA_FINAL) {
          enPausaFinal.current = 0;
          t = 0;
        }
      }
      pinta(t);
      id = requestAnimationFrame(tic);
    };
    id = requestAnimationFrame(tic);
    return () => cancelAnimationFrame(id);
  }, [reproduciendo, pinta]);

  function alternar() {
    if (!lista) return;
    if (reproduciendo) {
      pausadoAMano.current = true;
      setReproduciendo(false);
    } else {
      pausadoAMano.current = false;
      if (tiempo.current >= DURACION) pinta(0);
      setReproduciendo(true);
    }
  }

  function saltar(k: number) {
    if (!lista) return;
    enPausaFinal.current = 0;
    // A la primera estación de la fase, un segundo antes: se ve llegar la
    // cámara en vez de aparecer a mitad de un barrido.
    const tr = tramos.current[k];
    pinta(k === 0 ? 0 : Math.max(tr.inicio, tr.estacion - 1.2));
    // Elegir un capítulo es querer verlo: se reproduce desde ahí, salvo que
    // se haya pedido no mover nada.
    if (!reducir) {
      pausadoAMano.current = false;
      setReproduciendo(true);
    }
  }

  function pantallaCompleta() {
    const el = marco.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }

  return (
    <div>
      {/* Los capítulos, como las pestañas de producto de una landing: se ve
          en qué punto está la historia y se salta a cualquiera. La barra de
          cada uno se llena mientras dura. */}
      <div
        role="group"
        aria-label="Capítulos de la animática"
        className="-mx-1 flex snap-x gap-1 overflow-x-auto px-1 pb-3 [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_88%,transparent)] lg:[mask-image:none]"
      >
        {FASES.map((nombre, k) => (
          <button
            key={nombre}
            aria-current={k === capitulo ? 'step' : undefined}
            onClick={() => saltar(k)}
            className={`relative shrink-0 snap-start px-3 pb-2.5 pt-1.5 text-left font-mono text-[11px] uppercase tracking-wider transition-colors duration-150 ${
              k === capitulo ? 'text-[var(--l-ink-text)]' : 'text-[var(--l-ink-soft)] hover:text-[var(--l-ink-muted)]'
            }`}
          >
            <span className="mr-1.5 tabular-nums text-[var(--l-ink-soft)]">{String(k + 1).padStart(2, '0')}</span>
            {nombre}
            <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-px bg-[var(--l-ink-line)]" />
            <span
              aria-hidden="true"
              ref={(el) => {
                barras.current[k] = el;
              }}
              className="absolute inset-x-3 bottom-0 h-px origin-left bg-[var(--l-blue-on-ink)]"
              style={{ transform: 'scaleX(0)', opacity: 0 }}
            />
          </button>
        ))}
      </div>

      <div className="relative">
        {/* El marco. La película es clara sobre fondo oscuro, como la captura
            de producto de Doss: el contraste la separa de la página. */}
        <div
          ref={marco}
          className="relative aspect-video w-full overflow-hidden border border-[var(--l-ink-line)] bg-[#eeeeee]"
          aria-label="Animática: cómo lee una marca B3S Scanner, de la URL al informe"
          role="img"
        >
          <div
            ref={escenario}
            className="absolute left-0 top-0 origin-top-left"
            style={{ width: ANCHO, height: ALTO, transform: 'scale(0)' }}
          >
            <iframe
              ref={iframe}
              src="/scanner/flujo.html"
              title="Animática de B3S Scanner"
              loading="lazy"
              tabIndex={-1}
              aria-hidden="true"
              onLoad={() => {
                if ((iframe.current?.contentWindow as Pelicula | null)?.B3SFlow) setLista(true);
              }}
              className="pointer-events-none block border-0"
              style={{ width: ANCHO, height: ALTO }}
            />
          </div>
          {!lista && (
            <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] uppercase tracking-wider text-[#5d6b72]">
              cargando la animática…
            </span>
          )}
        </div>

        {/* La tarjeta que se monta sobre la esquina, como la de Doss sobre su
            foto: qué es esto y el mando. En móvil va debajo: la película mide
            ahí poco más de 180 px de alto y la tarjeta la tapaba entera. */}
        <div className="relative mt-3 flex items-center gap-4 border border-[var(--l-paper-line)] bg-[var(--l-paper)] px-4 py-3 text-[var(--l-paper-text)] shadow-[0_18px_40px_rgba(0,0,0,0.28)] sm:absolute sm:-bottom-8 sm:right-6 sm:mt-0 sm:w-[330px]">
          <button
            onClick={alternar}
            disabled={!lista}
            aria-label={reproduciendo ? 'Pausar la animática' : 'Reproducir la animática'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[2px] bg-[var(--l-ink)] text-[var(--l-ink-text)] transition-[transform,opacity] duration-150 active:scale-[0.97] disabled:opacity-40"
          >
            {reproduciendo ? (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <rect x="2" y="1.5" width="2.6" height="9" fill="currentColor" />
                <rect x="7.4" y="1.5" width="2.6" height="9" fill="currentColor" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M3 1.5v9l7.5-4.5z" fill="currentColor" />
              </svg>
            )}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[10px] uppercase tracking-wider text-[var(--l-paper-soft)]">
              De la URL al informe · 2:15
            </p>
            <p className="mt-0.5 truncate text-sm font-medium">{FASES[capitulo]}</p>
          </div>
          <button
            onClick={pantallaCompleta}
            aria-label="Ver a pantalla completa"
            title="Pantalla completa"
            className="shrink-0 p-1 text-[var(--l-paper-soft)] transition-colors hover:text-[var(--l-paper-text)]"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
              <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
