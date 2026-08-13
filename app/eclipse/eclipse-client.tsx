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

function Eclipse({
  avance,
  size = '100%',
  quieto = false,
  teleport = false,
}: {
  avance: number;
  // Acepta pixeles o el 100% del contenedor: el escenario grande manda su
  // tamaño en vh y los minis en px.
  size?: number | string;
  // El hero: la totalidad en reposo, sin diamante (ese destello se reserva
  // para el final del scan, cuando significa algo) y con la luz de la corona
  // escapando en un loop lento.
  quieto?: boolean;
  // Recolocar la luna sin animar: se usa bajo el fundido a negro.
  teleport?: boolean;
}) {
  const total = avance >= 1;
  // El halo solo existe cerca de la totalidad: antes ensuciaba el limbo con
  // un contorno gris que no era ni sol ni luna.
  const halo = total ? 1 : Math.max(0, (avance - 0.78) * 4);
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
          animation: total ? 'ecl-respirar 11s ease-in-out infinite' : undefined,
        }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at 50% 44%, rgba(${GRIS},0.32) 25%, rgba(${GRIS},0.11) 40%, rgba(${GRIS},0.03) 53%, transparent 67%)`,
            filter: 'blur(7px)',
          }}
        />
      </div>

      {/* El sol: un disco blanco NÍTIDO que quema por resplandor, no por
          degradado. Un SOLO resplandor con caída continua: la segunda capa
          gris que había antes tenía spread propio y dibujaba un aro alrededor
          del disco, un contorno que el sol no tiene. */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: '#fff',
          boxShadow: `0 0 ${86 - avance * 44}px 0 rgba(255,255,255,${0.34 - avance * 0.2})`,
          transition: 'box-shadow 900ms ease-out',
        }}
      />

      {/* La luna: gemela del sol, negra de verdad, borde nítido. Entra en
          diagonal desde arriba a la izquierda, como un cuerpo celeste y no
          como un slider. En modo teleport aparece ya colocada: es el fundido
          a negro del arranque del scan. */}
      <div
        className="absolute rounded-full"
        style={{
          inset: '-0.5%',
          background: '#000',
          transform: `translate(${(avance - 1) * 102}%, ${(1 - avance) * -16}%)`,
          transition: teleport ? 'none' : 'transform 1400ms cubic-bezier(0.34, 0.88, 0.4, 1)',
        }}
      />

      {/* La corona del limbo: anillo blanco fino y quemado, lóbulo superior
          más vivo. Solo en la totalidad. */}
      <div
        className="pointer-events-none absolute rounded-full"
        style={{
          inset: '-0.5%',
          opacity: total ? 1 : 0,
          transition: 'opacity 2000ms ease-out 300ms',
          boxShadow: `0 0 14px 3px rgba(${BLANCO},0.75), 0 0 44px 12px rgba(${GRIS},0.34), 0 0 120px 38px rgba(${GRIS},0.1)`,
        }}
      />

      {/* Las hebras de la corona: luz que escapa y gira despacio. */}
      {total && (
        <div
          className="pointer-events-none absolute rounded-full"
          style={{
            inset: '-20%',
            background:
              'conic-gradient(from 0deg, rgba(255,255,255,0) 0deg, rgba(226,232,244,0.11) 42deg, rgba(255,255,255,0) 96deg, rgba(226,232,244,0.07) 168deg, rgba(255,255,255,0) 226deg, rgba(226,232,244,0.09) 305deg, rgba(255,255,255,0) 360deg)',
            filter: 'blur(12px)',
            WebkitMaskImage:
              'radial-gradient(circle, transparent 44%, black 51%, rgba(0,0,0,0.7) 60%, transparent 72%)',
            maskImage:
              'radial-gradient(circle, transparent 44%, black 51%, rgba(0,0,0,0.7) 60%, transparent 72%)',
            animation: 'ecl-rotar 80s linear infinite',
          }}
        />
      )}

      {/* El anillo de diamante: destello BLANCO del segundo contacto. */}
      {total && !quieto && (
        <div
          className="pointer-events-none absolute rounded-full"
          style={{
            top: '4.5%',
            right: '18%',
            width: '6.5%',
            height: '6.5%',
            background: `radial-gradient(circle, #fff 0%, rgba(${BLANCO},0.85) 32%, transparent 64%)`,
            boxShadow: `0 0 30px 10px rgba(255,255,255,0.75), 0 0 90px 34px rgba(${GRIS},0.28)`,
            filter: 'blur(0.6px)',
            animation: 'ecl-diamante 2600ms cubic-bezier(0.23, 1, 0.32, 1) forwards',
          }}
        />
      )}
    </div>
  );
}

// ---------- la cuenta atrás ----------
// El siguiente eclipse total visible desde España: 2 de agosto de 2027, que
// cruza el sur andaluz, Ceuta y Melilla. Se cuenta hasta la medianoche del
// día en hora peninsular, no hasta el minuto de la totalidad: la fecha es el
// dato, y así el contador no finge una precisión que no tiene.
const PROXIMO_ECLIPSE = Date.UTC(2027, 7, 1, 22, 0, 0);

function CuentaAtras() {
  // Arranca en null y se rellena tras montar: el servidor y el cliente no
  // comparten reloj, y pintarlo en el HTML daría un error de hidratación.
  const [restante, setRestante] = useState<number | null>(null);
  useEffect(() => {
    const tic = () => setRestante(Math.max(0, PROXIMO_ECLIPSE - Date.now()));
    tic();
    const id = setInterval(tic, 1000);
    return () => clearInterval(id);
  }, []);

  const seg = restante == null ? null : Math.floor(restante / 1000);
  const dd = seg == null ? null : Math.floor(seg / 86400);
  const hh = seg == null ? null : Math.floor((seg % 86400) / 3600);
  const mm = seg == null ? null : Math.floor((seg % 3600) / 60);
  const ss = seg == null ? null : seg % 60;
  const dos = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="text-right font-mono text-[11px] uppercase leading-relaxed tracking-[0.25em] text-white/35">
      <div>Próximo eclipse</div>
      {/* Altura reservada aunque no haya cifras todavía: sin esto el header
          da un salto en cuanto monta el componente. */}
      <div className="tabular-nums text-white/55">
        {dd == null ? ' ' : `${dd}d ${dos(hh!)}h ${dos(mm!)}m ${dos(ss!)}s`}
      </div>
    </div>
  );
}

const FIELD =
  'ecl-campo w-full border-0 border-b border-white/15 bg-transparent px-0 py-2.5 text-lg text-white outline-none transition-colors placeholder:text-white/25 focus:border-white/60';

export function EclipseClient() {
  const [fase, setFase] = useState<Fase>('intro');
  const [domain, setDomain] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [avance, setAvance] = useState(0.82); // el hero enseña un eclipse a medias
  const [result, setResult] = useState<EclipseResult | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  // El telón: un negro que cubre la pantalla mientras la luna se recoloca al
  // otro lado. Sin él se veía rebobinar el disco, que es justo lo contrario
  // de un eclipse.
  const [telon, setTelon] = useState(false);
  const [teleport, setTeleport] = useState(false);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);
  const inicio = useRef(0);
  // El resultado puede llegar mientras el telón sigue bajado. Si eso pasa, el
  // aterrizaje ya está en marcha y el animador lento del scan no debe
  // arrancar: dos animadores sobre el mismo avance se pisan y gana el que
  // corre después, que congelaba la luna en el punto de partida.
  const aterrizando = useRef(false);

  useEffect(() => () => timers.current.forEach(clearInterval), []);

  // El avance durante el scan: rápido al principio, asintótico al 96% hasta
  // que el resultado llega de verdad. La totalidad solo ocurre con dato.
  function animarProgreso(esperadoMs: number) {
    if (aterrizando.current) return;
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
    if (aterrizando.current) return;
    aterrizando.current = true;
    timers.current.forEach(clearInterval);
    const transcurrido = Date.now() - inicio.current;
    // El fundido ocupa el primer segundo y medio: si el resultado llega
    // dentro de esa ventana, el eclipse aún no ha empezado y hay que
    // recorrerlo entero igual.
    const restante = transcurrido < 6_500 ? 7_000 - Math.max(0, transcurrido - 1_600) : 0;
    if (restante) {
      // Nunca se mueve la luna bajo el telón: el fundido dura 1,55s y lo que
      // pasa debajo no se ve, así que sería tiempo de eclipse regalado.
      const t0 = Date.now() + Math.max(0, 1_650 - (Date.now() - inicio.current));
      const t = setInterval(() => {
        const x = (Date.now() - t0) / restante;
        if (x < 0) return;
        if (x >= 1) {
          clearInterval(t);
          setAvance(1);
          // La totalidad se saborea: la corona tarda 2s en abrirse.
          setTimeout(fin, 3200);
        } else {
          // Velocidad constante, que es como se mueve la luna de verdad. Con
          // una curva suavizada el tramo medio pasaba volando y la fase azul
          // no llegaba a verse.
          setAvance(0.04 + x * 0.94);
        }
      }, 90);
      timers.current.push(t);
    } else {
      setAvance(1);
      // La totalidad se saborea: diamante, corona, y entonces el después.
      setTimeout(fin, 3200);
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
    // Fundido a negro: bajo el telón se recoloca la luna al inicio de su
    // trayecto (sin animar) y se levanta con las estrellas y el disco ya en
    // su sitio. Lo que se ve después es solo eclipse, nunca un rebobinado.
    inicio.current = Date.now();
    aterrizando.current = false;
    setTelon(true);
    setTimeout(() => {
      setTeleport(true);
      setFase('escaneando');
      setAvance(0.04);
      setTimeout(() => {
        setTelon(false);
        setTeleport(false);
        animarProgreso(90_000);
      }, 700);
    }, 850);
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
    ? `Ayer el eclipse. Hoy el de mi marca: ${result.score}/100 en B3S. Brilla: ${result.brilla.label.toLowerCase()}. Se eclipsa: ${result.eclipsa.label.toLowerCase()}.\n\nEscanea la tuya gratis: ${urlCompartir}`
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
          0% { opacity: 0; transform: scale(0.4) }
          22% { opacity: 0.9; transform: scale(1) }
          100% { opacity: 0; transform: scale(2.2) }
        }
        /* Chrome pinta los campos autocompletados de azul y se carga la
           escena. No hay propiedad para desactivarlo: se tapa con una sombra
           interior enorme del color del fondo y se fuerza el color del texto. */
        .ecl-campo:-webkit-autofill,
        .ecl-campo:-webkit-autofill:hover,
        .ecl-campo:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 1000px #000 inset !important;
          box-shadow: 0 0 0 1000px #000 inset !important;
          -webkit-text-fill-color: #fff !important;
          caret-color: #fff;
          transition: background-color 9999s ease-in-out 0s;
        }
        .ecl-campo::selection { background: rgba(255,255,255,0.2) }
        @keyframes ecl-grano {
          0% { transform: translate(0, 0) }
          33% { transform: translate(-2%, 1.5%) }
          66% { transform: translate(1.5%, -2%) }
          100% { transform: translate(0, 0) }
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

      {/* Las estrellas van DETRÁS del disco: son cielo, no polvo sobre la
          luna. Antes iban por encima para sobrevivir al telón del fundido;
          ahora el fundido lo hace el propio contenido, así que sobra. */}
      <div className="relative z-0">
        <Estrellas intensidad={intensidadEstrellas} />
      </div>

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

      {/* El cielo respira el color de la fase: rojo, azul, verde, muy tenue
          y lejos del disco. El tinte pegado al limbo ensuciaba la figura. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          background: `radial-gradient(circle at 50% 44%, rgba(${tinteDeFase(avance, false)},0.07), transparent 52%)`,
          opacity: fase === 'escaneando' && avance < 1 ? 1 : 0,
          transition: 'opacity 1400ms ease-out, background 1600ms ease-out',
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

      {/* Grano de película: rompe los degradados y quita el plástico. Es la
          diferencia entre un render y una fotografía. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-30 opacity-[0.055] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")",
          animation: 'ecl-grano 1.1s steps(3) infinite',
        }}
      />

      {/* Header: solo el símbolo, como en B3S Leads. */}
      <header className="z-10 flex w-full max-w-3xl items-center justify-between pt-6">
        <LogoMark size={26} />
        <CuentaAtras />
      </header>

      {/* El fundido del arranque lo hace el propio contenido, no un telón
          negro a pantalla completa: así el cielo estrellado sigue ahí
          mientras la luna se recoloca al otro lado. */}
      <div
        className="z-10 flex w-full flex-1 flex-col items-center justify-center py-10 text-center"
        style={{
          opacity: telon ? 0 : 1,
          transition: telon ? 'opacity 800ms ease-in' : 'opacity 1500ms ease-out',
        }}
      >
        {/* El escenario: UN solo disco, grande como la página, compartido por
            la bienvenida y el scan. En la intro es la totalidad en reposo con
            el contenido viviendo DENTRO del disco negro; al escanear, el
            contenido se desvanece, la luna se retira (el antes) y el
            fenómeno se recorre entero para tu marca. Sin cortes: el mismo
            cuerpo celeste todo el rato. */}
        {(fase === 'intro' || fase === 'escaneando') && (
          /* El disco nunca baja de 430px: en móvil el cuadrado inscrito en un
             círculo de 92vw no da para el titular, las cuatro frases y el
             formulario, y el contenido se salía por los lados. A partir de ahí
             el círculo sangra por los bordes de la pantalla, que es justo el
             aspecto de una totalidad. En escritorio manda 74vh, como antes. */
          <div
            className="relative flex items-center justify-center"
            style={{
              width: 'min(74vh, max(92vw, 430px))',
              height: 'min(74vh, max(92vw, 430px))',
            }}
          >
            <Eclipse
              avance={fase === 'intro' ? 1 : avance}
              quieto={fase === 'intro'}
              teleport={teleport}
            />
            {fase === 'intro' && (
              /* Ancho propio, no un porcentaje del disco: el círculo puede
                 crecer o sangrar por los bordes sin arrastrar al texto. */
              <div
                className="absolute inset-0 mx-auto flex max-w-[21rem] flex-col items-center justify-center px-6 text-center"
                style={{ animation: 'ecl-entrar 900ms cubic-bezier(0.23, 1, 0.32, 1)' }}
              >
                <h1 className="text-balance text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                  Un antes y un después.
                </h1>
                {/* Cada frase en su línea: el ritmo es parte del mensaje y una
                    sola parrafada lo perdería. Los saltos son de bloque, no
                    <br>, para que una frase larga siga pudiendo partirse sola
                    en pantallas estrechas. */}
                <p className="mt-3 max-w-sm text-pretty text-sm leading-relaxed text-white/55">
                  <span className="block">Unos minutos de oscuridad y vuelta a la luz.</span>
                  <span className="block">Los ciclos se ven cuando acaban.</span>
                  <span className="block">Mira en cuál está tu marca y hacia dónde mira:</span>
                  <span className="block">Escanéala ahora gratis con B3S Scanner.</span>
                </p>

                <div className="mt-7 w-full max-w-[19rem] space-y-3 text-left">
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
                    className="w-full rounded-md bg-white py-2.5 text-center text-sm font-medium text-black transition-transform active:scale-[0.98]"
                  >
                    Escanear mi marca
                  </button>
                  <p className="text-center font-mono text-[10px] leading-relaxed text-white/30">
                    Pruébalo ya, el análisis completo te lo enviaremos al email.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {fase === 'escaneando' && (
          <>
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
                <Eclipse avance={1} size={56} quieto />
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
                B3S Scanner by FLOC* · {result.demo ? 'simulación local' : 'Eclipse 12.08.2026'}
              </p>
            </div>

            {/* El después: qué pasa ahora y el puente a GTM. */}
            <div className="mx-auto mt-8 max-w-md text-left">
              <p className="text-sm leading-relaxed text-white/60">
                El análisis completo de los 9 componentes llega a <strong className="text-white/90">{email}</strong>.
                Ya estás en la lista de B3S, el scanner que mide marcas como se miden métricas.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-white/60">
                El eclipse duró dos minutos. Un ciclo de marca dura trimestres y se decide al
                principio, cuando se eligen los objetivos y se dice hacia dónde se mira. Si el
                próximo de <strong className="text-white/90">{domain}</strong> empieza ahora,{' '}
                <strong className="text-white/90">GTM by FLOC*</strong> es el sistema para salir al
                mercado con una marca que distingue: estrategia, narrativa y lanzamiento en un solo
                paquete.
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
            <div className="flex justify-center">
              <Eclipse avance={1} quieto size={220} />
            </div>
            <h2 className="mt-12 text-2xl font-bold tracking-tight">Tu marca está en el eclipse.</h2>
            <p className="mt-4 text-sm leading-relaxed text-white/60">
              El scan de <strong className="text-white/90">{domain}</strong> está en cola. El
              resultado y el análisis completo llegarán a{' '}
              <strong className="text-white/90">{email}</strong> cuando vuelva la luz. Ya estás en
              la lista de B3S.
            </p>
          </div>
        )}
      </div>

      <footer className="z-10 w-full max-w-3xl pb-6 text-center font-mono text-[11px] text-white/25">
        Informe de narrativa de marca diseñado por inteligencias combinadas y nuestra firma humana ·
        B3S Scanner by FLOC*
      </footer>
    </main>
  );
}
