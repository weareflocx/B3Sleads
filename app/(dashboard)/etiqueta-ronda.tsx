import Link from 'next/link';
import { Fragment } from 'react';
import { ETIQUETA_RONDA, fechaCorta, nombreRonda, type SenalRonda } from '@/lib/senal-ronda';
import { resolveInvestors } from '@/lib/investors';

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

// El módulo de ronda de la cabecera de la ficha: TODO lo de la ronda en una
// sola línea y una sola vez. Estado (la etiqueta), qué ronda e importe, cuándo,
// con quién (los inversores llevan a su ficha) y la fuente. Antes la ronda
// salía tres veces: la etiqueta, una línea de detalle y la fila antigua de
// "RONDA series-a · 18M€" con un chip por inversor.
export function ModuloRonda({ senal }: { senal: SenalRonda | null }) {
  if (!senal) {
    return <p className="font-mono text-xs text-[var(--soft)]">Sin ronda detectada</p>;
  }
  const qué = [nombreRonda(senal.ronda), senal.importe ? (senal.tipo === 'buscando' ? `buscan ${senal.importe}` : senal.importe) : null]
    .filter(Boolean)
    .join(' · ');
  const inversores = resolveInvestors(senal.inversores);
  const visibles = inversores.slice(0, 3);
  const resto = inversores.length - visibles.length;

  const partes: React.ReactNode[] = [];
  if (qué) partes.push(<span className="font-medium text-[var(--text)]">{qué}</span>);
  partes.push(<span>{fechaCorta(senal.fecha)}</span>);
  if (visibles.length) {
    partes.push(
      <span title={inversores.map((i) => i.name).join(', ')}>
        con{' '}
        {visibles.map((inv, i) => (
          <Fragment key={inv.slug}>
            {i > 0 && (i === visibles.length - 1 && resto === 0 ? ' y ' : ', ')}
            <Link href={inv.href} className="text-[var(--text)] hover:underline">
              {inv.name}
            </Link>
          </Fragment>
        ))}
        {resto > 0 && ` y ${resto} más`}
      </span>,
    );
  }
  if (senal.fuente) {
    partes.push(
      <a href={senal.fuente} target="_blank" rel="noreferrer" className="hover:text-[var(--text)] hover:underline">
        fuente ↗
      </a>,
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--muted)]">
      <EtiquetaRonda senal={senal} />
      {partes.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <span aria-hidden="true" className="text-[var(--soft)]">·</span>}
          {p}
        </Fragment>
      ))}
    </div>
  );
}
