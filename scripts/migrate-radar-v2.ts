// Migración de datos al radar v2 (spec §7). Idempotente y con dry-run.
//
//   npx tsx scripts/migrate-radar-v2.ts            (dry-run: no escribe)
//   npx tsx scripts/migrate-radar-v2.ts --apply    (escribe)
//
// Qué hace:
//  1. A cada señal de ronda le pone `occurred_at` (la fecha REAL de la ronda,
//     que en estas filas se registró a mano en detected_at) y una `evidence`
//     legible. Sin esas dos cosas el radar no la cuenta, por diseño.
//  2. Crea a mano las señales de Ticketeame declaradas por el founder.
//  3. No inventa nada para el resto: los leads sin señal caen a `reserva`,
//     que es el objetivo de la spec, no un fallo.
//
// Los valores por defecto (señal 8 · ronda 6 = 35) no se borran de ninguna
// tabla porque nunca se guardaron: se calculaban al vuelo en
// priorityBreakdown(). El radar v2 los sustituye por NULL + estado.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

type Row = { id: string; company_id: string; type: string; detail: Record<string, unknown> | null; detected_at: string };

function fundingEvidence(d: Record<string, unknown> | null): string {
  const round = typeof d?.round === 'string' ? d.round : null;
  const amount = typeof d?.amount === 'string' ? d.amount : null;
  const investors = Array.isArray(d?.investors) ? (d!.investors as string[]) : [];
  const parts = [
    round ? `Ronda ${round}` : 'Ronda',
    amount ? `de ${amount}` : null,
    investors.length ? `· ${investors.join(', ')}` : null,
  ].filter(Boolean);
  return parts.join(' ');
}

async function main() {
  console.log(APPLY ? '== APLICANDO ==' : '== DRY RUN (no escribe) ==');

  // ---- 1. Rondas: occurred_at + evidence ----
  const { data: signals } = await db.from('signals').select('*');
  const rows = (signals ?? []) as Row[];
  const funding = rows.filter((s) => s.type === 'funding_round');
  let touched = 0;
  for (const s of funding) {
    const d = s.detail ?? {};
    if (d.occurred_at && d.evidence) continue; // idempotente
    const next = {
      ...d,
      // La fecha real de la ronda: en estas filas se registró en detected_at.
      occurred_at: d.occurred_at ?? s.detected_at,
      evidence: d.evidence ?? fundingEvidence(d),
    };
    const days = Math.floor((Date.now() - new Date(next.occurred_at as string).getTime()) / 86_400_000);
    console.log(`  ronda ${s.company_id.slice(0, 8)} occurred_at=${String(next.occurred_at).slice(0, 10)} (hace ${days}d) · ${next.evidence}`);
    touched++;
    if (APPLY) {
      const { error } = await db.from('signals').update({ detail: next }).eq('id', s.id);
      if (error) console.error('    ERROR', error.message);
    }
  }
  console.log(`Rondas actualizadas: ${touched}/${funding.length}`);

  // ---- 2. Ticketeame: señales declaradas por el founder ----
  const { data: co } = await db
    .from('companies')
    .select('id,name')
    .ilike('name', '%ticket%')
    .maybeSingle();
  if (!co) {
    console.log('Ticketeame no encontrada, salto el paso 2');
  } else {
    const nuevas = [
      {
        company_id: co.id,
        type: 'rebranding_declarado',
        detected_at: '2026-07-24T12:27:40Z',
        detail: {
          occurred_at: '2026-07-24',
          evidence:
            'Interesante! Nosotros estamos planteando un rebranding de nombre (todavía no está decidido), marca y demás',
          source: 'linkedin_dm',
          manual: true,
        },
      },
      {
        company_id: co.id,
        type: 'busqueda_agencia',
        detected_at: '2026-07-27T11:14:38Z',
        detail: {
          occurred_at: '2026-07-27',
          evidence:
            'Buena reunión, están buscando agencia para rebranding. Hay 4 propuestas encima de la mesa que van desde 4.500€ hasta 18.000€',
          source: 'reunion',
          manual: true,
        },
      },
    ];
    const existentes = rows.filter((s) => s.company_id === co.id).map((s) => s.type);
    for (const n of nuevas) {
      if (existentes.includes(n.type)) {
        console.log(`  ya existe ${n.type}, salto`);
        continue;
      }
      console.log(`  + ${n.type} (${n.detail.occurred_at}) · ${n.detail.evidence.slice(0, 70)}…`);
      if (APPLY) {
        const { error } = await db.from('signals').insert(n);
        if (error) console.error('    ERROR', error.message);
      }
    }
  }

  console.log(APPLY ? 'Hecho.' : 'Dry run terminado. Repite con --apply para escribir.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
