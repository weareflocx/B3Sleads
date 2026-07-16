import { NextRequest, NextResponse } from 'next/server';
import { getBriefingLeads } from '@/lib/data';
import { generateDraft, draftInputFromLead } from '@/lib/claude';
import { getSupabase, isDemoMode } from '@/lib/supabase';

// POST { leadId } — regenera el borrador del lead con Claude API
export async function POST(req: NextRequest) {
  try {
    const { leadId } = await req.json();
    const leads = await getBriefingLeads();
    const bl = leads.find((l) => l.lead.id === leadId);
    if (!bl) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });

    const draft = await generateDraft(draftInputFromLead(bl));

    if (!isDemoMode()) {
      const db = getSupabase()!;
      await db.from('messages').insert({
        lead_id: leadId,
        channel: 'linkedin',
        lang: draftInputFromLead(bl).lang,
        draft,
      });
    }
    return NextResponse.json({ draft });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
