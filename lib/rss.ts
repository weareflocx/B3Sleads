// Parsing de feeds RSS de funding (spec §6)
import Parser from 'rss-parser';
import { FUNDING_FEEDS } from './rss-sources';

export interface FeedItem {
  title: string;
  link: string;
  pubDate: string | null;
  content: string;
  feedUrl: string;
}

const parser = new Parser({ timeout: 20_000 });

export async function fetchFundingItems(feeds = FUNDING_FEEDS): Promise<FeedItem[]> {
  const results = await Promise.allSettled(feeds.map((url) => parser.parseURL(url)));
  const items: FeedItem[] = [];
  results.forEach((res, i) => {
    if (res.status !== 'fulfilled') {
      console.error(`[rss] feed falló: ${feeds[i]} — ${res.reason}`);
      return;
    }
    for (const item of res.value.items ?? []) {
      items.push({
        title: item.title ?? '',
        link: item.link ?? '',
        pubDate: item.isoDate ?? item.pubDate ?? null,
        content: (item.contentSnippet ?? item.content ?? '').slice(0, 2000),
        feedUrl: feeds[i],
      });
    }
  });
  return items;
}

// Prefiltro barato antes de gastar tokens: solo items que huelen a ronda.
const FUNDING_HINTS =
  /(raises?|raised|secures?|secured|closes?|closed|lands?|funding|seed|pre-seed|series [ab]|ronda|levanta|captación|millones|million|€|\$[\d.]+[mk])/i;

export function looksLikeFunding(item: FeedItem): boolean {
  return FUNDING_HINTS.test(`${item.title} ${item.content}`);
}
