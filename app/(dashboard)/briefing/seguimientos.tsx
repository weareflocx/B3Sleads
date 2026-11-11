'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { diasLabel } from '@/lib/briefing';
import { PAUSA_SIN_RESPUESTA, type PlanSeguimiento } from '@/lib/seguimiento';

// Lo que la fila necesita del lead. Se pasa plano desde el servidor: la
// ficha entera (con el informe del scan) no tiene por qué viajar al cliente.
export interface SeguimientoItem {
  leadId: string;
  domain: string;
  company: string;
  founder: string | null;
  linkedinUrl: string | null;
  days: number;
  reason: 'sin_respuesta' | 'conversacion_fria';
}

// Seguimientos que tocan, ahora con el borrador a un clic. La app redacta;
// lo envías tú por LinkedIn y lo marcas aquí (spec §9).
export function Seguimientos({ items }: { items: SeguimientoItem[] }) {
  return (
    <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      {items.map((item) => (
        <Fila key={item.leadId} item={item} />
      ))}
    </ul>
  );
}

const BTN = 'rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-50';
const BTN_CTA = `${BTN} border-[var(--cta)]/50 font-medium text-[var(--cta)] hover:bg-[var(--cta)]/10`;
const BTN_MUTED = `${BTN} border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)]`;

async function post(url: string, body: Record<string, unknown>) {
  try {
    const res = await fetch(url, {
      method: url === '/api/leads' ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, json };
  } catch {
    return { ok: false, json: { error: 'Sin conexión con el servidor.' } as Record<string, unknown> };
  }
}

function Fila({ item }: { item: SeguimientoItem }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanSeguimiento | null>(null);
  const [texto, setTexto] = useState('');
  // El borrador tal como lo propuso la app, para guardarlo junto a lo enviado.
  const [original, setOriginal] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const marcaCopiado = (tag: string) => {
    setCopiado(tag);
    setTimeout(() => setCopiado((c) => (c === tag ? null : c)), 2500);
  };

  async function redactar() {
    setAbierto(true);
    setBusy('redactar');
    setAviso(null);
    const { ok, json } = await post('/api/messages/seguimiento', { leadId: item.leadId });
    setBusy(null);
    if (json.plan) setPlan(json.plan as PlanSeguimiento);
    if (typeof json.borrador === 'string') {
      setTexto(json.borrador);
      setOriginal(json.borrador);
    }
    if (!ok) setAviso(typeof json.error === 'string' ? json.error : 'No se pudo redactar. Vuelve a intentarlo.');
  }

  async function copiarPrompt() {
    setBusy('prompt');
    setAviso(null);
    const { ok, json } = await post('/api/messages/seguimiento', { leadId: item.leadId, modo: 'prompt' });
    setBusy(null);
    if (!ok || typeof json.prompt !== 'string') {
      setAviso(typeof json.error === 'string' ? json.error : 'No se pudo preparar el prompt.');
      return;
    }
    await navigator.clipboard.writeText(json.prompt).catch(() => setAviso('No se pudo copiar al portapapeles.'));
    marcaCopiado('prompt');
  }

  function copiarYAbrir() {
    // El portapapeles y la pestaña van en el mismo gesto: si se espera al
    // portapapeles, Safari bloquea la ventana.
    navigator.clipboard.writeText(texto).catch(() => setAviso('No se pudo copiar al portapapeles.'));
    if (item.linkedinUrl) window.open(item.linkedinUrl, '_blank', 'noopener');
    marcaCopiado('texto');
  }

  async function enviado() {
    setBusy('enviado');
    setAviso(null);
    const { ok, json } = await post('/api/messages/seguimiento', {
      leadId: item.leadId,
      modo: 'enviado',
      texto,
      original,
    });
    setBusy(null);
    if (!ok) {
      setAviso(typeof json.error === 'string' ? json.error : 'No se pudo guardar. Vuelve a intentarlo.');
      return;
    }
    setHecho('seguimiento enviado · te aviso si en 5 días sigue sin contestar');
    router.refresh();
  }

  async function pausar() {
    setBusy('pausar');
    setAviso(null);
    const { ok } = await post('/api/leads', {
      leadId: item.leadId,
      stage: 'paused',
      discardReason: PAUSA_SIN_RESPUESTA,
    });
    setBusy(null);
    if (!ok) {
      setAviso('No se pudo aparcar. Vuelve a intentarlo.');
      return;
    }
    setHecho('en pausa');
    router.refresh();
  }

  if (hecho) {
    return (
      <li className="px-4 py-2.5 text-sm text-[var(--muted)]">
        {item.company} → {hecho}
      </li>
    );
  }

  const max = plan?.max ?? null;
  const pasado = max != null && texto.length > max;

  return (
    <li className="px-4 py-2.5 text-sm">
      <div className="flex items-center gap-3">
        <Link href={`/companies/${item.domain}`} className="font-medium hover:underline">
          {item.company}
        </Link>
        {item.founder && <span className="truncate text-[var(--muted)]">{item.founder}</span>}
        <span className="min-w-0 flex-1 truncate text-xs text-[var(--muted)]">
          {item.reason === 'sin_respuesta'
            ? `contactado ${diasLabel(item.days)}, sin respuesta`
            : `conversación parada ${diasLabel(item.days)}`}
        </span>
        {item.linkedinUrl && (
          <a
            href={item.linkedinUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Abrir LinkedIn de ${item.founder ?? item.company}`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--linkedin)]/40 font-sans text-[13px] font-bold text-[var(--linkedin)] transition-colors hover:border-[var(--linkedin)] hover:bg-[var(--linkedin)]/10"
          >
            in
          </a>
        )}
        {!abierto && (
          <button onClick={redactar} className={`${BTN_CTA} shrink-0`}>
            Redactar
          </button>
        )}
      </div>

      {abierto && (
        <div className="mt-2.5 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3">
          {busy === 'redactar' && <p className="text-xs text-[var(--muted)]">Redactando el seguimiento…</p>}

          {plan?.tipo === 'pausar' ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 text-xs leading-relaxed text-[var(--muted)]">
                Ya van tres mensajes sin respuesta. Un cuarto resta más que suma: mejor aparcarlo.
              </p>
              <button onClick={pausar} disabled={busy !== null} className={BTN_CTA}>
                Aparcar
              </button>
            </div>
          ) : (
            busy !== 'redactar' && (
              <>
                {plan && (
                  <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-[var(--soft)]">
                    {plan.titulo} · mensaje n.º {plan.numero}
                  </p>
                )}
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  rows={4}
                  aria-label={`Seguimiento para ${item.founder ?? item.company}`}
                  placeholder="Pega aquí el seguimiento que te devuelva tu Claude, o escríbelo."
                  className="w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm leading-relaxed outline-none transition-colors focus:border-[var(--cta)]"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button onClick={copiarYAbrir} disabled={!texto.trim() || busy !== null} className={BTN_CTA}>
                    {copiado === 'texto' ? 'Copiado ✓' : 'Copiar y abrir LinkedIn'}
                  </button>
                  <button onClick={enviado} disabled={!texto.trim() || busy !== null} className={BTN_MUTED}>
                    {busy === 'enviado' ? 'Guardando…' : 'Enviado'}
                  </button>
                  <button onClick={redactar} disabled={busy !== null} className={BTN_MUTED}>
                    Otra versión
                  </button>
                  <button onClick={copiarPrompt} disabled={busy !== null} className={BTN_MUTED}>
                    {copiado === 'prompt' ? 'Prompt copiado ✓' : 'Copiar prompt ⧉'}
                  </button>
                  {max != null && (
                    <span
                      className={`ml-auto font-mono text-[11px] ${pasado ? 'text-[var(--danger)]' : 'text-[var(--soft)]'}`}
                    >
                      {texto.length}/{max}
                    </span>
                  )}
                </div>
              </>
            )
          )}
          {aviso && <p className="mt-2 text-xs text-[var(--danger)]">{aviso}</p>}
        </div>
      )}
    </li>
  );
}
