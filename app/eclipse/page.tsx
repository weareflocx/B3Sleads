'use client';

import { useEffect, useRef, useState } from 'react';
import { LogoMark } from '../(dashboard)/logo-mark';
import type { EclipseResult } from '@/lib/eclipse';

// El Eclipse Scan: la landing de captación del 12 de agosto de 2026, el día
// del eclipse total sobre España. La idea entera cabe en una frase: un
// eclipse es un antes y un después, también para una marca. Escanéala gratis,
// mira qué brilla y qué se eclipsa, y si quieres que el después sea mejor,
// ahí está GTM by FLOC*.
//
// Una sola página, tres fases: pedir (URL + email), eclipsar (el progreso ES
// el eclipse: la luna cubre el sol mientras el Scanner trabaja) y revelar
// (score, una clave positiva, una negativa, y el puente a B3S y GTM).

type Fase = 'intro' | 'escaneando' | 'resultado' | 'cola';

// El disco. El mismo dibujo sirve para el hero (quieto, casi total) y para el
// progreso (la luna avanza con `avance` de 0 a 1; en 1, eclipse total).
function Eclipse({ avance, size = 260 }: { avance: number; size?: number }) {
  const total = avance >= 1;
  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      role="img"
      aria-label="Eclipse solar"
    >
      {/* El sol: un disco que quema. */}
      <div
        className="absolute inset-0 rounded-full transition-opacity duration-700"
        style={{
          background: 'radial-gradient(circle, #fff 58%, #ffe9c4 72%, rgba(255,210,140,0.25) 88%, transparent 100%)',
          boxShadow: total
            ? '0 0 90px 18px rgba(255,244,224,0.55), 0 0 200px 60px rgba(255,236,200,0.18)'
            : '0 0 70px 12px rgba(255,244,224,0.35)',
        }}
      />
      {/* La luna: entra desde la izquierda y lo cubre. */}
      <div
        className="absolute rounded-full"
        style={{
          inset: '-1.5%',
          background: '#000',
          transform: `translateX(${(avance - 1) * 106}%)`,
          transition: 'transform 900ms cubic-bezier(0.23, 1, 0.32, 1)',
        }}
      />
      {/* La corona, solo en la totalidad. */}
      <div
        className="absolute rounded-full transition-opacity duration-1000"
        style={{
          inset: '-2%',
          opacity: total ? 1 : 0,
          boxShadow:
            'inset 0 0 24px 2px rgba(255,255,255,0.85), 0 0 40px 6px rgba(255,255,255,0.5), 0 0 120px 30px rgba(200,215,255,0.25)',
        }}
      />
    </div>
  );
}

const FIELD =
  'w-full border-0 border-b border-white/20 bg-transparent px-0 py-2.5 text-lg text-white outline-none transition-colors placeholder:text-white/25 focus:border-white/70';

export default function EclipsePage() {
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

  function revelar(r: EclipseResult) {
    timers.current.forEach(clearInterval);
    setAvance(1);
    // La totalidad se saborea un segundo antes de enseñar el después.
    setTimeout(() => {
      setResult(r);
      setFase('resultado');
    }, 1400);
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
      if (json.status === 'queued') {
        timers.current.forEach(clearInterval);
        setAvance(1);
        return setTimeout(() => setFase('cola'), 1400);
      }
      // Scan en marcha: polling hasta la totalidad.
      const poll = setInterval(async () => {
        try {
          const r = await fetch(
            `/api/eclipse?job=${encodeURIComponent(json.job)}&email=${encodeURIComponent(email)}&domain=${encodeURIComponent(domain)}`,
          );
          const j = await r.json();
          if (j.status === 'ready') revelar(j.result);
          if (j.status === 'queued') {
            timers.current.forEach(clearInterval);
            setAvance(1);
            setTimeout(() => setFase('cola'), 1400);
          }
        } catch {
          // un fallo de red en un poll no rompe el eclipse: se reintenta
        }
      }, 5_000);
      timers.current.push(poll);
    } catch {
      timers.current.forEach(clearInterval);
      setAvance(1);
      setTimeout(() => setFase('cola'), 1200);
    }
  }

  // ---------- compartir ----------
  const urlLanding = typeof window !== 'undefined' ? `${window.location.origin}/eclipse` : '';
  const postTexto = result
    ? `Hoy el eclipse ha pasado por mi marca. B3S Scanner: ${result.score}/100.\n\nLo que brilla: ${result.brilla.label.toLowerCase()}. Lo que se eclipsa: ${result.eclipsa.label.toLowerCase()}.\n\nDespués de un eclipse hay un antes y un después. Escanea la tuya gratis: ${urlLanding}`
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
    // el share con la URL. Un paso extra, dicho en voz alta.
    await copiarPost();
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(urlLanding)}`,
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

  return (
    <main className="flex min-h-screen flex-col items-center bg-black px-5 font-sans text-white">
      {/* Header: solo el símbolo, como en B3S Leads. */}
      <header className="flex w-full max-w-3xl items-center justify-between pt-6">
        <LogoMark size={26} />
        <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-white/35">
          12 · 08 · 2026
        </span>
      </header>

      <div className="flex w-full max-w-xl flex-1 flex-col items-center justify-center py-14 text-center">
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
            <p className="mt-12 font-mono text-xs uppercase tracking-[0.25em] text-white/45">
              {avance < 0.35
                ? 'Leyendo tu huella digital'
                : avance < 0.7
                  ? 'Midiendo los 9 componentes de tu marca'
                  : avance < 1
                    ? 'Calculando magnetismo y coherencia'
                    : 'Totalidad'}
            </p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/45">
              {domain} está entrando en el eclipse. Esto tarda uno o dos minutos: lo que tarda en
              leerse una marca entera.
            </p>
          </>
        )}

        {fase === 'resultado' && result && (
          <div style={{ animation: 'b3s-fade 700ms ease-out' }} className="w-full">
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
          <div style={{ animation: 'b3s-fade 700ms ease-out' }} className="max-w-md">
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

      <footer className="w-full max-w-3xl pb-6 text-center font-mono text-[11px] text-white/25">
        B3S Scanner by FLOC* · el envío del análisis es humano, como todo lo que hacemos
      </footer>
    </main>
  );
}
