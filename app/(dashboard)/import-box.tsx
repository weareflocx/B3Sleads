'use client';

import { AddLeadForm } from './add-lead-form';
import { SubidaLoteButton } from './subida-lote';

// Añadir al radar desde Briefing y Marcas. Vale con el founder, con la
// marca, o con ambos:
//  - LinkedIn → el nombre se autocompleta desde el handle (editable)
//  - dominio → se crea la ficha y se busca su scan en B3S automáticamente
// Nada de esto lee LinkedIn (spec §9): se pega lo que ya se está viendo.
//
// Para varias de golpe hay una sola vía: "subir en lote" (tabla o CSV, con
// vista previa y sin scans). El modo lote antiguo, que emparejaba una lista
// de LinkedIn con otra de dominios por número de fila, se quitó el 01/10:
// una fila desplazada emparejaba founders con la marca equivocada.
export function ImportBox() {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-end">
        <SubidaLoteButton className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)]">
          subir en lote →
        </SubidaLoteButton>
      </div>
      <AddLeadForm />
    </div>
  );
}
