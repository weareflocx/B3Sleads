// Importa datasets de Explee a Supabase.
//
// Formatos soportados en data/ (TSV con cabecera):
//   *-companies.tsv → name, domain, description, geo, size, industries, city, followers
//   *-people.tsv    → company, full_name, job_title, geo [, linkedin_url]
//
// Filtra el ruido de ecosistema según config/icp.json (fondos, aceleradoras,
// medios, agencias) antes de escribir nada.
//
// Uso:
//   npm run import:explee:dry                       # resumen, no escribe
//   npm run import:explee -- --max 50               # límite de empresas
//   npm run import:explee -- --geo ES --size 1-10   # filtros
//   npm run import:explee -- --companies data/x.tsv --people data/y.tsv
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getServiceSupabase } from '../lib/supabase';
import { priorityScore } from '../lib/scoring';
import { parseLinkedInHandle } from '../lib/types';
import type { Company } from '../lib/types';

const DRY = process.argv.includes('--dry-run');
const argOf = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const MAX = parseInt(argOf('--max') || '99999', 10);
const GEO = argOf('--geo')?.split(',').map((s) => s.trim().toUpperCase());
const SIZE = argOf('--size');
const COMPANIES_FILE = argOf('--companies') || 'data/explee-web3-companies.tsv';
const PEOPLE_FILE = argOf('--people') || 'data/explee-web3-people.tsv';

// ---------- Filtro de ruido de ecosistema (ICP negativo) ----------
// Explee devuelve mucho fondo, aceleradora y medio mezclado con startups.
const NOISE = [
  /\b(ventures?|capital|partners|fund|fondo)\b/i,
  /\b(accelerat|incubat|aceleradora|incubadora)/i,
  /\b(agency|agencia|consultanc|consultor|studio de servicios)\b/i,
  /\b(news|media|magazine|revista|podcast|blog)\b/i,
  /\b(coworking|community hub|association|asociación|non-profit|foundation|fundación)\b/i,
  /\b(university|universidad|business school|escuela)\b/i,
];
const NOISE_TITLES = /\b(investor|partner at|general partner|\bgp\b|\blp\b|advisor|mentor)\b/i;

function isEcosystemNoise(name: string, description: string): boolean {
  const hay = `${name} ${description}`;
  return NOISE.some((rx) => rx.test(hay));
}

interface TsvCompany {
  name: string;
  domain: string;
  description: string;
  geo: string;
  size: string;
  city: string;
  industries: string;
}
interface TsvPerson {
  company: string;
  full_name: string;
  job_title: string;
  geo: string;
  linkedin_url?: string;
}

function readTsv(relPath: string): { headers: string[]; rows: string[][] } | null {
  const p = path.isAbsolute(relPath) ? relPath : path.join(process.cwd(), relPath);
  if (!fs.existsSync(p)) return null;
  const lines = fs.readFileSync(p, 'utf-8').split('\n').filter(Boolean);
  return { headers: lines[0].split('\t'), rows: lines.slice(1).map((l) => l.split('\t')) };
}

// El sector real lo determina el Scanner; aquí solo una pista por descripción.
function guessSector(desc: string): string | null {
  const d = desc.toLowerCase();
  if (/(crypto|blockchain|web3|defi|nft|dao|wallet|token)/.test(d)) return 'web3';
  if (/(\bai\b|artificial intelligence|machine learning|llm)/.test(d)) return 'ai';
  if (/(fintech|payment|banking|lending|insur)/.test(d)) return 'fintech';
  if (/marketplace/.test(d)) return 'marketplace';
  if (/(ecommerce|e-commerce|retail|d2c)/.test(d)) return 'ecommerce';
  if (/(health|clinic|medical|salud|patient)/.test(d)) return 'health';
  if (/(saas|software|platform|api|tool)/.test(d)) return 'saas';
  return null;
}

function keywordsFrom(desc: string, industries: string): string[] {
  const stop = new Set([
    'the','and','for','with','that','this','from','are','their','they','you','your','our',
    'una','para','con','que','los','las','del','por','como','más','sus','una','este',
  ]);
  const words = `${desc} ${industries}`
    .toLowerCase()
    .replace(/[^a-záéíóúñü\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w));
  return [...new Set(words)].slice(0, 8);
}

async function main() {
  const compTsv = readTsv(COMPANIES_FILE);
  if (!compTsv) {
    console.error(`[import] falta ${COMPANIES_FILE}`);
    console.error('         Exporta desde Explee (Find contacts → CSV) y guarda el TSV en data/.');
    process.exit(1);
  }
  const peopleTsv = readTsv(PEOPLE_FILE);

  const companies: TsvCompany[] = compTsv.rows.map((c) => ({
    name: c[0] ?? '',
    domain: (c[1] ?? '').toLowerCase().replace(/^www\./, ''),
    description: c[2] ?? '',
    geo: c[3] ?? '',
    size: c[4] ?? '',
    industries: c[5] ?? '',
    city: c[6] ?? '',
  }));

  // El TSV de personas puede traer linkedin_url si se exportó enriquecido
  const liIdx = peopleTsv?.headers.findIndex((h) => /linkedin/i.test(h)) ?? -1;
  const people: TsvPerson[] = (peopleTsv?.rows ?? []).map((p) => ({
    company: p[0] ?? '',
    full_name: p[1] ?? '',
    job_title: p[2] ?? '',
    geo: p[3] ?? '',
    linkedin_url: liIdx >= 0 ? p[liIdx] : undefined,
  }));

  let selected = companies.filter((c) => c.domain);
  const beforeNoise = selected.length;
  const noise = selected.filter((c) => isEcosystemNoise(c.name, c.description));
  selected = selected.filter((c) => !isEcosystemNoise(c.name, c.description));
  if (GEO) selected = selected.filter((c) => GEO.includes(c.geo.toUpperCase()));
  if (SIZE) selected = selected.filter((c) => c.size === SIZE);
  selected = selected.slice(0, MAX);

  const peopleByCompany = new Map<string, TsvPerson[]>();
  for (const p of people) {
    // Solo founders/CEO: es a quien escribimos
    if (!/founder|fundador|ceo|chief executive/i.test(p.job_title)) continue;
    if (NOISE_TITLES.test(p.job_title)) continue;
    const key = p.company.toLowerCase();
    if (!peopleByCompany.has(key)) peopleByCompany.set(key, []);
    peopleByCompany.get(key)!.push(p);
  }

  const withLinkedin = people.filter((p) => p.linkedin_url && parseLinkedInHandle(p.linkedin_url)).length;

  console.log(`\n[import] ${COMPANIES_FILE}${DRY ? ' · DRY RUN' : ''}`);
  console.log(`  empresas en fichero:      ${companies.length}`);
  console.log(`  ruido de ecosistema:     -${noise.length} (fondos, aceleradoras, medios, agencias)`);
  console.log(`  tras filtros:             ${selected.length} de ${beforeNoise}`);
  console.log(`  founders/CEO disponibles: ${[...peopleByCompany.values()].flat().length}`);
  console.log(`  con LinkedIn:             ${withLinkedin}${withLinkedin === 0 ? '  ← sin LinkedIn no son contactables' : ''}`);

  if (DRY) {
    console.log('\n  Muestra:');
    for (const c of selected.slice(0, 12)) {
      const ppl = peopleByCompany.get(c.name.toLowerCase()) ?? [];
      console.log(
        `   · ${c.name} (${c.domain}) ${c.geo} ${c.size} — ${ppl.length} founder(s)${ppl[0] ? `: ${ppl[0].full_name}` : ''}`,
      );
    }
    if (noise.length) {
      console.log('\n  Descartado como ruido (muestra):');
      for (const c of noise.slice(0, 8)) console.log(`   ✗ ${c.name} — ${c.description.slice(0, 60)}…`);
    }
    console.log('\n[dry-run] Nada escrito.\n');
    return;
  }

  const db = getServiceSupabase();
  if (!db) throw new Error('Supabase no configurado');

  let inserted = 0, deduped = 0, contactsIn = 0, linkedinIn = 0;
  for (const c of selected) {
    const { data: existing } = await db.from('companies').select('id').eq('domain', c.domain).maybeSingle();
    if (existing) { deduped++; continue; }

    const { data: company, error } = await db
      .from('companies')
      .insert({
        name: c.name,
        domain: c.domain,
        description: c.description || null,
        hq_country: c.geo || null,
        city: c.city || null,
        size: c.size || null,
        sector: guessSector(c.description),
        keywords: keywordsFrom(c.description, c.industries),
        source: 'explee',
      })
      .select()
      .single();
    if (error) { console.error(`[import] ${c.domain}: ${error.message}`); continue; }

    let contactId: string | null = null;
    for (const p of peopleByCompany.get(c.name.toLowerCase()) ?? []) {
      const handle = p.linkedin_url ? parseLinkedInHandle(p.linkedin_url) : null;
      if (handle) {
        const { data: dup } = await db
          .from('contacts')
          .select('id')
          .eq('linkedin_handle', handle)
          .maybeSingle();
        if (dup) continue;
        linkedinIn++;
      }
      const { data: contact } = await db
        .from('contacts')
        .insert({
          company_id: company.id,
          full_name: p.full_name,
          role: p.job_title || null,
          linkedin_url: handle ? `https://www.linkedin.com/in/${handle}` : null,
          linkedin_handle: handle,
          source: 'explee',
          notes: handle ? null : 'importado de Explee sin LinkedIn: buscar perfil a mano',
        })
        .select()
        .single();
      if (contact && !contactId) contactId = contact.id;
      contactsIn++;
    }

    await db.from('leads').insert({
      company_id: company.id,
      contact_id: contactId,
      stage: 'detected',
      priority_score: priorityScore({ company: company as Company, signal: null, scan: null }),
    });
    inserted++;
  }
  console.log(
    `\n[import] hecho: ${inserted} empresas, ${deduped} deduplicadas, ${contactsIn} founders (${linkedinIn} con LinkedIn)\n`,
  );
}

main().catch((e) => {
  console.error('[import] fallo:', e);
  process.exit(1);
});
