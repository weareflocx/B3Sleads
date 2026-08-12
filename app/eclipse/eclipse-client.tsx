'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LogoMark } from '../(dashboard)/logo-mark';
import type { EclipseResult } from '@/lib/eclipse';

// El Eclipse Scan: la landing de captación del 12 de agosto de 2026, el día
// del eclipse total sobre España. La idea entera cabe en una frase: un
// eclipse es un antes y un después, también para una marca.
//
// El motion está calcado del fenómeno real, porque es lo que lo hace creíble:
// según la luna avanza, el cielo se oscurece y salen las estrellas; justo en
// el segundo contacto destella el anillo de diamante; y en la totalidad
// aparece la corona, que respira. Nada de barras de progreso: el progreso ES
// el eclipse.

type Fase = 'intro' | 'escaneando' | 'resultado' | 'cola';

// ---------- cielo ----------
// Estrellas deterministas (misma semilla en servidor y cliente: sin saltos de
// hidratación). Dos capas con titileo desfasado; su intensidad la gobierna la
// fase: emergen conforme el día se apaga, como en el eclipse de verdad.
function Estrellas({ intensidad }: { intensidad: number }) {
  const capas = useMemo(() => {
    let s = 20260812;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
    const capa = (n: number) =>
      Array.from({ length: n }, () => {
        const x = (rnd() * 100).toFixed(2);
        const y = (rnd() * 100).toFixed(2);
        const alfa = (0.12 + rnd() * 0.4).toFixed(2);
        const radio = rnd() > 0.9 ? '1px' : '0.5px';
        return `${x}vw ${y}vh 0 ${radio} rgba(255,255,255,${alfa})`;
      }).join(', ');
    return [capa(60), capa(45)];
  }, []);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0"
      style={{ opacity: intensidad, transition: 'opacity 1800ms ease-out' }}
    >
      <div
        className="absolute h-px w-px"
        style={{ boxShadow: capas[0], animation: 'ecl-titilar 4.5s ease-in-out infinite' }}
      />
      <div
        className="absolute h-px w-px"
        style={{ boxShadow: capas[1], animation: 'ecl-titilar 6.5s ease-in-out 1.8s infinite' }}
      />
    </div>
  );
}

// ---------- el disco ----------
// Calcado de la fotografía de una totalidad, en escala de grises: disco
// negro de borde nítido, corona blanca pegada al limbo con el lóbulo
// superior más vivo (las coronas reales son asimétricas) y halo que muere
// en negro. El único color es un tinte que hace el viaje de la casa:
// ROJO mientras se lee, AZUL mientras se mide, VERDE al calcular. En la
// totalidad, blanco puro: el veredicto no tiene color.
const GRIS = '226,232,244';
const BLANCO = '255,255,255';

// El tinte según el avance: los mismos umbrales que los mensajes de fase.
function tinteDeFase(avance: number, total: boolean): string {
  if (total) return BLANCO;
  if (avance < 0.35) return '255,0,0';
  if (avance < 0.7) return '0,0,255';
  return '0,213,84';
}

function Eclipse({ avance, size = 280 }: { avance: number; size?: number }) {
  const total = avance >= 1;
  const tinte = tinteDeFase(avance, total);
  // El halo asoma en el último tramo del parcial y explota en la totalidad.
  const halo = total ? 1 : Math.max(0, (avance - 0.55) * 0.8);
  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      role="img"
      aria-label="Eclipse solar"
    >
      {/* Halo exterior: gris difuso, descentrado hacia arriba, respira. */}
      <div
        className="pointer-events-none absolute"
        style={{
          inset: '-45%',
          opacity: halo,
          transition: 'opacity 1400ms ease-out',
          animation: total ? 'ecl-respirar 6s ease-in-out infinite' : undefined,
        }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at 50% 42%, rgba(${GRIS},0.30) 24%, rgba(${GRIS},0.10) 40%, rgba(${GRIS},0.03) 52%, transparent 66%)`,
            filter: 'blur(6px)',
          }}
        />
      </div>

      {/* El tinte de fase: un aliento de color alrededor del disco, sutil.
          Rojo, azul, verde; nunca en la totalidad. */}
      <div
        className="pointer-events-none absolute rounded-full"
        style={{
          inset: '-6%',
          opacity: total ? 0 : 0.7,
          boxShadow: `0 0 64px 22px rgba(${tinte},0.14)`,
          transition: 'box-shadow 1200ms ease-out, opacity 900ms ease-out',
        }}
      />

      {/* El sol de las fases parciales: quema blanco. */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, #fff 56%, rgba(255,255,255,0.92) 68%, rgba(${GRIS},0.28) 85%, transparent 97%)`,
          boxShadow: `0 0 ${64 - avance * 34}px ${12 - avance * 8}px rgba(${BLANCO},${0.34 - avance * 0.2})`,
          transition: 'box-shadow 900ms ease-out',
        }}
      />

      {/* La luna: negra de verdad, borde nítido contra la corona. */}
      <div
        className="absolute rounded-full"
        style={{
          inset: '-1%',
          background: '#000',
          transform: `translateX(${(avance - 1) * 104}%)`,
          transition: 'transform 1100ms cubic-bezier(0.34, 0.88, 0.4, 1)',
        }}
      />

      {/* La corona del limbo: anillo blanco fino y quemado, lóbulo superior
          más vivo. Solo en la totalidad. */}
      <div
        className="pointer-events-none absolute rounded-full"
        style={{
          inset: '-0.5%',
          opacity: total ? 1 : 0,
          transition: 'opacity 1100ms ease-out 200ms',
          boxShadow: `0 0 14px 3px rgba(${BLANCO},0.8), 0 0 44px 12px rgba(${GRIS},0.38), 0 0 110px 34px rgba(${GRIS},0.12)`,
        }}
      />
      <div
        className="pointer-events-none absolute"
        style={{
          top: '-9%',
          left: '12%',
          width: '76%',
          height: '42%',
          opacity: total ? 1 : 0,
          transition: 'opacity 1300ms ease-out 350ms',
          background: `radial-gradient(ellipse at 50% 70%, rgba(${BLANCO},0.42) 0%, rgba(${GRIS},0.14) 45%, transparent 72%)`,
          filter: 'blur(10px)',
        }}
      />

      {/* El anillo de diamante: destello BLANCO del segundo contacto. */}
      {total && (
        <div
          className="pointer-events-none absolute rounded-full"
          style={{
            top: '3%',
            right: '14%',
            width: '10%',
            height: '10%',
            background: `radial-gradient(circle, #fff 0%, rgba(${BLANCO},0.92) 34%, transparent 68%)`,
            boxShadow: `0 0 44px 16px rgba(255,255,255,0.9), 0 0 120px 48px rgba(${GRIS},0.4)`,
            animation: 'ecl-diamante 1600ms cubic-bezier(0.23, 1, 0.32, 1) forwards',
          }}
        />
      )}
    </div>
  );
}

const FIELD =
  'w-full border-0 border-b border-white/20 bg-transparent px-0 py-2.5 text-lg text-white outline-none transition-colors placeholder:text-white/25 focus:border-white/70';

export function EclipseClient() {
  const [fase, setFase] = useState<Fase>('intro');
  const [domain, setDomain] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [avance, setAvance] = useState(0.82); // el hero enseña un eclipse a medias
  const [result, setResult] = useState<EclipseResult | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);
  const inicio = useRef(0);

  useEffect(() => () => timers.current.forEach(clearInterval), []);

  // El avance durante el scan: rápido al principio, asintótico al 96% hasta
  // que el resultado llega de verdad. La totalidad solo ocurre con dato.
  function animarProgreso(esperadoMs: number) {
    inicio.current = Date.now();
    const t = setInterval(() => {
      const x = (Date.now() - inicio.current) / esperadoMs;
      setAvance(Math.min(0.96, 1 - Math.exp(-2.2 * x)));
    }, 180);
    timers.current.push(t);
  }

  // Aterrizar en la totalidad. Si el resultado llegó volando (histórico de
  // B3S o demo), el eclipse no puede terminarse en un parpadeo: se comprime
  // la línea temporal para que el viaje entero se vea igual, rojo, azul,
  // verde, diamante, corona. Si el scan tardó lo suyo, la totalidad es ya.
  function aterrizar(fin: () => void) {
    timers.current.forEach(clearInterval);
    const transcurrido = Date.now() - inicio.current;
    const restante = transcurrido < 5_000 ? 5_600 : 0;
    if (restante) {
      const t0 = Date.now();
      const t = setInterval(() => {
        const x = (Date.now() - t0) / restante;
        if (x >= 1) {
          clearInterval(t);
          setAvance(1);
          setTimeout(fin, 2300);
        } else {
          setAvance(0.06 + x * 0.9);
        }
      }, 120);
      timers.current.push(t);
    } else {
      setAvance(1);
      // La totalidad se saborea: diamante, corona, y entonces el después.
      setTimeout(fin, 2300);
    }
  }

  function revelar(r: EclipseResult) {
    aterrizar(() => {
      setResult(r);
      setFase('resultado');
    });
  }

  function encolar() {
    aterrizar(() => setFase('cola'));
  }

  async function escanear() {
    setError(null);
    if (!/\./.test(domain)) return setError('Escribe el dominio de tu marca, tipo tumarca.com');
    if (!/@/.test(email)) return setError('El análisis completo llega por email: necesitamos uno de verdad.');
    setFase('escaneando');
    setAvance(0.05);
    animarProgreso(90_000);
    try {
      const res = await fetch('/api/eclipse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, email }),
      });
      const json = await res.json();
      if (res.status === 422) {
        timers.current.forEach(clearInterval);
        setFase('intro');
        setAvance(0.82);
        return setError(json.error);
      }
      if (json.status === 'ready') return revelar(json.result);
      if (json.status === 'queued') return encolar();
      // Scan en marcha: polling hasta la totalidad.
      const poll = setInterval(async () => {
        try {
          const r = await fetch(
            `/api/eclipse?job=${encodeURIComponent(json.job)}&email=${encodeURIComponent(email)}&domain=${encodeURIComponent(domain)}`,
          );
          const j = await r.json();
          if (j.status === 'ready') revelar(j.result);
          if (j.status === 'queued') encolar();
        } catch {
          // un fallo de red en un poll no rompe el eclipse: se reintenta
        }
      }, 5_000);
      timers.current.push(poll);
    } catch {
      encolar();
    }
  }

  // ---------- compartir ----------
  // La URL compartida lleva el resultado en la query: la página genera con
  // ella la tarjeta Open Graph, así LinkedIn y X pintan SU resultado y no un
  // banner genérico.
  const origen = typeof window !== 'undefined' ? window.location.origin : '';
  const urlCompartir = result
    ? `${origen}/eclipse?${new URLSearchParams({
        d: domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0],
        s: String(result.score),
        b: result.brilla.label,
        e: result.eclipsa.label,
      })}`
    : `${origen}/eclipse`;
  const postTexto = result
    ? `El eclipse ha pasado por mi marca: ${result.score}/100 en B3S. Brilla: ${result.brilla.label.toLowerCase()}. Se eclipsa: ${result.eclipsa.label.toLowerCase()}.\n\nEscanea la tuya gratis: ${urlCompartir}`
    : '';

  async function copiarPost() {
    await navigator.clipboard.writeText(postTexto);
    setCopiado('Post copiado. Pégalo al compartir.');
    setTimeout(() => setCopiado(null), 3000);
  }

  function compartirX() {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(postTexto)}`, '_blank');
  }

  async function compartirLinkedIn() {
    // LinkedIn no acepta texto prefijado: se copia al portapapeles y se abre
    // el share con la URL del resultado, cuya tarjeta OG sí es personalizada.
    await copiarPost();
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(urlCompartir)}`,
      '_blank',
    );
  }

  const cardRef = useRef<HTMLDivElement>(null);

  async function descargarImagen() {
    if (!cardRef.current) return;
    const { toBlob } = await import('html-to-image');
    const blob = await Promise.race([
      toBlob(cardRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor: '#000' }),
      new Promise<null>((r) => setTimeout(() => r(null), 12_000)),
    ]).catch(() => null);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eclipse-scan-${domain.replace(/\./g, '-')}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // El cielo se apaga con el avance: en la intro se intuyen estrellas, en la
  // totalidad se ven todas.
  const intensidadEstrellas =
    fase === 'intro' ? 0.3 : fase === 'escaneando' ? 0.15 + avance * 0.85 : 1;

  return (
    <main className="relative flex min-h-screen flex-col items-center overflow-hidden bg-black px-5 font-sans text-white">
      {/* Los keyframes del fenómeno. Viven aquí y no en globals: son de esta
          página y de ninguna otra. */}
      <style>{`
        @keyframes ecl-rotar { to { transform: rotate(360deg) } }
        @keyframes ecl-respirar {
          0%, 100% { transform: scale(1); opacity: 0.85 }
          50% { transform: scale(1.045); opacity: 1 }
        }
        @keyframes ecl-diamante {
          0% { opacity: 0; transform: scale(0.3) }
          16% { opacity: 1; transform: scale(1.1) }
          100% { opacity: 0; transform: scale(2.6) }
        }
        @keyframes ecl-bandas {
          from { opacity: 0.35; transform: translateX(-1.5%) }
          to { opacity: 1; transform: translateX(1.5%) }
        }
        @keyframes ecl-titilar {
          0%, 100% { opacity: 0.55 }
          50% { opacity: 1 }
        }
        @keyframes ecl-entrar {
          from { opacity: 0; transform: translateY(12px) }
          to { opacity: 1; transform: none }
        }
      `}</style>

      <Estrellas intensidad={intensidadEstrellas} />

      {/* La luz del horizonte: cálida al principio, muere con el avance y
          VUELVE tenue en la totalidad. Es el atardecer de 360 grados, el
          fenómeno que nadie espera la primera vez. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 h-72"
        style={{
          background: 'radial-gradient(60% 100% at 50% 100%, rgba(255,166,78,0.08), transparent)',
          opacity:
            fase === 'escaneando' ? (avance >= 1 ? 0.45 : (1 - avance) * 0.8) : fase === 'intro' ? 0.5 : 0,
          transition: 'opacity 1500ms ease-out',
        }}
      />

      {/* Las bandas de sombra: el parpadeo nervioso de la luz en el último
          tramo antes de la totalidad. Sutil hasta lo subliminal. */}
      {fase === 'escaneando' && avance > 0.88 && avance < 1 && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0"
          style={{
            background: 'linear-gradient(100deg, transparent 30%, rgba(226,232,244,0.05) 42%, transparent 54%, rgba(226,232,244,0.04) 68%, transparent 80%)',
            animation: 'ecl-bandas 460ms ease-in-out infinite alternate',
          }}
        />
      )}

      {/* Header: solo el símbolo, como en B3S Leads. */}
      <header className="z-10 flex w-full max-w-3xl items-center justify-between pt-6">
        <LogoMark size={26} />
        <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-white/35">
          12 · 08 · 2026
        </span>
      </header>

      <div className="z-10 flex w-full max-w-xl flex-1 flex-col items-center justify-center py-14 text-center">
        {fase === 'intro' && (
          <>
            <Eclipse avance={avance} />
            <h1 className="mt-12 text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              Hoy hay un antes y un después.
            </h1>
            <p className="mt-4 max-w-md text-pretty text-base leading-relaxed text-white/60">
              Un eclipse total cruza España por primera vez en un siglo. Dura dos minutos y lo
              cambia todo. A tu marca le puede pasar lo mismo: escanéala gratis con B3S y descubre
              qué brilla y qué se eclipsa.
            </p>

            <div className="mt-10 w-full max-w-sm space-y-4 text-left">
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="tumarca.com"
                aria-label="Dominio de tu marca"
                autoFocus
                className={FIELD}
                onKeyDown={(e) => e.key === 'Enter' && escanear()}
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="tu@email.com"
                aria-label="Tu email"
                className={FIELD}
                onKeyDown={(e) => e.key === 'Enter' && escanear()}
              />
              {error && <p className="text-sm text-[#ff6b6b]">{error}</p>}
              <button
                onClick={escanear}
                className="w-full rounded-md bg-white py-3 text-center text-sm font-medium text-black transition-transform active:scale-[0.98]"
              >
                Escanear mi marca
              </button>
              <p className="text-center font-mono text-[11px] leading-relaxed text-white/30">
                Gratis. El análisis completo llega a tu email y entras en la lista de B3S.
              </p>
            </div>
          </>
        )}

        {fase === 'escaneando' && (
          <>
            <Eclipse avance={avance} />
            <p
              className="mt-12 flex items-center justify-center gap-2.5 font-mono text-xs uppercase text-white/45"
              style={{
                letterSpacing: avance >= 1 ? '0.6em' : '0.25em',
                transition: 'letter-spacing 1800ms cubic-bezier(0.23, 1, 0.32, 1)',
              }}
            >
              {avance < 1 && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    background: `rgb(${tinteDeFase(avance, false)})`,
                    transition: 'background 900ms ease-out',
                  }}
                />
              )}
              {avance < 0.35
                ? 'Leyendo tu huella digital'
                : avance < 0.7
                  ? 'Midiendo los 9 componentes de tu marca'
                  : avance < 1
                    ? 'Calculando magnetismo y coherencia'
                    : 'Totalidad'}
            </p>
            {avance < 1 && (
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/45">
                {domain} está entrando en el eclipse. Esto tarda uno o dos minutos: lo que tarda en
                leerse una marca entera.
              </p>
            )}
          </>
        )}

        {fase === 'resultado' && result && (
          <div style={{ animation: 'ecl-entrar 800ms cubic-bezier(0.23, 1, 0.32, 1)' }} className="w-full">
            {/* La tarjeta del resultado: también es la imagen que se comparte. */}
            <div
              ref={cardRef}
              className="mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-white/12 bg-black p-8 text-left"
            >
              <div className="flex items-center justify-between">
                <Eclipse avance={1} size={56} />
                <LogoMark size={30} />
              </div>
              <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.25em] text-white/40">
                Eclipse Scan · {domain}
              </p>
              <div className="mt-3 flex items-baseline gap-3">
                <span className="font-mono text-6xl font-medium leading-none">{result.score}</span>
                <span className="font-mono text-sm text-white/40">/100 · {result.banda}</span>
              </div>

              <div className="mt-7 space-y-5">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#00d554]">
                    Lo que brilla · {result.brilla.label}
                  </p>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-white/85">
                    {result.brilla.frase}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#ff5555]">
                    Lo que se eclipsa · {result.eclipsa.label}
                  </p>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-white/85">
                    {result.eclipsa.frase}
                  </p>
                </div>
              </div>

              <p className="mt-7 border-t border-white/10 pt-4 font-mono text-[11px] text-white/30">
                B3S Scanner by FLOC* · {result.demo ? 'simulación local' : '12.08.2026'}
              </p>
            </div>

            {/* El después: qué pasa ahora y el puente a GTM. */}
            <div className="mx-auto mt-8 max-w-md text-left">
              <p className="text-sm leading-relaxed text-white/60">
                El análisis completo de los 9 componentes llega a <strong className="text-white/90">{email}</strong>.
                Ya estás en la lista de B3S, el scanner que mide marcas como se miden métricas.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-white/60">
                Y si quieres que el después sea mejor que el antes: <strong className="text-white/90">GTM by FLOC*</strong> es
                el sistema para salir al mercado con una marca que distingue. Estrategia, narrativa
                y lanzamiento, en un solo paquete.
              </p>

              <div className="mt-7 flex flex-wrap gap-2">
                <button
                  onClick={compartirX}
                  className="rounded-md border border-white/25 px-4 py-2 text-sm text-white transition-colors hover:border-white/60"
                >
                  Compartir en X
                </button>
                <button
                  onClick={compartirLinkedIn}
                  className="rounded-md border border-[#0000ff] bg-[#0000ff]/20 px-4 py-2 text-sm text-white transition-colors hover:bg-[#0000ff]/35"
                >
                  Compartir en LinkedIn
                </button>
                <button
                  onClick={descargarImagen}
                  className="rounded-md border border-white/25 px-4 py-2 text-sm text-white transition-colors hover:border-white/60"
                >
                  Descargar imagen
                </button>
                <button
                  onClick={copiarPost}
                  className="rounded-md px-4 py-2 text-sm text-white/50 transition-colors hover:text-white"
                >
                  Copiar post
                </button>
              </div>
              {copiado && <p className="mt-3 text-xs text-[#00d554]">{copiado}</p>}
            </div>
          </div>
        )}

        {fase === 'cola' && (
          <div style={{ animation: 'ecl-entrar 800ms cubic-bezier(0.23, 1, 0.32, 1)' }} className="max-w-md">
            <Eclipse avance={1} />
            <h2 className="mt-12 text-2xl font-bold tracking-tight">Tu marca está en el eclipse.</h2>
            <p className="mt-4 text-sm leading-relaxed text-white/60">
              El scan de <strong className="text-white/90">{domain}</strong> está en cola. El
              resultado y el análisis completo llegarán a{' '}
              <strong className="text-white/90">{email}</strong> cuando la luz vuelva. Ya estás en
              la lista de B3S.
            </p>
          </div>
        )}
      </div>

      <footer className="z-10 w-full max-w-3xl pb-6 text-center font-mono text-[11px] text-white/25">
        B3S Scanner by FLOC* · el envío del análisis es humano, como todo lo que hacemos
      </footer>
    </main>
  );
}
