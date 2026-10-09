import { NextRequest, NextResponse } from 'next/server';
import { altaDeFounders, type PeticionAlta } from '@/lib/alta-founders';
import { requireUser } from '@/lib/auth';

// Alta manual de founders desde el dashboard. La lógica vive en
// lib/alta-founders.ts, que también usa la Agent API (/api/v1/leads) sin
// pasar por esta ruta, porque la Agent API no tiene sesión de usuario.
// POST { entries: [...], warm?: boolean, replied?: boolean }
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  let peticion: PeticionAlta;
  try {
    peticion = await req.json();
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
  // Atribución para el leaderboard: quién añade este lead
  const { status, body } = await altaDeFounders(peticion, auth.email);
  return NextResponse.json(body, { status });
}
