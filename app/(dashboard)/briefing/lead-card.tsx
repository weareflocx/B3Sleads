'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { BriefingLead } from '@/lib/types';
import { DISCARD_REASONS, displayName, companyLabel, esScanRetenido, estadoScan, ETIQUETA_ESTADO_SCAN } from '@/lib/types';
import { CompanyLogo } from '../company-logo';
import { agoLabel, computeRadar, type Radar } from '@/lib/radar';

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return 'hoy';
  if (days === 1) return 'hace 1 día';
  return `hace ${days} días`;
}

function signalLabel(bl: BriefingLead): string {
  const d = bl.signal?.detail;
  if (!bl.signal) return 'sin señal registrada';
  if (bl.signal.type === 'engagement') return `Engaged · ${timeAgo(bl.signal.detected_at)}`;
  // Levantando ronda no es una ronda cerrada: el importe vive en
  // target_amount, y sin este caso se leía como un cierre que no ha pasado.
  if (bl.signal.type === 'levantando_ronda') {
    const objetivo = d?.target_amount ? `buscan ${d.target_amount}` : null;
    return ['En ronda', d?.round, objetivo].filter(Boolean).join(' · ') +
      ` · ${timeAgo(bl.signal.detected_at)}`;
  }
  const parts = [d?.round, d?.amount, (d?.investors as string[] | undefined)?.join(', ')]
    .filter(Boolean)
    .join(' · ');
  return `${parts || bl.signal.type} · ${timeAgo(bl.signal.detected_at)}`;
}

function tldrText(bl: BriefingLead): string | null {
  const t = bl.scan?.tldr;
  if (!t) return null;
  if (typeof t === 'string') return t;
  // Sin resumen no se enseña nada: antes caía un trozo de JSON crudo.
  return typeof t.summary === 'string' && t.summary.trim() ? t.summary : null;
}

// El número del radar y la señal que lo sostiene. Sin señal no hay número:
// se dice "Sin señal" en gris, nunca un valor por defecto.
function RadarLine({ radar }: { radar: Radar }) {
  if (radar.state !== 'activo' || !radar.best) {
    return (
      <p className="mt-2 font-mono text-xs text-[var(--soft)]">
        {radar.state === 'no_escaneable'
          ? 'Sin scan utilizable · fuera de la cola hasta re-escanear'
          : 'Sin señal viva · en reserva hasta que aparezca una'}
      </p>
    );
  }
  const s = radar.best;
  return (
    <div className="mt-2">
      <p className="font-mono text-xs text-[var(--muted)]">
        Radar {radar.score} · Fit {radar.fit} × Timing {radar.timing}
      </p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Señal: {s.label} · {agoLabel(s.days)}
        {s.sourceUrl && (
          <a
            href={s.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-1 text-[var(--cta)] hover:underline"
          >
            ↗
          </a>
        )}
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-[var(--soft)]">{s.evidence}</p>
    </div>
  );
}

// Qué se ha hecho con el lead al quitarlo de la lista.
const HECHO: Record<string, string> = {
  invited: 'Invitación enviada',
  contacted: 'Contactado',
  discarded: 'Descartado',
};

// modo 'cola': aún no hay conexión en LinkedIn, el paso es invitar.
// modo 'conectado': aceptó la invitación, el paso es enviar el mensaje.
export function LeadCard({ initial, modo = 'cola' }: { initial: BriefingLead; modo?: 'cola' | 'conectado' }) {
  const bl = initial;
  const radar = computeRadar(bl, bl.signals);
  const [draft, setDraft] = useState(bl.message?.draft ?? '');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [copied, setCopied] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // El mensaje al que pertenece el borrador que se ve: cambia al regenerar.
  const [mensaje, setMensaje] = useState<{ id: string | null; draft: string }>({
    id: bl.message?.id ?? null,
    draft: bl.message?.draft ?? '',
  });

  // El briefing solo pasa leads con empresa (cualificados). Guard defensivo.
  if (!bl.company) return null;

  if (gone) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-5 py-3 text-sm text-[var(--muted)]">
        {bl.company.name} → {gone}
      </div>
    );
  }

  async function patchLead(stage: string, discardReason?: string) {
    setBusy(stage);
    setAviso(null);
    try {
      const res = await fetch('/api/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: bl.lead.id, stage, discardReason }),
      });
      if (res.ok) setGone(HECHO[stage] ?? stage);
      else setAviso('No se pudo cambiar la etapa. Vuelve a intentarlo.');
    } catch {
      setAviso('No se pudo cambiar la etapa: sin conexión con el servidor.');
    } finally {
      setBusy(null);
    }
  }

  async function copyAndOpen() {
    setAviso(null);
    // El portapapeles se pide ANTES de abrir la pestaña (con la página aún
    // enfocada) y la pestaña se abre en el mismo gesto: esperar al
    // portapapeles primero hacía que Safari bloqueara la ventana.
    const copia = navigator.clipboard.writeText(draft);
    if (bl.contact?.linkedin_url) window.open(bl.contact.linkedin_url, '_blank');
    try {
      await copia;
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setAviso('No pude copiar el borrador. Selecciónalo y cópialo a mano.');
    }
    // Lo que se envía de verdad, si difiere de lo que escribió la IA, se
    // guarda en el mensaje que se está enviando (el último regenerado).
    if (mensaje.id && draft !== mensaje.draft) {
      fetch('/api/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: mensaje.id, editedFinal: draft }),
      })
        .then((r) => {
          if (!r.ok) setAviso('El borrador editado no se guardó en el historial.');
        })
        .catch(() => setAviso('El borrador editado no se guardó en el historial.'));
    }
  }

  async function regenerate() {
    setBusy('regen');
    setAviso(null);
    try {
      const res = await fetch('/api/messages/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: bl.lead.id }),
      });
      const json = (await res.json().catch(() => ({}))) as { draft?: string; messageId?: string | null; error?: string };
      if (json.draft) {
        setDraft(json.draft);
        setMensaje({ id: json.messageId ?? null, draft: json.draft });
      } else setAviso(`No se pudo regenerar: ${json.error ?? `error ${res.status}`}`);
    } catch {
      setAviso('No se pudo regenerar: sin conexión con el servidor.');
    } finally {
      setBusy(null);
    }
  }

  const tldr = tldrText(bl);

  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-start justify-between gap-4">
        {/* La marca con su cara, como en la ficha: en una lista de leads el
            logo se reconoce antes que el nombre. */}
        <Link href={`/companies/${bl.company.domain}`} className="mt-0.5 shrink-0">
          <CompanyLogo
            domain={bl.company.domain}
            name={companyLabel(bl.company.name, bl.company.domain)}
            size={40}
            src={bl.company.logo_url}
          />
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">
            <Link href={`/companies/${bl.company.domain}`} className="hover:underline">
              {companyLabel(bl.company.name, bl.company.domain)}
            </Link>{' '}
            <a
              href={`https://${bl.company.domain}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-sm font-normal text-[var(--muted)] hover:underline"
            >
              {bl.company.domain} ↗
            </a>
          </h2>
          <p className="mt-1 flex items-center gap-2 text-sm text-[var(--muted)]">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{
                background:
                  bl.company.source === 'engaged' ? 'var(--success)' : 'var(--accent)',
              }}
            />
            {signalLabel(bl)}
          </p>
        </div>
        {radar.score != null ? (
          <span
            className="rounded-md border border-[var(--border)] px-2 py-1 font-mono text-sm"
            title={`Radar ${radar.score} = fit ${radar.fit} × timing ${radar.timing} (${radar.version})`}
          >
            {radar.score}
          </span>
        ) : (
          <span className="rounded-md border border-[var(--border)] px-2 py-1 font-mono text-xs text-[var(--soft)]">
            Sin señal
          </span>
        )}
      </div>

      {/* Por qué está aquí este lead. Ningún número del radar se muestra sin
          la señal que lo produjo: fecha, evidencia literal y fuente. */}
      {modo === 'conectado' ? (
        <p className="mt-2 text-sm text-[var(--success)]">
          Aceptó tu invitación. Ya podéis hablar: envía el mensaje.
        </p>
      ) : (
        <RadarLine radar={radar} />
      )}

      {bl.scan && (
        <div className="mt-4 text-sm">
          {bl.scan.status === 'ready' ? (
            <>
              {/* Un scan sin nota no es un scan vacío: el Scanner la retuvo.
                  Se dice, y la ficha explica por qué. */}
              {esScanRetenido(bl.scan) ? (
                <span className="font-mono text-[var(--warning)]">B3S: lectura retenida</span>
              ) : (
                <span className="font-mono">B3S: {bl.scan.score ?? '—'}/100</span>
              )}
              {tldr && <span className="text-[var(--muted)]"> · “{tldr}”</span>}{' '}
              {bl.scan.ui_url && (
                <a
                  href={bl.scan.ui_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--cta)] hover:underline"
                >
                  Ver informe completo ↗
                </a>
              )}
            </>
          ) : (
            // En castellano y sin puntos suspensivos cuando no hay nada en
            // marcha: "scan failed…" parecía trabajo en curso.
            <span className={estadoScan(bl.scan) === 'escaneando' ? 'text-[var(--muted)]' : 'text-[var(--warning)]'}>
              B3S: scan {ETIQUETA_ESTADO_SCAN[estadoScan(bl.scan)]}
            </span>
          )}
        </div>
      )}

      {bl.contact && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span>
            {displayName(bl.contact.full_name)}
            {bl.contact.role ? `, ${bl.contact.role}` : ''}
          </span>
          {bl.contact.linkedin_url && (
            <a
              href={bl.contact.linkedin_url}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--linkedin-soft)] hover:underline"
            >
              LinkedIn ↗
            </a>
          )}
          {bl.contact.email && (
            <a href={`mailto:${bl.contact.email}`} className="text-[var(--muted)] hover:underline">
              {bl.contact.email}
            </a>
          )}
          {bl.contact.notes && (
            <span className="text-xs text-[var(--muted)]">({bl.contact.notes})</span>
          )}
        </div>
      )}

      {bl.message && (
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-sm leading-relaxed outline-none transition-colors focus:border-[var(--cta)]"
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]/90">
              {draft}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <button
              onClick={copyAndOpen}
              className="rounded-md bg-[var(--linkedin)] px-3 py-1.5 font-medium text-[var(--linkedin-text)] transition-opacity hover:opacity-90"
            >
              {copied ? 'Copiado ✓ · abriendo LinkedIn' : 'Copiar y abrir LinkedIn'}
            </button>
            <button
              onClick={() => setEditing(!editing)}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 hover:border-[var(--muted)]"
            >
              {editing ? 'Hecho' : 'Editar'}
            </button>
            <button
              onClick={regenerate}
              disabled={busy === 'regen'}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 hover:border-[var(--muted)] disabled:opacity-50"
            >
              {busy === 'regen' ? 'Regenerando…' : 'Regenerar'}
            </button>
          </div>
        </div>
      )}

      {aviso && (
        <p role="status" className="mt-3 text-xs text-[var(--danger)]">
          {aviso}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4 text-sm">
        {/* En LinkedIn el mensaje no sale hasta que acepta la conexión: en la
            cola el paso es invitar, y "Contactado" queda para quien ya es
            contacto. */}
        {modo === 'cola' ? (
          <>
            <button
              onClick={() => patchLead('invited')}
              disabled={busy !== null}
              className="rounded-md border border-[var(--cta)]/50 px-3 py-1.5 text-[var(--cta)] transition-colors hover:bg-[var(--cta)]/10 disabled:opacity-50"
            >
              → Invitación enviada
            </button>
            <button
              onClick={() => patchLead('contacted')}
              disabled={busy !== null}
              title="Ya erais contactos y le has enviado el mensaje"
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[var(--muted)] transition-colors hover:border-[var(--muted)] disabled:opacity-50"
            >
              Ya es contacto · → Contactado
            </button>
          </>
        ) : (
          <button
            onClick={() => patchLead('contacted')}
            disabled={busy !== null}
            className="rounded-md border border-[var(--cta)]/50 px-3 py-1.5 text-[var(--cta)] transition-colors hover:bg-[var(--cta)]/10 disabled:opacity-50"
          >
            Mensaje enviado · → Contactado
          </button>
        )}
        {discarding ? (
          <select
            autoFocus
            defaultValue=""
            onChange={(e) => e.target.value && patchLead('discarded', e.target.value)}
            onBlur={() => setDiscarding(false)}
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
          >
            <option value="" disabled>
              Motivo…
            </option>
            {DISCARD_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        ) : (
          <button
            onClick={() => setDiscarding(true)}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[var(--muted)] hover:border-[var(--muted)]"
          >
            Descartar ▾
          </button>
        )}
      </div>
    </article>
  );
}
