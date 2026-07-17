import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

// Receptor de datasets en desarrollo (ej: TSVs cosechados desde el navegador).
// Solo activo fuera de producción. Escribe en data/ (gitignored).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Solo disponible en desarrollo' }, { status: 403, headers: CORS });
  }
  try {
    const { filename, content } = await req.json();
    if (typeof filename !== 'string' || typeof content !== 'string') {
      return NextResponse.json({ error: 'filename y content requeridos' }, { status: 400, headers: CORS });
    }
    const safe = path.basename(filename);
    if (!/^[a-z0-9._-]+\.tsv$/i.test(safe) || content.length > 5_000_000) {
      return NextResponse.json({ error: 'Nombre o tamaño inválido' }, { status: 400, headers: CORS });
    }
    const dir = path.join(process.cwd(), 'data');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, safe), content, 'utf-8');
    return NextResponse.json({ ok: true, file: `data/${safe}`, bytes: content.length }, { headers: CORS });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500, headers: CORS });
  }
}
