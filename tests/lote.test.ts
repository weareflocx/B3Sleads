import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AVISO_LINKEDIN, AVISO_NOMBRE, leeRonda, leeTabla, linkedinDePerfil } from '../lib/lote';

test('normaliza el dominio: minúsculas, sin protocolo, sin www, sin barra', () => {
  const { filas } = leeTabla('dominio\nHTTPS://www.Acme.IO/\nhttp://beta.com/precios?x=1\n');
  assert.deepEqual(filas.map((f) => f.dominio), ['acme.io', 'beta.com']);
});

test('sin cabecera, el orden del enunciado; con cabecera, cualquier orden y en inglés', () => {
  const sin = leeTabla('acme.io,Acme,linkedin.com/in/ana-ruiz,Ana Ruiz,SaaS,2M€ 2026-09,https://x.com/n');
  assert.equal(sin.conCabecera, false);
  assert.equal(sin.filas[0].marca, 'Acme');
  assert.equal(sin.filas[0].fundadores[0].nombre, 'Ana Ruiz');
  assert.equal(sin.filas[0].sector, 'SaaS');
  const con = leeTabla('Founder\tDomain\tCountry\tCiudad\nLuis\tbeta.com\tSpain\tMadrid');
  assert.equal(con.conCabecera, true);
  assert.equal(con.filas[0].dominio, 'beta.com');
  assert.equal(con.filas[0].pais, 'Spain');
  assert.equal(con.filas[0].ciudad, 'Madrid');
});

test('una cabecera sin dominio se rechaza con su motivo', () => {
  const r = leeTabla('marca;sector\nAcme;SaaS');
  assert.match(r.error ?? '', /dominio/);
});

test('varios LinkedIn por ";" (también con ";" de separador y comillas)', () => {
  const r = leeTabla('dominio;linkedin;fundador\nacme.io;"linkedin.com/in/ana;https://es.linkedin.com/in/luis-p/";"Ana;Luis"');
  const f = r.filas[0].fundadores;
  assert.equal(f.length, 2);
  assert.equal(f[0].linkedinUrl, 'https://www.linkedin.com/in/ana');
  assert.equal(f[1].handle, 'luis-p');
  assert.equal(f[1].nombre, 'Luis');
  assert.ok(!r.filas[0].avisos.includes(AVISO_LINKEDIN));
});

test('LinkedIn que falta o no es un perfil personal: el alta sigue, con aviso', () => {
  const r = leeTabla('dominio,linkedin,fundador\nacme.io,,Ana\nbeta.com,https://linkedin.com/company/beta,\ngama.com,ana-ruiz,');
  for (const f of r.filas) {
    assert.deepEqual(f.errores, []);
    assert.ok(f.avisos.includes(AVISO_LINKEDIN), f.dominio ?? '');
  }
  assert.equal(r.filas[1].fundadores[0].linkedinUrl, null, 'una página de empresa no es un fundador');
  assert.equal(r.filas[2].fundadores[0].linkedinUrl, null, 'un handle suelto no se convierte en perfil');
  assert.equal(linkedinDePerfil('https://www.linkedin.com/in/Ana-Ruiz-123/?trk=x')?.handle, 'ana-ruiz-123');
});

test('marca vacía: aviso de nombre por revisar; con marca, tal cual', () => {
  const r = leeTabla('dominio,marca\nacme.io,\nbeta.com,  BETA labs ');
  assert.ok(r.filas[0].avisos.includes(AVISO_NOMBRE));
  assert.equal(r.filas[1].marca, 'BETA labs');
});

test('errores por fila sin bloquear el resto, y repetidas dentro del lote', () => {
  const r = leeTabla('dominio\nacme.io\nesto no\n\nwww.acme.io\nbeta.com');
  assert.equal(r.filas.length, 4);
  assert.match(r.filas[1].errores[0], /no es un dominio/);
  assert.equal(r.filas[2].repetidaDe, 1);
  assert.equal(r.filas[3].errores.length, 0);
});

test('la ronda: importe y fecha en una celda o en dos', () => {
  assert.deepEqual(leeRonda('2M€ · 2026-09'), { importe: '2M€', fecha: '2026-09-01', tipo: null });
  assert.deepEqual(leeRonda('Seed 500K€ 12/03/2026'), { importe: 'Seed 500K€', fecha: '2026-03-12', tipo: 'Seed' });
  assert.deepEqual(leeRonda('1,5M€', '2026-05-20'), { importe: '1,5M€', fecha: '2026-05-20', tipo: null });
  assert.equal(leeRonda('', ''), null);
});
