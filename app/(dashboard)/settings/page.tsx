import { FUNDING_FEEDS } from '@/lib/rss-sources';
import { isDemoMode } from '@/lib/supabase';
import icp from '@/config/icp.json';
import offer from '@/config/floc-offer.json';

export const dynamic = 'force-dynamic';

// Settings mínimo (spec §10.4). En MVP la configuración vive en variables
// de entorno; esta pantalla la muestra en solo lectura.
export default function SettingsPage() {
  const rows = [
    { key: 'Presupuesto créditos Lusha/mes', value: process.env.CREDIT_BUDGET_MONTHLY || '100' },
    { key: 'Scans máx/noche', value: process.env.SCAN_MAX_PER_NIGHT || '10' },
    {
      key: 'Umbral score Brand3 (≥ = marca resuelta)',
      value: process.env.SCANNER_SCORE_THRESHOLD || '60',
    },
    { key: 'Modelo de redacción', value: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6' },
    { key: 'Idioma por defecto', value: 'en (es si la empresa es española)' },
    { key: 'Supabase', value: isDemoMode() ? 'no configurado (modo demo)' : 'conectado' },
    {
      key: 'Brand3 token',
      value:
        process.env.BRAND3_SCANNER_API_TOKEN || process.env.BRAND3_TOKEN
          ? 'configurado'
          : 'falta (solo necesario para lanzar scans nuevos)',
    },
    { key: 'Anthropic API key', value: process.env.ANTHROPIC_API_KEY ? 'configurada' : 'falta' },
  ];

  return (
    <main className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Settings</h1>
      <div className="overflow-hidden rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-[var(--border)] last:border-0">
                <td className="bg-[var(--surface)] px-4 py-3 text-[var(--muted)]">{r.key}</td>
                <td className="px-4 py-3 font-mono">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">ICP</h2>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        <p className="mb-3">{icp.profile}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--success)]">
              Criterios positivos
            </h3>
            <ul className="list-inside list-disc space-y-0.5 text-[var(--muted)]">
              {icp.positive.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--danger)]">
              Criterios negativos
            </h3>
            <ul className="list-inside list-disc space-y-0.5 text-[var(--muted)]">
              {icp.negative.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-3 text-xs text-[var(--muted)]">
          Editable en config/icp.json — alimenta la extracción de rondas y el QA del pipeline.
        </p>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Oferta FLOC*</h2>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        <p className="text-[var(--muted)]">{offer.positioning}</p>
        <div className="mt-3 space-y-1">
          {offer.programs.map((p) => (
            <div key={p.name} className="flex flex-wrap items-baseline gap-2">
              <span className="font-medium">{p.name}</span>
              <span className="font-mono text-xs text-[var(--accent)]">{p.price}</span>
              <span className="text-xs text-[var(--muted)]">
                {p.scope} · {p.for}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-[var(--muted)]">
          Editable en config/floc-offer.json. Da contexto al redactor; nunca se pitchea en el
          primer mensaje.
        </p>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Feeds RSS activos</h2>
      <ul className="space-y-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 font-mono text-xs">
        {FUNDING_FEEDS.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-[var(--muted)]">
        La configuración se edita en .env.local (app) y crontab (pipeline). Editable desde UI en
        una iteración futura.
      </p>
    </main>
  );
}
