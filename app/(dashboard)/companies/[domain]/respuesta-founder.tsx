'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { stageLabel } from '@/lib/types';
import { ETIQUETA_CLASE, type LecturaRespuesta } from '@/lib/seguimiento';

// Lo que ha contestado el founder. Sergio lo pega aquí (la app no lee
// LinkedIn, spec §9): queda en la bitácora, se clasifica, se propone la
// etapa y sale un borrador de contestación que él revisa y envía a mano.
export function RespuestaFounder({
  leadId,
  founder,
  linkedinUrl,
}: {
  leadId: string;
  founder: string | null;
  linkedinUrl: string | null;
}) {
  const router = useRouter();
  const [respuesta, setRespuesta] = useState('');
  const [lectura, setLectura] = useState<LecturaRespuesta | null>(null);
  const [borrador, setBorrador] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [etapaHecha, setEtapaHecha] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const quien = founder ?? 'el founder';
  const marcaCopiado = (tag: string) => {
    setCopiado(tag);
    setTimeout(() => setCopiado((c) => (c === tag ? null : c)), 2500);
  };

  async function llama(url: string, method: 'POST' | 'PATCH', body: Record<string, unknown>) {
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: res.ok, json };
    } catch {
      return { ok: false, json: { error: 'Sin conexión con el servidor.' } as Record<string, unknown> };
    }
  }

  async function leer() {
    setBusy('leer');
    setAviso(null);
    setLectura(null);
    setEtapaHecha(false);
    setEnviado(false);
    const { ok, json } = await llama('/api/messages/respuesta', 'POST', { leadId, respuesta });
    setBusy(null);
    if (json.lectura) {
      const l = json.lectura as LecturaRespuesta;
      setLectura(l);
      setBorrador(l.borrador);
    }
    if (!ok) setAviso(typeof json.error === 'string' ? json.error : 'No se pudo leer la respuesta.');
    // La respuesta ya está en la bitácora: que se vea.
    if (json.guardada) router.refresh();
  }

  async function copiarPrompt() {
    setBusy('prompt');
    setAviso(null);
    const { ok, json } = await llama('/api/messages/respuesta', 'POST', { leadId, respuesta, modo: 'prompt' });
    setBusy(null);
    if (!ok || typeof json.prompt !== 'string') {
      setAviso(typeof json.error === 'string' ? json.error : 'No se pudo preparar el prompt.');
      return;
    }
    await navigator.clipboard.writeText(json.prompt).catch(() => setAviso('No se pudo copiar al portapapeles.'));
    marcaCopiado('prompt');
    if (json.guardada) router.refresh();
  }

  async function aplicarEtapa() {
    if (!lectura?.etapa) return;
    setBusy('etapa');
    setAviso(null);
    const { ok } = await llama('/api/leads', 'PATCH', {
      leadId,
      stage: lectura.etapa,
      discardReason: lectura.motivo ?? undefined,
    });
    setBusy(null);
    if (!ok) {
      setAviso('No se pudo cambiar la etapa. Vuelve a intentarlo.');
      return;
    }
    setEtapaHecha(true);
    router.refresh();
  }

  function copiarYAbrir() {
    navigator.clipboard.writeText(borrador).catch(() => setAviso('No se pudo copiar al portapapeles.'));
    if (linkedinUrl) window.open(linkedinUrl, '_blank', 'noopener');
    marcaCopiado('borrador');
  }

  async function marcarEnviado() {
    setBusy('enviado');
    setAviso(null);
    const { ok, json } = await llama('/api/messages/seguimiento', 'POST', {
      leadId,
      modo: 'enviado',
      como: 'respuesta',
      texto: borrador,
      original: lectura?.borrador ?? null,
    });
    setBusy(null);
    if (!ok) {
      setAviso(typeof json.error === 'string' ? json.error : 'No se pudo guardar. Vuelve a intentarlo.');
      return;
    }
    setEnviado(true);
    router.refresh();
  }

  const BTN = 'rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40';
  const BTN_CTA = `${BTN} bg-[var(--cta)] text-[var(--cta-text)] hover:opacity-90`;
  const BTN_OUT = `${BTN} border border-[var(--cta)] text-[var(--cta)] hover:bg-[var(--cta)]/10`;
  const BTN_MUTED = `${BTN} border border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)]`;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs leading-relaxed text-[var(--muted)]">
        Pega lo que te ha contestado {quien} en LinkedIn. «Leer respuesta» la guarda en la bitácora, la
        clasifica y saca un borrador de contestación. «Copiar prompt» no guarda nada. Lo envías tú.
      </p>
      <textarea
        value={respuesta}
        onChange={(e) => setRespuesta(e.target.value)}
        rows={3}
        aria-label={`Respuesta de ${quien}`}
        placeholder="Su mensaje, tal cual."
        className="mt-2 w-full resize-y rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm leading-relaxed outline-none transition-colors focus:border-[var(--cta)]"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button onClick={leer} disabled={!respuesta.trim() || busy !== null} className={BTN_CTA}>
          {busy === 'leer' ? 'Leyendo…' : 'Leer respuesta'}
        </button>
        <button onClick={copiarPrompt} disabled={!respuesta.trim() || busy !== null} className={BTN_MUTED}>
          {copiado === 'prompt' ? 'Prompt copiado ✓ · pégalo en tu Claude' : 'Copiar prompt ⧉'}
        </button>
      </div>
      {aviso && <p className="mt-2 text-xs text-[var(--danger)]">{aviso}</p>}

      {lectura && (
        <div className="mt-4 space-y-3 border-t border-[var(--border)] pt-4">
          <div>
            <span className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs font-medium">
              {ETIQUETA_CLASE[lectura.clase]}
            </span>
            {lectura.resumen && <p className="mt-2 text-sm leading-relaxed">{lectura.resumen}</p>}
            {lectura.cualificacion && (
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{lectura.cualificacion}</p>
            )}
          </div>

          {lectura.etapa && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {etapaHecha ? (
                <span className="text-[var(--muted)]">Etapa: {stageLabel(lectura.etapa)} ✓</span>
              ) : (
                <>
                  <span className="text-[var(--muted)]">
                    Etapa propuesta: {stageLabel(lectura.etapa)}
                    {lectura.motivo ? ` (${lectura.motivo})` : ''}
                  </span>
                  <button onClick={aplicarEtapa} disabled={busy !== null} className={BTN_OUT}>
                    {busy === 'etapa' ? 'Guardando…' : `Pasar a ${stageLabel(lectura.etapa)}`}
                  </button>
                </>
              )}
            </div>
          )}

          {enviado ? (
            <p className="text-xs text-[var(--muted)]">Contestación enviada y anotada en la bitácora ✓</p>
          ) : (
            <div>
              <textarea
                value={borrador}
                onChange={(e) => setBorrador(e.target.value)}
                rows={4}
                aria-label="Borrador de contestación"
                placeholder="Aquí no hace falta contestar. Si quieres hacerlo, escríbelo."
                className="w-full resize-y rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm leading-relaxed outline-none transition-colors focus:border-[var(--cta)]"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button onClick={copiarYAbrir} disabled={!borrador.trim() || busy !== null} className={BTN_OUT}>
                  {copiado === 'borrador' ? 'Copiado ✓' : 'Copiar y abrir LinkedIn'}
                </button>
                <button onClick={marcarEnviado} disabled={!borrador.trim() || busy !== null} className={BTN_MUTED}>
                  {busy === 'enviado' ? 'Guardando…' : 'Enviado'}
                </button>
                <span className="ml-auto font-mono text-[11px] text-[var(--soft)]">{borrador.length}/500</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
