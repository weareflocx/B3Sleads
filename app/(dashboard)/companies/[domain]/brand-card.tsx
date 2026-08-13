'use client';

import { useEffect, useRef, useState } from 'react';
import { BTN_OUTLINE, BTN_WHITE } from '../../buttons';
import { CARD_LAYOUT, cardBand, type CardCell } from '@/lib/brand-card';
import { LogoMark } from '../../logo-mark';

// La tarjeta se compone SIEMPRE a 1080×1080 y se escala para verse. Así lo
// que se descarga es idéntico a lo que se ve y no depende del ancho de la
// ventana: exportar a ojo es la forma segura de que un día salga cortada.
const SIZE = 1080;
// Y se rasteriza a 1500: el maquetado no cambia, solo se dibuja con más
// pixeles. Subir el lienzo en vez de rehacer las medidas evita reabrir todo
// el ajuste de líneas que ya está comprobado.
const EXPORT = 1500;

// Un solo tamaño de letra en todas las celdas: la tarjeta se lee homogénea y,
// de paso, entra más información que cuando cada zona tenía el suyo. Lo único
// que cambia por fila es cuántas líneas caben antes del recorte.
const CELL_TEXT = 'text-[16px]';

// Los dos temas de la tarjeta. Van en estilos en línea y no en variables del
// producto porque la tarjeta la puede generar alguien con la app en claro y
// mandarla en oscuro: su color no puede depender del tema de quien exporta.
interface Tema {
  fondo: string;
  velo: string; // sobre una imagen de fondo, para que el texto siga legible
  // A qué banda de grises se lleva la imagen de fondo. En claro, blancos y
  // grises muy claros; en oscuro, negros y grises oscuros. Se aplica sobre
  // los pixeles, no con un filtro CSS: así el rango es exacto y no depende
  // de que el rasterizador respete el filtro.
  banda: [number, number];
  texto: string;
  suave: string;
  tenue: string;
  borde: string;
  bordeSuave: string;
  caja: string;
  notas: { bajo: string; medio: string; alto: string; nulo: string };
}

const TEMAS: Record<'oscuro' | 'claro', Tema> = {
  oscuro: {
    fondo: '#000000',
    velo: 'rgba(0,0,0,0.28)',
    banda: [6, 64],
    texto: '#ffffff',
    suave: 'rgba(255,255,255,0.45)',
    tenue: 'rgba(255,255,255,0.3)',
    borde: 'rgba(255,255,255,0.12)',
    bordeSuave: 'rgba(255,255,255,0.15)',
    caja: 'rgba(255,255,255,0.045)',
    notas: { bajo: '#ff0000', medio: '#4d6bff', alto: '#00d554', nulo: 'rgba(255,255,255,0.35)' },
  },
  claro: {
    fondo: '#ffffff',
    velo: 'rgba(255,255,255,0.3)',
    banda: [212, 252],
    texto: '#0b0d0e',
    suave: 'rgba(11,13,14,0.5)',
    tenue: 'rgba(11,13,14,0.35)',
    borde: 'rgba(11,13,14,0.14)',
    bordeSuave: 'rgba(11,13,14,0.18)',
    caja: 'rgba(11,13,14,0.035)',
    notas: { bajo: '#d40000', medio: '#2440d0', alto: '#1a7f37', nulo: 'rgba(11,13,14,0.4)' },
  },
};

// El mismo criterio de la parrilla de la ficha: por proporción, para que
// funcione con cualquier máximo (/5, /10 y el /20 de Magnetismo).
// <50% rojo · 50-79% azul · >=80% verde.
function colorNota(score: number | null, max: number | null, t: Tema): string {
  if (score == null || !max) return t.notas.nulo;
  if (score === 0) return t.texto;
  const ratio = score / max;
  if (ratio < 0.5) return t.notas.bajo;
  if (ratio < 0.8) return t.notas.medio;
  return t.notas.alto;
}

// El fondo, a escala de grises y comprimido a la banda del tema. Una foto a
// todo color detrás de la tarjeta se come el análisis; en grises y dentro de
// su banda se lee como textura y el contenido sigue mandando.
function aBandaDeGrises(src: string, banda: [number, number]): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        // Se reescala a 1400: da de sobra para 1500 de export y evita
        // arrastrar una foto de 4000px dentro del PNG.
        const lado = Math.min(1400, Math.max(img.width, img.height)) || 1400;
        const escala = lado / Math.max(img.width, img.height);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * escala);
        c.height = Math.round(img.height * escala);
        const ctx = c.getContext('2d');
        if (!ctx) return resolve(src);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const datos = ctx.getImageData(0, 0, c.width, c.height);
        const [min, max] = banda;
        const rango = max - min;
        for (let i = 0; i < datos.data.length; i += 4) {
          // Luma perceptual: un rojo saturado y un azul saturado no pueden
          // acabar en el mismo gris.
          const gris =
            0.299 * datos.data[i] + 0.587 * datos.data[i + 1] + 0.114 * datos.data[i + 2];
          const v = min + (gris / 255) * rango;
          datos.data[i] = v;
          datos.data[i + 1] = v;
          datos.data[i + 2] = v;
        }
        ctx.putImageData(datos, 0, 0);
        resolve(c.toDataURL('image/jpeg', 0.92));
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

function Cell({ cell, clamp, t }: { cell: CardCell; clamp: string; t: Tema }) {
  const empty = !cell.text && !cell.terms;
  const tono = colorNota(cell.score, cell.max, t);
  return (
    <div
      className="flex min-h-0 flex-col overflow-hidden rounded-[18px] border px-6 py-4"
      style={{
        borderColor: empty ? t.bordeSuave : t.borde,
        borderStyle: empty ? 'dashed' : 'solid',
        background: empty ? 'transparent' : t.caja,
      }}
    >
      {/* Etiqueta a la izquierda y la nota del componente en su esquina: el
          detalle que convierte la tarjeta en un análisis. */}
      <div className="flex items-baseline justify-between gap-3">
        <span
          className="font-mono text-[12px] uppercase tracking-[0.18em]"
          style={{ color: t.suave }}
        >
          {cell.label}
        </span>
        <span
          className="-mr-2 inline-flex h-[26px] shrink-0 items-center rounded border px-1.5 font-mono text-[13px]"
          style={{ borderColor: tono, color: tono }}
        >
          {cell.score != null && cell.max ? `${cell.score}/${cell.max}` : 'sin rastro'}
        </span>
      </div>
      {cell.terms && cell.soloTerminos ? (
        <div className="mt-2.5 flex flex-wrap gap-2 overflow-hidden">
          {(() => {
            // La casilla manda: con términos largos se baja el cuerpo y, si
            // aun así no caben, se enseña uno menos. Cuatro etiquetas cortas
            // y tres largas ocupan lo mismo.
            const largo = cell.terms!.reduce((a, t2) => a + t2.length, 0);
            const visibles = largo > 88 ? cell.terms!.slice(0, 3) : cell.terms!;
            const tam = largo > 52 ? 'px-2.5 py-1 text-[14px]' : 'px-3 py-1 text-[15px]';
            return visibles.map((termino) => (
              <span
                key={termino}
                className={`rounded-full border font-medium ${tam}`}
                style={{ borderColor: t.bordeSuave, color: t.texto }}
              >
                {termino}
              </span>
            ));
          })()}
        </div>
      ) : cell.soloTerminos ? (
        // Atributos y valores se enseñan como etiquetas o no se enseñan. Un
        // párrafo aquí delataría que el Scanner no encontró términos propios
        // y encima ocuparía el sitio de un hallazgo. Decirlo es más útil: es
        // exactamente de lo que se puede hablar con el founder.
        <p className={`mt-2 italic ${CELL_TEXT}`} style={{ color: t.tenue }}>
          {cell.score != null
            ? 'Detectados, pero sin términos propios'
            : 'Sin rastro de huella digital'}
        </p>
      ) : cell.text ? (
        <p
          className={`mt-2 font-semibold leading-[1.3] ${CELL_TEXT} ${clamp}`}
          style={{ color: t.texto }}
        >
          {cell.text}
        </p>
      ) : (
        <p className={`mt-2 italic ${CELL_TEXT}`} style={{ color: t.tenue }}>
          Sin rastro de huella digital
        </p>
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
  const [tema, setTema] = useState<'oscuro' | 'claro'>('oscuro');
  // El fondo se puede cambiar: un color plano o una imagen. La imagen se
  // guarda como data URL en memoria (nunca se sube a ningún sitio) y por eso
  // viaja al PNG sin depender de la red.
  const [colorFondo, setColorFondo] = useState<string | null>(null);
  // La original se guarda tal cual para poder reconvertirla al cambiar de
  // tema: el gris de la banda clara no sirve para la oscura.
  const [imagenOriginal, setImagenOriginal] = useState<string | null>(null);
  const [imagenFondo, setImagenFondo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  // El logo vive en el CDN de LinkedIn. Se pasa a data URL al montar para que
  // la exportación no dependa de una petición externa.
  const [logoData, setLogoData] = useState<string | null>(null);

  const t = TEMAS[tema];
  const base = colorFondo ?? t.fondo;
  // Con imagen, un velo del color del tema por encima: sin él, el texto de
  // las celdas deja de leerse en cuanto la foto tiene zonas claras.
  const fondoCss = imagenFondo
    ? `linear-gradient(${t.velo}, ${t.velo}), url(${imagenFondo}) center / cover no-repeat`
    : base;

  useEffect(() => {
    if (!logoUrl) return;
    let vivo = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!vivo) return;
      try {
        const c = document.createElement('canvas');
        c.width = 256;
        c.height = 256;
        c.getContext('2d')?.drawImage(img, 0, 0, 256, 256);
        setLogoData(c.toDataURL('image/png'));
      } catch {
        // Si el CDN no deja leerlo se enseña igual: solo se pierde en el PNG.
      }
    };
    img.src = logoUrl;
    return () => {
      vivo = false;
    };
  }, [logoUrl]);

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

  function cargarFondo(file: File | undefined) {
    if (!file) return;
    const lector = new FileReader();
    lector.onload = () => setImagenOriginal(String(lector.result));
    lector.readAsDataURL(file);
  }

  // Cada vez que cambia la imagen o el tema, se vuelve a llevar a su banda.
  useEffect(() => {
    if (!imagenOriginal) {
      setImagenFondo(null);
      return;
    }
    let vivo = true;
    aBandaDeGrises(imagenOriginal, t.banda).then((d) => {
      if (vivo) setImagenFondo(d);
    });
    return () => {
      vivo = false;
    };
  }, [imagenOriginal, t.banda]);

  // Tope de tiempo: html-to-image espera a que cargue todo lo que la tarjeta
  // referencia y, si algo no resuelve, la promesa se queda colgada para
  // siempre y el botón se queda en "Generando…". Antes de eso, se corta.
  function conTope<T>(p: Promise<T>, ms = 15_000): Promise<T | null> {
    return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
  }

  // La exportación rasteriza el nodo dentro de un SVG. Con las fuentes
  // embebidas en base64 ese SVG pesa varios MB, y a partir de cierto tamaño
  // Chrome se queda cargándolo sin resolver ni fallar: de ahí el tope de
  // tiempo y un segundo intento sin fuentes, que genera un SVG mucho menor.
  // Con tipografía del sistema la tarjeta no queda igual, pero es mejor que
  // quedarse sin entregable.
  async function render(): Promise<{ blob: Blob; degradado: boolean } | null> {
    if (!cardRef.current) return null;
    // Import diferido: la librería solo se descarga al exportar de verdad.
    const { toBlob } = await import('html-to-image');
    const opciones = {
      width: SIZE,
      height: SIZE,
      // Se compone a 1080 y se dibuja a 1500: mismo maquetado, más resolución.
      pixelRatio: EXPORT / SIZE,
      cacheBust: true,
      backgroundColor: base,
      // El nodo se clona CON su transform, así que sin anularlo la tarjeta
      // salía encogida en una esquina del PNG: el scale es de la vista
      // previa, no del entregable.
      style: { transform: 'none', transformOrigin: 'top left' },
    };
    const bueno = await conTope(toBlob(cardRef.current, opciones)).catch(() => null);
    if (bueno) return { blob: bueno, degradado: false };
    const apaño = await conTope(
      toBlob(cardRef.current, { ...opciones, skipFonts: true }),
      10_000,
    ).catch(() => null);
    return apaño ? { blob: apaño, degradado: true } : null;
  }

  async function download() {
    setBusy(true);
    try {
      const salida = await render();
      if (!salida) {
        setCopied('No se pudo generar la imagen. Recarga la página y prueba otra vez.');
        setTimeout(() => setCopied(null), 5000);
        return;
      }
      const url = URL.createObjectURL(salida.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${domain.replace(/\./g, '-')}-brand-seed.png`;
      a.click();
      URL.revokeObjectURL(url);
      setCopied(
        salida.degradado
          ? 'Descargada, pero con tipografía del sistema. Recarga y repite para la buena.'
          : 'Descargada en 1500×1500',
      );
      setTimeout(() => setCopied(null), salida.degradado ? 6000 : 2500);
    } finally {
      setBusy(false);
    }
  }

  // Copiar al portapapeles: para pegarla directamente en el mensaje de
  // LinkedIn sin pasar por la carpeta de descargas.
  async function copyImage() {
    setBusy(true);
    try {
      const salida = await render();
      if (!salida) throw new Error('sin imagen');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': salida.blob })]);
      setCopied(salida.degradado ? 'Copiada, con tipografía del sistema' : 'Copiada');
      setTimeout(() => setCopied(null), salida.degradado ? 6000 : 2000);
    } catch {
      setCopied('Tu navegador no deja copiar imágenes: descárgala');
      setTimeout(() => setCopied(null), 4000);
    } finally {
      setBusy(false);
    }
  }

  const band = score != null ? cardBand(score) : null;
  const chip = (activo: boolean) =>
    `rounded-md border px-2.5 py-1 text-xs transition-colors ${
      activo
        ? 'border-[var(--cta)] bg-[var(--cta)]/10 text-[var(--cta)]'
        : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)] hover:text-[var(--text)]'
    }`;

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

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border)] pt-3">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
            Tema
          </span>
          <div className="flex gap-1.5">
            <button onClick={() => setTema('oscuro')} className={chip(tema === 'oscuro')}>
              Oscuro
            </button>
            <button onClick={() => setTema('claro')} className={chip(tema === 'claro')}>
              Claro
            </button>
          </div>

          <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
            Fondo
          </span>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--muted)]">
            <input
              type="color"
              value={colorFondo ?? t.fondo}
              onChange={(e) => setColorFondo(e.target.value)}
              aria-label="Color de fondo"
              className="h-6 w-8 cursor-pointer rounded border border-[var(--border)] bg-transparent"
            />
            color
          </label>
          <label className={`${chip(false)} cursor-pointer`}>
            Subir imagen
            <input
              type="file"
              accept="image/*"
              onChange={(e) => cargarFondo(e.target.files?.[0])}
              className="hidden"
            />
          </label>
          {(colorFondo || imagenOriginal) && (
            <button
              onClick={() => {
                setColorFondo(null);
                setImagenOriginal(null);
              }}
              className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)]"
            >
              quitar fondo
            </button>
          )}
        </div>

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
            background: fondoCss,
            color: t.texto,
          }}
          className="flex flex-col p-14 font-sans"
        >
          {/* Cabecera: su logo a la izquierda, el nuestro a la derecha. */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-5">
              {/* El logo lleva el MISMO marco que la caja del score: mismo
                  tamaño, mismo radio y el mismo borde tenue. Antes iba sobre
                  una placa blanca rellena que rompía la columna. */}
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoData ?? logoUrl}
                  alt=""
                  crossOrigin="anonymous"
                  className="h-[76px] w-[76px] rounded-[14px] border object-contain p-1.5"
                  style={{ borderColor: t.bordeSuave }}
                />
              ) : (
                <span
                  className="flex h-[76px] w-[76px] items-center justify-center rounded-[14px] border text-[30px] font-bold"
                  style={{ borderColor: t.bordeSuave, color: t.texto }}
                >
                  {company.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span>
                <span className="block text-[34px] font-bold leading-none tracking-tight">
                  {company}
                </span>
                <span className="mt-2 block font-mono text-[17px]" style={{ color: t.suave }}>
                  {domain}
                </span>
              </span>
            </div>
            <LogoMark size={52} />
          </div>

          {/* La valoración y la frase: lo primero que se lee. */}
          <div className="mt-6 flex h-[116px] items-start gap-5 overflow-hidden">
            {showScore && score != null && (
              // Mismo cuadrado que el logo de la marca, para que la columna de
              // la izquierda quede aplomada de arriba abajo.
              <span
                className="flex h-[76px] w-[76px] shrink-0 flex-col items-center justify-center rounded-[14px] border"
                style={{ borderColor: t.bordeSuave }}
              >
                <span className="font-mono text-[34px] font-medium leading-none">
                  {Math.round(score)}
                </span>
                <span className="mt-1 font-mono text-[11px]" style={{ color: t.suave }}>
                  /100
                </span>
              </span>
            )}
            <span className="min-w-0 flex-1">
              {band && showScore && (
                <span
                  className="block font-mono text-[13px] uppercase tracking-[0.18em]"
                  style={{ color: t.suave }}
                >
                  {band}
                </span>
              )}
              <span
                className={`block font-semibold leading-[1.25] ${
                  highlight.length > 120 ? 'text-[23px] line-clamp-3' : 'text-[29px] line-clamp-2'
                } ${band && showScore ? 'mt-2' : ''}`}
              >
                {highlight}
              </span>
            </span>
          </div>

          {/* El Brand Seed, en el mismo orden que la pestaña B3S Seed. */}
          <div className="mt-6 flex flex-col gap-4">
            <div className="grid h-[172px] grid-cols-2 gap-4">
              {CARD_LAYOUT.top.map((k) => (
                <Cell key={k} cell={cells[k]} clamp="line-clamp-5" t={t} />
              ))}
            </div>
            <div className="grid h-[152px] grid-cols-3 gap-4">
              {CARD_LAYOUT.middle.map((k) => (
                <Cell key={k} cell={cells[k]} clamp="line-clamp-4" t={t} />
              ))}
            </div>
            <div className="grid h-[142px] grid-cols-2 gap-4">
              {CARD_LAYOUT.terms.map((k) => (
                <Cell key={k} cell={cells[k]} clamp="line-clamp-2" t={t} />
              ))}
            </div>
            <div className="grid h-[152px] grid-cols-2 gap-4">
              {CARD_LAYOUT.bottom.map((k) => (
                <Cell key={k} cell={cells[k]} clamp="line-clamp-4" t={t} />
              ))}
            </div>
          </div>

          {/* Pie: de dónde sale esto. La cobertura es el dato honesto y, de
              paso, el motivo de la conversación. */}
          <div
            className="mt-auto flex items-center justify-between pt-[42px] font-mono text-[14px]"
            style={{ color: t.tenue }}
          >
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
