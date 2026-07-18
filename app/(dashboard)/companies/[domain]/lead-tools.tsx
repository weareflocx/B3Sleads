'use client';

import { useState } from 'react';

// Trabajar el lead con un LLM externo (el Claude que Sergio ya paga, o su
// agente Guanchito). Copia prompts autocontenidos: cero coste de API.
//  - Brief de llamada: genera el dossier estratégico estilo Bokeroon.
//  - Preguntar: dossier del lead + tu pregunta, listo para pegar.
export function LeadTools({
  callBriefPrompt,
  leadContext,
}: {
  callBriefPrompt: string;
  leadContext: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [question, setQuestion] = useState('');

  function copy(text: string, tag: string) {
    navigator.clipboard.writeText(text);
    setCopied(tag);
    setTimeout(() => setCopied((c) => (c === tag ? null : c)), 2000);
  }

  const askPrompt = `${leadContext}\n\n---\n\nPregunta sobre este lead: ${question.trim()}\n\nResponde apoyándote solo en el dossier; si falta un dato, dilo.`;

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div>
        <button
          onClick={() => copy(callBriefPrompt, 'brief')}
          className="rounded-md bg-[var(--cta)] px-3.5 py-2 text-sm font-medium text-[var(--cta-text)] transition-opacity hover:opacity-90"
        >
          {copied === 'brief' ? 'Copiado ✓ · pégalo en tu Claude' : 'Generar brief de llamada ⧉'}
        </button>
        <p className="mt-1.5 text-xs text-[var(--muted)]">
          Copia el prompt del dossier + instrucciones. Lo pegas en tu Claude o en Guanchito y te
          devuelve el brief en Markdown (estilo Bokeroon), listo para guardar como nota.
        </p>
      </div>

      <div className="border-t border-[var(--border)] pt-3">
        <label htmlFor="ask" className="text-xs text-[var(--muted)]">
          Preguntar sobre el lead
        </label>
        <textarea
          id="ask"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          placeholder="¿Qué objeción es más probable? ¿Cómo abro la llamada? ¿Qué le duele de verdad?"
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--cta)]"
        />
        <button
          onClick={() => copy(askPrompt, 'ask')}
          disabled={!question.trim()}
          className="mt-2 rounded-md border border-[var(--cta)] px-3 py-1.5 text-sm font-medium text-[var(--cta)] transition-colors hover:bg-[var(--cta)]/10 disabled:opacity-40"
        >
          {copied === 'ask' ? 'Copiado ✓ · pégalo en tu Claude' : 'Copiar pregunta con contexto ⧉'}
        </button>
      </div>
    </div>
  );
}
