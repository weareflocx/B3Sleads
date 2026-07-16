// Pipeline nocturno FLOC* Radar (spec §8) — pasos sin Lusha.
// El paso Lusha (señales + enriquecimiento) lo ejecuta Claude Code headless
// con pipeline/nightly-prompt.md, porque el MCP de Lusha solo vive ahí.
//
// Uso:
//   npm run pipeline:dry   → sin escrituras ni créditos (solo RSS + extracción)
//   npm run pipeline:run   → completo
import 'dotenv/config';
import { getServiceSupabase } from '../lib/supabase';
import { createScan, pollScan, getResult, getEvidence, extractScore } from '../lib/brand3';
import { priorityScore } from '../lib/scoring';
import { generateDraft, draftInputFromLead } from '../lib/claude';
import { discoverFundingCandidates } from './extract-funding';
import type { Company, Scan, Signal } from '../lib/types';

const DRY_RUN = process.argv.includes('--dry-run');
const SCAN_MAX = parseInt(process.env.SCAN_MAX_PER_NIGHT || '10', 10);
const SCORE_THRESHOLD = parseInt(process.env.SCANNER_SCORE_THRESHOLD || '60', 10);

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`\n=== FLOC* Radar pipeline · ${startedAt} · ${DRY_RUN ? 'DRY RUN' : 'LIVE'} ===\n`);

  // [2] RSS → candidatos con señal de funding
  const candidates = await discoverFundingCandidates();
  console.log(`\n[pipeline] ${candidates.length} candidatos ICP desde RSS`);

  if (DRY_RUN) {
    for (const c of candidates) {
      console.log(
        `  · ${c.extraction.company_name} (${c.extraction.company_domain}) — ${c.extraction.round} ${c.extraction.amount ?? ''}`,
      );
    }
    console.log('\n[dry-run] Fin. No se escribió nada ni se gastaron créditos de Scanner/Lusha.');
    return;
  }

  const db = getServiceSupabase();
  if (!db) throw new Error('Supabase no configurado (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');

  // [4] Dedupe contra companies.domain + [5] insertar y lanzar scans
  let launched = 0;
  const scansToPolll: { scanRowId: string; jobId: number; companyId: string }[] = [];

  for (const c of candidates) {
    if (launched >= SCAN_MAX) break;
    const domain = c.extraction.company_domain!.toLowerCase().replace(/^www\./, '');

    const { data: existing } = await db.from('companies').select('id').eq('domain', domain).maybeSingle();
    if (existing) {
      console.log(`[dedupe] ${domain} ya existe, skip`);
      continue;
    }

    const { data: company, error: cErr } = await db
      .from('companies')
      .insert({
        name: c.extraction.company_name ?? domain,
        domain,
        sector: c.extraction.sector,
        hq_country: c.extraction.hq_country,
        source: 'rss',
      })
      .select()
      .single();
    if (cErr) {
      console.error(`[db] error insertando ${domain}: ${cErr.message}`);
      continue;
    }

    await db.from('signals').insert({
      company_id: company.id,
      type: 'funding_round',
      detail: {
        round: c.extraction.round,
        amount: c.extraction.amount,
        investors: c.extraction.investors,
        source_url: c.item.link,
      },
    });

    try {
      const job = await createScan(`https://${domain}`);
      const { data: scanRow } = await db
        .from('scans')
        .insert({ company_id: company.id, scanner_job_id: job.id, status: job.status })
        .select()
        .single();
      if (scanRow) scansToPolll.push({ scanRowId: scanRow.id, jobId: job.id, companyId: company.id });
      launched++;
      console.log(`[scanner] job ${job.id} lanzado para ${domain}`);
    } catch (e) {
      console.error(`[scanner] error lanzando scan de ${domain}: ${e}`);
    }
  }

  // [6] Poll de scans (serializado para no saturar; TODO: paralelizar si la API aguanta)
  for (const s of scansToPolll) {
    try {
      const job = await pollScan(s.jobId);
      const result = await getResult(s.jobId);
      const evidence = await getEvidence(s.jobId).catch(() => null);
      const score = extractScore(result);

      await db
        .from('scans')
        .update({
          status: 'ready',
          score,
          tldr: (result.tldr as object) ?? result,
          evidence,
          result_raw: result,
          ui_url: (job.ui_url as string) ?? null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', s.scanRowId);
      console.log(`[scanner] job ${s.jobId} ready, score=${score}`);
    } catch (e) {
      await db.from('scans').update({ status: 'failed' }).eq('id', s.scanRowId);
      console.error(`[scanner] job ${s.jobId} falló: ${e}`);
    }
  }

  // [7] Scans ready → priority_score + lead + borrador.
  // El enriquecimiento Lusha (7c) corre aparte vía nightly-prompt.md.
  const { data: readyScans } = await db
    .from('scans')
    .select('*')
    .eq('status', 'ready')
    .in('company_id', scansToPolll.map((s) => s.companyId));

  for (const scan of (readyScans as Scan[]) ?? []) {
    const { data: company } = await db.from('companies').select('*').eq('id', scan.company_id).single();
    const { data: signal } = await db
      .from('signals')
      .select('*')
      .eq('company_id', scan.company_id)
      .order('detected_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const score = priorityScore({
      company: company as Company,
      signal: signal as Signal | null,
      scan,
    });

    // Corte: score de Scanner alto = marca resuelta = descartar sin gastar crédito
    const passesCut = scan.score == null || Number(scan.score) < SCORE_THRESHOLD;

    const { data: lead } = await db
      .from('leads')
      .insert({
        company_id: scan.company_id,
        scan_id: scan.id,
        stage: passesCut ? 'briefed' : 'discarded',
        priority_score: score,
        discard_reason: passesCut ? null : 'Marca ya resuelta (score Scanner alto)',
      })
      .select()
      .single();

    if (passesCut && lead) {
      try {
        const draft = await generateDraft(
          draftInputFromLead({
            lead,
            company: company as Company,
            signal: signal as Signal | null,
            scan,
            contact: null,
            message: null,
          }),
        );
        await db.from('messages').insert({
          lead_id: lead.id,
          channel: 'linkedin',
          lang: (company as Company).hq_country?.toLowerCase().includes('spain') ? 'es' : 'en',
          draft,
        });
        console.log(`[draft] borrador generado para ${(company as Company).name}`);
      } catch (e) {
        console.error(`[draft] error generando borrador: ${e}`);
      }
    }
  }

  // [8] Log del run
  console.log(
    `\n=== Run completado: ${launched} scans lanzados, ${scansToPolll.length} procesados ===`,
  );
  console.log('Siguiente paso: Claude Code headless ejecuta nightly-prompt.md para Lusha.\n');
}

main().catch((e) => {
  console.error('[pipeline] fallo fatal:', e);
  process.exit(1);
});
