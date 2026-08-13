import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

// Runtime edge por los tipos: es lo que permite leer los .ttf colocados junto
// a esta ruta con fetch(import.meta.url). En Node, fetch no acepta file:.
export const runtime = 'edge';

// Geist, la tipografía de la casa. Sin esto satori cae en su sans genérica y
// la tarjeta compartida no se parece a la landing. Se leen una vez por
// arranque, no en cada petición.
const geist = (async () => {
  const [regular, bold] = await Promise.all([
    fetch(new URL('./Geist-Regular.ttf', import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL('./Geist-Bold.ttf', import.meta.url)).then((r) => r.arrayBuffer()),
  ]);
  return [
    { name: 'Geist', data: regular, weight: 400 as const, style: 'normal' as const },
    { name: 'Geist', data: bold, weight: 700 as const, style: 'normal' as const },
  ];
})();

// La tarjeta Open Graph del Eclipse Scan: lo que LinkedIn y X pintan al
// compartir la URL del resultado. Se genera por petición con los datos del
// scan en la query, así cada founder comparte SU resultado y no un banner
// genérico. Los parámetros se sanean: esta URL la puede montar cualquiera.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const domain = (p.get('d') ?? '').slice(0, 40).replace(/[^\w.-]/g, '') || null;
  const scoreRaw = Number(p.get('s'));
  const score = Number.isFinite(scoreRaw) ? Math.min(100, Math.max(0, Math.round(scoreRaw))) : null;
  const brilla = (p.get('b') ?? '').slice(0, 30) || null;
  const eclipsa = (p.get('e') ?? '').slice(0, 30) || null;
  const conResultado = domain && score != null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#000',
          color: '#fff',
          padding: 72,
          fontFamily: 'Geist',
        }}
      >
        {/* El eclipse: disco negro con corona. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 360,
            flexShrink: 0,
          }}
        >
          {/* Totalidad en blanco y negro: disco opaco de borde nítido y una
              corona que se abre en tres capas, de un anillo fino pegado al
              limbo a un halo ancho que muere en el fondo. Sin una sola gota
              de color, que es lo que la hace parecer una fotografía. */}
          <div
            style={{
              width: 286,
              height: 286,
              borderRadius: 286,
              background: '#000',
              boxShadow: [
                '0 0 0 2px rgba(255,255,255,0.92)',
                '0 0 18px 4px rgba(255,255,255,0.55)',
                '0 0 60px 18px rgba(226,232,244,0.30)',
                '0 0 150px 60px rgba(226,232,244,0.13)',
                '0 0 260px 110px rgba(226,232,244,0.06)',
              ].join(', '),
            }}
          />
        </div>

        {/* Ancho EXPLÍCITO, no flexGrow: satori no acota el texto por sí solo
            y un titular largo se sale del lienzo en vez de partirse.
            1200 - 72*2 de padding - 360 de la columna del disco - 64 de
            separación = 632. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            marginLeft: 64,
            width: 632,
          }}
        >
          {conResultado ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 26, letterSpacing: 6, color: 'rgba(255,255,255,0.45)' }}>
                {`ECLIPSE SCAN · ${domain.toUpperCase()}`}
              </div>
              {/* satori exige hijos texto o elemento: un número crudo revienta
                  el render con un error que señala a otro sitio. */}
              <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 18 }}>
                <div style={{ fontSize: 150, fontWeight: 700, lineHeight: 1 }}>{String(score)}</div>
                <div style={{ fontSize: 40, color: 'rgba(255,255,255,0.45)', marginLeft: 14 }}>
                  /100
                </div>
              </div>
              {brilla && (
                <div style={{ display: 'flex', fontSize: 30, marginTop: 34 }}>
                  <span style={{ color: '#00d554' }}>Brilla</span>
                  <span style={{ color: 'rgba(255,255,255,0.85)', marginLeft: 14 }}>{brilla}</span>
                </div>
              )}
              {eclipsa && (
                <div style={{ display: 'flex', fontSize: 30, marginTop: 12 }}>
                  <span style={{ color: '#ff5555' }}>Se eclipsa</span>
                  <span style={{ color: 'rgba(255,255,255,0.85)', marginLeft: 14 }}>{eclipsa}</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {/* Dos líneas fijas, una por div: satori partiría "Una nueva
                  mirada para tu marca" donde le cupiese, y el corte importa. */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1 }}>
                  Una nueva mirada
                </div>
                <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1 }}>para tu marca</div>
              </div>
              <div style={{ fontSize: 27, color: 'rgba(255,255,255,0.6)', marginTop: 26 }}>
                Escanea tu marca gratis con B3S y prepárate para el siguiente: lo que brilla, lo que
                se eclipsa.
              </div>
            </div>
          )}
          <div style={{ fontSize: 24, color: 'rgba(255,255,255,0.35)', marginTop: 40 }}>
            B3S Scanner by FLOC* · Eclipse 12.08.2026
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: await geist },
  );
}
