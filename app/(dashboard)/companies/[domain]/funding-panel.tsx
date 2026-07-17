'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Signal } from '@/lib/types';

// Financiación del lead: última ronda conocida + alta manual. La ronda es
// la señal de momento (40% de la prioridad): registrarla reordena el briefing.
function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return 'hoy';
  if (days < 30) return `hace ${days} día${days === 1 ? '' : 's'}`;
  const months = Math.round(days / 30);
  if (months < 12) return `hace ${months} mes${months === 1 ? '' : 'es'}`;
  return `hace ${Math.round(months / 12)} año${months >= 24 ? 's' : ''}`;
}

const ROUNDS = ['pre-seed', 'seed', 'series-a', 'series-b+', 'launch', 'other'];

export function FundingPanel({
  companyId,
  leadId,
  fundingSignals,
}: {
  companyId: string;
  leadId: string;
  fundingSignals: Signal[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState('seed');
  const [amount, setAmount] = useState('');
  const [investors, setInvestors] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const latest = fundingSignals[0] ?? null;

  async function save() {
    setBusy(true);
    const res = await fetch('/api/signals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, leadId, round, amount, investors, date }),
    });
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      setAmount('');
      setInvestors('');
      setDate('');
      router.refresh();
    }
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      {latest ? (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium capitalize">
              {(latest.detail?.round as string) ?? 'ronda'}
              {latest.detail?.amount ? ` · ${latest.detail.amount}` : ''}
            </span>
            <span className="shrink-0 font-mono text-xs text-[var(--muted)]">
              {timeAgo(latest.detected_at)}
            </span>
          </div>
          {Array.isArray(latest.detail?.investors) && latest.detail.investors.length > 0 && (
            <p className="mt-1 text-xs text-[var(--muted)]">
              {(latest.detail.investors as string[]).join(' · ')}
            </p>
          )}
          {fundingSignals.length > 1 && (
            <p className="mt-2 border-t border-[var(--border)] pt-2 text-xs text-[var(--muted)]">
              {fundingSignals.length - 1} ronda{fundingSignals.length > 2 ? 's' : ''} anterior
              {fundingSignals.length > 2 ? 'es' : ''} registrada{fundingSignals.length > 2 ? 's' : ''}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          Sin ronda registrada. Si sabes que levantaron, regístralo: la recencia de ronda pesa un
          40% en la prioridad.
        </p>
      )}

      {open ? (
        <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
          <div className="flex gap-2">
            <select
              value={round}
              onChange={(e) => setRound(e.target.value)}
              className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
            >
              {ROUNDS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="2.4M EUR"
              className="w-28 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
            />
          </div>
          <input
            value={investors}
            onChange={(e) => setInvestors(e.target.value)}
            placeholder="inversores, separados por comas"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          />
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? 'Guardando…' : 'Guardar ronda'}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)]"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="mt-3 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] transition-colors hover:border-[var(--nav-active-border)] hover:text-[var(--accent)]"
        >
          {latest ? 'Registrar otra ronda' : 'Registrar ronda'}
        </button>
      )}
    </div>
  );
}
