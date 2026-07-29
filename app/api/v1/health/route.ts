import { apiConfigured } from '@/lib/brand3';
import { publicAgentResponse } from '@/lib/agent-api/handler';
import { isDemoMode } from '@/lib/supabase';

export async function GET(request: Request) {
  return publicAgentResponse(request, {
    status: 'ok',
    api_version: 'v1',
    data_mode: isDemoMode() ? 'demo_read_only' : 'live',
    scanner_configured: apiConfigured(),
    time: new Date().toISOString(),
  });
}
