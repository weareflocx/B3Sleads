'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BTN_OUTLINE, BTN_WHITE } from './buttons';
import { leeTabla, type FilaLote } from '@/lib/lote';

// Subir en lote: pegar una tabla (de una hoja de cálculo, CSV o tabuladores)
// o subir un CSV, ver qué va a pasar con cada fila, y solo entonces importar.
//
// Importar NO lanza ningún scan: la marca entra en "Detectado", sin
// responsable, y el scan se lanza después desde su ficha si interesa.

const EJEMPLO = `dominio\tmarca\tlinkedin\tfundador\tsector\tronda\tfuente\tpaís\tciudad
acmelabs.io\tAcme Labs\tlinkedin.com/in/ana-ruiz;linkedin.com/in/luis-p\tAna Ruiz;Luis Pérez\tSaaS\t2M€ · 2026-09\thttps://…\tEspaña\tMadrid`;

const ICON_BTN =
  'flex h-6 w-6 items-center justify-center rounded border border-[var(--border)] text-[var(--muted)] transition-colors hover:border-[var(--muted)] hover:text-[var(--text)]';

const TANDA = 15;

type EstadoPrevio = 'nueva' | 'duplicada' | 'error';
interface Previa {
  fila: FilaLote;
  estado: EstadoPrevio;
  motivo: string | null; // para duplicadas y errores
  esLeadExistente: boolean; // duplicada contra la base (no solo dentro del lote)
  avisos: string[];
}
interface Resultado {
  n: number;
  dominio: string | null;
  estado: 'alta' | 'duplicada' | 'completada' | 'error';
  detalle: string;
  avisos?: string[];
}

export function SubidaLoteButton({ collapsed = false }: { collapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={collapsed ? 'Subir en lote' : undefined}
        aria-label="Subir leads en lote"
        className={`${BTN_OUTLINE} flex w-full items-center justify-center gap-2 py-1.5 text-xs ${collapsed ? 'px-0' : ''}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
          <path d="M12 15V4M7 8l5-4 5 4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
        </svg>
        {!collapsed && <span>Subir en lote</span>}
      </button>
      {open && <Dialogo onClose={() => setOpen(false)} />}
    </>
  );
}

function Chip({ tono, children }: { tono: 'ok' | 'dup' | 'error' | 'aviso'; children: React.ReactNode }) {
  const c = {
    ok: 'border-[var(--success)]/40 text-[var(--success)]',
    dup: 'border-[var(--border)] text-[var(--muted)]',
    error: 'border-[var(--danger)]/50 text-[var(--danger)]',
    aviso: 'border-[var(--warning)]/50 text-[var(--warning)]',
  }[tono];
  return <span className={`inline-flex whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[10px] ${c}`}>{children}</span>;
}

function Dialogo({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [fase, setFase] = useState<'pegar' | 'revisar' | 'importando' | 'hecho'>('pegar');
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [previas, setPrevias] = useState<Previa[]>([]);
  const [completar, setCompletar] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fase !== 'importando') cerrar();
    };
    document.addEventListener('keydown', onKey);
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previo;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase]);

  function cerrar() {
    if (fase === 'hecho') router.refresh();
    onClose();
  }

  async function leerArchivo(file: File) {
    setError(null);
    if (file.size > 2_000_000) return setError('El archivo pasa de 2 MB. Pártelo en varios.');
    setTexto(await file.text());
  }

  async function revisar() {
    setError(null);
    const { filas, error: e } = leeTabla(texto);
    if (e) return setError(e);
    if (!filas.length) return setError('No hay filas con datos.');
    if (filas.length > 1000) return setError('Como mucho 1.000 filas por subida.');
    setOcupado(true);
    try {
      const dominios = filas.map((f) => f.dominio).filter(Boolean);
      const handles = filas.flatMap((f) => f.fundadores.map((x) => x.handle)).filter(Boolean);
      const r = await fetch('/api/leads/lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'comprobar', dominios, handles }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        error?: string;
        existentes?: { dominio: string; esLead: boolean }[];
        fundadoresExistentes?: { handle: string; dominio: string | null }[];
      };
      if (!r.ok || j.error) throw new Error(j.error || `Error ${r.status}`);
      const leads = new Set((j.existentes ?? []).filter((x) => x.esLead).map((x) => x.dominio));
      const enCorpus = new Set((j.existentes ?? []).filter((x) => !x.esLead).map((x) => x.dominio));
      const fundadorEn = new Map((j.fundadoresExistentes ?? []).map((x) => [x.handle, x.dominio]));
      setPrevias(
        filas.map((f): Previa => {
          const avisos = [...f.avisos];
          if (f.dominio && enCorpus.has(f.dominio)) avisos.push('marca ya en el corpus, sin lead');
          for (const x of f.fundadores) {
            const d = x.handle ? fundadorEn.get(x.handle) : undefined;
            if (d !== undefined && d !== f.dominio) avisos.push(`${x.nombre ?? x.handle} ya está en ${d ?? 'otra ficha'}`);
          }
          if (f.errores.length) return { fila: f, estado: 'error', motivo: f.errores.join(' '), esLeadExistente: false, avisos };
          if (f.repetidaDe) return { fila: f, estado: 'duplicada', motivo: `Repetida en el lote (fila ${f.repetidaDe}).`, esLeadExistente: false, avisos };
          if (f.dominio && leads.has(f.dominio)) return { fila: f, estado: 'duplicada', motivo: 'Ya es lead.', esLeadExistente: true, avisos };
          return { fila: f, estado: 'nueva', motivo: null, esLeadExistente: false, avisos };
        }),
      );
      setFase('revisar');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo comprobar la tabla.');
    } finally {
      setOcupado(false);
    }
  }

  const cuentas = useMemo(() => {
    const c = { nueva: 0, duplicada: 0, error: 0, completables: 0 };
    for (const p of previas) {
      c[p.estado]++;
      if (p.esLeadExistente) c.completables++;
    }
    return c;
  }, [previas]);

  async function importar() {
    // Las nuevas siempre; las duplicadas contra la base solo para completar.
    // Las repetidas dentro del lote y las de error no viajan.
    const envio = previas.filter((p) => p.estado === 'nueva' || (completar && p.esLeadExistente));
    const locales: Resultado[] = previas
      .filter((p) => !envio.includes(p))
      .map((p) => ({
        n: p.fila.n,
        dominio: p.fila.dominio,
        estado: p.estado === 'error' ? 'error' : 'duplicada',
        detalle: p.motivo ?? '',
      }));
    setFase('importando');
    setProgreso(0);
    const out: Resultado[] = [];
    for (let i = 0; i < envio.length; i += TANDA) {
      const tanda = envio.slice(i, i + TANDA);
      try {
        const r = await fetch('/api/leads/lote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accion: 'importar', completar, filas: tanda.map((p) => p.fila) }),
        });
        const j = (await r.json().catch(() => ({}))) as { resultados?: Resultado[]; error?: string };
        if (!r.ok || !j.resultados) throw new Error(j.error || `Error ${r.status}`);
        out.push(...j.resultados);
      } catch (e) {
        // Una tanda caída no para las demás: sus filas salen con el motivo.
        const motivo = e instanceof Error ? e.message : 'Sin conexión con el servidor.';
        out.push(...tanda.map((p) => ({ n: p.fila.n, dominio: p.fila.dominio, estado: 'error' as const, detalle: `No llegó a importarse: ${motivo}` })));
      }
      setProgreso(Math.min(envio.length, i + TANDA));
    }
    setResultados([...out, ...locales].sort((a, b) => a.n - b.n));
    setFase('hecho');
  }

  const altas = resultados.filter((r) => r.estado === 'alta');
  const completadas = resultados.filter((r) => r.estado === 'completada');
  const duplicadas = resultados.filter((r) => r.estado === 'duplicada');
  const errores = resultados.filter((r) => r.estado === 'error');
  const envioTotal = previas.filter((p) => p.estado === 'nueva' || (completar && p.esLeadExistente)).length;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Subir leads en lote" className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4">
      <div
        onClick={() => fase !== 'importando' && cerrar()}
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
        style={{ animation: 'b3s-fade 140ms ease-out' }}
        aria-hidden="true"
      />
      <div
        className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
        style={{ animation: 'b3s-dialog 190ms cubic-bezier(0.23, 1, 0.32, 1)' }}
      >
        <div className="flex h-1 w-full shrink-0" aria-hidden="true">
          {['bg-[var(--accent)]', 'bg-[var(--linkedin-soft)]', 'bg-[var(--cta)]'].map((tono, i) => (
            <span key={i} className={`h-full flex-1 transition-colors duration-300 ${i <= ['pegar', 'revisar', 'hecho'].indexOf(fase === 'importando' ? 'revisar' : fase) ? tono : 'bg-[var(--border)]'}`} />
          ))}
        </div>

        <div className="flex items-start justify-between gap-4 px-7 pb-3 pt-6">
          <div>
            <h2 className="text-lg font-semibold">Subir en lote</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {fase === 'pegar' && 'Pega una tabla o sube un CSV. Solo el dominio es obligatorio. Importar no lanza ningún scan.'}
              {fase === 'revisar' && 'Así quedaría cada fila. Nada se guarda hasta que importes.'}
              {fase === 'importando' && `Importando ${progreso} de ${envioTotal}…`}
              {fase === 'hecho' && 'Hecho. Las altas están en Detectado, sin responsable y sin scan.'}
            </p>
          </div>
          <button onClick={cerrar} disabled={fase === 'importando'} aria-label="Cerrar" className={ICON_BTN}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-6">
          {fase === 'pegar' && (
            <>
              <textarea
                autoFocus
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={10}
                spellCheck={false}
                placeholder={EJEMPLO}
                aria-label="Tabla de leads"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 font-mono text-xs leading-relaxed outline-none transition-colors placeholder:text-[var(--soft)] focus:border-[var(--cta)]"
              />
              <p className="mt-2 font-mono text-[11px] leading-relaxed text-[var(--soft)]">
                Columnas: dominio · marca · linkedin (varios con «;») · fundador (varios con «;») · sector · ronda (importe y fecha) · fuente · país · ciudad.
                Con cabecera van en cualquier orden; sin cabecera, en este.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <input
                  ref={archivo}
                  type="file"
                  accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && leerArchivo(e.target.files[0])}
                />
                <button onClick={() => archivo.current?.click()} className={BTN_OUTLINE}>
                  Subir CSV
                </button>
                <button onClick={revisar} disabled={!texto.trim() || ocupado} className={`${BTN_WHITE} ml-auto`}>
                  {ocupado ? 'Comprobando…' : 'Revisar'}
                </button>
              </div>
            </>
          )}

          {(fase === 'revisar' || fase === 'importando') && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                <Chip tono="ok">{cuentas.nueva} nuevas</Chip>
                <Chip tono="dup">{cuentas.duplicada} duplicadas</Chip>
                <Chip tono="error">{cuentas.error} con error</Chip>
              </div>
              <div className="overflow-x-auto rounded-md border border-[var(--border)]">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="bg-[var(--surface-2)] font-mono text-[10px] uppercase tracking-wider text-[var(--soft)]">
                    <tr>
                      <th className="px-3 py-2">Fila</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2">Dominio</th>
                      <th className="px-3 py-2">Marca</th>
                      <th className="px-3 py-2">Fundadores</th>
                      <th className="px-3 py-2">Avisos / motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {previas.map((p) => (
                      <tr key={p.fila.n} className={p.estado === 'nueva' ? '' : 'text-[var(--muted)]'}>
                        <td className="px-3 py-2 font-mono text-[var(--soft)]">{p.fila.n}</td>
                        <td className="px-3 py-2">
                          <Chip tono={p.estado === 'nueva' ? 'ok' : p.estado === 'error' ? 'error' : 'dup'}>{p.estado}</Chip>
                        </td>
                        <td className="px-3 py-2 font-mono">
                          {p.esLeadExistente && p.fila.dominio ? (
                            <Link href={`/companies/${p.fila.dominio}`} target="_blank" className="hover:underline">
                              {p.fila.dominio} ↗
                            </Link>
                          ) : (
                            p.fila.dominio ?? p.fila.dominioRaw ?? '—'
                          )}
                        </td>
                        <td className="px-3 py-2">{p.fila.marca ?? <span className="text-[var(--soft)]">{p.fila.dominio ?? '—'}</span>}</td>
                        <td className="px-3 py-2">
                          {p.fila.fundadores.length
                            ? p.fila.fundadores.map((x) => x.nombre ?? x.handle ?? x.linkedinRaw).join(', ')
                            : <span className="text-[var(--soft)]">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <span className="flex flex-wrap gap-1">
                            {p.motivo && <span className={p.estado === 'error' ? 'text-[var(--danger)]' : ''}>{p.motivo}</span>}
                            {/* Los avisos solo importan en lo que se va a crear. */}
                            {p.estado === 'nueva' &&
                              p.avisos.map((a) => (
                                <Chip key={a} tono="aviso">{a}</Chip>
                              ))}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={completar}
                  onChange={(e) => setCompletar(e.target.checked)}
                  disabled={fase === 'importando' || !cuentas.completables}
                />
                Completar campos vacíos de las duplicadas
                <span className="text-xs text-[var(--soft)]">
                  (nunca se sobrescribe lo que ya tiene valor{cuentas.completables ? ` · ${cuentas.completables} ${cuentas.completables === 1 ? 'ya es lead' : 'ya son lead'}` : ''})
                </span>
              </label>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button onClick={() => setFase('pegar')} disabled={fase === 'importando'} className={BTN_OUTLINE}>
                  Volver
                </button>
                <button onClick={importar} disabled={fase === 'importando' || !envioTotal} className={`${BTN_WHITE} ml-auto`}>
                  {fase === 'importando'
                    ? `Importando ${progreso}/${envioTotal}…`
                    : completar && cuentas.completables
                      ? `Importar ${cuentas.nueva} y completar ${cuentas.completables}`
                      : `Importar ${cuentas.nueva} ${cuentas.nueva === 1 ? 'nueva' : 'nuevas'}`}
                </button>
              </div>
            </>
          )}

          {fase === 'hecho' && (
            <div className="space-y-5 text-sm">
              <p className="text-base">
                <strong>{altas.length}</strong> {altas.length === 1 ? 'alta' : 'altas'} ·{' '}
                <strong>{duplicadas.length + completadas.length}</strong> duplicadas
                {completadas.length > 0 && ` (${completadas.length} completadas)`} · <strong>{errores.length}</strong> con error
              </p>
              {altas.length > 0 && (
                <Bloque titulo="Altas">
                  {altas.map((r) => (
                    <li key={r.n} className="flex flex-wrap items-center gap-2">
                      <Link href={`/companies/${r.dominio}`} className="font-mono hover:underline">{r.dominio}</Link>
                      <span className="text-[var(--muted)]">{r.detalle}</span>
                      {r.avisos?.map((a) => <Chip key={a} tono="aviso">{a}</Chip>)}
                    </li>
                  ))}
                </Bloque>
              )}
              {(duplicadas.length > 0 || completadas.length > 0) && (
                <Bloque titulo="Duplicadas">
                  {[...completadas, ...duplicadas].sort((a, b) => a.n - b.n).map((r) => (
                    <li key={r.n} className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[var(--soft)]">fila {r.n}</span>
                      {r.dominio && !r.detalle.startsWith('Repetida') ? (
                        <Link href={`/companies/${r.dominio}`} className="font-mono hover:underline">{r.dominio} ↗</Link>
                      ) : (
                        <span className="font-mono">{r.dominio}</span>
                      )}
                      <span className="text-[var(--muted)]">{r.detalle}</span>
                    </li>
                  ))}
                </Bloque>
              )}
              {errores.length > 0 && (
                <Bloque titulo="Con error">
                  {errores.map((r) => (
                    <li key={r.n} className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[var(--soft)]">fila {r.n}</span>
                      <span className="font-mono">{r.dominio ?? ''}</span>
                      <span className="text-[var(--danger)]">{r.detalle}</span>
                    </li>
                  ))}
                </Bloque>
              )}
              <div className="flex justify-end">
                <button onClick={cerrar} className={BTN_WHITE}>Cerrar</button>
              </div>
            </div>
          )}

          {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--soft)]">{titulo}</h3>
      <ul className="space-y-1.5">{children}</ul>
    </section>
  );
}
