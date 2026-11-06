type ApiResponse = { data: any; status: number };

async function request(method: string, path: string, data?: unknown): Promise<ApiResponse> {
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin) throw new Error('API requests must stay on this website.');
  if (method === 'GET' && data && typeof data === 'object') {
    for (const [key, value] of Object.entries(data)) if (value != null) url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method,
    cache: 'no-store',
    headers: { Accept: 'application/json', ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) },
    ...(method !== 'GET' && data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || body?.error || `Request failed (${response.status}).`);
  return { data: body, status: response.status };
}

export const api = {
  get: (path: string, data?: unknown) => request('GET', path, data),
  post: (path: string, data?: unknown) => request('POST', path, data),
  put: (path: string, data?: unknown) => request('PUT', path, data),
  delete: (path: string, data?: unknown) => request('DELETE', path, data),
};

export type WsConnection = {
  connectionId: string;
  ready: Promise<void>;
  onMessage: (callback: (message: any) => void) => void;
  onClose: (callback: () => void) => void;
  onError: (callback: () => void) => void;
  disconnect: () => void;
};

export const ws = {
  connect(): WsConnection {
    const source = new EventSource('/api/events');
    const messages = new Set<(message: unknown) => void>();
    const errors = new Set<() => void>();
    const closes = new Set<() => void>();
    let resolveReady!: () => void;
    let rejectReady!: (reason: Error) => void;
    let connected = false;
    // Attach a rejection handler immediately; React may unmount before subscribing.
    const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    void ready.catch(() => undefined);
    const connection: WsConnection = {
      connectionId: '', ready,
      onMessage: callback => { messages.add(callback); },
      onClose: callback => { closes.add(callback); },
      onError: callback => { errors.add(callback); },
      disconnect: () => { source.close(); if (!connected) rejectReady(new Error('Connection closed.')); },
    };
    source.onmessage = event => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'connection.ready') {
        connection.connectionId = String(message.connectionId);
        connected = true;
        resolveReady();
      } else for (const callback of messages) callback(message);
    };
    source.onerror = () => {
      // The app owns reconnect/subscription renewal. Avoid duplicate EventSources.
      source.close();
      if (!connected) rejectReady(new Error('Live updates unavailable.'));
      for (const callback of errors) callback();
      for (const callback of closes) callback();
    };
    return connection;
  },
};
