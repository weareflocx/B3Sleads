import { ETIQUETA_RONDA, fechaCorta, type SenalRonda } from '@/lib/senal-ronda';

// La señal de ronda en una etiqueta. Verde: ronda detectada (cerrada y
// anunciada). Azul: buscando ronda. Sin confirmar, el borde es discontinuo,
// el tono más tenue y lo dice. Sin señal no se pinta nada: esa empresa se ve
// igual que siempre.
export function EtiquetaRonda({ senal, tam = 'sm' }: { senal: SenalRonda | null; tam?: 'sm' | 'md' }) {
  if (!senal) return null;
  const color = senal.tipo === 'detectada' ? 'var(--success)' : 'var(--linkedin-soft)';
  return (
    <span
      title={`${ETIQUETA_RONDA[senal.tipo]}${senal.importe ? ` · ${senal.importe}` : ''} · ${fechaCorta(senal.fecha)}${senal.confirmada ? '' : ' · sin confirmar'}`}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded border font-mono ${
        tam === 'md' ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-px text-[10px]'
      } ${senal.confirmada ? '' : 'border-dashed opacity-60'}`}
      style={{ color, borderColor: `color-mix(in srgb, ${color} 55%, transparent)` }}
    >
      {ETIQUETA_RONDA[senal.tipo]}
      {!senal.confirmada && <span className="opacity-80">· sin confirmar</span>}
    </span>
  );
}

// Lo que va debajo, en la ficha: importe, fecha del anuncio y fuente.
export function DetalleRonda({ senal }: { senal: SenalRonda | null }) {
  if (!senal) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 font-mono text-xs text-[var(--muted)]">
      {senal.importe && <span>{senal.tipo === 'buscando' ? `buscan ${senal.importe}` : senal.importe}</span>}
      <span>{fechaCorta(senal.fecha)}</span>
      {senal.fuente && (
        <a href={senal.fuente} target="_blank" rel="noreferrer" className="hover:text-[var(--text)] hover:underline">
          fuente ↗
        </a>
      )}
    </span>
  );
}
