import { publicAgentDocument } from '@/lib/agent-api/handler';
import { agentOpenApi } from '@/lib/agent-api/openapi';

export async function GET(request: Request) {
  return publicAgentDocument(request, agentOpenApi);
}
