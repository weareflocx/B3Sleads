'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BriefingLead } from '@/lib/types';
import { companyLabel, displayName } from '@/lib/types';
import { AVISO_INVITACION, PAUSA_NO_ACEPTA, type Invitacion, type NivelInvitacion } from '@/lib/invitacion';
import type { Signal } from '@/lib/types';
import { signalMeta } from '@/lib/radar';
import { diasLabel } from '@/lib/briefing';
import { CompanyLogo } from '../company-logo';

// Invitaciones de LinkedIn sin aceptar. Si ha aceptado lo miras tú en
// LinkedIn y lo marcas aquí: la app no consulta LinkedIn (spec §9).
export function Invitaciones({ pendientes }: { pendientes: Invitacion[] }) {
  return (
    <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      {pendientes.map((inv) => (
        <Fila key={inv.bl.lead.id} inv={inv} />
      ))}
    </ul>
  );
}

// El aviso sube de tono con los días: mirar, otra vía, retirar.
const TONO: Record<Exclude<NivelInvitacion, 'reciente'>, string> = {
  revisar: 'text-[var(--muted)]',
  otra_via: 'text-[var(--warning)]',
  retirar: 'text-[var(--danger)]',
};

// Cambiar el lead desde una fila del briefing. Devuelve el error a enseñar.
async function patch(body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch('/api/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return null;
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return res.status === 409 && json.error ? json.error : 'No se pudo guardar. Vuelve a intentarlo.';
  } catch {
    return 'Sin conexión con el servidor.';
  }
}

function Fila({ inv }: { inv: Invitacion }) {
  const { bl, days, nivel, activa, revisadaHace } = inv;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [hecho, setHecho] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function accion(body: Record<string, unknown>, texto: string) {
    setBusy(true);
    setAviso(null);
    const error = await patch({ leadId: bl.lead.id, ...body });
    setBusy(false);
    if (error) {
      setAviso(error);
      return;
    }
    setHecho(texto);
    // Quien acepta pasa a la sección de mensajes por enviar.
    router.refresh();
  }

  const mover = (stage: 'connected' | 'paused', texto: string) =>
    accion({ stage, discardReason: stage === 'paused' ? PAUSA_NO_ACEPTA : undefined }, texto);

  const nombre = bl.company ? companyLabel(bl.company.name, bl.company.domain) : displayName(bl.contact?.full_name);

  if (hecho) {
    return (
      <li className="px-4 py-2.5 text-sm text-[var(--muted)]">
        {nombre} → {hecho}
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 text-sm">
      {bl.company && (
        <CompanyLogo domain={bl.company.domain} name={nombre} size={26} src={bl.company.logo_url} />
      )}
      <div className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          {bl.company ? (
            <Link href={`/companies/${bl.company.domain}`} className="font-medium hover:underline">
              {nombre}
            </Link>
          ) : (
            <span className="font-medium">{nombre}</span>
          )}
          {bl.contact && bl.company && (
            <span className="truncate text-[var(--muted)]">{displayName(bl.contact.full_name)}</span>
          )}
        </span>
        <span className="block font-mono text-xs text-[var(--muted)]">
          invitación {diasLabel(days) === 'hoy' ? 'de hoy' : `enviada ${diasLabel(days)}`}
          {revisadaHace != null && !activa && ` · revisada ${diasLabel(revisadaHace)}`}
        </span>
        {nivel !== 'reciente' && activa && (
          <span className={`block text-xs ${TONO[nivel]}`}>{AVISO_INVITACION[nivel]}</span>
        )}
        {aviso && <span className="block text-xs text-[var(--danger)]">{aviso}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {bl.contact?.linkedin_url && (
          <a
            href={bl.contact.linkedin_url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Abrir LinkedIn de ${displayName(bl.contact.full_name)}`}
            className="flex h-7 w-7 items-center justify-center rounded border border-[var(--linkedin)]/40 font-sans text-[13px] font-bold text-[var(--linkedin)] transition-colors hover:border-[var(--linkedin)] hover:bg-[var(--linkedin)]/10"
          >
            in
          </a>
        )}
        <button
          onClick={() => mover('connected', 'Aceptada · el mensaje te espera arriba')}
          disabled={busy}
          className="rounded-md border border-[var(--cta)]/50 px-2.5 py-1 text-xs font-medium text-[var(--cta)] transition-colors hover:bg-[var(--cta)]/10 disabled:opacity-50"
        >
          Aceptada
        </button>
        {nivel !== 'reciente' && activa && (
          <button
            onClick={() => accion({ inviteChecked: true }, 'Sigue pendiente · te lo recuerdo en una semana')}
            disabled={busy}
            className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] transition-colors hover:border-[var(--muted)] disabled:opacity-50"
          >
            Sigue pendiente
          </button>
        )}
        <button
          onClick={() => mover('paused', `En pausa · ${PAUSA_NO_ACEPTA}`)}
          disabled={busy}
          title="Retírala también en LinkedIn: las invitaciones pendientes tienen tope"
          className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] transition-colors hover:border-[var(--muted)] disabled:opacity-50"
        >
          Retirar
        </button>
      </div>
    </li>
  );
}

// Aparcados porque no aceptaron, con una señal nueva después de la pausa: un
// motivo nuevo para volver a invitar.
export function VuelvenAlRadar({ items }: { items: { bl: BriefingLead; signal: Signal }[] }) {
  return (
    <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      {items.map(({ bl, signal }) => (
        <FilaVuelve key={bl.lead.id} bl={bl} signal={signal} />
      ))}
    </ul>
  );
}

function FilaVuelve({ bl, signal }: { bl: BriefingLead; signal: Signal }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [hecho, setHecho] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const nombre = bl.company ? companyLabel(bl.company.name, bl.company.domain) : displayName(bl.contact?.full_name);
  const d = (signal.detail ?? {}) as Record<string, unknown>;
  const que = [signalMeta(signal.type)?.label ?? signal.type, d.round, d.amount].filter(Boolean).join(' · ');

  async function volver() {
    setBusy(true);
    setAviso(null);
    const error = await patch({ leadId: bl.lead.id, stage: 'detected' });
    setBusy(false);
    if (error) return setAviso(error);
    setHecho(true);
    router.refresh();
  }

  if (hecho) {
    return <li className="px-4 py-2.5 text-sm text-[var(--muted)]">{nombre} → de vuelta en la cola</li>;
  }
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 text-sm">
      {bl.company && <CompanyLogo domain={bl.company.domain} name={nombre} size={26} src={bl.company.logo_url} />}
      <div className="min-w-0 flex-1">
        {bl.company ? (
          <Link href={`/companies/${bl.company.domain}`} className="font-medium hover:underline">
            {nombre}
          </Link>
        ) : (
          <span className="font-medium">{nombre}</span>
        )}
        <span className="block text-xs text-[var(--muted)]">
          No aceptó la invitación. Señal nueva: {que} · {diasLabel(Math.floor((Date.now() - new Date(signal.detected_at).getTime()) / 86_400_000))}
        </span>
        {aviso && <span className="block text-xs text-[var(--danger)]">{aviso}</span>}
      </div>
      <button
        onClick={volver}
        disabled={busy}
        className="shrink-0 rounded-md border border-[var(--cta)]/50 px-2.5 py-1 text-xs font-medium text-[var(--cta)] transition-colors hover:bg-[var(--cta)]/10 disabled:opacity-50"
      >
        Volver a la cola
      </button>
    </li>
  );
}
