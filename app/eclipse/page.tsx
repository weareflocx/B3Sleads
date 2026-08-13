import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { EclipseClient } from './eclipse-client';

// La página es un componente de servidor por una sola razón: los metadatos.
// LinkedIn y X no ejecutan JavaScript al compartir; rastrean la URL y pintan
// su tarjeta Open Graph. La URL compartida lleva el resultado en la query
// (?d=marca.com&s=58&b=…&e=…) y aquí se convierte en una tarjeta OG
// personalizada: cada founder comparte SU resultado, no un banner genérico.
// El eclipse vive en su propio sitio, así que la base NO se puede dar por
// sabida: se lee del propio dominio que sirve la petición y solo se recurre a
// la variable si está puesta. Un microsite que se autoconfigura no puede
// compartir la tarjeta de otro dominio por un despiste de entorno.
async function baseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return 'https://b3slead.netlify.app';
  return `${h.get('x-forwarded-proto') ?? 'https'}://${host}`;
}

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const BASE = await baseUrl();
  const p = await searchParams;
  const d = (p.d ?? '').slice(0, 40).replace(/[^\w.-]/g, '');
  const conResultado = Boolean(d) && /^\d{1,3}$/.test(p.s ?? '');
  const title = conResultado
    ? `${d} · ${p.s}/100 en el Eclipse Scan`
    : 'Eclipse Scan · el día después para tu marca';
  const description =
    'El 12 de agosto de 2026 un eclipse total cruzó España. Los ciclos se ven cuando acaban. Escanea tu marca gratis con B3S: qué brilla, qué se eclipsa y hacia dónde mira.';
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
