'use client';

import { useState } from 'react';

// Trabajar el lead con un LLM externo (el Claude que Sergio ya paga, o su
// agente Guanchito). Cada herramienta copia un prompt autocontenido: cero
// coste de API. Dos tarjetas paralelas: brief de llamada y pregunta libre.
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
    setTimeout(() => setCopied((c) => (c === tag ? null : c)), 2500);
  }

  const askPrompt = `${leadContext}\n\n---\n\nPregunta sobre este lead: ${question.trim()}\n\nResponde apoyándote solo en el dossier; si falta un dato, dilo.`;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {/* Brief de llamada */}
      <div className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="text-sm font-semibold">Brief de llamada</h3>
        <p className="mt-1 flex-1 text-xs leading-relaxed text-[var(--muted)]">
          El dossier del lead con el prompt maestro del brief pre-call: verificación contra la web
          viva, inteligencia, gancho, guion con preguntas literales, cierre y chuleta.</p>
        <button
          onClick={() => copy(callBriefPrompt, 'brief')}
          className="mt-3 w-full rounded-md bg-[var(--cta)] px-3.5 py-2 text-sm font-medium text-[var(--cta-text)] transition-opacity hover:opacity-90"
        >
          {copied === 'brief' ? 'Copiado ✓ · pégalo en tu Claude' : 'Copiar prompt del brief ⧉'}
        </button>
      </div>

      {/* Pregunta libre */}
      <div className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="text-sm font-semibold">Pregunta al dossier</h3>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          placeholder="¿Qué objeción es más probable? ¿Cómo abro la llamada?"
          className="mt-2 w-full flex-1 resize-none rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs leading-relaxed outline-none transition-colors focus:border-[var(--cta)]"
        />
        <button
          onClick={() => copy(askPrompt, 'ask')}
          disabled={!question.trim()}
          className="mt-3 w-full rounded-md border border-[var(--cta)] px-3.5 py-2 text-sm font-medium text-[var(--cta)] transition-colors hover:bg-[var(--cta)]/10 disabled:opacity-40"
        >
          {copied === 'ask' ? 'Copiado ✓ · pégalo en tu Claude' : 'Copiar pregunta + contexto ⧉'}
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-[var(--soft)] lg:col-span-2">
        Se copia un prompt autocontenido: pégalo en tu Claude o en Guanchito. La respuesta que te
        devuelva puedes guardarla como nota del lead.
      </p>
    </div>
  );
}
