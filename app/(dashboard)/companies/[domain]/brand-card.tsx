'use client';

import { useEffect, useRef, useState } from 'react';
import { BTN_OUTLINE, BTN_WHITE } from '../../buttons';
import { CARD_LAYOUT, cardBand, type CardCell } from '@/lib/brand-card';
import { LogoMark } from '../../logo-mark';

// La tarjeta se compone SIEMPRE a 1080×1080 y se escala para verse. Así lo
// que se descarga es idéntico a lo que se ve y no depende del ancho de la
// ventana: exportar a ojo es la forma segura de que un día salga cortada.
const SIZE = 1080;

// Un solo tamaño de letra en todas las celdas: la tarjeta se lee homogénea y,
// de paso, entra más información que cuando cada zona tenía el suyo. Lo único
// que cambia por fila es cuántas líneas caben antes del recorte.
const CELL_TEXT = 'text-[18px]';

// El mismo criterio de la parrilla de la ficha: por proporción, para que
// funcione con cualquier máximo (/5, /10 y el /20 de Magnetismo).
// <50% rojo · 50-79% azul · >=80% verde. Los colores van fijos y en su valor
// de tema oscuro: la tarjeta es negra siempre, la genere quien la genere.
function scoreTone(score: number | null, max: number | null): string {
  if (score == null || !max) return 'border-white/15 text-white/35';
  if (score === 0) return 'border-white/20 text-white';
  const ratio = score / max;
  if (ratio < 0.5) return 'border-[#ff0000]/60 text-[#ff0000]';
  if (ratio < 0.8) return 'border-[#4d6bff]/70 text-[#4d6bff]';
  return 'border-[#00d554]/60 text-[#00d554]';
}

function Cell({ cell, clamp }: { cell: CardCell; clamp: string }) {
  const empty = !cell.text && !cell.terms;
  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded-[18px] border px-6 py-4 ${
        empty ? 'border-dashed border-white/15' : 'border-white/12 bg-white/[0.045]'
      }`}
    >
      {/* Etiqueta a la izquierda y la nota del componente en su esquina: el
          detalle que convierte la tarjeta en un análisis. */}
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[12px] uppercase tracking-[0.18em] text-white/40">
          {cell.label}
        </span>
        <span
          className={`inline-flex h-[26px] shrink-0 items-center rounded border px-1.5 font-mono text-[13px] ${scoreTone(cell.score, cell.max)}`}
        >
          {cell.score != null && cell.max ? `${cell.score}/${cell.max}` : 'sin rastro'}
        </span>
      </div>
      {cell.terms ? (
        <div className="mt-2.5 flex flex-wrap gap-2 overflow-hidden">
          {cell.terms.map((t) => (
            <span
              key={t}
              className="rounded-full border border-white/20 px-3.5 py-1 text-[17px] font-medium text-white"
            >
              {t}
            </span>
          ))}
        </div>
      ) : cell.text ? (
        <p className={`mt-2 font-semibold leading-[1.3] text-white ${CELL_TEXT} ${clamp}`}>
          {cell.text}
        </p>
      ) : (
        <p className={`mt-2 italic text-white/30 ${CELL_TEXT}`}>Sin rastro de huella digital</p>
      )}
    </div>
  );
}

export function BrandCard({
  company,
  domain,
  logoUrl,
  score,
  cells,
  initialHighlight,
  coverage,
}: {
  company: string;
  domain: string;
  logoUrl: string | null;
  score: number | null;
  cells: Record<string, CardCell>;
  initialHighlight: string;
  coverage: { detected: number; total: number };
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [highlight, setHighlight] = useState(initialHighlight);
  const [showScore, setShowScore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // La escala se calcula del ancho real disponible: la tarjeta se ve entera
  // en cualquier columna sin dejar de medir 1080 por dentro.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const fit = () => setScale(box.clientWidth / SIZE);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  async function render(): Promise<Blob | null> {
    if (!cardRef.current) return null;
    // Import diferido: la librería de exportación solo se descarga cuando de
    // verdad se exporta, no al abrir la pestaña.
    const { toBlob } = await import('html-to-image');
    return toBlob(cardRef.current, {
      width: SIZE,
      height: SIZE,
      pixelRatio: 1,
      cacheBust: true,
      backgroundColor: '#000000',
      // El nodo se clona CON su transform, así que sin anularlo la tarjeta
      // salía encogida en una esquina del PNG: el scale es de la vista
      // previa, no del entregable.
      style: { transform: 'none', transformOrigin: 'top left' },
    });
  }

  async function download() {
    setBusy(true);
    try {
      const blob = await render();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${domain.replace(/\./g, '-')}-brand-seed.png`;
      a.click();
      URL.revokeObjectURL(url);
      setCopied('Descargada');
      setTimeout(() => setCopied(null), 2000);
    } finally {
      setBusy(false);
    }
  }

  // Copiar al portapapeles: para pegarla directamente en el mensaje de
  // LinkedIn sin pasar por la carpeta de descargas.
  async function copyImage() {
    setBusy(true);
    try {
      const blob = await render();
      if (!blob) return;
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied('Copiada');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied('Tu navegador no deja copiar imágenes: descárgala');
      setTimeout(() => setCopied(null), 4000);
    } finally {
      setBusy(false);
    }
  }

  const band = score != null ? cardBand(score) : null;

  return (
    <div className="space-y-3">
      {/* Controles: lo único editable es lo que de verdad cambia según a quién
          se le manda. El resto sale del scan y no se retoca a mano. */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <label className="block font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
          Frase destacada
        </label>
        <textarea
          value={highlight}
          onChange={(e) => setHighlight(e.target.value)}
          rows={2}
          placeholder="La lectura que quieres que lea primero"
          className="mt-1.5 w-full resize-none rounded-md border border-[var(--border)] bg-[var(--bg)] p-2.5 text-sm leading-relaxed outline-none transition-colors focus:border-[var(--cta)]"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--muted)]">
            <input
              type="checkbox"
              checked={showScore}
              onChange={(e) => setShowScore(e.target.checked)}
              className="accent-[var(--cta)]"
            />
            Enseñar la puntuación
          </label>
          <button onClick={copyImage} disabled={busy} className={`${BTN_OUTLINE} ml-auto`}>
            {busy ? 'Generando…' : 'Copiar imagen'}
          </button>
          <button onClick={download} disabled={busy} className={BTN_WHITE}>
            Descargar PNG
          </button>
        </div>
        {copied && <p className="mt-2 text-xs text-[var(--cta)]">{copied}</p>}
        {!showScore && (
          <p className="mt-2 text-xs text-[var(--muted)]">
            Sin puntuación la tarjeta es solo su marca leída en alto. Suele funcionar mejor en un
            primer mensaje: el número invita a discutir la nota, no la marca.
          </p>
        )}
      </div>

      {/* Contenedor que mide; dentro, la tarjeta real a tamaño fijo. */}
      <div ref={boxRef} style={{ height: SIZE * scale }} className="overflow-hidden">
        <div
          ref={cardRef}
          style={{
            width: SIZE,
            height: SIZE,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
          className="flex flex-col bg-black p-14 font-sans text-white"
        >
          {/* Cabecera: su logo a la izquierda, el nuestro a la derecha. */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-5">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt=""
                  crossOrigin="anonymous"
                  className="h-[76px] w-[76px] rounded-[14px] bg-white object-contain p-1.5"
                />
              ) : (
                <span className="flex h-[76px] w-[76px] items-center justify-center rounded-[14px] bg-white text-[30px] font-bold text-black">
                  {company.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span>
                <span className="block text-[34px] font-bold leading-none tracking-tight">
                  {company}
                </span>
                <span className="mt-2 block font-mono text-[17px] text-white/45">{domain}</span>
              </span>
            </div>
            <LogoMark size={52} />
          </div>

          {/* La valoración y la frase: lo primero que se lee. */}
          <div className="mt-7 flex h-[106px] items-start gap-5 overflow-hidden">
            {showScore && score != null && (
              // Mismo cuadrado que el logo de la marca, para que la columna de
              // la izquierda quede aplomada de arriba abajo.
              <span className="flex h-[76px] w-[76px] shrink-0 flex-col items-center justify-center rounded-[14px] border border-white/15">
                <span className="font-mono text-[34px] font-medium leading-none">
                  {Math.round(score)}
                </span>
                <span className="mt-1 font-mono text-[11px] text-white/40">/100</span>
              </span>
            )}
            <span className="min-w-0 flex-1">
              {band && showScore && (
                <span className="block font-mono text-[13px] uppercase tracking-[0.18em] text-white/40">
                  {band}
                </span>
              )}
              <span
                className={`block font-semibold leading-[1.25] ${
                  highlight.length > 120 ? 'text-[24px] line-clamp-3' : 'text-[29px] line-clamp-2'
                } ${band && showScore ? 'mt-2' : ''}`}
              >
                {highlight}
              </span>
            </span>
          </div>

          {/* El Brand Seed, en el mismo orden que la pestaña B3S Seed. */}
          <div className="mt-8 flex flex-col gap-4">
            <div className="grid h-[184px] grid-cols-2 gap-4">
              {CARD_LAYOUT.top.map((k) => (
                <Cell key={k} cell={cells[k]} clamp="line-clamp-5" />
              ))}
            </div>
            <div className="grid h-[170px] grid-cols-3 gap-4">
              {CARD_LAYOUT.middle.map((k) => (
                <Cell key={k} cell={cells[k]} clamp="line-clamp-4" />
              ))}
            </div>
            <div className="grid h-[116px] grid-cols-2 gap-4">
              {CARD_LAYOUT.terms.map((k) => (
                <Cell key={k} cell={cells[k]} clamp="line-clamp-2" />
              ))}
            </div>
            <div className="grid h-[166px] grid-cols-2 gap-4">
              {CARD_LAYOUT.bottom.map((k) => (
                <Cell key={k} cell={cells[k]} clamp="line-clamp-4" />
              ))}
            </div>
          </div>

          {/* Pie: de dónde sale esto. La cobertura es el dato honesto y, de
              paso, el motivo de la conversación. */}
          <div className="mt-auto flex items-center justify-between pt-6 font-mono text-[14px] text-white/35">
            <span>
              {coverage.detected} de {coverage.total} componentes detectados
            </span>
            <span>Análisis B3S Scanner by FLOC*</span>
          </div>
        </div>
      </div>
    </div>
  );
}
