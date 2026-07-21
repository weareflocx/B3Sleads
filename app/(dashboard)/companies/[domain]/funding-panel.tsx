'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Signal } from '@/lib/types';
import {
  parseAmount,
  formatAmount,
  amountToEur,
  dateInputValue,
  type AmountUnit,
} from '@/lib/funding';
import { resolveInvestors } from '@/lib/investors';

// Financiación del lead: rondas registradas, corregibles, y alta manual. La
// ronda es la señal de momento (40% de la prioridad): tocarla reordena el
// briefing, así que cada guardado recalcula el score en el servidor.
function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return 'hoy';
  if (days < 30) return `hace ${days} día${days === 1 ? '' : 's'}`;
  const months = Math.round(days / 30);
  if (months < 12) return `hace ${months} mes${months === 1 ? '' : 'es'}`;
  return `hace ${Math.round(months / 12)} año${months >= 24 ? 's' : ''}`;
}

const ROUNDS = ['pre-seed', 'seed', 'series-a', 'series-b+', 'launch', 'other'];

const FIELD =
  'rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm outline-none focus:border-[var(--cta)]';

// Importe: número + unidad, con el euro puesto. Nadie teclea el símbolo.
function AmountField({
  value,
  unit,
  onValue,
  onUnit,
}: {
  value: string;
  unit: AmountUnit;
  onValue: (v: string) => void;
  onUnit: (u: AmountUnit) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.1"
        value={value}
        onChange={(e) => onValue(e.target.value)}
        placeholder="6"
        aria-label="Importe de la ronda"
        className={`${FIELD} w-20 text-right`}
      />
      <select
        value={unit}
        onChange={(e) => onUnit(e.target.value as AmountUnit)}
        aria-label="Unidad"
        className={`${FIELD} px-1`}
      >
        <option value="K">K</option>
        <option value="M">M</option>
      </select>
      <span className="font-mono text-sm text-[var(--muted)]">€</span>
    </div>
  );
}

// Los inversores dejan de ser texto plano: cada uno es un chip que lleva a
// buscar el fondo. Cuando exista la ficha del VC, el chip apuntará ahí.
function InvestorChips({ investors }: { investors: unknown }) {
  const refs = resolveInvestors(investors);
  if (!refs.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {refs.map((inv) => (
        <a
          key={inv.slug}
          href={inv.href}
          target="_blank"
          rel="noreferrer"
          title={`Buscar ${inv.name}`}
          className="rounded-full border border-[var(--border)] px-2 py-0.5 font-mono text-xs text-[var(--muted)] transition-colors hover:border-[var(--cta)] hover:text-[var(--cta)]"
        >
          {inv.name}
        </a>
      ))}
    </div>
  );
}

function RoundRow({
  signal,
  leadId,
  highlight,
}: {
  signal: Signal;
  leadId: string;
  highlight: boolean;
}) {
  const router = useRouter();
  const d = signal.detail ?? {};
  const initialAmount = parseAmount(d.amount);

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState((d.round as string) || 'seed');
  const [value, setValue] = useState(initialAmount.value);
  const [unit, setUnit] = useState<AmountUnit>(initialAmount.unit);
  const [investors, setInvestors] = useState(
    Array.isArray(d.investors) ? (d.investors as string[]).join(', ') : '',
  );
  const [date, setDate] = useState(dateInputValue(signal.detected_at));

  function reset() {
    setRound((d.round as string) || 'seed');
    setValue(initialAmount.value);
    setUnit(initialAmount.unit);
    setInvestors(Array.isArray(d.investors) ? (d.investors as string[]).join(', ') : '');
    setDate(dateInputValue(signal.detected_at));
    setEditing(false);
  }

  async function save() {
    setBusy(true);
    const res = await fetch('/api/signals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signalId: signal.id,
        leadId,
        round,
        amount: formatAmount(value, unit),
        amountEur: amountToEur(value, unit),
        investors,
        date,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setEditing(false);
      router.refresh();
    }
  }

  async function remove() {
    if (!confirm('¿Eliminar esta ronda? La prioridad del lead se recalculará.')) return;
    setBusy(true);
    const res = await fetch('/api/signals', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signalId: signal.id, leadId }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  if (editing) {
    return (
      <div className="space-y-2 rounded-md border border-[var(--cta)] p-2">
        <div className="flex flex-wrap items-center gap-2">
          <select value={round} onChange={(e) => setRound(e.target.value)} className={`${FIELD} flex-1`}>
            {ROUNDS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <AmountField value={value} unit={unit} onValue={setValue} onUnit={setUnit} />
        </div>
        <input
          value={investors}
          onChange={(e) => setInvestors(e.target.value)}
          placeholder="inversores, separados por comas"
          className={`${FIELD} w-full`}
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={`${FIELD} w-full`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={save}
            disabled={busy}
            className="rounded-md bg-[var(--cta)] px-3 py-1.5 text-sm font-medium text-[var(--cta-text)] disabled:opacity-50"
          >
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
          <button onClick={reset} className="px-1 text-sm text-[var(--muted)] hover:text-[var(--text)]">
            Cancelar
          </button>
          <button
            onClick={remove}
            disabled={busy}
            className="ml-auto text-xs text-[var(--muted)] transition-colors hover:text-[var(--danger)] disabled:opacity-50"
          >
            Eliminar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`group ${highlight ? '' : 'opacity-70'}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium capitalize">
          {(d.round as string) ?? 'ronda'}
          {d.amount ? ` · ${d.amount}` : ''}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setEditing(true)}
            title="Editar ronda"
            aria-label="Editar ronda"
            className="text-[var(--soft)] opacity-0 transition-opacity hover:text-[var(--text)] group-hover:opacity-100 focus:opacity-100"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <span className="font-mono text-xs text-[var(--muted)]">{timeAgo(signal.detected_at)}</span>
        </span>
      </div>
      <InvestorChips investors={d.investors} />
    </div>
  );
}

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
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState<AmountUnit>('M');
  const [investors, setInvestors] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await fetch('/api/signals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId,
        leadId,
        round,
        amount: formatAmount(value, unit),
        amountEur: amountToEur(value, unit),
        investors,
        date,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      setValue('');
      setInvestors('');
      setDate('');
      router.refresh();
    }
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      {fundingSignals.length ? (
        <div className="space-y-3">
          {fundingSignals.map((s, i) => (
            <div key={s.id} className={i > 0 ? 'border-t border-[var(--border)] pt-3' : ''}>
              <RoundRow signal={s} leadId={leadId} highlight={i === 0} />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          Sin ronda registrada. Si sabes que levantaron, regístralo: la recencia de ronda pesa un
          40% en la prioridad.
        </p>
      )}

      {open ? (
        <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <select value={round} onChange={(e) => setRound(e.target.value)} className={`${FIELD} flex-1`}>
              {ROUNDS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <AmountField value={value} unit={unit} onValue={setValue} onUnit={setUnit} />
          </div>
          <input
            value={investors}
            onChange={(e) => setInvestors(e.target.value)}
            placeholder="inversores, separados por comas"
            className={`${FIELD} w-full`}
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`${FIELD} w-full`}
          />
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="rounded-md bg-[var(--cta)] px-3 py-1.5 text-sm font-medium text-[var(--cta-text)] disabled:opacity-50"
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
          className="mt-3 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] transition-colors hover:border-[var(--cta)] hover:text-[var(--cta)]"
        >
          {fundingSignals.length ? 'Registrar otra ronda' : 'Registrar ronda'}
        </button>
      )}
    </div>
  );
}
