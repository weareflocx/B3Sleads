'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BriefingLead } from '@/lib/types';
import { companyLabel, displayName } from '@/lib/types';
import { PAUSA_NO_ACEPTA } from '@/lib/invitacion';
import { diasLabel } from '@/lib/briefing';
import { CompanyLogo } from '../company-logo';

// Invitaciones de LinkedIn sin aceptar. Si ha aceptado lo miras tú en
// LinkedIn y lo marcas aquí: la app no consulta LinkedIn (spec §9).
export function Invitaciones({ pendientes }: { pendientes: { bl: BriefingLead; days: number }[] }) {
  return (
    <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      {pendientes.map(({ bl, days }) => (
        <Fila key={bl.lead.id} bl={bl} days={days} />
      ))}
    </ul>
  );
}

function Fila({ bl, days }: { bl: BriefingLead; days: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [hecho, setHecho] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function mover(stage: 'connected' | 'paused', texto: string) {
    setBusy(true);
    setAviso(null);
    try {
      const res = await fetch('/api/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: bl.lead.id,
          stage,
          discardReason: stage === 'paused' ? PAUSA_NO_ACEPTA : undefined,
        }),
      });
      if (!res.ok) {
        setAviso('No se pudo guardar. Vuelve a intentarlo.');
        return;
      }
      setHecho(texto);
      // Quien acepta pasa a la sección de mensajes por enviar.
      router.refresh();
    } catch {
      setAviso('Sin conexión con el servidor.');
    } finally {
      setBusy(false);
    }
  }

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
        </span>
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
