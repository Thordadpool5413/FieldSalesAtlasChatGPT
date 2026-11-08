import { AtlasDatabase, AppDatabaseError } from './database';
import { workspacePath } from './paths';
export { AppDatabaseError } from './database';
export { ws } from './events';

const dataDirectory = workspacePath(process.env.ATLAS_DATA_DIR || 'artifacts/field-sales-atlas/data');
export const db = new AtlasDatabase(workspacePath(`${dataDirectory}/atlas.sqlite`));
export const isAppDatabaseError = (value: unknown): value is AppDatabaseError => value instanceof AppDatabaseError;

export type RouterContext = {
  query: Record<string, string>;
  params: Record<string, string>;
  body: unknown;
  user?: { userId: string; email?: string; name?: string; scope: string };
};
export type RouterMiddleware = (context: RouterContext) => Response | void | Promise<Response | void>;
export type RouterRoutes = Record<string, RouterMiddleware[]>;

export function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
export const error = (message: string, status = 500) => json({ error: message, message }, status);

export function router(routes: RouterRoutes, access?: RouterMiddleware) {
  const parsed = Object.entries(routes).map(([route, middleware]) => {
    const [method, pattern] = route.split(' ');
    return { method, parts: pattern.split('/'), middleware };
  });
  const handle = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const route = parsed.find(candidate => candidate.method === request.method && candidate.parts.length === parts.length &&
      candidate.parts.every((part, i) => part.startsWith(':') || part === parts[i]));
    if (!route) return error('API route not found.', 404);
    const context: RouterContext = { query: Object.fromEntries(url.searchParams), params: {}, body: undefined };
    try {
      route.parts.forEach((part, i) => { if (part.startsWith(':')) context.params[part.slice(1)] = decodeURIComponent(parts[i]); });
      if (!['GET', 'HEAD'].includes(request.method)) {
        const text = await request.text();
        if (text) context.body = JSON.parse(text);
      }
    } catch { return error('Invalid request encoding or JSON body.', 400); }
    try {
      for (const middleware of route.middleware) {
        const response = await middleware(context);
        if (response instanceof Response) return response;
      }
      return error('Route did not return a response.', 500);
    } catch (failure) {
      if (isAppDatabaseError(failure)) return error('The record changed. Refresh before retrying.', 409);
      console.error('API request failed:', failure instanceof Error ? failure.name : 'Unknown error');
      return error('The request could not be completed.', 500);
    }
  };
  return Object.assign(handle, { routeManifest: Object.entries(routes).map(([route, middleware]) => ({ route, workspaceRequired: !!access && middleware.includes(access) })) });
}
