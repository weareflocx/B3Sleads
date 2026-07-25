// Sistema de botones homogéneo de la ficha. Todos comparten proporciones
// (px-4 py-2, text-sm, font-medium, sin icono dentro), como "Lanzar scan" y
// "Abrir LinkedIn". El primario es de relleno; el secundario, blanco sutil de
// contorno. El ancho lo pone quien lo usa (w-full donde toque).
const BTN = 'rounded-md px-4 py-2 text-center text-sm font-medium transition-colors disabled:opacity-40';

export const BTN_CTA = `${BTN} bg-[var(--cta)] text-[var(--cta-text)] hover:opacity-90`;
export const BTN_LINKEDIN = `${BTN} bg-[var(--linkedin)] text-[var(--linkedin-text)] hover:opacity-90`;

// Sólido de máximo contraste: blanco en el tema oscuro, negro en el claro
// (se invierte con el fondo vía --btn-solid-*). Un filete sutil lo perfila.
export const BTN_WHITE = `${BTN} border border-[var(--border)] bg-[var(--btn-solid-bg)] text-[var(--btn-solid-text)] hover:opacity-90`;

// Blanco sutil: contorno neutro, texto normal, realce leve al pasar.
export const BTN_OUTLINE = `${BTN} border border-[var(--border)] text-[var(--text)] hover:border-[var(--muted)] hover:bg-[var(--surface-2)]`;

// LinkedIn en contorno: azul de la marca al borde y al texto, sin relleno.
export const BTN_LINKEDIN_OUTLINE = `${BTN} border border-[var(--linkedin)] text-[var(--linkedin)] hover:bg-[var(--linkedin)]/10`;
