'use client';

import { useEffect, useState } from 'react';

// Reloj vivo del banner de la home: hora y fecha de Madrid, latiendo cada
// segundo. Se pinta tras montar (la hora del servidor y la del cliente nunca
// coinciden, y un mismatch de hidratación por un reloj sería pagar caro un
// adorno): hasta entonces reserva su sitio en silencio.
export function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const hora = now
    ? new Intl.DateTimeFormat('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Europe/Madrid',
      }).format(now)
    : '--:--:--';
  const fecha = now
    ? new Intl.DateTimeFormat('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'Europe/Madrid',
      }).format(now)
    : '';

  return (
    <div className="text-right">
      <p className="font-mono text-2xl tabular-nums tracking-tight">{hora}</p>
      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
        {fecha || ' '}
      </p>
    </div>
  );
}
