import Link from 'next/link';
import { FUNDING_FEEDS } from '@/lib/rss-sources';
import { isDemoMode } from '@/lib/supabase';
import { currentUser } from '@/lib/auth';
import { getBriefingLeads } from '@/lib/data';
import { usersRanking, OWNER_EMAIL } from '@/lib/leaderboard';
import icp from '@/config/icp.json';
import offer from '@/config/floc-offer.json';
import { ProfileCard } from './profile-card';
import { ThemeCard } from './theme-card';

export const dynamic = 'force-dynamic';

// Cuenta del usuario (se llega desde el chip de abajo a la izquierda):
// perfil, personalización y tu actividad. Debajo, la configuración del
// sistema (conexiones, ICP, oferta, feeds). Pensado para crecer con más
// secciones (histórico de acciones cuando estén las notas).
export default async function SettingsPage() {
  const user = await currentUser();
  const leads = await getBriefingLeads();
  const me = user.email ?? OWNER_EMAIL;
  const mine = usersRanking(leads).find((r) => r.user === me);

  const rows = [
    { key: 'Presupuesto créditos Lusha/mes', value: process.env.CREDIT_BUDGET_MONTHLY || '100' },
    { key: 'Scans máx/noche', value: process.env.SCAN_MAX_PER_NIGHT || '10' },
    {
      key: 'Umbral score B3S (≥ = marca resuelta)',
      value: process.env.SCANNER_SCORE_THRESHOLD || '60',
    },
    { key: 'Modelo de redacción', value: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6' },
    { key: 'Idioma por defecto', value: 'en (es si la empresa es española)' },
    { key: 'Supabase', value: isDemoMode() ? 'no configurado (modo demo)' : 'conectado' },
    {
      key: 'B3S Scanner API',
      value: process.env.B3S_SCANNER_API_URL || 'falta URL',
    },
    {
      key: 'B3S Scanner token',
      value:
        process.env.B3S_SCANNER_API_TOKEN ||
        process.env.BRAND3_SCANNER_API_TOKEN ||
        process.env.BRAND3_TOKEN
          ? 'configurado'
          : 'falta',
    },
    { key: 'Anthropic API key', value: process.env.ANTHROPIC_API_KEY ? 'configurada' : 'falta' },
  ];

  return (
    <main className="mx-auto w-full max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Tu cuenta</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <ProfileCard initialName={user.name} email={user.email} />
        <ThemeCard />
      </div>

      {/* Tu actividad: el embrión del histórico de acciones */}
      <h2 className="mb-3 mt-8 text-lg font-semibold">Tu actividad</h2>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        {mine ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'leads', value: mine.leads },
              { label: 'en conversación', value: mine.conversations },
              { label: 'cierres', value: mine.won },
              { label: 'puntos', value: mine.points },
            ].map((s) => (
              <div key={s.label}>
                <div className="font-mono text-2xl leading-none">{s.value}</div>
                <div className="mt-1 text-xs text-[var(--muted)]">{s.label}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Aún no tienes leads atribuidos. Añade founders desde{' '}
            <Link href="/founders" className="text-[var(--cta)] hover:underline">
              Founders
            </Link>{' '}
            y empieza a sumar.
          </p>
        )}
        <p className="mt-3 border-t border-[var(--border)] pt-2.5 text-[11px] leading-relaxed text-[var(--soft)]">
          Compite en el{' '}
          <Link href="/leaderboard" className="text-[var(--cta)] hover:underline">
            leaderboard
          </Link>
          . El histórico detallado de acciones (notas, cambios de etapa, informes) llegará con la
          bitácora de notas.
        </p>
      </div>

      {/* Sistema */}
      <h2 className="mb-3 mt-8 text-lg font-semibold">Sistema</h2>
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
