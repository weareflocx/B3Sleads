'use client';

import { useEffect, useRef } from 'react';

// Campo geométrico del hero: triángulos en contorno que crecen y toman su
// canal (rojo / verde / azul) cuando el ratón se acerca, y se apagan al
// alejarse. Minimalismo puro: solo transform, opacity y color, con ease-out
// fuerte para que el movimiento se sienta vivo pero discreto.
//
// Posiciones deterministas (PRNG con semilla fija) para que servidor y
// cliente rendericen lo mismo.
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260719);
const SHAPES = Array.from({ length: 26 }, (_, i) => ({
  x: 3 + rand() * 94, // % dentro del contenedor
  y: 6 + rand() * 86,
  rot: Math.floor(rand() * 360),
  size: 10 + Math.floor(rand() * 14),
  ch: i % 3, // canal RGB asignado
}));

const CHANNEL = ['var(--accent)', 'var(--cta)', 'var(--linkedin-soft)'];
const RADIUS = 230; // px de influencia del cursor

export function GeoField() {
  const layerRef = useRef<HTMLDivElement>(null);
  const shapeRefs = useRef<(SVGSVGElement | null)[]>([]);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const layer = layerRef.current;
    const parent = layer?.parentElement;
    if (!layer || !parent) return;

    function paint() {
      raf.current = null;
      const rect = layer!.getBoundingClientRect();
      const p = pointer.current;
      SHAPES.forEach((s, i) => {
        const el = shapeRefs.current[i];
        if (!el) return;
        let t = 0;
        if (p) {
          const cx = rect.left + (rect.width * s.x) / 100 + s.size / 2;
          const cy = rect.top + (rect.height * s.y) / 100 + s.size / 2;
          const d = Math.hypot(p.x - cx, p.y - cy);
          t = Math.max(0, 1 - d / RADIUS);
        }
        el.style.transform = `rotate(${s.rot}deg) scale(${1 + t * 1.5})`;
        el.style.opacity = String(0.25 + t * 0.65);
        el.style.color = t > 0.04 ? CHANNEL[s.ch] : 'var(--soft)';
      });
    }

    function schedule() {
      if (raf.current == null) raf.current = requestAnimationFrame(paint);
    }
    function onMove(e: PointerEvent) {
      pointer.current = { x: e.clientX, y: e.clientY };
      schedule();
    }
    function onLeave() {
      pointer.current = null;
      schedule();
    }

    parent.addEventListener('pointermove', onMove);
    parent.addEventListener('pointerleave', onLeave);
    return () => {
      parent.removeEventListener('pointermove', onMove);
      parent.removeEventListener('pointerleave', onLeave);
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div ref={layerRef} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {SHAPES.map((s, i) => (
        <svg
          key={i}
          ref={(el) => {
            shapeRefs.current[i] = el;
          }}
          viewBox="0 0 24 24"
          style={{
            position: 'absolute',
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            color: 'var(--soft)',
            opacity: 0.25,
            transform: `rotate(${s.rot}deg) scale(1)`,
            transition:
              'transform 350ms cubic-bezier(0.23, 1, 0.32, 1), opacity 350ms ease, color 350ms ease',
            willChange: 'transform, opacity',
          }}
        >
          <polygon points="12,3 21,20 3,20" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      ))}
    </div>
  );
}
