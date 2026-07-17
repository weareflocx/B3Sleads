// Importa los datasets de Explee (data/explee-*.tsv) a Supabase.
// Empresas → companies (source 'explee') + lead en stage 'detected'.
// Personas → contacts vinculados por nombre de empresa.
//
// Uso:
//   npx tsx scripts/import-explee.ts --dry-run          # resumen sin escribir
//   npx tsx scripts/import-explee.ts                    # importa todo
//   npx tsx scripts/import-explee.ts --max 50           # límite de empresas
//   npx tsx scripts/import-explee.ts --geo ES,GB --size 1-10
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getServiceSupabase } from '../lib/supabase';
import { priorityScore } from '../lib/scoring';
import type { Company } from '../lib/types';

const DRY = process.argv.includes('--dry-run');
const argOf = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const MAX = parseInt(argOf('--max') || '99999', 10);
const GEO = argOf('--geo')?.split(',').map((s) => s.trim().toUpperCase());
const SIZE = argOf('--size'); // ej: "1-10" | "11-50"

interface TsvCompany {
  name: string;
  domain: string;
  description: string;
  geo: string;
  size: string;
  city: string;
}
interface TsvPerson {
  company: string;
  full_name: string;
  job_title: string;
  geo: string;
}

function readTsv(file: string): string[][] {
  const p = path.join(process.cwd(), 'data', file);
  if (!fs.existsSync(p)) {
    console.error(`[import] falta ${p} — exporta primero desde Explee`);
    process.exit(1);
  }
  return fs
    .readFileSync(p, 'utf-8')
    .split('\n')
    .slice(1)
    .filter(Boolean)
    .map((l) => l.split('\t'));
}

// El sector real lo determinará el Scanner; guardamos null salvo pista obvia.
function guessSector(desc: string): string | null {
  const d = desc.toLowerCase();
  if (/(crypto|blockchain|web3|defi|nft|dao|wallet|token)/.test(d)) return 'web3';
  if (/(\bai\b|artificial intelligence|machine learning)/.test(d)) return 'ai';
  if (/marketplace/.test(d)) return 'marketplace';
  if (/(ecommerce|e-commerce|commerce)/.test(d)) return 'ecommerce';
  if (/saas|software/.test(d)) return 'saas';
  return null;
}

async function main() {
  const companies: TsvCompany[] = readTsv('explee-web3-companies.tsv').map((c) => ({
    name: c[0],
    domain: (c[1] || '').toLowerCase().replace(/^www\./, ''),
    description: c[2] || '',
    geo: c[3] || '',
    size: c[4] || '',
    city: c[6] || '',
  }));
  const people: TsvPerson[] = fs.existsSync(path.join(process.cwd(), 'data', 'explee-web3-people.tsv'))
    ? readTsv('explee-web3-people.tsv').map((p) => ({
        company: p[0],
        full_name: p[1],
        job_title: p[2],
        geo: p[3] || '',
      }))
    : [];

  let selected = companies.filter((c) => c.domain);
  if (GEO) selected = selected.filter((c) => GEO.includes(c.geo));
  if (SIZE) selected = selected.filter((c) => c.size === SIZE);
  selected = selected.slice(0, MAX);

  const peopleByCompany = new Map<string, TsvPerson[]>();
  for (const p of people) {
    const key = p.company.toLowerCase();
    if (!peopleByCompany.has(key)) peopleByCompany.set(key, []);
    peopleByCompany.get(key)!.push(p);
  }

  console.log(
    `[import] ${selected.length} empresas seleccionadas (de ${companies.length}), ${people.length} contactos disponibles${DRY ? ' · DRY RUN' : ''}`,
  );
  if (DRY) {
    for (const c of selected.slice(0, 15)) {
      const ppl = peopleByCompany.get(c.name.toLowerCase()) ?? [];
      console.log(`  · ${c.name} (${c.domain}) ${c.geo} ${c.size} — ${ppl.length} contactos`);
    }
    if (selected.length > 15) console.log(`  … y ${selected.length - 15} más`);
    return;
  }

  const db = getServiceSupabase();
  if (!db) throw new Error('Supabase no configurado');

  let inserted = 0, deduped = 0, contactsIn = 0;
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
        sector: guessSector(c.description),
        source: 'explee',
      })
      .select()
      .single();
    if (error) { console.error(`[import] ${c.domain}: ${error.message}`); continue; }

    // Contactos de esa empresa (sin email: Explee no los revela pre-outreach)
    let contactId: string | null = null;
    for (const p of peopleByCompany.get(c.name.toLowerCase()) ?? []) {
      const { data: contact } = await db
        .from('contacts')
        .insert({
          company_id: company.id,
          full_name: p.full_name,
          role: p.job_title || null,
          notes: 'importado de Explee (email no revelado)',
        })
        .select()
        .single();
      if (contact && !contactId) contactId = contact.id;
      contactsIn++;
    }

    const score = priorityScore({ company: company as Company, signal: null, scan: null });
    await db.from('leads').insert({
      company_id: company.id,
      contact_id: contactId,
      stage: 'detected',
      priority_score: score,
    });
    inserted++;
  }
  console.log(`[import] hecho: ${inserted} empresas nuevas, ${deduped} deduplicadas, ${contactsIn} contactos`);
}

main().catch((e) => {
  console.error('[import] fallo:', e);
  process.exit(1);
});
