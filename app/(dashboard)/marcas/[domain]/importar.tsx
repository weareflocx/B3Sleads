'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ResumenImport } from '@/lib/import-estudio';

// Traer de vuelta el criterio trabajado fuera. Es la operación inversa del
// botón JSON, y el camino para no clasificar cuarenta y cuatro marcas a mano
// cuando el trabajo ya está hecho en otro sitio.
//
// Se hace en dos tiempos a propósito: primero se calcula y se enseña qué va a
// pasar, y solo después se escribe. Importar toca las cuarenta y cuatro
// fichas de una vez y no hay deshacer; ver antes el número de marcas que se
// van a tocar y las que el archivo no reconoce cuesta un clic y evita
// enterarse tarde.
export function ImportarEstudio({ cliente }: { cliente: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement | null>(null);
  const [contenido, setContenido] = useState<unknown>(null);
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const [resumen, setResumen] = useState<ResumenImport | null>(null);
  const [hecho, setHecho] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function limpiar() {
    setContenido(null);
    setNombreArchivo(null);
    setResumen(null);
    setHecho(false);
    setError(null);
    if (input.current) input.current.value = '';
  }

  async function elegir(f: File | undefined) {
    if (!f) return;
    setError(null);
    setHecho(false);
    setResumen(null);
    let json: unknown;
    try {
      json = JSON.parse(await f.text());
    } catch {
      setError('Ese archivo no es un JSON válido.');
      return;
    }
    setContenido(json);
    setNombreArchivo(f.name);
    await mandar(json, true);
  }

  async function mandar(json: unknown, soloProbar: boolean) {
    setOcupado(true);
    setError(null);
    try {
      const r = await fetch('/api/estudio/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: cliente, estudio: json, soloProbar }),
      });
      const j = (await r.json()) as { resumen?: ResumenImport; error?: string };
      if (!r.ok) {
        setError(j.error ?? 'No se pudo importar');
        setResumen(null);
        return;
      }
      setResumen(j.resumen ?? null);
      if (!soloProbar) {
        setHecho(true);
        router.refresh();
      }
    } catch {
      setError('Sin conexión: no se ha importado nada.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => elegir(e.target.files?.[0])}
      />
      <button
        onClick={() => input.current?.click()}
        disabled={ocupado}
        title="Trae la clasificación, los ejes y los términos excluidos desde un JSON exportado de aquí"
        className="font-mono text-[11px] uppercase tracking-wider text-[var(--muted)] transition-colors hover:text-[var(--text)] disabled:opacity-40"
      >
        json ↑
      </button>

      {(resumen || error) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="text-sm font-semibold">
              {hecho ? 'Estudio importado' : 'Esto es lo que va a pasar'}
            </h2>
            {nombreArchivo && (
              <p className="mt-1 font-mono text-[11px] text-[var(--soft)]">{nombreArchivo}</p>
            )}

            {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}

            {resumen && (
              <>
                <ul className="mt-3 space-y-1.5 text-sm">
                  <li className="flex justify-between gap-4">
                    <span className="text-[var(--muted)]">Marcas con criterio</span>
                    <span className="font-mono">{resumen.marcasAplicadas}</span>
                  </li>
                  <li className="flex justify-between gap-4">
                    <span className="text-[var(--muted)]">Ejes de posicionamiento</span>
                    <span className="font-mono">{resumen.ejes}</span>
                  </li>
                  <li className="flex justify-between gap-4">
                    <span className="text-[var(--muted)]">Términos excluidos</span>
                    <span className="font-mono">{resumen.terminosExcluidos}</span>
                  </li>
                  {Object.entries(resumen.ocultasPorGrupo).map(([g, n]) => (
                    <li key={g} className="flex justify-between gap-4">
                      <span className="text-[var(--muted)]">Fuera de la comparación en {g}</span>
                      <span className="font-mono">{n}</span>
                    </li>
                  ))}
                </ul>

                {resumen.noVienenEnElArchivo.length > 0 && (
                  <p className="mt-3 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs leading-relaxed text-[var(--muted)]">
                    {resumen.noVienenEnElArchivo.length} marcas del estudio no vienen en el archivo.
                    Su ficha se queda como está.
                  </p>
                )}

                {resumen.avisos.map((a) => (
                  <p
                    key={a}
                    className="mt-3 rounded-md border border-[var(--warning)]/40 bg-[var(--accent-soft)]/20 px-3 py-2 text-xs leading-relaxed text-[var(--warning)]"
                  >
                    {a}
                  </p>
                ))}

                {!hecho && (
                  <p className="mt-3 text-xs leading-relaxed text-[var(--soft)]">
                    No se toca ni el score ni las dimensiones ni la madurez: eso lo mide el Scanner
                    y el archivo solo lo lleva para leerlo. Tampoco cambia qué marcas hay en cada
                    grupo ni en qué orden.
                  </p>
                )}
              </>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={limpiar}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] transition-colors hover:border-[var(--muted)] hover:text-[var(--text)]"
              >
                {hecho ? 'Cerrar' : 'Cancelar'}
              </button>
              {!hecho && resumen && (
                <button
                  onClick={() => mandar(contenido, false)}
                  disabled={ocupado}
                  className="rounded-md bg-[var(--text)] px-3 py-1.5 text-sm text-[var(--bg)] transition-opacity disabled:opacity-40"
                >
                  {ocupado ? 'importando…' : 'Importar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
