import { PAGE } from '@/app/(dashboard)/page-width';
import { getBriefingLeads } from '@/lib/data';
import { computeRadar } from '@/lib/radar';
import { LeadCard } from './lead-card';
import { ImportBox } from '../import-box';

export const dynamic = 'force-dynamic';

export default async function BriefingPage() {
  const leads = await getBriefingLeads();
  // El briefing muestra leads cualificados: con empresa (ficha + Scanner).
  // Los founders sueltos sin empresa viven en /founders hasta tener dominio.
  const cualificados = leads.filter(
    (l) => ['detected', 'briefed'].includes(l.lead.stage) && l.company,
  );

  // Radar v2: solo entran los leads con señal viva, ordenados por radar_score.
  // Los que tienen ficha pero ninguna señal no se rellenan con un número
  // inventado: van a reserva y se cuentan aparte.
  const conRadar = cualificados.map((bl) => ({ bl, radar: computeRadar(bl, bl.signals) }));
  const active = conRadar
    .filter((r) => r.radar.state === 'activo')
    .sort((a, b) => (b.radar.score ?? 0) - (a.radar.score ?? 0))
    .map((r) => r.bl);
  const enReserva = conRadar.filter((r) => r.radar.state !== 'activo').length;

  return (
    <main className={PAGE}>
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Briefing de las 9:00</h1>
        <span className="text-sm text-[var(--muted)]">
          {active.length} {active.length === 1 ? 'lead' : 'leads'} en cola
        </span>
      </div>

      {/* El alta vive aquí, el punto de entrada del día: pegar un founder y a
          la cola. Barra compacta que se despliega para nombre/nota/lote. */}
      <div className="mb-6">
        <ImportBox />
      </div>

      {/* Estado vacío honesto: si no hay señal viva se dice, no se rellena
          la pantalla con leads sin timing para que no esté vacía. */}
      {active.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] p-10 text-center text-[var(--muted)]">
          Ningún lead con señal viva hoy. No se rellena la cola con leads sin timing: registra una
          señal en una ficha o espera al pipeline nocturno.
        </p>
      ) : (
        <div className="space-y-4">
          {active.map((bl) => (
            <LeadCard key={bl.lead.id} initial={bl} />
          ))}
        </div>
      )}

      {/* El sistema no los ha perdido: están esperando señal. */}
      {enReserva > 0 && (
        <p className="mt-6 text-center font-mono text-xs text-[var(--soft)]">
          {enReserva} {enReserva === 1 ? 'lead en reserva esperando' : 'leads en reserva esperando'}{' '}
          señal
        </p>
      )}
    </main>
  );
}
