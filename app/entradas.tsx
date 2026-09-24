'use client';

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

// Las entradas de la landing. El movimiento en sí vive en globals.css
// (.l-linea, .l-sube, .l-letra); aquí solo se decide CUÁNDO arranca.
//
// Lo que está por debajo de la pantalla llega del servidor en pausa
// ([data-espera]) y se suelta al entrar en ella, una sola vez. Lo que ya se
// ve al cargar no espera. Sin JavaScript, un <noscript> de la página lo
// suelta todo: nunca se queda nada escondido.

export function Revela({
  children,
  className = '',
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const soltar = () => el.removeAttribute('data-espera');
    // Ya a la vista al montar: que corra ya.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return soltar();
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        soltar();
        io.disconnect();
      },
      // Un poco antes del borde inferior: se ve arrancar, no aparecer hecho.
      { rootMargin: '0px 0px -12% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} data-espera="" className={className} style={style}>
      {children}
    </div>
  );
}

// Un texto que se escribe letra a letra, en una ola suave.
//
// Las letras van agrupadas por palabras que no se parten, para que el texto
// corte las líneas donde siempre. El lector de pantalla lee la frase entera
// de una vez (la copia oculta), no ciento veinte letras sueltas.
export function Tecleo({
  texto,
  inicio = 0,
  paso = 12,
}: {
  texto: string;
  // Cuándo empieza, en ms, y cuánto tarda cada letra en seguir a la anterior.
  inicio?: number;
  paso?: number;
}) {
  let i = 0;
  const palabras = texto.split(' ');
  return (
    <>
      <span className="sr-only">{texto}</span>
      <span aria-hidden="true">
        {palabras.map((p, k) => (
          <span key={k}>
            <span className="whitespace-nowrap">
              {[...p].map((c, j) => {
                const d = inicio + i++ * paso;
                return (
                  <span key={j} className="l-letra" style={{ '--d': `${d}ms` } as CSSProperties}>
                    {c}
                  </span>
                );
              })}
            </span>
            {k < palabras.length - 1 && ' '}
          </span>
        ))}
      </span>
    </>
  );
}
