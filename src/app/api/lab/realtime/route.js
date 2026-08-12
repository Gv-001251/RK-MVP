import { addRealtimeClient, removeRealtimeClient } from '@/lib/realtime-registry';
import { getAuthenticatedUser } from '@/lib/auth-middleware';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  // Authenticate in-route: the SSE stream carries patient data (PHI), and per
  // Next.js 16 guidance proxy/middleware must not be relied on for authz.
  // EventSource sends the session cookie automatically on same-origin requests.
  const { user } = await getAuthenticatedUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let controllerRef = null;

  const responseStream = new ReadableStream({
    start(controller) {
      controllerRef = controller;
      addRealtimeClient({ controller });
      
      // Send an initial handshake/ping event to confirm connection
      const initMessage = `data: ${JSON.stringify({ type: 'HANDSHAKE', status: 'Connected' })}\n\n`;
      controller.enqueue(new TextEncoder().encode(initMessage));
    },
    cancel() {
      if (controllerRef) {
        removeRealtimeClient({ controller: controllerRef });
      }
    }
  });

  return new Response(responseStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
