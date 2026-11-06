import { randomBytes } from 'node:crypto';
import type { ServerResponse } from 'node:http';

const connections = new Map<string, ServerResponse>();

export function openEvents(response: ServerResponse) {
  const connectionId = randomBytes(24).toString('hex');
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  connections.set(connectionId, response);
  response.write(`data: ${JSON.stringify({ type: 'connection.ready', connectionId })}\n\n`);
  const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 25000);
  response.on('close', () => { clearInterval(heartbeat); connections.delete(connectionId); });
}

export const ws = {
  async send(ids: string[], message: unknown) {
    const payload = `data: ${JSON.stringify(message)}\n\n`;
    for (const id of ids) connections.get(id)?.write(payload);
  },
};

export function closeEvents() {
  for (const connection of connections.values()) connection.end();
  connections.clear();
}
