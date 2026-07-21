// Acceso a datos de los fondos. Server-only: usa la service key.
//
// Idea central: la cartera de un fondo NO se almacena. Se deriva de las
// rondas registradas en `signals`. Así, corregir una ronda en la ficha de
// una startup actualiza la cartera del fondo sin ningún paso extra, y no
// hay dos verdades que puedan divergir.
import { getServiceSupabase, isDemoMode } from './supabase';
import { investorSlug } from './investors';
import type { Company, Investor, Scan, Signal } from './types';

export interface PortfolioEntry {
  company: Company;
  scan: Scan | null; // último scan listo, si lo hay
  rounds: Signal[]; // rondas de esa participada en las que entró el fondo
}

export interface InvestorStats {
  slug: string;
  name: string;
  website: string | null;
  portfolio: number;
  scanned: number;
  avgScore: number | null; // media de score B3S de la cartera escaneada
  deployedEur: number; // suma del tamaño de las rondas donde entró
  lastRoundAt: string | null;
}

// Todas las rondas con su compañía. Es la fuente de la que salen carteras,
// estadísticas y ranking, así que se lee una sola vez por página.
async function fundingRows(): Promise<{ signals: Signal[]; companyById: Map<string, Company> }> {
  const db = getServiceSupabase()!;
  const { data: signals } = await db
    .from('signals')
    .select('*')
    .eq('type', 'funding_round')
    .order('detected_at', { ascending: false });

  const list = (signals as Signal[] | null) ?? [];
  const ids = [...new Set(list.map((s) => s.company_id))];
  if (!ids.length) return { signals: [], companyById: new Map() };

  const { data: companies } = await db.from('companies').select('*').in('id', ids);
  const companyById = new Map(((companies as Company[] | null) ?? []).map((c) => [c.id, c]));
  return { signals: list, companyById };
}

function investorSlugsOf(signal: Signal): string[] {
  const raw = signal.detail?.investors;
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((n) => investorSlug(String(n))).filter(Boolean))];
}

export async function getInvestor(slug: string): Promise<Investor | null> {
  if (isDemoMode()) return null;
  const db = getServiceSupabase()!;
  const { data } = await db.from('investors').select('*').eq('slug', slug).maybeSingle();
  return (data as Investor | null) ?? null;
}

export async function getInvestors(): Promise<Investor[]> {
  if (isDemoMode()) return [];
  const db = getServiceSupabase()!;
  const { data } = await db.from('investors').select('*').order('name');
  return ((data as Investor[] | null) ?? []).filter(Boolean);
}

// La cartera: participadas en cuyas rondas aparece este fondo, con el mejor
// scan listo de cada una para poder leer la marca de un vistazo.
export async function getPortfolio(slug: string): Promise<PortfolioEntry[]> {
  if (isDemoMode()) return [];
  const db = getServiceSupabase()!;
  const { signals, companyById } = await fundingRows();

  const byCompany = new Map<string, Signal[]>();
  for (const s of signals) {
    if (!investorSlugsOf(s).includes(slug)) continue;
    byCompany.set(s.company_id, [...(byCompany.get(s.company_id) ?? []), s]);
  }
  if (!byCompany.size) return [];

  const { data: scans } = await db
    .from('scans')
    .select('*')
    .in('company_id', [...byCompany.keys()])
    .eq('status', 'ready')
    .order('created_at', { ascending: false });

  const bestScan = new Map<string, Scan>();
  for (const s of ((scans as Scan[] | null) ?? [])) {
    const prev = bestScan.get(s.company_id);
    if (!prev || Number(s.score ?? 0) > Number(prev.score ?? 0)) bestScan.set(s.company_id, s);
  }

  return [...byCompany.entries()]
    .map(([companyId, rounds]) => ({
      company: companyById.get(companyId)!,
      scan: bestScan.get(companyId) ?? null,
      rounds,
    }))
    .filter((e) => e.company)
    .sort((a, b) => Number(b.scan?.score ?? -1) - Number(a.scan?.score ?? -1));
}

// Ranking de fondos. Se computa sobre las rondas registradas, no sobre la
// tabla `investors`: un fondo cuenta desde que aparece en una ronda, aunque
// nadie haya abierto aún su ficha.
export async function getInvestorStats(): Promise<InvestorStats[]> {
  if (isDemoMode()) return [];
  const db = getServiceSupabase()!;
  const { signals, companyById } = await fundingRows();
  if (!signals.length) return [];

  const { data: scans } = await db
    .from('scans')
    .select('company_id,score,status')
    .eq('status', 'ready');

  const bestScore = new Map<string, number>();
  for (const s of ((scans as { company_id: string; score: number | null }[] | null) ?? [])) {
    if (s.score == null) continue;
    const prev = bestScore.get(s.company_id);
    if (prev == null || Number(s.score) > prev) bestScore.set(s.company_id, Number(s.score));
  }

  const { data: known } = await db.from('investors').select('slug,name,website');
  const knownBySlug = new Map(
    ((known as { slug: string; name: string; website: string | null }[] | null) ?? []).map((i) => [
      i.slug,
      i,
    ]),
  );

  interface Acc {
    slug: string;
    name: string;
    companies: Set<string>;
    scores: number[];
    deployedEur: number;
    lastRoundAt: string | null;
  }
  const acc = new Map<string, Acc>();

  for (const signal of signals) {
    const names = Array.isArray(signal.detail?.investors) ? signal.detail.investors : [];
    for (const rawName of names) {
      const name = String(rawName).trim();
      const slug = investorSlug(name);
      if (!slug) continue;
      const row =
        acc.get(slug) ??
        ({
          slug,
          name: knownBySlug.get(slug)?.name || name,
          companies: new Set<string>(),
          scores: [],
          deployedEur: 0,
          lastRoundAt: null,
        } satisfies Acc);

      if (!row.companies.has(signal.company_id) && companyById.has(signal.company_id)) {
        row.companies.add(signal.company_id);
        const score = bestScore.get(signal.company_id);
        if (score != null) row.scores.push(score);
      }
      const eur = signal.detail?.amount_eur;
      if (typeof eur === 'number') row.deployedEur += eur;
      if (!row.lastRoundAt || signal.detected_at > row.lastRoundAt) {
        row.lastRoundAt = signal.detected_at;
      }
      acc.set(slug, row);
    }
  }

  return [...acc.values()]
    .map((r) => ({
      slug: r.slug,
      name: r.name,
      website: knownBySlug.get(r.slug)?.website ?? null,
      portfolio: r.companies.size,
      scanned: r.scores.length,
      avgScore: r.scores.length
        ? Math.round(r.scores.reduce((a, b) => a + b, 0) / r.scores.length)
        : null,
      deployedEur: r.deployedEur,
      lastRoundAt: r.lastRoundAt,
    }))
    .filter((r) => r.portfolio > 0)
    .sort(
      (a, b) =>
        b.portfolio - a.portfolio ||
        (b.avgScore ?? -1) - (a.avgScore ?? -1) ||
        b.deployedEur - a.deployedEur,
    );
}

// Alta perezosa: la primera vez que alguien abre la ficha de un fondo que
// solo existía como texto en una ronda, se materializa su fila.
export async function ensureInvestor(slug: string, fallbackName: string): Promise<Investor | null> {
  if (isDemoMode()) return null;
  const existing = await getInvestor(slug);
  if (existing) return existing;
  const db = getServiceSupabase()!;
  const { data } = await db
    .from('investors')
    .insert({ slug, name: fallbackName })
    .select()
    .single();
  return (data as Investor | null) ?? null;
}

// Nombre "bonito" de un fondo a partir de las rondas donde aparece: se
// respeta cómo lo escribió Sergio en vez de reconstruirlo desde el slug.
export async function investorNameFromRounds(slug: string): Promise<string | null> {
  const { signals } = await fundingRows();
  for (const s of signals) {
    const names = Array.isArray(s.detail?.investors) ? s.detail.investors : [];
    for (const n of names) {
      if (investorSlug(String(n)) === slug) return String(n).trim();
    }
  }
  return null;
}

export function formatEur(value: number): string {
  if (!value) return '—';
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M€`;
  }
  return `${Math.round(value / 1_000)}K€`;
}
