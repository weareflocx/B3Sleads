import type { Metadata } from 'next';
import { EclipseClient } from './eclipse-client';

// La página es un componente de servidor por una sola razón: los metadatos.
// LinkedIn y X no ejecutan JavaScript al compartir; rastrean la URL y pintan
// su tarjeta Open Graph. La URL compartida lleva el resultado en la query
// (?d=marca.com&s=58&b=…&e=…) y aquí se convierte en una tarjeta OG
// personalizada: cada founder comparte SU resultado, no un banner genérico.
const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://b3slead.netlify.app';

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const p = await searchParams;
  const d = (p.d ?? '').slice(0, 40).replace(/[^\w.-]/g, '');
  const conResultado = Boolean(d) && /^\d{1,3}$/.test(p.s ?? '');
  const title = conResultado
    ? `${d} · ${p.s}/100 en el Eclipse Scan`
    : 'Eclipse Scan · un antes y un después para tu marca';
  const description =
    'El 12 de agosto de 2026 un eclipse total cruza España. Escanea tu marca gratis con B3S y descubre qué brilla y qué se eclipsa.';
  const og = conResultado
    ? `${BASE}/api/eclipse/og?${new URLSearchParams({
        d,
        s: p.s!,
        b: (p.b ?? '').slice(0, 30),
        e: (p.e ?? '').slice(0, 30),
      })}`
    : `${BASE}/api/eclipse/og`;
  return {
    title,
    description,
    metadataBase: new URL(BASE),
    openGraph: {
      title,
      description,
      url: `${BASE}/eclipse`,
      siteName: 'B3S',
      images: [{ url: og, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [og] },
  };
}

export default function EclipsePage() {
  return <EclipseClient />;
}
