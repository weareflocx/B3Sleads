// Paso 2 del pipeline: RSS → extracción de rondas con Claude API
import { fetchFundingItems, looksLikeFunding, type FeedItem } from '../lib/rss';
import { extractFunding, type FundingExtraction } from '../lib/claude';

export interface FundingCandidate {
  extraction: FundingExtraction;
  item: FeedItem;
}

export async function discoverFundingCandidates(maxItems = 30): Promise<FundingCandidate[]> {
  const items = await fetchFundingItems();
  const funding = items.filter(looksLikeFunding).slice(0, maxItems);
  console.log(`[rss] ${items.length} items, ${funding.length} con pinta de ronda`);

  const candidates: FundingCandidate[] = [];
  for (const item of funding) {
    try {
      const extraction = await extractFunding(item.title, item.content, item.link);
      if (extraction?.is_funding && extraction.fits_icp && extraction.company_domain) {
        candidates.push({ extraction, item });
        console.log(`[extract] ✓ ${extraction.company_name} (${extraction.company_domain})`);
      }
    } catch (e) {
      console.error(`[extract] error en "${item.title}": ${e}`);
    }
  }
  return candidates;
}
