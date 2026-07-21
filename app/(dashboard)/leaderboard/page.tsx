import Link from 'next/link';
import { getBriefingLeads } from '@/lib/data';
import { getInvestorStats, formatEur } from '@/lib/investors-data';
import { usersRanking, foundersRanking, startupsRanking, userLabel } from '@/lib/leaderboard';
import { stageLabel, companyLabel } from '@/lib/types';
import { Heat } from '../heat';
import { ScoreRing } from '../score-ring';
import { Avatar } from '../avatar';
import { LeaderTabs } from './tabs';

export const dynamic = 'force-dynamic';

// Leaderboard: gamificación del embudo. Tres rankings sobre los mismos
// leads: quién los trabaja (usuarios), quién responde (founders) y qué
// marcas puntúan más alto (startups, score B3S).

function RankBadge({ n }: { n: number }) {
  const podium =
    n === 1
      ? 'border-[var(--warning)] text-[var(--warning)]'
      : n <= 3
        ? 'border-[var(--muted)] text-[var(--text)]'
        : 'border-transparent text-[var(--soft)]';
  return (
    <span
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border font-mono text-sm ${podium}`}
    >
      {n}
    </span>
  );
}

function Row({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border bg-[var(--surface)] px-4 py-3 ${
        first ? 'border-[var(--warning)]/60' : 'border-[var(--border)]'
      }`}
    >
      {children}
    </div>
  );
}

export default async function LeaderboardPage() {
  const leads = await getBriefingLeads();
  const users = usersRanking(leads);
  const founders = foundersRanking(leads).slice(0, 15);
  const startups = startupsRanking(leads).slice(0, 15);
  const investors = (await getInvestorStats()).slice(0, 15);

  const usersTab = (
    <div className="space-y-2">
      {users.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
          Aún no hay leads. Añade founders y empieza a sumar.
        </p>
      ) : (
        users.map((u, i) => (
          <Row key={u.user} first={i === 0}>
            <RankBadge n={i + 1} />
            <Avatar name={userLabel(u.user)} size={32} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{userLabel(u.user)}</div>
              <div className="text-xs text-[var(--muted)]">
                {u.leads} {u.leads === 1 ? 'lead' : 'leads'} · {u.conversations} en conversación
                {u.won > 0 && ` · ${u.won} ${u.won === 1 ? 'cierre' : 'cierres'}`}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-lg leading-none">{u.points}</div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">pts</div>
            </div>
          </Row>
        ))
      )}
      <p className="pt-1 text-[11px] leading-relaxed text-[var(--soft)]">
        Puntos por fase alcanzada con cada lead: detectado 1 · contactado 3 · conversación 8 ·
        call 12 · propuesta 20 · cierre 40. Cada alta se atribuye al usuario logueado; cuando el
        resto del equipo se registre, cada uno verá su progresión.
      </p>
    </div>
  );

  const foundersTab = (
    <div className="space-y-2">
      {founders.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
          Sin founders todavía.
        </p>
      ) : (
        founders.map((f, i) => (
          <Row key={`${f.name}-${f.domain}`} first={i === 0}>
            <RankBadge n={i + 1} />
            <Avatar name={f.name} size={32} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="truncate text-sm font-medium">{f.name}</span>
                {f.domain && (
                  <Link
                    href={`/companies/${f.domain}`}
                    className="truncate text-xs text-[var(--muted)] hover:underline"
                  >
                    {f.company}
                  </Link>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                <span className="rounded border border-[var(--border)] px-1.5 py-0.5">
                  {stageLabel(f.stage)}
                </span>
                {f.replied && <span className="text-[var(--success)]">respondió</span>}
                <Heat temp={f.temp} size={11} />
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-lg leading-none">{f.points}</div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">pts</div>
            </div>
          </Row>
        ))
      )}
      <p className="pt-1 text-[11px] leading-relaxed text-[var(--soft)]">
        Momentum de la relación: fase del embudo ×2 + temperatura viva + señales (ronda,
        interacción). Sin métricas de LinkedIn: aquí puntúa lo que pasa de verdad en el embudo.
      </p>
    </div>
  );

  const startupsTab = (
    <div className="space-y-2">
      {startups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
          Ninguna marca escaneada aún. Importa scans de B3S en las fichas.
        </p>
      ) : (
        startups.map((s, i) => (
          <Row key={s.domain} first={i === 0}>
            <RankBadge n={i + 1} />
            <div className="min-w-0 flex-1">
              <Link href={`/companies/${s.domain}`} className="text-sm font-medium hover:underline">
                {companyLabel(s.name, s.domain)}
              </Link>
              <div className="truncate font-mono text-xs text-[var(--muted)]">{s.domain}</div>
            </div>
            <ScoreRing score={s.score} size={40} />
          </Row>
        ))
      )}
      <p className="pt-1 text-[11px] leading-relaxed text-[var(--soft)]">
        B3S Score del último scan (rojo ≤50 · azul 51-75 · verde 76-100). Una fila por
        startup; si hay varios scans, el mejor.
      </p>
    </div>
  );

  const investorsTab = (
    <div className="space-y-2">
      {investors.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
          Sin fondos todavía. Aparecen solos al registrar los inversores de una ronda.
        </p>
      ) : (
        investors.map((v, i) => (
          <Row key={v.slug} first={i === 0}>
            <RankBadge n={i + 1} />
            <div className="min-w-0 flex-1">
              <Link href={`/investors/${v.slug}`} className="text-sm font-medium hover:underline">
                {v.name}
              </Link>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                <span>
                  {v.portfolio} {v.portfolio === 1 ? 'participada' : 'participadas'}
                </span>
                {v.deployedEur > 0 && <span>{formatEur(v.deployedEur)} en rondas</span>}
                {v.scanned > 0 && (
                  <span>
                    {v.scanned} escaneada{v.scanned === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </div>
            {v.avgScore != null ? (
              <ScoreRing score={v.avgScore} size={40} />
            ) : (
              <span className="font-mono text-xs text-[var(--soft)]">sin scans</span>
            )}
          </Row>
        ))
      )}
      <p className="pt-1 text-[11px] leading-relaxed text-[var(--soft)]">
        Fondos ordenados por participadas en el radar. El anillo es la media de B3S Score de su
        cartera escaneada: un fondo con media baja es una conversación con el fondo, no con una
        startup suelta.
      </p>
    </div>
  );

  return (
    <main>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
        <span className="text-sm text-[var(--muted)]">
          se puntúa avanzar, no acumular
        </span>
      </div>
      <LeaderTabs
        tabs={[
          {
            key: 'usuarios',
            label: 'Usuarios',
            hint: 'Quién capta y trabaja más leads. Añadir suma poco; avanzar fases, mucho.',
            content: usersTab,
          },
          {
            key: 'founders',
            label: 'Founders',
            hint: 'Los founders con más momentum: respondieron, avanzan, se calientan.',
            content: foundersTab,
          },
          {
            key: 'startups',
            label: 'Startups',
            hint: 'Las mejores marcas del radar según B3S Scanner.',
            content: startupsTab,
          },
          {
            key: 'fondos',
            label: 'Fondos',
            hint: 'Quién está detrás del radar: cuántas participadas tienes y cómo puntúa su cartera.',
            content: investorsTab,
          },
        ]}
      />
    </main>
  );
}
