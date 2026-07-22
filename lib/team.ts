// El equipo: quién puede llevar un lead. Server-only.
//
// No hay tabla propia de usuarios: la fuente es Supabase Auth. Se listan los
// registrados y se completan con los emails que ya aparecen en leads, para
// que delegar funcione aunque alguien todavía no haya entrado nunca.
import { getServiceSupabase, isDemoMode } from './supabase';
import { OWNER_EMAIL, userLabel } from './leaderboard';

export interface TeamMember {
  email: string;
  label: string;
}

export async function getTeamMembers(): Promise<TeamMember[]> {
  const emails = new Set<string>([OWNER_EMAIL]);
  if (isDemoMode()) return [...emails].map((e) => ({ email: e, label: userLabel(e) }));

  const db = getServiceSupabase()!;
  try {
    const { data } = await db.auth.admin.listUsers();
    for (const u of data?.users ?? []) {
      if (u.email) emails.add(u.email.toLowerCase());
    }
  } catch {
    // Sin permisos de admin seguimos teniendo los emails de los leads.
  }

  const { data: leads } = await db.from('leads').select('created_by_email,owner_email');
  for (const l of (leads as { created_by_email: string | null; owner_email: string | null }[] | null) ??
    []) {
    if (l.created_by_email) emails.add(l.created_by_email.toLowerCase());
    if (l.owner_email) emails.add(l.owner_email.toLowerCase());
  }

  return [...emails]
    .map((email) => ({ email, label: userLabel(email) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

// Quién responde por el lead ahora mismo: el delegado si lo hay, si no
// quien lo detectó, y en última instancia el dueño del radar.
export function leadOwner(lead: {
  owner_email?: string | null;
  created_by_email?: string | null;
}): string {
  return lead.owner_email?.trim() || lead.created_by_email?.trim() || OWNER_EMAIL;
}
