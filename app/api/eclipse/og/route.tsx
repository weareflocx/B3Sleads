import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

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
          fontFamily: 'sans-serif',
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
          <div
            style={{
              width: 250,
              height: 250,
              borderRadius: 250,
              background: '#000',
              // La corona de la landing: blanco y gris, anillo fino pegado
              // al limbo y halo que muere en negro.
              boxShadow:
                '0 0 0 2px rgba(255,255,255,0.9), 0 0 34px 10px rgba(226,232,244,0.45), 0 0 130px 50px rgba(226,232,244,0.14)',
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            marginLeft: 64,
            flexGrow: 1,
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
              <div style={{ fontSize: 58, fontWeight: 700, lineHeight: 1.15 }}>
                Hoy hay un antes y un después.
              </div>
              <div style={{ fontSize: 30, color: 'rgba(255,255,255,0.6)', marginTop: 22 }}>
                Escanea tu marca gratis con B3S y descubre qué brilla y qué se eclipsa.
              </div>
            </div>
          )}
          <div style={{ fontSize: 24, color: 'rgba(255,255,255,0.35)', marginTop: 40 }}>
            B3S Scanner by FLOC* · 12.08.2026
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
