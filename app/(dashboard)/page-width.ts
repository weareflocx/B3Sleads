// Anchos de contenido. El layout ya no impone un tope: lo fija cada página,
// porque no todas quieren lo mismo. La mayoría pide una medida de lectura
// cómoda; el kanban quiere todo el espacio disponible.
//
// Las clases van literales para que el escáner de Tailwind las genere.

// Medida estándar de lectura (briefing, fichas, listados).
export const PAGE = 'mx-auto w-full max-w-[1180px]';

// Vistas que respiran mejor anchas: tableros y tablas largas.
export const PAGE_WIDE = 'w-full';

// La ficha del lead: más ancha que la medida de lectura para que el análisis
// del Scanner quepa a dos columnas de verdad, sin llegar al ancho total.
export const PAGE_XL = 'mx-auto w-full max-w-[1480px]';
