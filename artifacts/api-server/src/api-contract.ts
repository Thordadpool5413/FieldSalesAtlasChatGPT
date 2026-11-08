import { handler } from "./field-atlas/backend/index";
// Generated from the actual registered router, including its exact access middleware.
// This documents routing/auth and generic JSON envelopes, not complete business schemas.
export function apiContract() {
  const routes = [
    ...handler.routeManifest,
    { route: "GET /api/events", workspaceRequired: false },
    { route: "GET /api/healthz", workspaceRequired: false },
    { route: "GET /api/build-info", workspaceRequired: false },
    { route: "GET /api/openapi.json", workspaceRequired: false },
    { route: "POST /api/maintenance/run", workspaceRequired: false },
  ];
  const paths: Record<string, Record<string, unknown>> = {};
  for (const row of routes) {
    const [method, route] = row.route.split(" ");
    const path = route.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
    const service = path === "/api/maintenance/run";
    const parameters = [...route.matchAll(/:([A-Za-z0-9_]+)/g)].map(
      (match) => ({
        name: match[1],
        in: "path",
        required: true,
        schema: { type: "string" },
      }),
    );
    paths[path] ||= {};
    paths[path][method.toLowerCase()] = {
      operationId: method.toLowerCase() + route.replace(/[^A-Za-z0-9]+/g, "_"),
      summary: method + " " + route,
      description:
        path === "/api/events"
          ? "Server-sent events connection handshake. Private workspace subscription is authorized separately through POST /api/subscriptions."
          : "Live route inventory. Detailed business payload constraints are enforced by the server; this generic envelope is not a complete request schema.",
      security: service
        ? [{ maintenanceBearer: [] }]
        : row.workspaceRequired
          ? [{ workspaceLink: [] }]
          : [],
      parameters,
      ...(!["GET", "HEAD", "DELETE"].includes(method)
        ? {
            requestBody: {
              required: false,
              content: { "application/json": { schema: {} } },
            },
          }
        : {}),
      responses: {
        "200": {
          description:
            "JSON result; creation and deprecation routes may use another success/error status.",
        },
        "201": { description: "Created when supported." },
        "400": { description: "Invalid input." },
        "403": { description: "Access denied." },
        "409": { description: "Concurrent edit or business conflict." },
        "410": { description: "Retired operation when applicable." },
        "422": { description: "Unusable request or evidence." },
        "500": { description: "Request could not complete." },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Field Sales Atlas runtime route contract",
      version: "1.0.0",
      description:
        "Route and access inventory generated from the active backend. The generated health client in lib/api-spec remains a separate, intentionally small client contract. Request/response business schemas are not fully described here.",
    },
    paths,
    components: {
      securitySchemes: {
        workspaceLink: {
          type: "apiKey",
          in: "query",
          name: "workspaceKey",
          description:
            "Sensitive workspace capability. Do not place links in logs or share them publicly.",
        },
        maintenanceBearer: {
          type: "http",
          scheme: "bearer",
          description:
            "Separate deployment maintenance token; not a workspace link.",
        },
      },
    },
  };
}
