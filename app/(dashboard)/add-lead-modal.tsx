'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useAddLead } from './add-lead-form';
import { BTN_WHITE, BTN_OUTLINE } from './buttons';

// Añadir un lead desde cualquier pantalla. El botón vive en el menú, así que
// el gesto no depende de estar en el Briefing: ves algo en LinkedIn y entra al
// radar sin cambiar de sitio.
//
// El botón es el sólido de máximo contraste (negro en claro, blanco en
// oscuro): es la única acción del menú, y el menú es navegación.
export function AddLeadButton({
  collapsed = false,
  domain,
  label = 'Añadir lead',
  className,
}: {
  collapsed?: boolean;
  // Desde una ficha: la marca ya se sabe, así que se pregunta solo por la
  // persona. Es como se añade un segundo founder.
  domain?: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={collapsed ? 'Añadir lead' : undefined}
        aria-label="Añadir lead"
        className={
          className ??
          `${BTN_WHITE} flex w-full items-center justify-center gap-2 ${collapsed ? 'px-0' : ''}`
        }
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          aria-hidden="true"
          className="shrink-0"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        {!collapsed && <span>{label}</span>}
      </button>

      {open && <AddLeadDialog onClose={() => setOpen(false)} presetDomain={domain} />}
    </>
  );
}

// Una pregunta por pantalla. El gesto real es pegar una URL y seguir, así que
// Enter avanza y "Añadir" está disponible en cuanto hay lo mínimo: por pasos,
// pero sin obligar a recorrerlos.
// El mismo encuadre que el ojo de la ficha: cuadrado, borde sutil, se marca
// al pasar. Lo comparten cerrar y atrás.
const ICON_BTN =
  'flex h-6 w-6 items-center justify-center rounded border border-[var(--border)] text-[var(--muted)] transition-colors hover:border-[var(--muted)] hover:text-[var(--text)]';

// Rojo → azul → verde: el avance se lee por color, como en el scan.
// Cargos habituales de un founder, de un toque. El campo sigue abierto.
const ROLES = ['CEO', 'CTO', 'Co-founder', 'COO', 'CMO', 'CSO'];

const STEP_TONES = ['bg-[var(--accent)]', 'bg-[var(--linkedin-soft)]', 'bg-[var(--cta)]'];

const FIELD =
  'w-full border-0 border-b border-[var(--border)] bg-transparent px-0 py-2 text-lg outline-none transition-colors placeholder:text-[var(--soft)] focus:border-[var(--cta)]';

function AddLeadDialog({
  onClose,
  presetDomain,
}: {
  onClose: () => void;
  presetDomain?: string;
}) {
  const [step, setStep] = useState(0);
  const [contactoPrevio, setContactoPrevio] = useState(false);
  const [done, setDone] = useState<{ name?: string; domain?: string } | null>(null);
  const lead = useAddLead((rows) => {
    const ok = rows.find((r) => r.status === 'ok');
    setDone({ name: ok?.name, domain: ok?.domain ?? presetDomain });
  });

  useEffect(() => {
    if (presetDomain) lead.setDomain(presetDomain);
    // Solo al abrir: después el campo es del usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetDomain]);

  const ALL_STEPS = [
    {
      title: '¿Quién es el founder?',
      hint: 'Pega la URL de su perfil. El nombre se completa solo.',
      body: (
        <input
          autoFocus
          value={lead.linkedin}
          onChange={(e) => lead.onLinkedinChange(e.target.value)}
          aria-label="URL de LinkedIn del founder"
          placeholder="linkedin.com/in/…"
          className={FIELD}
        />
      ),
    },
    {
      title: '¿Cuál es su marca?',
      hint: 'Con el dominio buscamos su scan en B3S automáticamente.',
      body: (
        <input
          autoFocus
          value={lead.domain}
          onChange={(e) => lead.setDomain(e.target.value)}
          aria-label="Dominio de la marca"
          placeholder="acmelabs.io"
          className={FIELD}
        />
      ),
    },
    {
      title: '¿Algo más que anotar?',
      hint: 'Todo opcional. El cargo y el ángulo personal son lo que hace irrepetible el primer mensaje.',
      body: (
        <div className="space-y-6">
          {/* El cargo importa para saber con quién hablas. No se puede leer de
              LinkedIn (spec §9), así que se elige de un toque o se escribe. */}
          <div>
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {ROLES.map((r) => {
                const active = lead.role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => lead.setRole(active ? '' : r)}
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                      active
                        ? 'border-[var(--cta)] bg-[var(--cta)]/10 text-[var(--cta)]'
                        : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
            <input
              value={lead.role}
              onChange={(e) => lead.setRole(e.target.value)}
              aria-label="Cargo del founder"
              placeholder="cargo"
              className={FIELD}
            />
          </div>

          <input
            autoFocus
            value={lead.note}
            onChange={(e) => lead.setNote(e.target.value)}
            aria-label="Nota · ángulo personal"
            placeholder="comentó mi post sobre marcas"
            className={FIELD}
          />

          {/* Contacto previo: solo estorba si aún no ha pasado nada, así que
              se abre a demanda. Marca la temperatura de entrada del lead. */}
          {contactoPrevio ? (
            <div className="flex flex-wrap gap-5 border-t border-[var(--border)] pt-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={lead.warm}
                  onChange={(e) => lead.setWarm(e.target.checked)}
                  disabled={lead.replied}
                  className="accent-[var(--cta)]"
                />
                Interactuaron con mis posts
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--success)]">
                <input
                  type="checkbox"
                  checked={lead.replied}
                  onChange={(e) => lead.setReplied(e.target.checked)}
                  className="accent-[var(--cta)]"
                />
                Respondió por DM
              </label>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setContactoPrevio(true)}
              className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)]"
            >
              + ya hubo contacto
            </button>
          )}
        </div>
      ),
    },
  ];

  // Desde una ficha la marca ya está: ese paso no se pregunta.
  const STEPS = presetDomain ? ALL_STEPS.filter((_, i) => i !== 1) : ALL_STEPS;
  const isLast = step === STEPS.length - 1;
  const error = lead.log.find((r) => r.status === 'error');

  function next() {
    if (isLast) lead.submit();
    else setStep((s) => s + 1);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      next();
    }
  }

  // El diálogo se monta en <body>, no donde vive el botón. El menú es
  // `sticky`, y sticky crea contexto de apilamiento: dentro de él, z-100 solo
  // compite con los hermanos del menú, así que cualquier elemento posicionado
  // de la página (el chip + de Sector, el selector de Etapa) se pintaba encima
  // del pop-up. Portal al body y el z-index vuelve a significar algo.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Añadir lead al radar"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4"
      onKeyDown={onKeyDown}
    >
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
        style={{ animation: 'b3s-fade 140ms ease-out' }}
        aria-hidden="true"
      />

      <div
        className="relative w-full max-w-lg overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
        style={{
          animation: 'b3s-dialog 190ms cubic-bezier(0.23, 1, 0.32, 1)',
          transformOrigin: 'center',
        }}
      >
        {/* Progreso pegado al borde superior, con el color del avance: rojo,
            azul y verde, igual que la barra del scan. */}
        {!done && (
          <div className="flex h-1 w-full" aria-hidden="true">
            {STEP_TONES.slice(0, STEPS.length).map((tone, i) => (
              <span
                key={i}
                className={`h-full flex-1 transition-colors duration-300 ${
                  i <= step ? tone : 'bg-[var(--border)]'
                }`}
              />
            ))}
          </div>
        )}

        <div className="p-7">
        <div className="mb-5 flex justify-end">
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className={ICON_BTN}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {done ? (
          <div style={{ animation: 'b3s-dialog 190ms cubic-bezier(0.23, 1, 0.32, 1)' }}>
            <p className="text-lg font-semibold text-[var(--cta)]">Está en el radar</p>
            <p className="mt-1.5 text-sm text-[var(--muted)]">
              {done.name ?? 'El lead'} entró en la cola.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {done.domain && (
                <Link href={`/companies/${done.domain}`} className={BTN_OUTLINE} onClick={onClose}>
                  Ver ficha →
                </Link>
              )}
              <button
                onClick={() => {
                  setDone(null);
                  setStep(0);
                }}
                className={BTN_OUTLINE}
              >
                Añadir otro
              </button>
              <button onClick={onClose} className={`${BTN_WHITE} ml-auto`}>
                Listo
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* key: cada paso vuelve a entrar, no se sustituye en seco. */}
            <div key={step} style={{ animation: 'b3s-step 200ms cubic-bezier(0.23, 1, 0.32, 1)' }}>
              <h2 className="text-xl font-semibold">{STEPS[step].title}</h2>
              <p className="mt-1.5 text-sm text-[var(--muted)]">{STEPS[step].hint}</p>
              <div className="mt-5">{STEPS[step].body}</div>
            </div>

            {error && <p className="mt-4 text-sm text-[var(--danger)]">{error.detail}</p>}

            {/* La acción, centrada y sola. Enter sigue avanzando: los pasos
                2 y 3 son opcionales, así que el camino corto es pulsarlo. */}
            <div className="relative mt-7 flex items-center justify-center">
              <button
                onClick={() => setStep((s) => s - 1)}
                disabled={step === 0}
                aria-label="Paso anterior"
                title="Paso anterior"
                className={`absolute left-0 ${ICON_BTN} disabled:invisible`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M15 5l-7 7 7 7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                onClick={next}
                disabled={isLast && !lead.canSubmit}
                className={`${BTN_WHITE} px-8`}
              >
                {isLast ? (lead.busy ? 'Añadiendo…' : 'Añadir') : 'Continuar'}
              </button>
            </div>
          </>
        )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
