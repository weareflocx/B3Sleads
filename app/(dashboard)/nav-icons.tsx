// Iconos de línea para la navegación. Inline, sin librería: 24×24, trazo 1.75,
// heredan currentColor. Uno por sección, más los de la propia UI del menú.
import type { SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 18, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

// Briefing: bandeja / dossier del día.
export const IconBriefing = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 14h4l1.5 2.5h7L17 14h4" />
    <path d="M4.5 6.5 3 14v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4l-1.5-7.5A2 2 0 0 0 17.5 5h-11a2 2 0 0 0-2 1.5Z" />
  </Base>
);

// Pipeline: columnas de un kanban.
export const IconPipeline = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="4" width="5" height="16" rx="1" />
    <rect x="9.5" y="4" width="5" height="10" rx="1" />
    <rect x="16" y="4" width="5" height="13" rx="1" />
  </Base>
);

// Founders: personas.
export const IconFounders = (p: IconProps) => (
  <Base {...p}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.5a3 3 0 0 1 0 5.8" />
    <path d="M17.5 20a5.5 5.5 0 0 0-3-4.9" />
  </Base>
);

// Leaderboard: podio / barras.
export const IconLeaderboard = (p: IconProps) => (
  <Base {...p}>
    <rect x="9" y="9" width="6" height="11" rx="1" />
    <rect x="3" y="13" width="6" height="7" rx="1" />
    <rect x="15" y="6" width="6" height="14" rx="1" />
  </Base>
);

// Home: la casa. (El logo va a home, pero se usa para el enlace explícito.)
export const IconHome = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 11.5 12 4l8 7.5" />
    <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
  </Base>
);

export const IconSearch = (p: IconProps) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Base>
);

// Comprimir / expandir el menú: barra con flecha.
export const IconCollapse = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 5v14" />
    <path d="M20 12H9" />
    <path d="m13 8-4 4 4 4" />
  </Base>
);

export const IconExpand = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 5v14" />
    <path d="M9 12h11" />
    <path d="m16 8 4 4-4 4" />
  </Base>
);

export const IconMenu = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 6h16" />
    <path d="M4 12h16" />
    <path d="M4 18h16" />
  </Base>
);

export const IconClose = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 6l12 12" />
    <path d="M18 6 6 18" />
  </Base>
);

export const IconBuilding = (p: IconProps) => (
  <Base {...p}>
    <rect x="5" y="3" width="14" height="18" rx="1" />
    <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
  </Base>
);
