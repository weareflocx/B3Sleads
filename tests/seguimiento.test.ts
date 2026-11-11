import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAUSA_NO_AHORA,
  contextoRespuesta,
  contextoSeguimiento,
  enviosDe,
  etapaPara,
  filaDeEnvio,
  haRespondido,
  motivoScanDudoso,
  notaDeRespuesta,
  parseLectura,
  planSeguimiento,
  textoEnviado,
  toquesDe,
  type ContextoLead,
} from '../lib/seguimiento';
import type { ScanReport } from '../lib/scan-report';
import type { Message } from '../lib/types';

const msg = (o: Partial<Message>): Message =>
  ({ id: Math.random().toString(36).slice(2), lead_id: 'l', channel: 'linkedin', lang: 'es', draft: 'borrador', edited_final: null, sent_at: null, replied: false, created_at: '2026-11-01T10:00:00Z', ...o }) as Message;

const LEAD: ContextoLead = {
  companyName: 'Acme',
  domain: 'acme.io',
  contactName: 'Ana Ruiz',
  signalSummary: 'Seed · 2 M€',
  scannerFindings: 'Fortaleza: idea de marca clara. Hueco: sin prueba externa.',
  lang: 'es',
};

test('plan: segundo toque, último toque y, al tercero sin respuesta, aparcar', () => {
  assert.equal(planSeguimiento('contacted', 1).tipo, 'segundo_toque');
  assert.equal(planSeguimiento('contacted', 1).numero, 2);
  assert.equal(planSeguimiento('contacted', 2).tipo, 'ultimo_toque');
  assert.equal(planSeguimiento('contacted', 3).tipo, 'pausar');
  assert.equal(planSeguimiento('contacted', 3).max, null);
});

test('plan: un contactado a mano, sin mensajes guardados, cuenta como uno enviado', () => {
  const p = planSeguimiento('contacted', 0);
  assert.equal(p.tipo, 'segundo_toque');
  assert.equal(p.numero, 2);
});

test('plan: en conversación no se cuentan toques, se reactiva', () => {
  for (const stage of ['conversation', 'call', 'proposal'] as const) {
    assert.equal(planSeguimiento(stage, 5).tipo, 'reactivar');
  }
});

test('envíos: los borradores regenerados que se marcan a la vez cuentan como un solo envío', () => {
  // Pasar a "Contactado" pone el mismo sent_at en todos los borradores sin enviar.
  const mismos = '2026-11-02T09:00:00.123Z';
  const envios = enviosDe([
    msg({ draft: 'v1', sent_at: mismos, created_at: '2026-11-01T10:00:00Z' }),
    msg({ draft: 'v2', sent_at: mismos, created_at: '2026-11-01T10:05:00Z' }),
    msg({ draft: 'sin enviar' }),
    msg({ draft: 'seguimiento', sent_at: '2026-11-08T09:00:00Z', created_at: '2026-11-08T09:00:00Z' }),
  ]);
  assert.deepEqual(envios.map((m) => m.draft), ['v2', 'seguimiento']);
});

test('lo enviado de verdad es la versión editada, si la hay', () => {
  assert.equal(textoEnviado({ draft: 'borrador', edited_final: ' lo que salió ' }), 'lo que salió');
  assert.equal(textoEnviado({ draft: 'borrador', edited_final: '  ' }), 'borrador');
});

test('contexto del seguimiento: lleva lo ya enviado, el tipo y el tope', () => {
  const c = contextoSeguimiento({
    lead: LEAD,
    plan: planSeguimiento('contacted', 1),
    dias: 6,
    enviados: ['Primer mensaje sobre la idea de marca.'],
    notas: [],
  });
  assert.match(c, /1\. Primer mensaje sobre la idea de marca\./);
  assert.match(c, /Tipo de seguimiento: SEGUNDO TOQUE/);
  assert.match(c, /máx 300 caracteres/);
  assert.match(c, /Idioma: español/);
  assert.doesNotMatch(c, /Bitácora/);
});

test('contexto del seguimiento: con tres mensajes sin respuesta no se redacta', () => {
  assert.throws(() =>
    contextoSeguimiento({ lead: LEAD, plan: planSeguimiento('contacted', 3), dias: 9, enviados: [], notas: [] }),
  );
});

test('etapa: quien contesta pasa a conversación; si ya conversa, no se mueve', () => {
  assert.deepEqual(etapaPara('interesado', 'contacted'), { etapa: 'conversation', motivo: null });
  assert.deepEqual(etapaPara('cortesia', 'invited'), { etapa: 'conversation', motivo: null });
  assert.deepEqual(etapaPara('pregunta', 'call'), { etapa: null, motivo: null });
});

test('etapa: "ahora no" aparca y "no" descarta con un motivo válido', () => {
  assert.deepEqual(etapaPara('no_ahora', 'contacted'), { etapa: 'paused', motivo: PAUSA_NO_AHORA });
  assert.deepEqual(etapaPara('no_interesa', 'contacted', 'Marca ya resuelta'), { etapa: 'discarded', motivo: 'Marca ya resuelta' });
  // Un motivo inventado por el modelo no llega a la BD.
  assert.deepEqual(etapaPara('no_interesa', 'contacted', 'porque sí'), { etapa: 'discarded', motivo: 'Otro' });
});

test('lectura: se entiende el JSON aunque venga envuelto', () => {
  const l = parseLectura(
    'Aquí tienes:\n```json\n{"clase":"interesado","resumen":"Quiere hablar.","cualificacion":"Decide ella.","motivo_descarte":null,"borrador":"¿Te va [hueco 1] o [hueco 2]?"}\n```',
    'contacted',
  );
  assert.ok(l);
  assert.equal(l.clase, 'interesado');
  assert.equal(l.etapa, 'conversation');
  assert.equal(l.borrador, '¿Te va [hueco 1] o [hueco 2]?');
});

test('lectura: sin clase válida no se inventa una clasificación', () => {
  assert.equal(parseLectura('{"clase":"entusiasmado","borrador":"x"}', 'contacted'), null);
  assert.equal(parseLectura('no es json', 'contacted'), null);
  assert.equal(parseLectura('{"clase": "interesado", ', 'contacted'), null);
});

test('contexto de la respuesta: sin enlace de agenda se piden dos huecos', () => {
  const base = { lead: LEAD, enviados: ['Hola'], notas: ['Nota previa'], respuesta: ' Me interesa, ¿hablamos? ', posicionamiento: 'Estudio de marca.' };
  const sin = contextoRespuesta({ ...base, agenda: { minutos: 20, enlace: null } });
  assert.match(sin, /\[hueco 1\] y \[hueco 2\]/);
  assert.match(sin, /"""\nMe interesa, ¿hablamos\?\n"""/);
  assert.match(sin, /- Nota previa/);
  const con = contextoRespuesta({ ...base, agenda: { minutos: 20, enlace: 'https://cal.example/sergio' } });
  assert.match(con, /Enlace de agenda: https:\/\/cal\.example\/sergio/);
});

test('la respuesta va a la bitácora literal y con su autor', () => {
  assert.equal(notaDeRespuesta('Ana Ruiz', ' Gracias '), 'Respuesta de Ana Ruiz (LinkedIn): «Gracias»');
  assert.equal(notaDeRespuesta(null, 'Ok'), 'Respuesta del founder (LinkedIn): «Ok»');
});

test('toques: una contestación al founder no cuenta como toque', () => {
  const envios = [
    msg({ sent_at: '2026-11-01T09:00:00Z', kind: null }),
    msg({ sent_at: '2026-11-06T09:00:00Z', kind: 'followup' }),
    msg({ sent_at: '2026-11-08T09:00:00Z', kind: 'reply' }),
  ];
  assert.equal(toquesDe(envios).length, 2);
});

test('plan: si el founder ha contestado, se reactiva y nunca se aparca', () => {
  // Contestó, Sergio respondió dos veces y nadie movió la etapa.
  const p = planSeguimiento('contacted', 3, true);
  assert.equal(p.tipo, 'reactivar');
  assert.notEqual(p.tipo, 'pausar');
  assert.equal(haRespondido([msg({ sent_at: '2026-11-01T09:00:00Z', replied: true }), msg({})]), true);
  assert.equal(haRespondido([msg({ sent_at: '2026-11-01T09:00:00Z' })]), false);
});

test('envío: el borrador de la app va a draft y lo enviado a edited_final', () => {
  assert.deepEqual(filaDeEnvio({ texto: ' lo que salió ', original: 'lo que propuso la app', kind: 'followup' }), {
    draft: 'lo que propuso la app',
    edited_final: 'lo que salió',
    kind: 'followup',
    sin_borrador: false,
  });
  const fuera = filaDeEnvio({ texto: 'pegado de su Claude', original: null, kind: 'reply' });
  assert.equal(fuera.draft, 'pegado de su Claude');
  assert.equal(fuera.sin_borrador, true);
});

const dim = (missing: boolean) =>
  ({ name: 'x', score: missing ? null : 8, max: 10, ratio: missing ? 0 : 0.8, verdict: '', reading: null, analysis: '', todos: [], missing, terms: [] }) as unknown as ScanReport['dimensions'][number];
const informe = (ausentes: number, total: number): ScanReport => {
  const dimensions = Array.from({ length: total }, (_, i) => dim(i < ausentes));
  return { summary: null, dimensions, strengths: [], weaknesses: [] };
};

test('scan dudoso: sin scan, retenido o con la mitad de componentes sin detectar', () => {
  const listo = { status: 'ready' as const, score: 62 };
  assert.equal(motivoScanDudoso({ scan: listo, report: informe(2, 10), retenido: false }), null);
  assert.match(motivoScanDudoso({ scan: null, report: null, retenido: false })!, /no hay scan/);
  assert.match(motivoScanDudoso({ scan: { status: 'ready', score: null }, report: informe(0, 10), retenido: true })!, /retuvo/);
  assert.match(motivoScanDudoso({ scan: listo, report: informe(5, 10), retenido: false })!, /5 de 10 componentes/);
});

test('contexto: con scan dudoso no se pasan hallazgos y se pide apoyarse en la señal', () => {
  const c = contextoSeguimiento({
    lead: { ...LEAD, scanDudoso: '6 de 10 componentes salen sin detectar' },
    plan: planSeguimiento('contacted', 1),
    dias: 6,
    enviados: ['Hola'],
    notas: [],
  });
  assert.match(c, /Scan NO FIABLE/);
  assert.doesNotMatch(c, /sin prueba externa/);
  assert.match(c, /Señal: Seed · 2 M€/);
});
