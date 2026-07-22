'use client';

import { useState } from 'react';
import Link from 'next/link';
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
import type { RoundProposal } from '@/lib/funding-discovery';

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

// Los inversores dejan de ser texto plano: cada chip lleva a la ficha del
// fondo, donde está su cartera dentro del radar.
function InvestorChips({ investors }: { investors: unknown }) {
  const refs = resolveInvestors(investors);
  if (!refs.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {refs.map((inv) => (
        <Link
          key={inv.slug}
          href={inv.href}
          title={`Ficha de ${inv.name}`}
          className="rounded-full border border-[var(--border)] px-2 py-0.5 font-mono text-xs text-[var(--muted)] transition-colors hover:border-[var(--cta)] hover:text-[var(--cta)]"
        >
          {inv.name}
        </Link>
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

// Una ronda propuesta por el buscador. Se enseña con su frase textual y su
// enlace: la decisión sigue siendo humana, esto solo ahorra la búsqueda.
function ProposalCard({
  proposal,
  onUse,
}: {
  proposal: RoundProposal;
  onUse: (p: RoundProposal) => void;
}) {
  const tone =
    proposal.confidence === 'alta'
      ? 'border-[var(--cta)]/50 text-[var(--cta)]'
      : proposal.confidence === 'media'
        ? 'border-[var(--border)] text-[var(--muted)]'
        : 'border-dashed border-[var(--border)] text-[var(--soft)]';
  const simbolo = proposal.currency === 'USD' ? '$' : proposal.currency === 'EUR' ? '€' : '';
  const titulo = [
    proposal.round,
    proposal.amountValue ? `${proposal.amountValue}${proposal.amountUnit}${simbolo}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="rounded-md border border-[var(--border)] p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium capitalize">{titulo || 'mención de financiación'}</span>
        <span className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${tone}`}>
          {proposal.confidence}
        </span>
      </div>
      {proposal.investors.length > 0 && (
        <p className="mt-1 font-mono text-xs text-[var(--muted)]">
          {proposal.investors.join(' · ')}
        </p>
      )}
      {proposal.currency === 'USD' && (
        <p className="mt-1 font-mono text-[11px] text-[var(--warning)]">
          Importe en dólares: no se precarga, la ficha guarda euros.
        </p>
      )}
      <p className="mt-1.5 border-l-2 border-[var(--border)] pl-2 text-xs leading-relaxed text-[var(--muted)]">
        {proposal.quote}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          onClick={() => onUse(proposal)}
          className="rounded-md border border-[var(--cta)] px-2.5 py-1 text-xs font-medium text-[var(--cta)] transition-colors hover:bg-[var(--cta)] hover:text-[var(--cta-text)]"
        >
          Revisar y aprobar
        </button>
        {proposal.sourceUrl ? (
          <a
            href={proposal.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] text-[var(--muted)] hover:text-[var(--cta)]"
          >
            {proposal.sourceLabel} ↗
          </a>
        ) : (
          <span className="font-mono text-[11px] text-[var(--soft)]">{proposal.sourceLabel}</span>
        )}
      </div>
    </li>
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
  const [searching, setSearching] = useState(false);
  const [proposals, setProposals] = useState<RoundProposal[] | null>(null);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const [showPaste, setShowPaste] = useState(false);

  async function discover(pastedText?: string) {
    setSearching(true);
    setSearchMsg(null);
    setProposals(null);
    try {
      const res = await fetch('/api/signals/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, pastedText }),
      });
      const json = await res.json();
      if (json.error) setSearchMsg(json.error);
      else {
        setProposals(json.proposals ?? []);
        if (json.message) setSearchMsg(json.message);
        // Sin resultados, lo útil es ofrecer el camino que sí funciona.
        if (!(json.proposals ?? []).length && !pastedText) setShowPaste(true);
      }
    } catch {
      setSearchMsg('No pude completar la búsqueda');
    } finally {
      setSearching(false);
    }
  }

  // Aprobar una propuesta no la guarda: precarga el formulario para que se
  // revise. El último paso siempre es humano.
  function useProposal(p: RoundProposal) {
    if (p.round) setRound(p.round);
    // Un importe en dólares no se precarga: guardarlo en el campo de euros
    // sería convertir un dato correcto en uno falso sin que nadie lo note.
    if (p.amountValue && p.currency !== 'USD') {
      setValue(p.amountValue);
      setUnit(p.amountUnit);
    }
    if (p.investors.length) setInvestors(p.investors.join(', '));
    if (p.date) setDate(p.date.slice(0, 10));
    setProposals(null);
    setSearchMsg(null);
    setShowPaste(false);
    setPasted('');
    setOpen(true);
  }

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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => discover()}
            disabled={searching}
            className="rounded-md border border-[var(--cta)] px-3 py-1.5 text-xs font-medium text-[var(--cta)] transition-colors hover:bg-[var(--cta)] hover:text-[var(--cta-text)] disabled:opacity-40"
          >
            {searching ? 'Buscando…' : 'Buscar rondas'}
          </button>
          <button
            onClick={() => setShowPaste((v) => !v)}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] transition-colors hover:border-[var(--cta)] hover:text-[var(--cta)]"
          >
            Pegar noticia o enlace
          </button>
          <button
            onClick={() => setOpen(true)}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] transition-colors hover:border-[var(--cta)] hover:text-[var(--cta)]"
          >
            {fundingSignals.length ? 'Registrar otra ronda' : 'Registrar a mano'}
          </button>
        </div>
      )}

      {searching && (
        <p className="mt-2 text-xs text-[var(--muted)]">Leyendo fuentes…</p>
      )}

      {showPaste && (
        <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
          <label htmlFor="pegar-ronda" className="text-xs text-[var(--muted)]">
            Pega la noticia o su enlace y saco los campos
          </label>
          <textarea
            id="pegar-ronda"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={3}
            placeholder="un enlace (webcapitalriesgo, prensa…) o el texto de la noticia"
            className={`${FIELD} w-full`}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => discover(pasted)}
              disabled={searching || pasted.trim().length < 20}
              className="rounded-md bg-[var(--cta)] px-3 py-1.5 text-xs font-medium text-[var(--cta-text)] disabled:opacity-40"
            >
              Extraer datos
            </button>
            <button
              onClick={() => {
                setShowPaste(false);
                setPasted('');
              }}
              className="text-xs text-[var(--muted)] hover:text-[var(--text)]"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {proposals && proposals.length > 0 && (
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-[var(--muted)]">
            {proposals.length} {proposals.length === 1 ? 'candidata' : 'candidatas'} · verifica antes de aprobar
          </p>
          <ul className="space-y-2">
            {proposals.map((p, i) => (
              <ProposalCard key={`${p.sourceUrl}-${i}`} proposal={p} onUse={useProposal} />
            ))}
          </ul>
        </div>
      )}

      {searchMsg && <p className="mt-2 text-xs text-[var(--muted)]">{searchMsg}</p>}
    </div>
  );
}
