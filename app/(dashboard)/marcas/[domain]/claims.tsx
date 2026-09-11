'use client';

import { useEffect, useMemo, useState } from 'react';
import { Select } from '../../select';
import {
  SIN_CLASIFICAR,
  TIPOS_POR_DEFECTO,
  type Claim,
  type MatrizClaims,
  type TipoClaim,
} from '@/lib/claims';

// Claims por marca: qué promete cada una y quién lo demuestra.
//
// El cruce de vocabulario de arriba mira TÉRMINOS. Esto mira AFIRMACIONES
// enteras, que es otra pregunta. Y la respuesta útil no es la lista: es la
// distancia entre cuántas marcas prometen algo y cuántas lo acompañan de un
// dato comprobable. Ese hueco es el territorio libre.
//
// Por eso el contador va PRIMERO y la lista al final: la lista es la prueba
// de que el contador no se lo ha inventado nadie, no al revés.

interface Respuesta {
  claims: Claim[];
  matriz: MatrizClaims | null;
  tipos: TipoClaim[];
  error?: string;
}

const MINI = 'font-mono text-[10px] uppercase tracking-wider';

// Cómo se lee la procedencia de una frase, sin adornos.
const PROCEDENCIA: Record<Claim['procedencia'], { texto: string; color: string; ayuda: string }> = {
  propia: {
    texto: 'lo dice su web',
    color: 'var(--cta)',
    ayuda: 'La frase casa con una página del dominio de la marca',
  },
  tercero: {
    texto: 'lo dice un tercero',
    color: 'var(--warning)',
    ayuda: 'La frase viene de prensa o de un directorio, no de la marca. No cuenta como promesa suya',
  },
  'sin-rastro': {
    texto: 'sin rastro',
    color: 'var(--soft)',
    ayuda: 'El scan guarda la cita pero no de qué página la sacó',
  },
};

export function Claims({
  cliente,
  clienteNombre,
  query,
}: {
  cliente: string;
  clienteNombre: string;
  query: string | null;
}) {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Lo que se ha tocado en esta sesión, para pintarlo sin esperar al servidor.
  const [parches, setParches] = useState<Record<string, { tipo?: string; oculto?: boolean }>>({});
  const [celda, setCelda] = useState<{ tipo: string; dominio: string | null } | null>(null);
  const [soloProbados, setSoloProbados] = useState(false);
  const [editandoTipos, setEditandoTipos] = useState(false);
  const [borrador, setBorrador] = useState<TipoClaim[]>([]);
  const [guardandoTipos, setGuardandoTipos] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    const url = `/api/estudio/claims?domain=${encodeURIComponent(cliente)}${query ? `&g=${encodeURIComponent(query)}` : ''}`;
    fetch(url)
      .then((r) => r.json())
      .then((j: Respuesta) => {
        if (!vivo) return;
        if (j.error) setError(j.error);
        else {
          setDatos(j);
          setParches({});
        }
      })
      .catch(() => vivo && setError('No se pudieron extraer los claims'))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [cliente, query]);

  // El juicio humano se pinta al instante y se manda detrás: clasificar es
  // teclear rápido y esperar al servidor por cada línea lo hace insufrible.
  // Si el servidor dice que no, se deshace y se avisa.
  async function decide(claimId: string, parche: { tipo?: string; oculto?: boolean }) {
    const antes = parches[claimId];
    setParches((p) => ({ ...p, [claimId]: { ...p[claimId], ...parche } }));
    try {
      const r = await fetch('/api/estudio/claims', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: cliente, claimId, ...parche }),
      });
      if (!r.ok) throw new Error();
    } catch {
      setError('No se pudo guardar el cambio');
      setParches((p) => ({ ...p, [claimId]: antes ?? {} }));
    }
  }

  // El vocabulario de tipos de ESTE estudio. Una categoría de telecos y una
  // de multinivel no prometen lo mismo: forzar las dos a la misma lista
  // convierte la matriz en ruido.
  async function guardaTipos() {
    setGuardandoTipos(true);
    try {
      const r = await fetch('/api/estudio/claims', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: cliente, tipos: borrador }),
      });
      if (!r.ok) throw new Error();
      const j = (await r.json()) as { tipos: TipoClaim[] };
      // Cambiar los tipos cambia lo que propone el léxico, así que se vuelve
      // a pedir todo en vez de recomponerlo a medias aquí.
      setDatos((d) => (d ? { ...d, tipos: j.tipos } : d));
      setEditandoTipos(false);
      setCelda(null);
      setCargando(true);
      const url = `/api/estudio/claims?domain=${encodeURIComponent(cliente)}${query ? `&g=${encodeURIComponent(query)}` : ''}`;
      const fresco = (await fetch(url).then((x) => x.json())) as Respuesta;
      if (!fresco.error) {
        setDatos(fresco);
        setParches({});
      }
    } catch {
      setError('No se pudieron guardar los tipos');
    } finally {
      setGuardandoTipos(false);
      setCargando(false);
    }
  }

  // Los claims con lo decidido en esta sesión ya aplicado, y la matriz
  // recalculada encima: mover un claim de tipo tiene que mover el contador,
  // que es lo único que se mira.
  const claims = useMemo(() => {
    const base = datos?.claims ?? [];
    return base.map((c) => {
      const p = parches[c.id];
      if (!p) return c;
      return {
        ...c,
        tipo: p.tipo ?? c.tipo,
        tipoOrigen: (p.tipo ? 'humano' : c.tipoOrigen) as Claim['tipoOrigen'],
        oculto: p.oculto ?? c.oculto,
      };
    });
  }, [datos, parches]);

  const tipos = datos?.tipos ?? [];
  const matriz = useMemo(() => (datos?.matriz ? recalcula(claims, tipos, cliente) : null), [claims, tipos, cliente, datos]);

  if (cargando) {
    return (
      <p className="mt-6 rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
        Leyendo las afirmaciones de cada marca del estudio. Tarda unos segundos.
      </p>
    );
  }
  if (error && !datos) {
    return (
      <p className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--danger)]">
        {error}
      </p>
    );
  }
  if (!matriz || matriz.total === 0) {
    return (
      <p className="mt-6 rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
        Ninguna marca del estudio tiene todavía afirmaciones capturadas en su scan.
      </p>
    );
  }

  // Las columnas: el cliente primero y el resto por grupo, para que la
  // matriz se lea de izquierda a derecha como se lee el estudio.
  const columnas = [
    ...matriz.marcas.filter((m) => m.dominio === cliente),
    ...matriz.marcas
      .filter((m) => m.dominio !== cliente)
      .sort((a, b) => (a.grupo ?? '').localeCompare(b.grupo ?? '') || b.claims - a.claims),
  ];

  const abiertos = celda
    ? claims.filter(
        (c) =>
          !c.oculto &&
          c.tipo === celda.tipo &&
          (celda.dominio ? c.dominio === celda.dominio : true) &&
          (!soloProbados || c.prueba),
      )
    : [];
  const nombreTipo = (clave: string) =>
    clave === SIN_CLASIFICAR ? 'Sin clasificar' : (tipos.find((t) => t.clave === clave)?.nombre ?? clave);

  const urlCsv = `/api/estudio/claims?csv=1&domain=${encodeURIComponent(cliente)}${query ? `&g=${encodeURIComponent(query)}` : ''}`;
  const promesas = matriz.filas.filter((f) => f.clave !== SIN_CLASIFICAR).reduce((n, f) => n + f.claims, 0);

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h3 className="text-sm font-semibold">Claims por marca</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--soft)]">
            Afirmaciones enteras, no términos sueltos. De {matriz.total} frases publicadas,{' '}
            {promesas} son una promesa clasificable; el resto es prosa corporativa.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {error && <span className="text-xs text-[var(--danger)]">{error}</span>}
          <button
            onClick={() => {
              setBorrador(tipos.map((t) => ({ ...t })));
              setEditandoTipos((v) => !v);
            }}
            className={`${MINI} text-[var(--muted)] hover:text-[var(--text)]`}
            title="El vocabulario de tipos de este estudio"
          >
            tipos ({tipos.length})
          </button>
          <a
            href={urlCsv}
            className={`${MINI} text-[var(--muted)] hover:text-[var(--text)]`}
            title="Una fila por claim, con tipo, prueba, procedencia y URL"
          >
            csv ↓
          </a>
        </div>
      </header>

      {editandoTipos && (
        <div className="rounded-lg border border-[var(--cta)]/40 bg-[var(--surface)] p-4">
          <p className={`${MINI} text-[var(--soft)]`}>tipos de claim de este estudio</p>
          <ul className="mt-3 space-y-1.5">
            {borrador.map((t, i) => (
              <li key={i} className="flex items-center gap-2">
                <input
                  value={t.nombre}
                  onChange={(e) =>
                    setBorrador((b) => b.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))
                  }
                  maxLength={40}
                  className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-[var(--cta)]"
                />
                <button
                  onClick={() => setBorrador((b) => b.filter((_, j) => j !== i))}
                  className={`${MINI} shrink-0 text-[var(--soft)] transition-colors hover:text-[var(--danger)]`}
                  title="Los claims de este tipo vuelven a Sin clasificar"
                >
                  quitar
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
            <button
              onClick={() =>
                setBorrador((b) => [...b, { clave: `tipo_${Date.now().toString(36)}`, nombre: '' }])
              }
              disabled={borrador.length >= 20}
              className={`${MINI} rounded border border-[var(--border)] px-2 py-1 text-[var(--muted)] transition-colors hover:border-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40`}
            >
              + añadir tipo
            </button>
            <button
              onClick={() => setBorrador(TIPOS_POR_DEFECTO.map((t) => ({ ...t })))}
              className={`${MINI} text-[var(--soft)] hover:text-[var(--text)]`}
            >
              volver a los de partida
            </button>
            <span className="ml-auto flex items-center gap-3">
              <button
                onClick={() => setEditandoTipos(false)}
                className={`${MINI} text-[var(--soft)] hover:text-[var(--text)]`}
              >
                cancelar
              </button>
              <button
                onClick={guardaTipos}
                disabled={guardandoTipos || borrador.some((t) => !t.nombre.trim())}
                className={`${MINI} rounded bg-[var(--cta)] px-3 py-1.5 text-[var(--cta-text)] transition-opacity hover:opacity-90 disabled:opacity-40`}
              >
                {guardandoTipos ? 'guardando…' : 'guardar tipos'}
              </button>
            </span>
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-[var(--soft)]">
            Renombrar un tipo no mueve ningún claim. Quitarlo devuelve los suyos a «Sin
            clasificar»; lo que hayas reclasificado a mano se queda como está.
          </p>
        </div>
      )}

      {/* ── El contador: prometen frente a prueban ── */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className={`${MINI} text-[var(--soft)]`}>
            cuántas marcas lo prometen · cuántas lo prueban
          </p>
          <p className={`${MINI} text-[var(--soft)]`}>
            {clienteNombre} · de {columnas.length} marcas
          </p>
        </div>
        <div className="mt-3 flex items-center gap-3 border-b border-[var(--border)] pb-1.5">
          <span className="w-[118px] shrink-0 sm:w-[148px]" />
          <span className="min-w-0 flex-1" />
          <span className={`${MINI} w-[38px] shrink-0 text-right text-[var(--soft)]`}>prom.</span>
          <span className={`${MINI} w-[38px] shrink-0 text-right text-[var(--soft)]`}>prue.</span>
          <span className={`${MINI} w-[72px] shrink-0 text-right text-[var(--soft)] sm:w-[86px]`}>cliente</span>
        </div>
        <ul className="mt-2 space-y-2.5">
          {matriz.filas
            .filter((f) => f.clave !== SIN_CLASIFICAR)
            .map((f) => {
              const anchoUsan = (f.usan / columnas.length) * 100;
              const anchoPrueban = (f.prueban / columnas.length) * 100;
              return (
                <li key={f.clave} className="flex items-center gap-3">
                  <span className="w-[118px] shrink-0 truncate text-sm sm:w-[148px]">{f.nombre}</span>
                  {/* La barra sólida es quién lo promete; el trozo verde,
                      quién lo demuestra. El hueco entre las dos es el hueco
                      del mercado, y se ve sin leer un número. */}
                  <span className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${anchoUsan}%`,
                        background: 'color-mix(in srgb, var(--muted) 45%, transparent)',
                      }}
                    />
                    <span
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${anchoPrueban}%`, background: 'var(--cta)' }}
                    />
                  </span>
                  <span className="w-[38px] shrink-0 text-right font-mono text-sm">{f.usan}</span>
                  <span
                    className="w-[38px] shrink-0 text-right font-mono text-sm"
                    style={{ color: f.prueban ? 'var(--cta)' : 'var(--soft)' }}
                  >
                    {f.prueban}
                  </span>
                  {/* Lo del cliente, en una sola línea y sin gritar: es un
                      dato más de la fila, no una alarma. */}
                  <span className="w-[72px] shrink-0 text-right sm:w-[86px]">
                    {f.clienteUsa ? (
                      <span
                        className={`${MINI} whitespace-nowrap`}
                        style={{ color: f.clientePrueba ? 'var(--cta)' : 'var(--accent)' }}
                        title={
                          f.clientePrueba
                            ? `${clienteNombre} lo promete y lo prueba`
                            : `${clienteNombre} lo promete sin ningún dato que lo sostenga`
                        }
                      >
                        {f.clientePrueba ? 'con prueba' : 'sin prueba'}
                      </span>
                    ) : (
                      <span
                        className={`${MINI} whitespace-nowrap text-[var(--soft)]`}
                        title={`${clienteNombre} no hace esta promesa: territorio libre`}
                      >
                        libre
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
        </ul>
        <p className="mt-3 border-t border-[var(--border)] pt-3 text-xs leading-relaxed text-[var(--soft)]">
          Una promesa cuenta como probada cuando lleva un dato que se puede ir a mirar: una cifra
          con unidad, una fecha de origen o un tercero que la respalde. «Ahorra hasta un 30%» se
          puede comprobar; «ahorra de verdad», no. Donde la barra verde es corta, la categoría
          entera está prometiendo sin enseñar.
        </p>
      </div>

      {/* ── La matriz: tipos por marca ── */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className={`${MINI} text-[var(--soft)]`}>tipos por marca · pulsa una celda para leer sus claims</p>
        <div className="mt-3 overflow-x-auto">
          <div style={{ minWidth: 200 + columnas.length * 40 }}>
            <div className="flex items-end gap-1 border-b border-[var(--border)] pb-1.5">
              <span className={`${MINI} w-[190px] shrink-0 text-[var(--soft)]`}>tipo</span>
              {columnas.map((m) => (
                <span
                  key={m.dominio}
                  title={`${m.nombre} · ${m.claims} claims, ${m.probados} con prueba`}
                  className={`w-[36px] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[9px] ${
                    m.dominio === cliente ? 'font-bold text-[var(--cta)]' : 'text-[var(--soft)]'
                  }`}
                  style={{ writingMode: 'vertical-rl', height: 74 }}
                >
                  {m.nombre}
                </span>
              ))}
            </div>
            <ul className="divide-y divide-[var(--border)]">
              {matriz.filas.map((f) => (
                <li key={f.clave} className="flex items-center gap-1 py-1">
                  <span
                    className={`w-[190px] shrink-0 truncate text-sm ${
                      f.clave === SIN_CLASIFICAR ? 'text-[var(--soft)]' : ''
                    }`}
                  >
                    {f.nombre}
                  </span>
                  {columnas.map((m) => {
                    const n = f.porMarca[m.dominio] ?? 0;
                    const p = f.probadosPorMarca[m.dominio] ?? 0;
                    const activa = celda?.tipo === f.clave && celda?.dominio === m.dominio;
                    return (
                      <button
                        key={m.dominio}
                        disabled={!n}
                        onClick={() =>
                          setCelda(activa ? null : { tipo: f.clave, dominio: m.dominio })
                        }
                        title={
                          n
                            ? `${m.nombre} · ${f.nombre}: ${n} ${n === 1 ? 'claim' : 'claims'}, ${p} con prueba`
                            : undefined
                        }
                        className={`flex h-7 w-[36px] shrink-0 items-center justify-center rounded font-mono text-[11px] transition-colors ${
                          activa ? 'ring-1 ring-[var(--cta)]' : ''
                        } ${n ? 'hover:bg-[var(--surface-2)]' : 'cursor-default'}`}
                        style={{
                          // El relleno dice cuántos; el color, si alguno va
                          // con prueba. Un número suelto en una cuadrícula de
                          // cuarenta columnas no se lee; una mancha sí.
                          background: n ? `color-mix(in srgb, var(--border) ${Math.min(100, 30 + n * 18)}%, transparent)` : undefined,
                          color: p ? 'var(--cta)' : n ? 'var(--text)' : 'var(--border)',
                        }}
                      >
                        {n || ''}
                      </button>
                    );
                  })}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-3 border-t border-[var(--border)] pt-3 text-xs leading-relaxed text-[var(--soft)]">
          El número es cuántos claims de ese tipo tiene la marca; en verde, los que llevan prueba.
          «Sin clasificar» no es un fallo: casi siempre es texto que no promete nada (notas de
          prensa, descripciones), y se puede dejar ahí o mandarlo a un tipo desde la lista.
        </p>
      </div>

      {/* ── Los claims de la celda elegida ── */}
      {celda && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2.5">
            <h4 className="text-sm font-semibold">
              {nombreTipo(celda.tipo)}
              {celda.dominio && (
                <span className="ml-2 font-normal text-[var(--muted)]">
                  · {columnas.find((m) => m.dominio === celda.dominio)?.nombre}
                </span>
              )}
              <span className="ml-2 font-mono text-xs font-normal text-[var(--soft)]">
                {abiertos.length}
              </span>
            </h4>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSoloProbados((v) => !v)}
                className={`${MINI} rounded border px-2 py-1 transition-colors ${
                  soloProbados
                    ? 'border-[var(--cta)] text-[var(--cta)]'
                    : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)]'
                }`}
              >
                solo con prueba
              </button>
              <button
                onClick={() => setCelda(null)}
                className={`${MINI} text-[var(--soft)] hover:text-[var(--text)]`}
              >
                cerrar
              </button>
            </div>
          </header>
          <ul className="divide-y divide-[var(--border)]">
            {abiertos.map((c) => {
              const pr = PROCEDENCIA[c.procedencia];
              return (
                <li key={c.id} className="px-4 py-3">
                  <p className="text-sm leading-relaxed">
                    {/* Literal, entrecomillado y sin recortar: es la palabra
                        de la marca y es lo que se lleva a la presentación. */}
                    “{c.texto}”
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className={MINI} style={{ color: pr.color }} title={pr.ayuda}>
                      {pr.texto}
                    </span>
                    {c.url && (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`${MINI} min-w-0 max-w-[280px] truncate text-[var(--muted)] hover:text-[var(--text)]`}
                        title={c.url}
                      >
                        {c.url.replace(/^https?:\/\/(www\.)?/, '')} ↗
                      </a>
                    )}
                    {c.prueba ? (
                      <span
                        className={`${MINI} text-[var(--cta)]`}
                        title={`Comprobable por ${c.prueba.clase}`}
                      >
                        prueba: {c.prueba.dato}
                      </span>
                    ) : (
                      <span className={`${MINI} text-[var(--soft)]`}>sin dato comprobable</span>
                    )}
                    {c.componente && (
                      <span className={`${MINI} text-[var(--soft)]`}>scan: {c.componente}</span>
                    )}

                    <span className="ml-auto flex items-center gap-2">
                      {c.tipoOrigen === 'humano' && (
                        <span className={`${MINI} text-[var(--cta)]`} title="Tipo decidido a mano">
                          a mano
                        </span>
                      )}
                      <Select
                        value={c.tipo}
                        onChange={(v) => decide(c.id, { tipo: v })}
                        ariaLabel="Tipo de claim"
                        options={[
                          ...tipos.map((t) => ({ value: t.clave, label: t.nombre })),
                          { value: SIN_CLASIFICAR, label: 'Sin clasificar' },
                        ]}
                      />
                      <button
                        onClick={() => decide(c.id, { oculto: true })}
                        className={`${MINI} text-[var(--soft)] transition-colors hover:text-[var(--danger)]`}
                        title="Esto no es un claim de esta marca: fuera del recuento"
                      >
                        quitar
                      </button>
                    </span>
                  </div>
                </li>
              );
            })}
            {abiertos.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-[var(--muted)]">
                Ninguno con prueba en esta celda.
              </li>
            )}
          </ul>
        </div>
      )}

      {/* La letra pequeña de la procedencia: si no se dice, la lista parece
          decir que todas estas frases están en la web de cada marca, y no es
          verdad. */}
      <p className="text-xs leading-relaxed text-[var(--soft)]">
        El scan guarda la cita de cada marca, pero solo a veces la página de la que salió: de{' '}
        {matriz.total} claims, {matriz.total - matriz.sinRastro} tienen fuente y {matriz.sinRastro}{' '}
        no. {matriz.deTerceros > 0 && (
          <>
            {matriz.deTerceros} vienen de prensa o directorios, no de la marca: van marcados en
            naranja y conviene quitarlos del recuento.
          </>
        )}
      </p>
    </section>
  );
}

// La matriz se recalcula en el cliente al reclasificar. Es la misma cuenta
// que hace el servidor con `matrizDeClaims`, pero repetirla aquí evita ir y
// volver por cada decisión: con doscientos claims que revisar, esa espera es
// la diferencia entre usarlo y no usarlo.
function recalcula(claims: Claim[], tipos: TipoClaim[], cliente: string): MatrizClaims {
  const vivos = claims.filter((c) => !c.oculto);
  const todos = [...tipos, { clave: SIN_CLASIFICAR, nombre: 'Sin clasificar' }];
  const filas = todos
    .map((t) => {
      const suyos = vivos.filter((c) => c.tipo === t.clave);
      const porMarca: Record<string, number> = {};
      const probadosPorMarca: Record<string, number> = {};
      for (const c of suyos) {
        porMarca[c.dominio] = (porMarca[c.dominio] ?? 0) + 1;
        if (c.prueba) probadosPorMarca[c.dominio] = (probadosPorMarca[c.dominio] ?? 0) + 1;
      }
      return {
        clave: t.clave,
        nombre: t.nombre,
        claims: suyos.length,
        usan: Object.keys(porMarca).length,
        prueban: Object.keys(probadosPorMarca).length,
        clienteUsa: Boolean(porMarca[cliente]),
        clientePrueba: Boolean(probadosPorMarca[cliente]),
        porMarca,
        probadosPorMarca,
      };
    })
    .filter((f) => f.claims > 0);

  const porDominio = new Map<string, MatrizClaims['marcas'][number]>();
  for (const c of vivos) {
    const y = porDominio.get(c.dominio) ?? {
      dominio: c.dominio,
      nombre: c.nombre,
      grupo: c.grupo,
      claims: 0,
      probados: 0,
    };
    y.claims++;
    if (c.prueba) y.probados++;
    porDominio.set(c.dominio, y);
  }

  return {
    filas,
    marcas: [...porDominio.values()],
    total: vivos.length,
    sinRastro: vivos.filter((c) => c.procedencia === 'sin-rastro').length,
    deTerceros: vivos.filter((c) => c.procedencia === 'tercero').length,
  };
}
